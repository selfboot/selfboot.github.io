---
title: LevelDB Explained - How To Read and Write WAL Logs
tags:
  - C++
  - LevelDB
category: Source Code Analysis
toc: true
mathjax: true
date: 2024-08-14 21:05:31
description: This article explores the Write-Ahead Logging (WAL) log read and write interfaces in LevelDB. It provides a detailed analysis of the WAL log writing process, including data segmentation, record format, and storage methods. It also explains the complex logic of log reading, including how to handle cross-block records and abnormal situations. Additionally, it showcases relevant test cases to verify the correctness of WAL logs in various scenarios.
lang: en
---

LevelDB uses Write-Ahead Logging (WAL) to ensure data durability. When a write operation occurs, LevelDB first writes the data to the log file, and then applies it to the in-memory data structure (such as MemTable). When the system or database restarts after a crash, LevelDB checks the records in the WAL log file. By reading and replaying these log records, LevelDB can rebuild the data state that had not been fully written to disk when the crash occurred.

![LevelDB WAL Log Writing Process](https://slefboot-1251736664.file.myqcloud.com/20240723_leveldb_source_wal_log_cover.svg)

The overall WAL log-related operation process is as follows:

1. LevelDB first writes the data to the WAL log. This ensures that the data won't be lost even in the event of a system crash.
2. The data is written to the MemTable in memory, which is a fast memory operation.
3. LevelDB confirms the write completion to the client.
4. Over time, when the MemTable is full, it is flushed to SSTable files on disk.
5. Once the MemTable has been successfully flushed to SSTable, the corresponding WAL log can be cleared.

Let's take a detailed look at the implementation.

<!-- more -->

## Writing WAL Logs

First, let's see how LevelDB writes WAL logs. In LevelDB, a Writer class is defined in [db/log_writer.h](https://github.com/google/leveldb/blob/main/db/log_writer.h) for writing to WAL log files. The main method of the Writer class is `AddRecord`, used to append a record to the log file. The main data member is `WritableFile* dest_;`, which points to the log file that supports append writes. Here, WritableFile is an abstract class interface defined in [include/leveldb/env.h](https://github.com/google/leveldb/blob/main/include/leveldb/env.h#L277), used to encapsulate sequential file write operations. For specific interfaces and implementations, refer to [LevelDB Source Code Reading: Posix File Operation Interface Implementation Details](https://selfboot.cn/en/2024/08/02/leveldb_source_env_posixfile/#%E9%A1%BA%E5%BA%8F%E5%86%99%E6%96%87%E4%BB%B6).

The main implementation of WAL log writing is in the [db/log_writer.cc](https://github.com/google/leveldb/blob/main/db/log_writer.cc) file, and the overall process is quite clear. The AddRecord method handles data of different sizes, ensuring they are segmented according to the correct format and type, and then calls [EmitPhysicalRecord](https://github.com/google/leveldb/blob/main/db/log_writer.cc#L82) to set the header and store a single record.

### Single Record Storage Format

The single record storage format is quite clear, with a complete implementation in EmitPhysicalRecord. Each record consists of two parts: a **fixed-length 7-byte** Header and a Data part of variable length. The Header part includes 1 byte for record type, 2 bytes for record length, and 4 bytes for checksum. Specifically:

- Record Type: Identifies whether it's a complete record, first part, middle part, or last part.
- Length: The length of a single record, referring to the length of the data part, not including the header length. The maximum length of a single record is kBlockSize - kHeaderSize, which can be adequately expressed with 2 bytes.
- CRC32: Cyclic redundancy check code, used to check if the data has changed during storage or transmission.

As shown in the following diagram:

```shell
+-----------------+--------------------------------------------------+
|     Header      |                     Data/Payload                  |
+-----------------+--------------------------------------------------+
| Record Type (1B)| Actual data written by the application...         |
| Length (2B)     |                                                  |
| CRC (4B)        |                                                  |
+-----------------+--------------------------------------------------+
```

The implementation of writing a single record is as follows. First, it calculates the values of each field in the header, then writes the header and data parts to the log file.

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

When calculating the CRC32 here, it uses `type_crc_[t]`. This array is initialized in the Writer's constructor using the InitTypeCrc function, which can improve calculation efficiency and avoid recalculating the CRC32 checksum each time a record is written. If the type_crc_ array is not initialized, you could also use `crc32c::Extend(0, ptr, length)` to calculate the CRC checksum. However, this would only calculate the CRC checksum for the data part, without considering the **record type**. By using type_crc_, the record type is used as the initial value for the crc32 calculation, so that even for the same content, if the types are different, the calculated crc32 will also be different.

We've mentioned record types here, and the code also records a `block_offset_`. What are these used for? This is the **data segmentation logic** done in AddRecord.

### Data Segmentation Records

**When writing data, if a single piece of data is too large, LevelDB will segment the data into multiple records and write them bit by bit**. After segmentation, one piece of data may include multiple records, so it's necessary to design a good **record organization format** to correctly rebuild the complete data when reading. LevelDB's approach here is quite direct: it adds a record type to each record to identify whether it's a complete record, first part, middle part, or last part. This way, when reading, the data can be assembled in the order of the record types. A piece of data might be segmented in the following ways:

```shell
first(R1), middle(R1), middle(R1), ..., last(R1)
first(R2), last(R2)
full(R3)
```

Here, first, middle, last, and full represent the types of records. All records are placed in **logical blocks**, with the size of a logical block being kBlockSize (32768=32KB), which is defined in [db/log_format.h](https://github.com/google/leveldb/blob/main/db/log_format.h#L27). When segmenting data, it ensures that **a single record does not span logical blocks**. The overall logic for segmenting records is implemented in AddRecord, mainly based on the size of the data, the remaining space in the current logical block, and then determining whether segmentation is needed. For scenarios requiring segmentation, the data is segmented into records, the correct record type is set, and then EmitPhysicalRecord is called to write them one by one. The core code is as follows, with some comments and assert validation logic removed:

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

Note that for data of length 0, a record will still be written here, with the record type as fulltype, and the record only containing a header without a data part. There are specific test cases to verify this situation. Also, note that if after writing some records, the remaining space in the current logical block is less than 7, not enough to write a Header, it will fill the remaining space with `\x00` and then switch to the next logical block.

The **implementation of determining the current record type is quite clever** here, only needing to maintain two flags: begin and end. When starting to write data, begin is true, and after writing a record, begin is updated to false. The update of end is determined by whether the remaining data length is 0. Then, based on the values of begin and end, the current record type can be determined. Note that the order of if-else here is also crucial: if it's both begin and end, it indicates a kFullType record; then if it's only begin, it's kFirstType; if it's only end, it's kLastType; in other cases, it's kMiddleType.

There's a design here worth considering: **why not cross logical blocks when segmenting records**? In fact, if you look at the code for reading WAL logs later, you'll find that this design allows for block-by-block reading. **Records within each block are complete, which means there's no need to handle records spanning blocks, greatly simplifying the reading logic**. Additionally, if a block is damaged, it will only affect the records within that block, not the records in other blocks.

So far, we've introduced the process of writing data to WAL log files. Next, let's look at how to read WAL log files.

## Reading WAL Logs

Compared to segmenting data into records and then writing to log files, the logic for reading logs and reconstructing data is slightly more complex. The [db/log_reader.h](https://github.com/google/leveldb/blob/main/db/log_reader.h#L20) defines a Reader class for reading data from log files. The main data member of Reader is `SequentialFile* const file_;`, which points to a **log file that supports sequential reading**. Similar to WritableFile, SequentialFile is also an abstract class interface defined in include/leveldb/env.h, encapsulating the sequential read operations of the file system. For specific interfaces and implementations, refer to [LevelDB Source Code Reading: Posix File Operation Interface Implementation Details](https://selfboot.cn/en/2024/08/02/leveldb_source_env_posixfile/#%E9%A1%BA%E5%BA%8F%E8%AF%BB%E6%96%87%E4%BB%B6).

The main method of the Reader class is `ReadRecord`, used to read a complete piece of data. It can be called multiple times to sequentially read all the data. If some unexpected data occurs during the reading process, such as invalid record length or CRC check failure, the Reporter interface defined in Reader can be used to record error information. Additionally, Reader supports skipping a certain length of data in the file, used to skip over already read data when recovering data. The complete implementation is in [db/log_reader.cc](https://github.com/google/leveldb/blob/main/db/log_reader.cc), let's take a detailed look.

### Skipping Initial Data

Reader has a last_record_offset_ that records the offset of the latest complete data read, initialized to 0. Subsequently, each time a record of type kFullType or kLastType is read, this value is updated. At the entrance of ReadRecord, it first compares the size of last_record_offset_ and initial_offset_. Here, initial_offset_ is passed in during construction, used to specify the length of data to skip reading. If last_record_offset_ is less than initial_offset_, it needs to skip the initial_offset_ part at the beginning of the file. The implementation of skipping the beginning part is as follows:

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

There's a special case here: if initial_offset_ happens to be at the end of a logical block, the entire logical block needs to be skipped. Determining whether it's at the end of a logical block is simple: take the modulus of initial_offset_ with the size of the logical block (32kb), and if the remaining part is just within the last 6 bytes of the logical block, it's considered to be at the end of the logical block. Note that when skipping, it will only skip entire logical blocks, ensuring reading starts from the **head of the logical block** containing initial_offset_. This may cause the offset of the first record read to be smaller than initial_offset_, which will be handled later in ReadPhysicalRecord.

### Parsing a Complete Piece of Data

ReadRecord is used to read a complete piece of data from the log file. Here, a complete piece of data may include multiple records, each of which needs to be read out and then concatenated.

First, **in_fragmented_record** is used to mark whether we're currently in a **fragmented record**, initialized to false. Then it enters a while loop, continuously calling ReadPhysicalRecord to read out records, saving them in fragment, and then processing them according to the record type. Note that there's a `resyncing_` here, which is set to true during initialization if there's data to be skipped (initial_offset_>0), indicating that it's currently in a state of skipping data. In this state, as long as a record of type kFullType is read, resyncing_ will be updated to false, indicating the end of data skipping and the start of normal data reading.

When reading data, it will determine whether data needs to be concatenated based on the current record type.

- If it's of type kFullType, it means this is a complete piece of data. fragment is directly set as result, and last_record_offset_ is updated.
- If it's of type kFirstType, it means this is the beginning of a new piece of data. This record is saved in scratch, and in_fragmented_record is set to true.
- If it's of type kMiddleType, it means this is a middle part of a piece of data. in_fragmented_record must be true at this time, otherwise an error is reported. In this case, scratch continues to concatenate new records.
- If it's of type kLastType, it means this is the last part of a piece of data. in_fragmented_record must be true at this time, otherwise an error is reported. The last part of fragment is concatenated to scratch, then scratch is set as result, last_record_offset_ is updated, and it returns.

There are also other record types, such as kEof and kBadRecord, which are abnormal situations and need special handling. The core logic of ReadRecord is as follows, with some error handling code omitted:

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

ReadPhysicalRecord **encapsulates the process of extracting records from logical blocks**. The size of a logical block is kBlockSize=32KB, which is defined in [db/log_format.h](https://github.com/google/leveldb/blob/main/db/log_format.h#L27). When we read files from disk, we **use logical blocks as the minimum reading unit**, read them into memory cache, and then parse the records one by one. Here, the outermost layer is a while loop. It first checks the size of buffer_. If the data in buffer_ is not enough to parse out a record (length less than kHeaderSize), it reads a logical block of data from the file into buffer_.

- If the length read from the file is less than kBlockSize, it means it has reached the end of the file. In this case, eof_ is set to true, then it continues into the loop, clears the data in buffer_, and returns kEof.
- If there's an error reading the file, it reports the read failure using ReportDrop, clears buffer_, sets eof_ to true, and then directly returns kEof.
- If it successfully reads kBlockSize of content into buffer_, it proceeds to parse the records.

Of course, there might be multiple records in a logical block Block. ReadPhysicalRecord returns after parsing each record. Before returning, it updates the pointer of buffer_ to point to the start position of the next record. When re-entering ReadPhysicalRecord, if it finds there are still records in buffer_ (length greater than kHeaderSize), it won't read from the file but directly parse from buffer_ continuing from the last position.

The specific code for parsing records is the opposite of writing records above. It first parses information such as length and crc32 from the Header, then saves the record data in result, and finally updates the data of buffer_ to point to the start position of the next record.

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
    buffer_.remove_prefix(kHeaderSize + length);    // Point to the start position of the next record
    // ...
    *result = Slice(header + kHeaderSize, length);
    return type;
  }
```

The code above omitted some exception handling logic, such as invalid record length and CRC check failure. The exception handling here mainly uses the Reporter interface to record error information and then clear buffer_. This way, even if some exceptions occur during the reading process, it will at most affect the current buffer_ parsing without affecting the reading and parsing of subsequent logical blocks.

There's another exception: **when the current record is within the skipped initial_offset_ range**. This is because when we skipped earlier, we only skipped entire logical blocks, ensuring reading starts from the **head of the logical block** containing initial_offset_. If the offset of the current record is less than initial_offset_, it means this record needs to be skipped. In this case, it adjusts the starting part of buffer_ and returns kBadRecord.

## WAL Read and Write Testing

[db/log_test.cc](https://github.com/google/leveldb/blob/main/db/log_test.cc) provides some utility helper classes and functions, as well as detailed test cases, to fully test the WAL log reading and writing here. For example, BigString is used to generate strings of specified length, and the LogTest class encapsulates the read and write logic of Reader and Writer, exposing convenient interfaces for testing, such as Write, ShrinkSize, Read, etc. Additionally, it doesn't directly read files but implements a StringSource class inheriting from SequentialFile, using string to simulate file reading. It also implements a StringDest class inheriting from WritableFile, using string to simulate file writing.

Here are some test cases for normal reading and writing:

- Empty: Tests reading an empty file directly, returning EOF.
- ReadWrite: Tests simple writing and reading, ensuring that written data can be correctly read. Here, an empty string is written and can be normally read out.
- ManyBlocks: Tests writing a large number of strings of different lengths, occupying multiple logical blocks. Then reads them one by one to ensure they can be correctly read.
- Fragmentation: Tests writing extremely large strings, where each piece of data needs to occupy multiple records. Then reads them one by one to ensure they can be correctly read.

In addition, some test cases for abnormal situations are constructed. For example, TruncatedTrailingRecordIsIgnored is used in LevelDB's log system to verify the handling of **truncated records at the end of log files**. When the last record of a log file is not completely written (for example, due to system crash or other write interruption events), this incomplete record should be ignored rather than treated as an error.

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

BadLength is used to verify the behavior when dealing with corrupted record length fields. The test ensures that the log system can correctly identify and ignore invalid records caused by **errors in the record length field**, while being able to continue reading subsequent valid records and report appropriate error messages.

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

Here, IncrementByte is used to increase the value at the 4th byte by 1. This position stores the length information of the record, thus causing the record length to increase. When reading, it will find that the record length is invalid and then report an error message. The logic for checking the length is in ReadPhysicalRecord, as follows:

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

In addition, a large number of test cases are constructed to verify the initial skip length. A function CheckInitialOffsetRecord is encapsulated here to verify whether the records with initial skip length are correctly skipped. This function will write some records, then set initial_offset_ to read records, verifying whether records of initial_offset_ length have been skipped.

Through a large number of test cases, the correctness of the WAL log read and write logic is ensured. The test cases here are also very worth learning, as they can help us better understand the read and write logic of WAL logs.