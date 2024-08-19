---
title: LevelDB Code - How To Read and Write WAL Logs
tags:
  - C++
  - LevelDB
category: SourceCode
toc: true
mathjax: true
date: 2024-08-14 21:05:31
description: This article discusses the WAL (Write-Ahead Logging) log read/write interface in LevelDB. It provides a detailed analysis of the WAL log writing process, including data segmentation, record formats, and storage methods. It also explains the complex logic of log reading, how to handle records that span blocks, and exceptional cases. Additionally, relevant test cases are presented to verify the correctness of WAL logs in various scenarios.
---

LevelDB uses WAL (Write-Ahead Logging) logs to ensure data durability. When a write operation occurs, LevelDB first writes the data to a log file and then applies it to the in-memory data structures (e.g., MemTable). Upon system or database restart after a crash, LevelDB checks the records in the WAL log file. By reading and replaying these log records, LevelDB can reconstruct the data state that had not been fully written to disk at the time of the crash.

![LevelDB WAL Log Writing Process](https://slefboot-1251736664.file.myqcloud.com/20240723_leveldb_source_wal_log_cover.svg)

The overall process for WAL log operations is as follows:

1. LevelDB first writes the data to the WAL log to ensure that data is not lost even in the event of a system crash.
2. The data is then written to the in-memory MemTable, which is a fast operation.
3. LevelDB confirms to the client that the write is complete.
4. Over time, as the MemTable becomes full, it is flushed to an SSTable file on disk.
5. Once the MemTable is successfully flushed to the SSTable, the corresponding WAL log can be cleared.

Next, let's take a detailed look at the implementation.

<!-- more -->

## Writing WAL Logs

Let's first look at how LevelDB writes WAL logs. In LevelDB, a `Writer` class is defined in [db/log_writer.h](https://github.com/google/leveldb/blob/main/db/log_writer.h) for writing to WAL log files. The main method of the `Writer` class is `AddRecord`, which is used to append a record to the log file. The primary data member is `WritableFile* dest_;`, which points to the log file that supports appending writes. `WritableFile` is an abstract class interface defined in [include/leveldb/env.h](https://github.com/google/leveldb/blob/main/include/leveldb/env.h#L277) that encapsulates sequential write file operations. For the specific interface and implementation, refer to [LevelDB Source Code Review: Posix File Operation Interface Details](https://selfboot.cn/2024/08/02/leveldb_source_env_posixfile/#%E9%A1%BA%E5%BA%8F%E5%86%99%E6%96%87%E4%BB%B6).

The main implementation of WAL log writing is in the [db/log_writer.cc](https://github.com/google/leveldb/blob/main/db/log_writer.cc) file, and the overall process is relatively straightforward. The `AddRecord` method handles data of different sizes, ensuring they are segmented according to the correct format and type, and then calls [EmitPhysicalRecord](https://github.com/google/leveldb/blob/main/db/log_writer.cc#L82) to set the header and store a single record.

### Single Record Storage Format

The single record storage format is quite clear, and the complete implementation is in `EmitPhysicalRecord`. Each record consists of two parts: a **7-byte fixed-length** header and a variable-length data section. The header includes 1 byte for the record type, 2 bytes for the record length, and 4 bytes for the checksum. Specifically:

- Record Type: Indicates whether the record is a full record, the first part, a middle part, or the last part.
- Length: The length of a single record, referring to the length of the data section, excluding the header. The maximum record length is `kBlockSize - kHeaderSize`, and 2 bytes are sufficient to express it.
- CRC32: Cyclic Redundancy Check code used to verify whether the data has changed during storage or transmission.

As illustrated below:

```shell
+-----------------+--------------------------------------------------+
|     Header      |                     Data/Payload                  |
+-----------------+--------------------------------------------------+
| Record Type (1B)| Actual data written by the application...         |
| Length (2B)     |                                                  |
| CRC (4B)        |                                                  |
+-----------------+--------------------------------------------------+
```

The implementation for writing a single record is as follows: First, the values of each header field are calculated, and then the header and data parts are written to the log file.

```cpp
Status Writer::EmitPhysicalRecord(RecordType t, const char* ptr,
                                  size_t length) {
  // Format the header
  char buf[kHeaderSize];
  buf[4] = static_cast<char>(length & 0xff);
  buf[5] = static_cast<char>(length >> 8);
  buf[6] = static_cast<char>(t);
  // Compute the crc of the record type and the payload.
  uint32_t crc = crc32c::Extend(type_crc_[t], ptr, length);
  crc = crc32c::Mask(crc);  // Adjust for storage
  EncodeFixed32(buf, crc);

  // Write the header and the payload
  Status s = dest_->Append(Slice(buf, kHeaderSize));
  if (s.ok()) {
    s = dest_->Append(Slice(ptr, length));
    if (s.ok()) {
      s = dest_->Flush();
    }
  }
  block_offset_ += kHeaderSize + length;
  return s;
}
```

When calculating the CRC32, `type_crc_[t]` is used, which is initialized in the `Writer` constructor with the `InitTypeCrc` function to improve calculation efficiency and avoid recalculating the CRC32 checksum every time a record is written. If the `type_crc_` array is not initialized, `crc32c::Extend(0, ptr, length)` can still be used to calculate the CRC checksum. However, this would only calculate the checksum for the data section without considering the **record type**. By using `type_crc_`, the record type is included as the initial value in the crc32 calculation, meaning that the same content would result in different CRC32 values if the types are different.

Here, the record type is mentioned, and the code also tracks a `block_offset_`. What is this used for? This relates to the **data segmentation logic** in `AddRecord`.

### Data Segmentation Records

**When writing data, if a single piece of data is too large, LevelDB splits the data into multiple records and writes them incrementally.** After segmentation, one piece of data may include multiple records, so a **record organization format** must be designed to ensure that the complete data can be correctly reconstructed during reading. LevelDB's approach is straightforward: each record adds a record type to indicate whether it is a full record, the first part, a middle part, or the last part. This way, during reading, data can be assembled according to the sequence of record types. A piece of data may be split into the following types:

```shell
first(R1), middle(R1), middle(R1), ..., last(R1)
first(R2), last(R2)
full(R3)
```

Here, `first`, `middle`, `last`, and `full` indicate the types of records. All records are placed in **logical blocks**, with a block size of `kBlockSize` (32768 = 32KB), defined in [db/log_format.h](https://github.com/google/leveldb/blob/main/db/log_format.h#L27). During data segmentation, it is ensured that **a single record does not span logical blocks**. The entire logic for splitting records is implemented in `AddRecord`, primarily based on the size of the data and the remaining space in the current logical block to determine whether segmentation is necessary. In cases where segmentation is required, the data is split into records, the correct record type is set, and `EmitPhysicalRecord` is called to write each record sequentially. The core code is as follows, with some comments and assert checks removed.

```cpp
Status Writer::AddRecord(const Slice& slice) {
  const char* ptr = slice.data();
  size_t left = slice.size();

  Status s;
  bool begin = true;
  do {
    const int leftover = kBlockSize - block_offset_;
    if (leftover < kHeaderSize) {
      // Switch to a new block
      if (leftover > 0) {
        // Fill the trailer (literal below relies on kHeaderSize being 7)
        static_assert(kHeaderSize == 7, "");
        dest_->Append(Slice("\x00\x00\x00\x00\x00\x00", leftover));
      }
      block_offset_ = 0;
    }

    const size_t avail = kBlockSize - block_offset_ - kHeaderSize;
    const size_t fragment_length = (left < avail) ? left : avail;
    RecordType type;
    const bool end = (left == fragment_length);
    if (begin && end) {
      type = kFullType;
    } else if (begin) {
      type = kFirstType;
    } else if (end) {
      type = kLastType;
    } else {
      type = kMiddleType;
    }

    s = EmitPhysicalRecord(type, ptr, fragment_length);
    ptr += fragment_length;
    left -= fragment_length;
    begin = false;
  } while (s.ok() && left > 0);
  return s;
}
```

Note that even for data with a length of 0, a record will be written with a type of `fulltype`, consisting only of the header with no data section. There are test cases specifically to verify this scenario. Additionally, if some records are written and the remaining space in the current logical block is less than 7 (insufficient to write the header), the remaining space will be filled with `\x00`, and the process will switch to the next logical block.

The **implementation of determining the current record type is quite clever**. It only requires maintaining two flags: `begin` and `end`. When data writing starts, `begin` is true, and after writing a record, `begin` is updated to false. `end` is updated based on whether the remaining data length is 0. Then, based on the values of `begin` and `end`, the current record type can be determined. The order of the `if` and `else` statements here is also crucial: if both `begin` and `end` are true, the record is of type `kFullType`; next, if only `begin` is true, it is of type `kFirstType`; if only `end` is true, it is of type `kLastType`, and in other cases, it is of type `kMiddleType`.

There is a design consideration here: **Why don't segmented records span logical blocks?** If you look at the subsequent code for reading WAL logs, you'll find that this design allows reading by block. **Records within each block are complete, meaning there is no need to handle records spanning blocks, significantly simplifying the reading logic.** Additionally, if a block is corrupted, it will only affect the records within that block, not those in other blocks.

With this, the process of writing data to the WAL log file is complete. Now, let's take a look at how to read WAL log files.

## Reading WAL Logs

Compared to splitting data into records and writing them to log files, the logic for reading logs and reconstructing data is slightly more complex. The `Reader` class, defined in [db/log_reader.h](https://github.com/google/leveldb/blob/main/db/log_reader.h#L20), is used to read data from log files. The primary data member of the `Reader` is `SequentialFile* const file_;`, which points to a **log file that supports sequential reading**. Like `WritableFile`, `SequentialFile` is also an abstract class interface defined in `include/leveldb/env.h`, encapsulating the sequential reading of file systems. For the specific interface and implementation, refer to [LevelDB Source Code Review: Posix File Operation Interface Details](https://selfboot.cn/2024/08/02/leveldb_source_env_posixfile/#%E9%A1%BA%E5%BA%8F%E8%AF%BB%E6%96%87%E4%BB%B6).

The main method of the `Reader` class is `ReadRecord`, which reads a complete piece of data and can be called multiple times to sequentially read all the data. If some unexpected data is encountered during the reading process, such as invalid record lengths or CRC verification failures, the `Reporter` interface defined in `Reader` can be used to log errors. Additionally, the `Reader` supports skipping a certain length of data in the file, which can be used to skip already read data during data recovery. The complete implementation is in [db/log_reader.cc](https://github.com/google/leveldb/blob/main/db/log_reader.cc). Let's take a closer look.

### Skipping Initial Data

The `Reader` has a `last_record_offset_` that records the offset of the latest complete data read, initialized to 0. Subsequently, every time a record of type `kFullType` or `kLastType` is read, this value is updated. At the `ReadRecord` entry point, the size of `last_record_offset_` is compared to `initial_offset_`. Here, `initial_offset_` is passed in during construction to specify the length of data to skip. If `last_record_offset_` is less than `initial_offset_`, the initial part of the file (up to `initial_offset_`) needs to be skipped. The implementation for skipping the initial part is as follows:

```cpp
// db/log_reader.cc
bool Reader::SkipToInitialBlock() {
  const size_t offset_in_block = initial_offset_ % kBlockSize;
  uint64_t block_start_location = initial_offset_ - offset_in_block;

  // Don't search a block if we'd be in the trailer
  if (offset_in_block > kBlockSize - 6) {
    block_start_location += kBlockSize;
  }
  end_of_buffer_offset_ = block_start_location;
  // Skip to start of first block that can contain the initial record
  if (block_start_location > 0) {
    Status skip_status = file_->Skip(block_start_location);
    if (!skip_status.ok()) {
      ReportDrop(block_start_location, skip_status);
      return false;
    }
  }

  return true;
}
```

There is a special case where if `initial_offset_` happens to be at the end of a logical block, the entire logical block needs to be skipped. Judging whether it is at the end of a logical block is straightforward: directly take the remainder of `initial_offset_` modulo the block size (32KB). If the remaining part is within the last 6 bytes of the block, it means it is at the end of the block. Note that during the skip, only the entire logical block is skipped, ensuring that reading starts from the **head of the logical block** containing `initial_offset_`. This may result in the first record read having an offset smaller than `initial_offset_`, which is handled later in `ReadPhysicalRecord`.

### Parsing a Complete Record

`ReadRecord` is used to read a complete piece of data from the log file, which may consist of multiple records that need to be read out one by one and then concatenated.

First, a flag `in_fragmented_record` is used to indicate whether the reader is currently in the middle of a **fragmented record**, initialized to false. Then, the code enters a while loop, repeatedly calling `ReadPhysicalRecord` to read out records and store them in `fragment`, followed by processing based on the record type. Note that there is a `resyncing_` flag. If data skipping is required (`initial_offset_ > 0`), it will be set to true during initialization, indicating that the reader is currently in a state of skipping data. In this state, once a record of type `kFullType` is read, `resyncing_` is updated to false, indicating the end of the data skipping and the start of normal data reading.

For the data reading part, whether data concatenation is required depends on the current record type.

- If the record is of type `kFullType`, it indicates a complete piece of data, and the `fragment` is directly set as the `result`, updating `last_record_offset_`.
- If the record is of type `kFirstType`, it indicates the start of a new piece of data, and the record is stored in `scratch`, with `in_fragmented_record` set to true.
- If the record is of type `kMiddleType`, it indicates a middle part of the data. At this point, `in_fragmented_record` must be true; otherwise, an error is reported. In this case, `scratch` continues to append the new record.
- If the record is of type `kLastType`, it indicates the last part of the data. Again, `in_fragmented_record` must be true; otherwise, an error is reported. The last part of the `fragment` is appended to `scratch`, which is then set as the `result`. After updating `last_record_offset_`, the function returns.

Additionally, there are other record types, such as `kEof` and `kBadRecord`, which are exceptional cases that require special handling. The core logic of `ReadRecord` is as follows, with some error-handling code omitted:

```cpp
// db/log_reader.cc
bool Reader::ReadRecord(Slice* record, std::string* scratch) {
  // ...
  scratch->clear();
  record->clear();
  bool in_fragmented_record = false;
  Slice fragment;
  while (true) {
    const unsigned int record_type = ReadPhysicalRecord(&fragment);
    if (resyncing_) {
        // ...
    }

    switch (record_type) {
      case kFullType:
        // ...
        *record = fragment;
        last_record_offset_ = prospective_record_offset;
        return true;
      case kFirstType:
        // ...
        scratch->assign(fragment.data(), fragment.size());
        in_fragmented_record = true;
        break;

      case kMiddleType:
        if (!in_fragmented_record) {
          ReportCorruption(fragment.size(),
                           "missing start of fragmented record(1)");
        } else {
          scratch->append(fragment.data(), fragment.size());
        }
        break;

      case kLastType:
        if (!in_fragmented_record) {
          ReportCorruption(fragment.size(),
                           "missing start of fragmented record(2)");
        } else {
          scratch->append(fragment.data(), fragment.size());
          *record = Slice(*scratch);
          last_record_offset_ = prospective_record_offset;
          return true;
        }
        break;
        // ...
    }
  }
  return false;
}
```


### Reading a Single Logical Block

`ReadPhysicalRecord` **encapsulates the process of extracting records from a logical block**. The size of a logical block is `kBlockSize = 32KB`, which is defined in [db/log_format.h](https://github.com/google/leveldb/blob/main/db/log_format.h#L27). When reading a file from disk, **the logical block is the minimum reading unit**. The data is read into memory, where records are parsed one by one. The outermost layer is a while loop, first checking the size of `buffer_`. If the data in `buffer_` is insufficient to parse a record (length is less than `kHeaderSize`), a logical block of data is read from the file into `buffer_`.

- If the length of the data read from the file is less than `kBlockSize`, it indicates that

 the end of the file has been reached, `eof_` is set to true, and the loop continues, clearing the data in `buffer_` and returning `kEof`.
- If a file read error occurs, `ReportDrop` is used to report the read failure, `buffer_` is cleared, `eof_` is set to true, and the function immediately returns `kEof`.
- If `kBlockSize` of data is successfully read into `buffer_`, record parsing begins.

Of course, a logical block (Block) may contain multiple records. After parsing one record, `ReadPhysicalRecord` returns. Before returning, the `buffer_` pointer is updated to point to the start of the next record. The next time `ReadPhysicalRecord` is re-entered, if `buffer_` still contains records (length greater than `kHeaderSize`), the file is not read again; instead, parsing continues from the current position in `buffer_`.

The specific code for parsing records is the reverse of the code for writing records above. The length, CRC32, and other information are first parsed from the header, the record data is stored in `result`, and `buffer_` is updated to point to the start of the next record.

```cpp
// db/log_reader.cc
unsigned int Reader::ReadPhysicalRecord(Slice* result) {
  while (true) {
    if (buffer_.size() < kHeaderSize) {
        // ...
    }
    // ...
    const char* header = buffer_.data();
    const uint32_t a = static_cast<uint32_t>(header[4]) & 0xff;
    const uint32_t b = static_cast<uint32_t>(header[5]) & 0xff;
    const unsigned int type = header[6];
    const uint32_t length = a | (b << 8);

    // ...
    buffer_.remove_prefix(kHeaderSize + length);    // Point to the start of the next record
    // ...
    *result = Slice(header + kHeaderSize, length);
    return type;
  }
```

Some of the exception handling logic is commented out in the code above, such as invalid record length and CRC verification failure. Exception handling mainly relies on the `Reporter` interface to log error messages and clear `buffer_`. Thus, even if some exceptions occur during the reading process, they will only affect the parsing of the current `buffer_`, without impacting the reading and parsing of subsequent logical blocks.

Another exception is when **the current record is within the skipped `initial_offset_` range**. This is because, during the earlier skipping process, only entire logical blocks are skipped, ensuring that reading starts from the **head of the logical block** containing `initial_offset_`. If the offset of the current record is less than `initial_offset_`, it means this record needs to be skipped. The start of `buffer_` is adjusted, and `kBadRecord` is returned.

## WAL Read/Write Testing

[db/log_test.cc](https://github.com/google/leveldb/blob/main/db/log_test.cc) provides some auxiliary classes and functions, as well as detailed test cases, to thoroughly test the WAL log read/write functionality. For example, `BigString` is used to generate strings of specified lengths, the `LogTest` class encapsulates the read/write logic of `Reader` and `Writer`, and exposes convenient testing interfaces, such as `Write`, `ShrinkSize`, `Read`, etc. Moreover, instead of directly reading files, a custom `StringSource` class is implemented, inheriting from `SequentialFile`, and using a string to simulate reading files. Similarly, a `StringDest` class is implemented, inheriting from `WritableFile`, also using a string to simulate writing files.

Here are some test cases for normal read/write operations:

- Empty: Tests directly reading an empty file, returning EOF.
- ReadWrite: Tests simple writing and reading to ensure that the written data can be correctly read. Here, an empty string is also written, which can be correctly read.
- ManyBlocks: Tests writing a large number of strings of different lengths, occupying multiple logical blocks. Then, each string is read sequentially to ensure correctness.
- Fragmentation: Tests writing oversized strings, where each piece of data requires multiple records. Then, each string is read sequentially to ensure correctness.

In addition, some test cases for exceptional scenarios are constructed. For example, `TruncatedTrailingRecordIsIgnored` in LevelDB's logging system is used to verify the handling of **log records that are truncated at the end of the file**. When the last record of a log file is not fully written (e.g., due to a system crash or other interruption), the incomplete record is ignored rather than treated as an error.

```cpp
TEST_F(LogTest, TruncatedTrailingRecordIsIgnored) {
  Write("foo");
  ShrinkSize(4);  // Drop all payload as well as a header byte
  ASSERT_EQ("EOF", Read());
  // Truncated last record is ignored, not treated as an error.
  ASSERT_EQ(0, DroppedBytes());
  ASSERT_EQ("", ReportMessage());
}
```

`BadLength` is used to verify the behavior when the record length field is corrupted. The test ensures that the logging system correctly identifies and ignores invalid records due to **corrupted record length fields** while continuing to read subsequent valid records and reporting appropriate error messages.

```cpp
TEST_F(LogTest, BadLength) {
  const int kPayloadSize = kBlockSize - kHeaderSize;
  Write(BigString("bar", kPayloadSize));
  Write("foo");
  // Least significant size byte is stored in header[4].
  IncrementByte(4, 1);
  ASSERT_EQ("foo", Read());
  ASSERT_EQ(kBlockSize, DroppedBytes());
  ASSERT_EQ("OK", MatchError("bad record length"));
}
```

Here, `IncrementByte` increments the value at the 4th byte, which stores the record length information, causing the record length to increase. When reading, it will find that the record length is invalid, and an error message is reported. The length check logic is in `ReadPhysicalRecord`, as follows:

```cpp
    if (kHeaderSize + length > buffer_.size()) {
      size_t drop_size = buffer_.size();
      buffer_.clear();
      if (!eof_) {
        ReportCorruption(drop_size, "bad record length");
        return kBadRecord;
      }
      return kEof;
    }
```

In addition, a large number of test cases are constructed to verify initial skipping lengths. A function `CheckInitialOffsetRecord` is encapsulated to verify whether the records at the initial skipping length are correctly skipped. This function writes some records, sets `initial_offset_` to read records, and verifies whether the records at the `initial_offset_` length are skipped.

Through extensive test cases, the correctness of the WAL log read/write logic is ensured. These test cases are also very instructive, helping us better understand the WAL log read/write logic.
