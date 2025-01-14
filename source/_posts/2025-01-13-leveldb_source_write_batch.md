---
title: LevelDB 源码阅读：如何优雅地合并写入和删除操作
tags:
  - C++
  - LevelDB
category: 源码剖析
toc: true
date: 2025-01-13 22:00:00
description: 本文深入剖析了 LevelDB 中 WriteBatch 的设计与实现，详细介绍了其如何通过批量写入和删除操作提升性能。文章从 WriteBatch 的接口设计、序列号机制、操作记录存储格式等方面展开，结合源码分析了其核心功能，如序列号的全局递增、操作计数、数据格式验证等。此外，文章还通过测试用例展示了 WriteBatch 的实际使用场景，适合对 LevelDB 或存储系统设计感兴趣的开发者阅读。
---

LevelDB 支持写入单个键值对和批量写入多个键值对，这两种操作的处理流程本质上是相同的，都会被封装进一个 WriteBatch 对象中，这样就可以提高写操作的效率。

在 LevelDB 中，WriteBatch 是通过一个简单的数据结构实现的，其中包含了一系列的写入操作。这些操作被序列化（转换为字节流）并存储在内部的一个字符串中。每个操作都包括操作类型（如插入或删除），键和值（对于插入操作）。

当 WriteBatch 被提交给数据库时，其内容被解析并应用到 WAL 日志和 memtable 中。不管 WriteBatch 中包含多少操作，它们都将作为一个整体进行处理和日志记录。

<!-- more -->

WriteBatch 的实现主要涉及到 4 个文件，接下来一起看看。

1. [include/leveldb/write_batch.h](https://github.com/google/leveldb/blob/main/include/leveldb/write_batch.h)：对外暴露的接口文件，定义了 WriteBatch 类的接口。
2. [db/write_batch_internal.h](https://github.com/google/leveldb/blob/main/db/write_batch_internal.h)：内部实现文件，定义了 WriteBatchInternal 类，提供了一些操作 WriteBatch 的方法。
3. [db/write_batch.cc](https://github.com/google/leveldb/blob/main/db/write_batch.cc)：WriteBatch 类的实现文件，实现了 WriteBatch 类。
4. [db/write_batch_test.cc](https://github.com/google/leveldb/blob/main/db/write_batch_test.cc)：WriteBatch 类的测试文件，用于测试 WriteBatch 的功能。

## WriteBatch 接口设计

我们先来看 write_batch.h 文件，这里定义了 WriteBatch 类对外暴露的一些接口。 LevelDB 代码中的注释十分清晰，不过这里先省略注释：

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

其中 [WriteBatch::Handler](https://github.com/google/leveldb/blob/main/include/leveldb/write_batch.h#L35) 是一个抽象基类，定义了处理键值对操作的接口，只包括 Put 和 Delete 方法。这样的设计允许 WriteBatch 类实现与**具体存储操作**解耦，使得 WriteBatch 不必直接知道如何将操作应用到底层存储（如 MemTable）。

**通过继承 Handler 类，可以创建多种处理器，它们可以以不同的方式实现这些方法**。比如：

1. MemTableInserter： 定义在 db/write_batch.cc 中，将键值操作存储到 MemTable 中。
2. WriteBatchItemPrinter：定义在 db/dumpfile.cc 中，将键值操作打印到文件中，可以用来测试。

另外还有一个 `friend class WriteBatchInternal` 作为 WriteBatch 的友元类，能够访问其私有和受保护成员。**WriteBatchInternal 主要用来封装一些内部操作，这些方法不需要对外暴露，只在内部用到。通过将内部操作方法隐藏在 WriteBatchInternal 中，保持了对象的接口清晰，可以自由地修改内部实现而不影响到使用这些对象的代码**。

### WriteBatch 使用方法

在应用层，我们可以通过 WriteBatch 来批量写入多个键值对，然后通过 `DB::Write` 方法将 WriteBatch 写入到数据库中。

这里 WriteBatch 支持 Put 和 Delete 操作，可以合并多个 WriteBatch。如下使用示例：

```cpp
WriteBatch batch;
batch.Put("key1", "value1");
batch.Put("key2", "value2");
batch.Delete("key3");

// 合并另一个批次
WriteBatch another_batch;
another_batch.Put("key4", "value4");
batch.Append(another_batch);

// 写入数据库
db->Write(writeOptions, &batch);
```

## WriteBatch 实现细节

那么 WriteBatch 是怎么实现的呢？关键在 [db/write_batch.cc](https://github.com/google/leveldb/blob/main/db/write_batch.cc)，该类中有一个 private 成员 `std::string rep_` 来存储序列化后的键值操作。我们先来看看这里的存储数据协议：

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
                        
Varstring (可变长度字符串):
+-------------+-----------------------+
| Length (varint32) | Data (uint8[])  |
+-------------+-----------------------+
```

该字符串前 12 个字节是头部元数据部分，包括 8 个字节的序列号和 4 个字节的 count 数。接下来是一个或多个操作记录，每个记录包含一个操作类型和键值对。操作类型是一个字节，可以是 Put 或者 Delete 操作。键和值都是可变长度的字符串，格式为 varstring。

### LevelDB 的序列号机制

rep_ 头部 8 个字节代表64位的数字 sequence（序列号），WriteBatchInternal 友元类提供了两个方法来获取和设置 sequence number，内部是用 [EncodeFixed64 和 DecodeFixed64](https://selfboot.cn/2024/08/29/leveldb_source_utils/#%E6%95%B4%E6%95%B0%E7%BC%96%E3%80%81%E8%A7%A3%E7%A0%81) 方法来编解码 64 位的序列号。

```cpp
SequenceNumber WriteBatchInternal::Sequence(const WriteBatch* b) {
  return SequenceNumber(DecodeFixed64(b->rep_.data()));
}

void WriteBatchInternal::SetSequence(WriteBatch* b, SequenceNumber seq) {
  EncodeFixed64(&b->rep_[0], seq);
}
```

**序列号是 LevelDB 中的全局递增标识符，用于实现版本控制和操作排序**。每个 WriteBatch 在执行时会获得一段连续的序列号，批次内的每个操作（Put/Delete）都会分配到其中的一个序列号。序列号在 LevelDB 中有三个核心作用：

1. **版本控制**：LevelDB 中的每个 key 可以有多个版本，每个版本都对应一个序列号。在读取时，通过比较序列号来确定应该返回哪个版本的值。较大的序列号表示更新的版本。
2. **多版本并发控制（MVCC）**：写操作获取新的序列号，创建 key 的新版本。读操作可以指定序列号，访问该序列号时间点的数据快照。这种机制使得读写操作可以并发执行，无需互相阻塞。
3. **故障恢复**：WAL（预写日志）中记录了操作的序列号。系统重启时，通过序列号可以准确重建崩溃时的数据状态，避免重复应用已持久化的操作。

这种设计让 LevelDB 既保证了数据一致性，又实现了高效的并发控制。

设置序列号的逻辑在 [DBImpl::Write](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L1222) 方法中，首先获取当前最大序列号，然后为 WriteBatch 分配一个新的序列号。

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

如果 WriteBatch 包含多个操作，那么这些操作会**连续地分配序列号**。在写入 WAL 日志时，会将 WriteBatch 的序列号写入到日志中，这样在恢复时可以根据序列号来恢复操作的顺序。写入 memtable 之后，会更新当前最大序列号，以便下次分配。

### count 记录操作数

头部还有 4 个字节的 count，用于记录 WriteBatch 中包含的操作数。这里每次 put 或者 delete 操作都会增加 count 的值。如下示例：

```cpp
WriteBatch batch;
batch.Put("key1", "value1");  // count = 1
batch.Put("key2", "value2");  // count = 2
batch.Delete("key3");         // count = 3
int num_ops = WriteBatchInternal::Count(&batch);  // = 3
```

在合并两个 WriteBatch 的时候，也会累计两部分的 count 的值，如下 [WriteBatchInternal::Append](https://github.com/google/leveldb/blob/main/db/write_batch.cc#L144) 方法：

```cpp
void WriteBatchInternal::Append(WriteBatch* dst, const WriteBatch* src) {
  SetCount(dst, Count(dst) + Count(src));
  assert(src->rep_.size() >= kHeader);
  dst->rep_.append(src->rep_.data() + kHeader, src->rep_.size() - kHeader);
}
```

使用 count 的地方主要有两个，一个是在迭代这里每个记录的时候，会用 [count 来做完整性检查](https://github.com/google/leveldb/blob/main/db/write_batch.cc#L75)，确保没有遗漏操作。

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

另一个是在 db 写入的时候，根据 count 可以预先知道需要分配多少序列号，保证序列号连续性。如下 [DBImpl::Write](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L449)：

```cpp
WriteBatchInternal::SetSequence(write_batch, last_sequence + 1);
last_sequence += WriteBatchInternal::Count(write_batch);
```

### 支持的各种操作

在头部的 sequence 和 count 之后，rep_ 紧跟着的是一系列的记录，每个记录包含一个操作类型和键值。这里记录可以通过 Put 和 Delete 方法来添加，其中 Put 方法的实现如下：

```cpp
void WriteBatch::Put(const Slice& key, const Slice& value) {
  WriteBatchInternal::SetCount(this, WriteBatchInternal::Count(this) + 1);
  rep_.push_back(static_cast<char>(kTypeValue));
  PutLengthPrefixedSlice(&rep_, key);
  PutLengthPrefixedSlice(&rep_, value);
}
```

这里更新了 count，然后添加了 kTypeValue 操作类型，接着是添加 key 和 value。Delete 操作类似，count 计数也是要加 1，然后操作类型是 kTypeDeletion，最后只用添加 key 即可。

```cpp
void WriteBatch::Delete(const Slice& key) {
  WriteBatchInternal::SetCount(this, WriteBatchInternal::Count(this) + 1);
  rep_.push_back(static_cast<char>(kTypeDeletion));
  PutLengthPrefixedSlice(&rep_, key);
}
```

上面是往 rep_ 中添加记录，那么如何从 rep_ 中解析出这些记录呢？这里 WriteBatch 类中提供了一个 [Iterate](https://github.com/google/leveldb/blob/main/db/write_batch.cc#L42) 方法，该方法遍历 rep_ 中的每条记录，然后通过传入的 Handler 接口来灵活处理这些记录。 

此外该方法的实现中还有**数据格式验证，会检查头部大小、操作类型、操作数量是否匹配**。可以返回 Corruption 错误，表示数据格式不正确等。Iterate 核心代码如下：

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

前面提过 Handler 是 WriteBatch 的抽象基类，可以传入不同的实现。在 LevelDB 写数据的时候，这里传入的是 MemTableInserter 类，该类将操作数据存储到 MemTable 中。具体可以调用这里的实现：

```cpp
Status WriteBatchInternal::InsertInto(const WriteBatch* b, MemTable* memtable) {
  MemTableInserter inserter;
  inserter.sequence_ = WriteBatchInternal::Sequence(b);
  inserter.mem_ = memtable;
  return b->Iterate(&inserter);
}
```

整体上看 WriteBatch 负责存储键值操作的数据，进行编码解码等，而 Handler 负责具体处理里面的每条数据。这样 WriteBatch 的操作就可以被灵活地应用到不同场景中，方便扩展。

## 测试用例分析

最后再来看看 [write_batch_test.cc](https://github.com/google/leveldb/blob/main/db/write_batch_test.cc)，这里提供了一些测试用例，用于测试 WriteBatch 的功能。

首先定义了一个 PrintContents 函数，用来输出 WriteBatch 中的所有操作记录。这里用 MemTableInserter 将 WriteBatch 中的操作记录存储到 MemTable 中，然后通过 MemTable 的迭代器遍历所有记录，并保存到字符串中。

这里测试用例覆盖了下面这些情况：

1. Empty：测试空的 WriteBatch 是否正常；
2. Multiple：测试多个 Put 和 Delete 操作，验证总的 count 数目和每个操作的序列号是否正确；
3. Corruption：先写进去数据，然后故意截断部分记录，测试能读取尽量多的正常数据；
4. Append：测试合并两个 WriteBatch，验证合并后序列号的正确性，以及合并空 WriteBatch；
5. ApproximateSize：测试 ApproximateSize 方法，计算 WriteBatch 的近似大小； 

这里通过测试用例，基本就能知道怎么使用 WriteBatch 了。比较有意思的是，前面在看 Append 代码的时候，没太留意到合并后这里序列号是用谁的。这里结合测试用例，才发现取的目标 WriteBatch 的序列号。

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

## 总结

通过深入分析 LevelDB 的 WriteBatch 实现，我们可以清晰地看到其设计精妙之处。WriteBatch 通过将多个写入和删除操作封装在一起，不仅提高了写操作的效率，还简化了并发控制和故障恢复的实现。有几个亮点值得借鉴：

1. **批量操作**：WriteBatch 允许将多个 Put 和 Delete 操作合并为一个批次，减少了频繁的 I/O 操作，提升了写入性能。
2. **序列号机制**：通过全局递增的序列号，LevelDB 实现了多版本并发控制（MVCC），确保了读写操作的一致性。
3. **Handler 抽象**：通过 Handler 接口，WriteBatch 将操作的具体实现与存储逻辑解耦，使得代码更加灵活和可扩展。
4. **数据格式验证**：在解析 WriteBatch 时，LevelDB 会进行严格的数据格式验证，确保数据的完整性和正确性。

当然本篇只是分析 WriteBatch 的实现，并没有串起 LevelDB 的整个写入流程，后续文章我们会继续分析，写入一个 key 的完整流程。