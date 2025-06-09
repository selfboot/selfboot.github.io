---
title: LevelDB 源码阅读：结合代码理解多版本并发控制(MVCC)
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: a
mathjax: true
---

在数据库系统中，并发访问是一个常见的场景。多个用户同时读写数据库，如何保证每个人的读写结果都是正确的，这就是并发控制要解决的问题。

考虑一个简单的转账场景，开始的时候 A 账户有 1000 元，要转 800 元给 B 账户。转账过程包括两步：从 A 扣钱，给 B 加钱。恰好在这两步中间，有人查询了 A 和 B 的余额。

如果没有任何并发控制，查询者会看到一个异常现象：A 账户已经被扣除了 800 元，只剩 200 元，B 账户还没收到转账，还是原来的金额！这就是典型的数据不一致问题。为了解决这个问题，数据库系统**需要某种并发控制机制**。

最直观的解决方案是加锁，当有人在进行写操作（如转账）时，其他人的读操作必须等待。回到前面的问题，只有在转账的两步都完成之后，才能查到正确的账户余额。但是锁机制存在明显的问题，每次只要写相关 key，所有读该 key 的操作都要排队等待，导致并发上不去，性能会比较差。

现代数据库系统普遍采用 MVCC 来控制并发，LevelDB 也不例外，接下来我们结合源码来理解 LevelDB 的 MVCC 实现。

## 通过 MVCC 控制并发

MVCC([Multi-Version Concurrency Control](https://en.wikipedia.org/wiki/Multiversion_concurrency_control)) 是一种并发控制机制，它通过维护数据的多个版本来实现并发访问。 简单来说，LevelDB 的 MVCC 实现关键点有下面几个：

- 每个 key 可以有多个版本，每个版本都有自己的序列号(sequence number)；
- 写操作创建新版本而不是直接修改现有数据。
- 读操作可以看到特定时间点的某个数据版本。

这就是 MVCC 的核心思想了。接下来结合源码，来看看具体实现。

### LevelDB 键带版本格式

实现 MVCC 的前提是，**每个键都保存多个版本**。所以要设计一个数据结构，把键和版本号关联起来。LevelDB 设计的 key 格式如下：

> [key][sequence<<8|type]

LevelDB 的做法也比较容易理解，在原来的 key 后面拼上版本信息。这里版本信息是一个 64 位的 uint，其中高 56 位存储的是 sequence，低 8 位存储的是操作类型。这里操作类型目前只有两种，对应的分别是写入和删除操作。

```cpp
// Value types encoded as the last component of internal keys.
// DO NOT CHANGE THESE ENUM VALUES: they are embedded in the on-disk
// data structures.
enum ValueType { kTypeDeletion = 0x0, kTypeValue = 0x1 };
```

这里序列号只有 56 位，所以最多可以支持 $ 2^{56} $ 次写入。这样实现会不会有问题？如果我想<span style="color:red">写入更多的 key 那岂不是不支持了</span>？理论上是的，但是咱们从实际使用场景来分析下。假设每秒写入 100W 次，这个已经是很高的写入 QPS 了，那么可以持续写入的时间是：

$$ 2^{56} / 1000000 / 3600 / 24 / 365 = 2284 $$ 

嗯。。。能写 2000 多年，所以这个序列号是够用的，不用担心耗尽问题了。这里的数据格式设计虽然很简单，但还是有不少好处的：

1. **同一个 key 支持不同版本**，同一个 key 多次写入，最新写入的会有更高的序列号。在写入的同时，支持并发读这个 key 的更老版本。
2. 类型字段(type)区分普通写入还是删除，这样删除并不是真正删除数据，而是写入一个删除标记，只有等待 compaction 时被真正删除。

我们知道 LevelDB 中键是顺序存储的，当要查询单个键时，可以用二分查找快速定位。当需要获取一系列连续键时，可以使用二分查找快速定位范围起点，然后顺序扫描即可。但现在我们给键增加了版本号，那么问题来了，**带版本号的键要怎么排序呢**？

### 内部键排序方法

LevelDB 的做法也是比较简单有效，排序规则如下：

1. 首先按键升序排列，这里是按照字符串的字典序排序；
2. 然后按序列号降序排列，序列号越大越靠前；
3. 最后按类型降序排列，写入类型靠前，删除类型靠后；

为了实现这里的排序规则，LevelDB 实现了自己的比较器，在 [db/dbformat.cc](https://github.com/google/leveldb/blob/main/db/dbformat.cc#L47) 中，代码如下：

```cpp
int InternalKeyComparator::Compare(const Slice& akey, const Slice& bkey) const {
  // Order by:
  //    increasing user key (according to user-supplied comparator)
  //    decreasing sequence number
  //    decreasing type (though sequence# should be enough to disambiguate)
  int r = user_comparator_->Compare(ExtractUserKey(akey), ExtractUserKey(bkey));
  if (r == 0) {
    const uint64_t anum = DecodeFixed64(akey.data() + akey.size() - 8);
    const uint64_t bnum = DecodeFixed64(bkey.data() + bkey.size() - 8);
    if (anum > bnum) {
      r = -1;
    } else if (anum < bnum) {
      r = +1;
    }
  }
  return r;
}
```

可以看到首先从带版本号的 key 中去掉后 8 位，拿到真实的用户键，之后按照用户键的排序规则进行比较。这里再多说一句，LevelDB 提供了一个默认的用户键比较器 `leveldb.BytewiseComparator`，这里是完全按照键值的字节序进行比较。比较器的实现代码在 [util/comparator.cc](https://github.com/google/leveldb/blob/main/util/comparator.cc#L21) 中，如下：

```cpp
class BytewiseComparatorImpl : public Comparator {
 public:
  BytewiseComparatorImpl() = default;

  const char* Name() const override { return "leveldb.BytewiseComparator"; }

  int Compare(const Slice& a, const Slice& b) const override {
    return a.compare(b);
  }
  // ... 
```

这里 Slice 是 LevelDB 中定义的一个字符串类，用于表示一个字符串，它的 compare 就是字节码比较。其实 LevelDB 也支持用户自定义比较器，只需要实现 Comparator 接口即可。这里多说一点，在使用比较器的时候，用 BytewiseComparator 封装了一个单例，代码有点难理解，如下：

```cpp
const Comparator* BytewiseComparator() {
  static NoDestructor<BytewiseComparatorImpl> singleton;
  return singleton.get();
}
```

我之前专门写了一篇文章来解释 NoDestructor 模板类，感兴趣的可以看下：[LevelDB 源码阅读：禁止对象被析构](https://selfboot.cn/2024/07/22/leveldb_source_nodestructor/)。

这种排序规则的好处也是显而易见的，首先按照用户键升序排列，这样范围查询非常高效。当用户需要获取一系列连续键时，可以使用二分查找快速定位范围起点，然后顺序扫描即可。另外，同一个用户键的多个版本按序列号降序排列，这意味着最新版本在前，便于快速找到当前值。查询时，只需找到第一个序列号小于等于当前快照的版本，**不需要完整扫描所有版本**。

好了，关于排序就说到这。下面咱们结合代码来看看写入和读取的时候，是怎么拼接 key 的。

### 写入带版本键

LevelDB 写入键值对的步骤比较复杂，可以看我之前的文章：[LevelDB 源码阅读：写入键值的工程实现和优化细节](https://selfboot.cn/2025/01/24/leveldb_source_writedb/)。简单说就是先写入 memtable，然后是 immutable memtable，最后不断沉淀(compaction)到不同层次的 SST 文件。整个过程的第一步就是写入 memtable，所以在最开始写入 memtable 的时候，就会给 key 带上版本和类型，组装成前面我们说的带版本的内部 key 格式。

这里组装 Key 的代码在 [db/memtable.c](https://github.com/google/leveldb/blob/main/db/memtable.cc#L76) 的 `MemTable::Add` 函数中。这里除了组装 key，还拼接了 value 部分。实现如下：

```cpp
void MemTable::Add(SequenceNumber s, ValueType type, const Slice& key,
                   const Slice& value) {
  // Format of an entry is concatenation of:
  //  key_size     : varint32 of internal_key.size()
  //  key bytes    : char[internal_key.size()]
  //  tag          : uint64((sequence << 8) | type)
  //  value_size   : varint32 of value.size()
  //  value bytes  : char[value.size()]
  size_t key_size = key.size();
  size_t val_size = value.size();
  size_t internal_key_size = key_size + 8;
  const size_t encoded_len = VarintLength(internal_key_size) +
                             internal_key_size + VarintLength(val_size) +
                             val_size;
  char* buf = arena_.Allocate(encoded_len);
  char* p = EncodeVarint32(buf, internal_key_size);
  std::memcpy(p, key.data(), key_size);
  p += key_size;
  EncodeFixed64(p, (s << 8) | type);
  p += 8;
  p = EncodeVarint32(p, val_size);
  std::memcpy(p, value.data(), val_size);
  assert(p + val_size == buf + encoded_len);
  table_.Insert(buf);
}
```

可以看到这里同一个用户键的多次写入会产生多个版本，每个版本都有唯一的 sequence number。用户键一旦被转换为内部键，后续所有处理过程都基于这个内部键进行。包括 MemTable 转为 Immutable MemTable，SST 文件写入，SST 文件合并等。

这里 Add 函数中，在 internal_key 内部键的前面其实也保存了整个内部键的长度，然后把长度和内部键拼接起来，一起插入到了 MemTable 中。这样的 key 其实是 memtable_key，后续在读取的时候，也是用 memtable_key 来在 memtable 中查找的。

这里为什么要保存长度呢？我们知道 Memtable 中的 SkipList 使用 const char* 指针作为键类型，但这些指针只是指向内存中某个位置的裸指针。当跳表的比较器需要比较两个键时，它需要知道每个键的确切范围，也就是起始位置和结束位置。如果直接使用 internal key，就没有明确的方法知道一个 internal key 在内存中的确切边界。加上长度信息后，就可以快速定位到每个键的边界，从而进行正确的比较。

### 读取键值过程

接下来看看读取键值的过程。在读取键值的时候，会先把用户键转为内部键，然后进行查找。不过这里首先面临一个问题是，序列号要用哪个呢。回答这个问题前，我们先来看读取键常用的的方法，如下：

```cpp
std::string newValue;
status = db->Get(leveldb::ReadOptions(), "key500", &newValue);
```

这里有个 ReadOptions 参数，里面会封装一个 Snapshot 快照对象。这里的快照你可以理解为数据库在某个时间点的状态，里面有这个时间点之前所有的数据，但不会包含这个时间点之后的写入。

其实这里快照的核心实现就是保存某个时间点的最大序列号，读取的时候，会用这个序列号来组装内部键。读的时候，分两种情况，如果没有指定 snapshot，使用当前最新的 sequence number。如果使用了之前保存下来的 snapshot，则会使用 snapshot 的序列号。

之后会根据快照序列号和用户键组装，这里先定义了一个 LookupKey 对象，用来封装查找时候使用内部键的一些常用操作。代码在 [db/dbformat.h](https://github.com/google/leveldb/blob/main/db/dbformat.h#L184) 中，如下：

```cpp
// A helper class useful for DBImpl::Get()
class LookupKey {
 public:
  // Initialize *this for looking up user_key at a snapshot with
  // the specified sequence number.
  LookupKey(const Slice& user_key, SequenceNumber sequence);

  LookupKey(const LookupKey&) = delete;
  LookupKey& operator=(const LookupKey&) = delete;

  ~LookupKey();

  // Return a key suitable for lookup in a MemTable.
  Slice memtable_key() const { return Slice(start_, end_ - start_); }
  // Return an internal key (suitable for passing to an internal iterator)
  Slice internal_key() const { return Slice(kstart_, end_ - kstart_); }
  // Return the user key
  Slice user_key() const { return Slice(kstart_, end_ - kstart_ - 8); }

  // ...
}
```

在 LookupKey 的构造函数中，会根据传入的 user_key 和 sequence 来组装内部键，具体代码在 [db/dbformat.cc](https://github.com/google/leveldb/blob/main/db/dbformat.cc#L117) 中。后续在 memtable 中搜索的时候，用的 memtable_key，然后在 SST 中查找的时候，用的 internal_key。这里 memtable_key 就是我们前面说的，在 internal_key 的前面加上了长度信息，方便在 SkipList 中快速定位到每个键的边界。

## 4. 并发控制示例

好了，前面讲了不少代码实现，下面我们考虑实际使用场景下，MVCC 是怎么工作的。假设有以下操作序列：

```
时间点 T1: sequence=100, 写入 key=A, value=1
时间点 T2: sequence=101, 写入 key=A, value=2
时间点 T3: Reader1 获取 snapshot=101
时间点 T4: sequence=102, 写入 key=A, value=3
时间点 T5: Reader2 获取 snapshot=102
```

此时：
- Reader1 读取 key=A 会得到 value=2（sequence=101）
- Reader2 读取 key=A 会得到 value=3（sequence=102）
- 新的读取（不指定 snapshot）会得到 value=3

## 5. 并发读写的保证

1. **读写互不阻塞**：
   - 写入创建新版本
   - 读取基于 snapshot，看到的是某个时间点的一致性视图
   - 不需要加锁

2. **写写并发**：
   - 通过 log 和 memtable 的互斥锁保证写入顺序
   - 每个写入获得唯一的 sequence number

3. **一致性视图**：
   - 每个 snapshot 代表一个一致性视图
   - 读取操作看到的总是某个时间点之前的所有写入

## 6. 垃圾回收

- 旧版本的数据会在 compaction 过程中被清理
- 如果没有 snapshot 在引用某个版本，该版本可以被删除
- 保留的版本数取决于活跃的 snapshot 数量

### 总结

LevelDB 的 MVCC：
1. 通过 sequence number 实现多版本
2. 通过 snapshot 实现读取隔离
3. 写入永远创建新版本
4. 读取看到的是快照时间点的一致视图
5. 实现了无锁的并发读写

这种设计：
- 提供了很好的并发性能
- 保证了读取的一致性
- 避免了读写冲突
- 代价是存储空间的额外开销（保存多个版本）
