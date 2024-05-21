---
title: LevelDB 源码阅读：批量写的优雅设计
tags: [C++, LevalDB]
category: 源码剖析
toc: true
description: 
---

LevelDB 支持写入单个键值对和批量写入多个键值对，这两种操作的处理流程本质上是相同的，都会被封装进一个 WriteBatch 对象中，这样做的目的是提高写操作的效率和保持操作的原子性。

在 LevelDB 中，WriteBatch 是通过一个简单的数据结构实现的，其中包含了一系列的写入操作。这些操作被序列化（转换为字节流）并存储在内部的一个字符串中。每个操作都包括操作类型（如插入或删除），键和值（对于插入操作）。当 WriteBatch 被提交给数据库时，其内容被解析并应用到 WAL 日志和 memtable 中。这意味着不管 WriteBatch 中包含多少操作，它们都将作为一个整体进行处理和日志记录。

如果一次只写入一个键值对，内部也是独立的 WriteBatch 来处理，这个键值对会立即被写入 WAL 并更新到 memtable。如果想利用批量写入的性能优势，则需要在**应用层聚合这些写入操作**。例如，我们可以设计一个缓冲机制，收集一定时间内的写入请求，然后将它们打包在一个 WriteBatch 中提交。这种方式可以减少对磁盘的写入次数和上下文切换，从而提高性能。

<!-- more -->

这里 WriteBatch 的实现主要涉及到 4 个文件：

1. include/leveldb/write_batch.h：对外暴露的接口文件，定义了 WriteBatch 类的接口。
2. db/write_batch_internal.h：内部实现文件，定义了 WriteBatchInternal 类，提供了一些操作 WriteBatch 的方法。
3. db/write_batch.cc：WriteBatch 类的实现文件，实现了 WriteBatch 类。
4. db/write_batch_test.cc：WriteBatch 类的测试文件，用于测试 WriteBatch 的功能。

## 类的设计

我们先来看 `write_batch.h` 文件，这里定义了 WriteBatch 类对外暴露的一些接口。 LevelDB 代码中的注释十分清晰，不过这里先省略注释：

```c++
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

`WriteBatch::Handler` 是一个抽象基类，定义了处理键值对操作的接口，只包括 Put 和 Delete 方法。这样的设计允许 WriteBatch 类实现与**具体存储操作**解耦，使得 WriteBatch 不必直接知道如何将操作应用到底层存储（如 MemTable）。通过继承 Handler 类，可以创建多种处理器，它们可以以不同的方式实现这些方法。比如：

1. MemTableInserter： 定义在 `db/write_batch.cc` 中，将操作应用到 MemTable 中。
2. WriteBatchItemPrinter：定义在 `db/dumpfile.cc` 中，将操作打印到文件中。

另外还有一个 `friend class WriteBatchInternal` 作为 WriteBatch 的友元类，能够访问其私有和受保护成员。WriteBatchInternal 主要用来封装一些内部操作，这些方法不需要对外暴露，只在内部用到。通过将内部操作方法隐藏在 WriteBatchInternal 中，保持了对象的接口清晰，并且可以自由地修改内部实现而不影响到使用这些对象的代码。

## 实现细节

WriteBatch 的具体实现在 `db/write_batch.cc` 文件中，类中用private成员 `std::string rep_` 来存储序列化后的操作。存储数据协议如下：

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

rep_ 字符串的前 12 个字节分别是 8 个字节的 sequence number 和 4 个字节的操作数 count。接下来是一个或多个操作记录，每个记录包含一个操作类型和键值对。操作类型是一个字节，用来区分 Put 和 Delete 操作。键和值都是可变长度的字符串，格式为 varstring。

### sequence number

rep_ 头部 8 个字节代表64位的数字sequence（序列号），用来确保数据库操作的顺序性和一致性。`sequence number` 是为每个写操作分配的唯一标识符，用于记录写操作的顺序，这对于多版本并发控制（MVCC）和事务日志（WAL）至关重要。

- **操作顺序性**：sequence number 确保了写操作的顺序性。LevelDB 是一个键值存储，但支持相同键的多个版本。sequence number 用来区分同一个键的不同版本，确保读取操作总是能访问到正确版本的数据。
- **多版本并发控制（MVCC）**：通过使用 sequence number，LevelDB 能够支持快照隔离，允许读取操作访问数据的旧版本，而同时有新的写操作发生，而不会相互干扰。
- **恢复和一致性**：在系统崩溃后，sequence numbers 允许 LevelDB 从 WAL 日志中恢复，确保只重放那些尚未持久化到 SST 文件的写操作。

这里设置 sequence number 的逻辑 `DBImpl::Write` 方法中，首先获取当前最大序列号，然后为 WriteBatch 分配一个新的序列号。如果 WriteBatch 包含多个操作，那么这些操作会**连续地分配序列号**。在写入 WAL 日志时，会将 WriteBatch 的序列号写入到日志中，这样在恢复时可以根据序列号来恢复操作的顺序。写入 memtable 之后，会更新当前最大序列号，以便下次分配。

### 具体实现

