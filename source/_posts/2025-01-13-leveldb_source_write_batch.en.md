---
title: LevelDB Explained - Elegant Merging of Write and Delete Operations
tags:
  - C++
  - LevelDB
category: Source Code Analysis
toc: true
description: This article provides an in-depth analysis of WriteBatch design and implementation in LevelDB, detailing how it improves performance through batch write and delete operations. The article explores WriteBatch's interface design, sequence number mechanism, operation record storage format, and other aspects, examining core functionalities like global sequence number increment, operation counting, and data format validation through source code analysis. Additionally, it demonstrates practical usage scenarios through test cases, making it valuable reading for developers interested in LevelDB or storage system design.
date: 2025-01-13 22:00:00
---

LevelDB supports both single key-value writes and batch writes. These two types of operations are essentially handled the same way - they're both encapsulated in a WriteBatch object, which helps improve write operation efficiency.

In LevelDB, WriteBatch is implemented using a simple data structure that contains a series of write operations. These operations are serialized (converted to byte streams) and stored in an internal string. Each operation includes an operation type (such as insert or delete), key, and value (for insert operations).

When a WriteBatch is committed to the database, its contents are parsed and applied to both the WAL log and memtable. Regardless of how many operations a WriteBatch contains, they are processed and logged as a single unit.

<!-- more -->

WriteBatch's implementation primarily involves 4 files, let's examine them:

1. [include/leveldb/write_batch.h](https://github.com/google/leveldb/blob/main/include/leveldb/write_batch.h): The public interface file defining the WriteBatch class interface.
2. [db/write_batch_internal.h](https://github.com/google/leveldb/blob/main/db/write_batch_internal.h): Internal implementation file defining the WriteBatchInternal class, providing methods to manipulate WriteBatch.
3. [db/write_batch.cc](https://github.com/google/leveldb/blob/main/db/write_batch.cc): The implementation file for the WriteBatch class.
4. [db/write_batch_test.cc](https://github.com/google/leveldb/blob/main/db/write_batch_test.cc): Test file for WriteBatch functionality.

## WriteBatch Interface Design

Let's first look at write_batch.h, which defines the public interfaces of the WriteBatch class. While LevelDB's code comments are very clear, we'll skip them for now:

```cpp
class LEVELDB_EXPORT WriteBatch {
 public:
  class LEVELDB_EXPORT Handler {
   public:
    virtual ~Handler();
    virtual void Put(const Slice& key, const Slice& value) = 0;
    virtual void Delete(const Slice& key) = 0;
  };

  WriteBatch();

  // Intentionally copyable.
  WriteBatch(const WriteBatch&) = default;
  WriteBatch& operator=(const WriteBatch&) = default;

  ~WriteBatch();
  void Put(const Slice& key, const Slice& value);
  void Delete(const Slice& key);
  void Clear();
  size_t ApproximateSize() const;
  void Append(const WriteBatch& source);
  Status Iterate(Handler* handler) const;

 private:
  friend class WriteBatchInternal;

  std::string rep_;  // See comment in write_batch.cc for the format of rep_
};
```

The [WriteBatch::Handler](https://github.com/google/leveldb/blob/main/include/leveldb/write_batch.h#L35) is an abstract base class that defines interfaces for handling key-value operations, containing only Put and Delete methods. This design allows the WriteBatch class implementation to be decoupled from **specific storage operations**, meaning WriteBatch doesn't need to know directly how to apply operations to underlying storage (like MemTable).

**By inheriting from the Handler class, various handlers can be created that implement these methods differently**. For example:

1. MemTableInserter: Defined in db/write_batch.cc, stores key-value operations in MemTable.
2. WriteBatchItemPrinter: Defined in db/dumpfile.cc, prints key-value operations to a file for testing.

Additionally, there's a `friend class WriteBatchInternal` that can access WriteBatch's private and protected members. **WriteBatchInternal mainly encapsulates internal operations that don't need to be exposed publicly and are only used internally. By hiding internal operation methods in WriteBatchInternal, the object's interface remains clean, and internal implementations can be modified freely without affecting code that uses these objects**.

### WriteBatch Usage

At the application level, we can use WriteBatch to write multiple key-value pairs in batch, then write the WriteBatch to the database using the `DB::Write` method.

WriteBatch supports Put and Delete operations and can merge multiple WriteBatches. Here's a usage example:

```cpp
WriteBatch batch;
batch.Put("key1", "value1");
batch.Put("key2", "value2");
batch.Delete("key3");

// Merge another batch
WriteBatch another_batch;
another_batch.Put("key4", "value4");
batch.Append(another_batch);

// Write to database
db->Write(writeOptions, &batch);
```

## WriteBatch Implementation Details

So how is WriteBatch implemented? The key lies in [db/write_batch.cc](https://github.com/google/leveldb/blob/main/db/write_batch.cc), where the class has a private member `std::string rep_` to store serialized key-value operations. Let's first look at the storage data protocol:

```
+---------------+---------------+----------------------------------------+
|   Sequence    |     Count     |                Data                    |
|  (8 bytes)    |   (4 bytes)   |                                        |
+---------------+---------------+----------------------------------------+
                                   |                 |                   |
                                   v                 v                   v
                               +-------+         +-------+          +-------+
                               |Record1|         |Record2|   ...    |RecordN|
                               +-------+         +-------+          +-------+
                                  |                 |
                                  v                 v
                        +-----------------+ +-----------------+
                        | kTypeValue      | | kTypeDeletion   |
                        | Varstring Key   | | Varstring Key   |
                        | Varstring Value | |                 |
                        +-----------------+ +-----------------+
                        
Varstring (variable-length string):
+-------------+-----------------------+
| Length (varint32) | Data (uint8[])  |
+-------------+-----------------------+
```

The first 12 bytes of this string are header metadata, including 8 bytes for sequence number and 4 bytes for count. Following that are one or more operation records, each containing an operation type and key-value pair. The operation type is a single byte, which can be either Put or Delete. Keys and values are variable-length strings in varstring format.

### LevelDB's Sequence Number Mechanism

The first 8 bytes of rep_ represent a 64-bit sequence number. The WriteBatchInternal friend class provides two methods to get and set the sequence number, internally using [EncodeFixed64 and DecodeFixed64](https://selfboot.cn/en/2024/08/29/leveldb_source_utils/#Integer-Encoding-and-Decoding) methods to encode and decode the 64-bit sequence number.

```cpp
SequenceNumber WriteBatchInternal::Sequence(const WriteBatch* b) {
  return SequenceNumber(DecodeFixed64(b->rep_.data()));
}

void WriteBatchInternal::SetSequence(WriteBatch* b, SequenceNumber seq) {
  EncodeFixed64(&b->rep_[0], seq);
}
```

**Sequence numbers are globally incrementing identifiers in LevelDB, used for version control and operation ordering**. Each WriteBatch receives a consecutive range of sequence numbers during execution, with each operation (Put/Delete) within the batch being assigned one of these numbers. Sequence numbers serve three core purposes in LevelDB:

1. **Version Control**: Each key in LevelDB can have multiple versions, each corresponding to a sequence number. When reading, sequence numbers are compared to determine which version to return. Higher sequence numbers indicate newer versions.

2. **Multi-Version Concurrency Control (MVCC)**: Write operations get new sequence numbers and create new versions of keys. Read operations can specify a sequence number to access data snapshots at that point in time. This mechanism allows concurrent execution of read and write operations without blocking each other.

3. **Crash Recovery**: WAL (Write-Ahead Log) records operation sequence numbers. During system restart, sequence numbers help accurately rebuild the data state at the time of crash, avoiding duplicate application of already persisted operations.

This design allows LevelDB to maintain data consistency while implementing efficient concurrency control.

The sequence number setting logic is in the [DBImpl::Write](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L1222) method, which first gets the current maximum sequence number, then allocates a new sequence number for the WriteBatch.

```cpp
Status DBImpl::Write(const WriteOptions& options, WriteBatch* updates) {
  // ...
  uint64_t last_sequence = versions_->LastSequence();
  // ...
  if (status.ok() && updates != nullptr) {  // nullptr batch is for compactions
    WriteBatch* write_batch = BuildBatchGroup(&last_writer);
    WriteBatchInternal::SetSequence(write_batch, last_sequence + 1);
    last_sequence += WriteBatchInternal::Count(write_batch);
    // ...
  }
}
```

If a WriteBatch contains multiple operations, these operations are assigned sequence numbers consecutively. When writing to the WAL log, the WriteBatch's sequence number is written to the log, allowing operations to be recovered in order during recovery. After writing to the memtable, the current maximum sequence number is updated for the next allocation.

### Count for Operation Tracking

The header also includes 4 bytes for count, which records the number of operations in the WriteBatch. The count is incremented for each put or delete operation. For example:

```cpp
WriteBatch batch;
batch.Put("key1", "value1");  // count = 1
batch.Put("key2", "value2");  // count = 2
batch.Delete("key3");         // count = 3
int num_ops = WriteBatchInternal::Count(&batch);  // = 3
```

When merging two WriteBatches, their counts are also accumulated, as shown in the [WriteBatchInternal::Append](https://github.com/google/leveldb/blob/main/db/write_batch.cc#L144) method:

```cpp
void WriteBatchInternal::Append(WriteBatch* dst, const WriteBatch* src) {
  SetCount(dst, Count(dst) + Count(src));
  assert(src->rep_.size() >= kHeader);
  dst->rep_.append(src->rep_.data() + kHeader, src->rep_.size() - kHeader);
}
```

The count is used primarily in two places. First, when iterating through each record, it's used for [integrity checking](https://github.com/google/leveldb/blob/main/db/write_batch.cc#L75) to ensure no operations are missed.

```cpp
Status WriteBatch::Iterate(Handler* handler) const {
  Slice input(rep_);

  ...
  if (found != WriteBatchInternal::Count(this)) {
    return Status::Corruption("WriteBatch has wrong count");
  } else {
    return Status::OK();
  }
}
```

Second, during database writes, the count helps pre-determine how many sequence numbers need to be allocated, ensuring sequence number continuity. As shown in [DBImpl::Write](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L449):

```cpp
WriteBatchInternal::SetSequence(write_batch, last_sequence + 1);
last_sequence += WriteBatchInternal::Count(write_batch);
```

### Supported Operations

After the header's sequence and count, rep_ contains a series of records, each including an operation type and key-value pair. Records can be added through Put and Delete methods. Here's the implementation of Put:

```cpp
void WriteBatch::Put(const Slice& key, const Slice& value) {
  WriteBatchInternal::SetCount(this, WriteBatchInternal::Count(this) + 1);
  rep_.push_back(static_cast<char>(kTypeValue));
  PutLengthPrefixedSlice(&rep_, key);
  PutLengthPrefixedSlice(&rep_, value);
}
```

This updates the count, adds the kTypeValue operation type, then adds the key and value. The Delete operation is similar - it increments the count, uses kTypeDeletion as the operation type, and only needs to add the key.

```cpp
void WriteBatch::Delete(const Slice& key) {
  WriteBatchInternal::SetCount(this, WriteBatchInternal::Count(this) + 1);
  rep_.push_back(static_cast<char>(kTypeDeletion));
  PutLengthPrefixedSlice(&rep_, key);
}
```

Above shows how records are added to rep_, but how are these records parsed from rep_? The WriteBatch class provides an [Iterate](https://github.com/google/leveldb/blob/main/db/write_batch.cc#L42) method that traverses each record in rep_ and flexibly handles these records through the passed Handler interface.

Additionally, the implementation includes **data format validation, checking header size, operation type, and operation count matching**. It can return Corruption errors indicating incorrect data format. Here's the core code of Iterate:

```cpp
Status WriteBatch::Iterate(Handler* handler) const {
  Slice input(rep_);
  if (input.size() < kHeader) {
    return Status::Corruption("malformed WriteBatch (too small)");
  }

  input.remove_prefix(kHeader);
  Slice key, value;
  int found = 0;
  while (!input.empty()) {
    found++;
    char tag = input[0];
    input.remove_prefix(1);
    switch (tag) {
      case kTypeValue:
        if (GetLengthPrefixedSlice(&input, &key) &&
            GetLengthPrefixedSlice(&input, &value)) {
          handler->Put(key, value);
        } else {
          return Status::Corruption("bad WriteBatch Put");
        }
        break;
      case kTypeDeletion:
        if (GetLengthPrefixedSlice(&input, &key)) {
          handler->Delete(key);
        } else {
          return Status::Corruption("bad WriteBatch Delete");
        }
        break;
      default:
        return Status::Corruption("unknown WriteBatch tag");
    }
  }
  // ...
}
```

As mentioned earlier, Handler is WriteBatch's abstract base class and can accept different implementations. When writing data in LevelDB, the MemTableInserter class is passed in, which stores operation data in MemTable. Here's the specific implementation:

```cpp
Status WriteBatchInternal::InsertInto(const WriteBatch* b, MemTable* memtable) {
  MemTableInserter inserter;
  inserter.sequence_ = WriteBatchInternal::Sequence(b);
  inserter.mem_ = memtable;
  return b->Iterate(&inserter);
}
```

Overall, WriteBatch is responsible for storing key-value operation data and handling encoding/decoding, while Handler is responsible for processing each piece of data specifically. This allows WriteBatch operations to be flexibly applied to different scenarios, facilitating extension.

## Test Case Analysis

Finally, let's look at [write_batch_test.cc](https://github.com/google/leveldb/blob/main/db/write_batch_test.cc), which provides test cases for WriteBatch functionality.

First, it defines a PrintContents function to output all operation records in WriteBatch. It uses MemTableInserter to store WriteBatch operation records in MemTable, then traverses all records using MemTable's iterator and saves them to a string.

The test cases cover the following scenarios:

1. Empty: Tests if an empty WriteBatch works normally
2. Multiple: Tests multiple Put and Delete operations
3. Corruption: Writes data then deliberately truncates some records to test reading as many normal records as possible
4. Append: Tests merging two WriteBatches, including sequence numbers and empty WriteBatch cases
5. ApproximateSize: Tests the ApproximateSize method for calculating approximate WriteBatch size

Through these test cases, we can understand how to use WriteBatch. Interestingly, when looking at the Append code earlier, we didn't notice whose sequence number is used after merging. Looking at the test cases, we discover it uses the target WriteBatch's sequence number:

```cpp
TEST(WriteBatchTest, Append) {
  WriteBatch b1, b2;
  WriteBatchInternal::SetSequence(&b1, 200);
  WriteBatchInternal::SetSequence(&b2, 300);
  b1.Append(b2);
  ASSERT_EQ("", PrintContents(&b1));
  b2.Put("a", "va");
  b1.Append(b2);
  ASSERT_EQ("Put(a, va)@200", PrintContents(&b1));
  // ...
}
```

## Summary

By delving into the implementation of LevelDB's WriteBatch, we can clearly see the ingenuity of its design. WriteBatch improves the efficiency of write operations and simplifies the implementation of concurrency control and fault recovery by encapsulating multiple write and delete operations together. Several highlights are worth noting:

1. **Batch Operations**: WriteBatch allows combining multiple Put and Delete operations into a single batch, reducing frequent I/O operations and enhancing write performance.
2. **Sequence Number Mechanism**: Through globally incrementing sequence numbers, LevelDB achieves Multi-Version Concurrency Control (MVCC), ensuring consistency in read and write operations.
3. **Handler Abstraction**: The Handler interface decouples the specific implementation of operations from storage logic, making the code more flexible and extensible.
4. **Data Format Validation**: When parsing WriteBatch, LevelDB performs strict data format validation to ensure data integrity and correctness.

Of course, this article only analyzes the implementation of WriteBatch and does not cover the entire write process of LevelDB. In future articles, we will continue to explore the complete flow of writing a key.