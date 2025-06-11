---
title: LevelDB 源码阅读：MemTable 内存表的实现细节
tags:
  - C++
  - LevelDB
category: 源码剖析
toc: true
description: 本文深入解析LevelDB中MemTable内存表的实现细节，包括其在内存中管理最近写入数据的核心作用。文章详细介绍了MemTable的内部构造、基于跳表的数据结构、键值对的编码格式以及内存管理机制。通过分析Add和Get方法的实现，展示了键值对如何被编码存储和高效查询。同时解释了引用计数机制如何实现并发访问控制，以及MemTable如何与友元类协作完成数据遍历。对理解LevelDB读写流程和性能优化具有重要参考价值。
mathjax: true
date: 2025-06-11 19:47:42
---

在 LevelDB 中，所有的写操作首先都会被记录到一个 [Write-Ahead Log（WAL，预写日志）](https://selfboot.cn/2024/08/14/leveldb_source_wal_log/)中，以确保持久性。接着数据会被存储在 MemTable 中，MemTable 的主要作用是**在内存中有序存储最近写入的数据**，到达一定条件后批量落磁盘。

LevelDB 在内存中维护两种 MemTable，一个是可写的，接受新的写入请求。当达到一定的大小阈值后，会被转换为一个不可变的 Immutable MemTable，接着会触发一个后台过程将其写入磁盘形成 SSTable。这个过程中，会创建一个新的 MemTable 来接受新的写入操作。这样可以保证写入操作的连续性，不受到影响。

在读取数据时，LevelDB 首先查询 MemTable。如果在 MemTable 中找不到，然后会依次查询不可变的 Immutable MemTable，最后是磁盘上的 SSTable 文件。在 LevelDB 的实现中，不管是 MemTable 还是 Immutable MemTable，内部其实都是用 class MemTable 来实现的。这篇文章我们来看看 memtable 的实现细节。

<!-- more -->

## Memtable 使用方法

先来看看 LevelDB 中哪里用到了 MemTable 类。在库的核心 DB [实现类 DBImpl](https://github.com/google/leveldb/blob/main/db/db_impl.h#L177) 中，可以看到有两个成员指针，

```cpp
class DBImpl : public DB {
 public:
  DBImpl(const Options& options, const std::string& dbname);
  //...
  MemTable* mem_;
  MemTable* imm_ GUARDED_BY(mutex_);  // Memtable being compacted
  //...
}
```

mem_ 是可写的 memtable，imm_ 是不可变的 memtable。这两个是数据库实例中唯一的两个 memtable 对象，用来存储最近写入的数据，在读取和写入键值的时候，都会用到这两个 memtable。

我们先来看写入过程，我之前写过[LevelDB 源码阅读：写入键值的工程实现和优化细节](https://selfboot.cn/2025/01/24/leveldb_source_writedb/)，里面有写入键值的全部过程。写入过程中，写入 WAL 日志成功后，会调用 [db/write_batch.cc](https://github.com/google/leveldb/blob/main/db/write_batch.cc#L121) 中的 MemTableInserter 类来写入 memtable，具体代码如下：

```cpp
// db/write_batch.cc
class MemTableInserter : public WriteBatch::Handler {
 public:
  SequenceNumber sequence_;
  MemTable* mem_;

  void Put(const Slice& key, const Slice& value) override {
    mem_->Add(sequence_, kTypeValue, key, value);
    sequence_++;
  }
  //...
};
```

这里调用了 Add 接口往 memtable 中写入键值对，sequence_ 是写入的序列号，kTypeValue 是写入的类型，key 和 value 是用户传入的键值对。 

除了写入过程，在读取键值对的时候，也会需要 Memtable 类。具体在 [db/db_impl.cc](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L1147) 中 DBImpl 类的 Get 方法中，会调用 memtable 的 Get 方法来查询键值对。

```cpp
Status DBImpl::Get(const ReadOptions& options, const Slice& key,
                   std::string* value) {
  // ...
  MemTable* mem = mem_;
  MemTable* imm = imm_;
  Version* current = versions_->current();
  mem->Ref();
  if (imm != nullptr) imm->Ref();
  // Unlock while reading from files and memtables
  {
    mutex_.Unlock();
    LookupKey lkey(key, snapshot);
    if (mem->Get(lkey, value, &s)) {
      // Done
    } else if (imm != nullptr && imm->Get(lkey, value, &s)) {
      // Done
    }
    mutex_.Lock();
  }

  // ...
  mem->Unref();
  if (imm != nullptr) imm->Unref();
  // ...
```

这里会先创建本地指针 mem 和 imm 来引用成员变量 mem_ 和 imm_，之后用本地指针来进行读取。这里有个问题是，**<span style="color:red">为什么不直接使用成员变量 mem_ 和 imm_ 来读取呢</span>**？这个问题留到[后面解读疑问](#解答疑问)我们再回答。

好了，至此我们已经看到了 Memtable 的主要使用方法了，那它们内部是怎么实现的呢，我们接着看吧。

## Memtable 实现

在开始讨论 MemTable 对外方法的实现之前，先要知道 Memtable 中的数据其实是存储在跳表中的。跳表提供了平衡树的大部分优点（如有序性、插入和查找的对数时间复杂性），但是实现起来更为简单。关于跳表的详细实现，可以参考[LevelDB 源码阅读：跳表的原理、实现以及可视化](https://selfboot.cn/2024/09/09/leveldb_source_skiplist/)。

MemTable 类内部来声明了一个跳表对象 table_ 成员变量，跳表是个模板类，初始化需要提供 key 和 Comparator 比较器。这里 memtable 中跳表的 key 是 `const char*` 类型，比较器是 KeyComparator 类型。KeyComparator 就是这样一个自定义的比较器，用来给跳表中键值进行排序。

KeyComparator 包含了一个 InternalKeyComparator 类型的成员变量 comparator，用来比较 internal key 的大小。KeyComparator 比较器的 `operator()` 重载了函数调用操作符，先从 const char* 中解码出 internal key，然后然后调用 InternalKeyComparator 的 Compare 方法来比较 internal key 的大小。具体实现在 [db/memtable.cc](https://github.com/google/leveldb/blob/main/db/memtable.cc#L28) 中。

```cpp
int MemTable::KeyComparator::operator()(const char* aptr,
                                        const char* bptr) const {
  // Internal keys are encoded as length-prefixed strings.
  Slice a = GetLengthPrefixedSlice(aptr);
  Slice b = GetLengthPrefixedSlice(bptr);
  return comparator.Compare(a, b);
}
```

再补充说下这里 levelDB 的 **internal key** 其实是拼接了用户传入的 key 和内部的 sequence number，然后再加上一个类型标识。这样可以保证相同 key 的不同版本是有序的，从而实现 MVCC 并发读写。存储到 Memtable 的时候又在 internal key 前面编码了长度信息，叫 `memtable key`，这样后面读取的时候，我们就能从 const char* 的 memtable key 中根据长度信息解出 internal key 来。这部分我在另一篇文章：[LevelDB 源码阅读：结合代码理解多版本并发控制(MVCC)](https://selfboot.cn/2025/06/10/leveldb_mvcc_intro/) 有详细分析，感兴趣的可以看看。

Memtable 用跳表做存储，然后对外主要支持 Add 和 Get 方法，下面来看看这两个函数的实现细节。

### Add 添加键值对

Add 方法用于往 MemTable 中添加一个键值对，其中 key 和 value 是用户传入的键值对，SequenceNumber 是写入时的序列号，ValueType 是写入的类型，有两种类型：kTypeValue 和 kTypeDeletion。kTypeValue 表示插入操作，kTypeDeletion 表示删除操作。LevelDB 中的删除操作，内部其实是插入一个标记为删除的键值对。

Add 实现在 [db/memtable.cc](https://github.com/google/leveldb/blob/main/db/memtable.cc#L76) 中，函数定义如下：

```cpp
void MemTable::Add(SequenceNumber s, ValueType type, const Slice& key,
                   const Slice& value) {
  // Format of an entry is concatenation of:
  //  key_size     : varint32 of internal_key.size()
  //  key bytes    : char[internal_key.size()]
  //  tag          : uint64((sequence << 8) | type)
  //  value_size   : varint32 of value.size()
  //  value bytes  : char[value.size()]
  //...
```

这里的注释十分清楚，Memtable 中存储了格式化后的键值对，先是 internal key 的长度，然后是 internal key 字节串(就是下面的 tag 部分，包含 User Key + Sequence Number + Value Type)，接着是 value 的长度，然后是 value 字节串。整体由 5 部分组成，格式如下：

```cpp
+-----------+-----------+----------------------+----------+--------+
| Key Size  | User Key  |          tag         | Val Size | Value  |
+-----------+-----------+----------------------+----------+--------+
| varint32  | key bytes | 64 位，后 8 位为 type  | varint32 | value  |
```

这里第一部分的 keysize 是用 Varint 编码的用户 key 长度加上 8 字节 tag，tag 是序列号和 value type 的组合，高 56 位存储序列号，低 8 位存储 value type。其他部分比较简单，这里不再赘述。

插入过程会先计算出需要分配的内存大小，然后分配内存，接着写入各个部分的值，最后插入到跳表中。具体写入过程代码如下：

```cpp
// db/memtable.cc
  // ...
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

这里的 `EncodeVarint32` 和 `EncodeFixed64` 是一些编码函数，用来将整数编码到字节流中。具体可以参考[LevelDB 源码阅读：内存分配器、随机数生成、CRC32、整数编解码](https://selfboot.cn/2024/08/29/leveldb_source_utils/)。接下来看看查询键的实现。

### Get 查询键值

查询方法的定义也比较简单，如下：

```cpp
  // If memtable contains a value for key, store it in *value and return true.
  // If memtable contains a deletion for key, store a NotFound() error
  // in *status and return true.
  // Else, return false.
  bool Get(const LookupKey& key, std::string* value, Status* s);
```

这里接口传入的 key 并不是用户输入 key，而是一个 LookupKey 对象，在 [db/dbformat.h](https://github.com/google/leveldb/blob/main/db/dbformat.h#L184) 中有定义。这是因为 levelDB 中同一个用户键可能有不同版本，查询的时候必须指定快照(也就是序列号)，才能拿到对应的版本。所以这里抽象出了一个 LookupKey 类，可以根据用户输入的 key 和 sequence number 来初始化，然后就可以拿到需要的键值格式。

具体到查找过程，先用 LookupKey 对象的 memtable_key 方法拿到前面提到的 memtable key，然后调用跳表的 Seek 方法来查找。[db/memtable.cc](https://github.com/google/leveldb/blob/main/db/memtable.cc#L102) 中 Get 方法的完整实现如下：

```cpp
bool MemTable::Get(const LookupKey& key, std::string* value, Status* s) {
  Slice memkey = key.memtable_key();
  Table::Iterator iter(&table_);
  iter.Seek(memkey.data());
  if (iter.Valid()) {
    // Check that it belongs to same user key.  We do not check the
    // sequence number since the Seek() call above should have skipped
    // all entries with overly large sequence numbers.
    const char* entry = iter.key();
    uint32_t key_length;
    const char* key_ptr = GetVarint32Ptr(entry, entry + 5, &key_length);
    if (comparator_.comparator.user_comparator()->Compare(
            Slice(key_ptr, key_length - 8), key.user_key()) == 0) {
      // Correct user key
      const uint64_t tag = DecodeFixed64(key_ptr + key_length - 8);
      switch (static_cast<ValueType>(tag & 0xff)) {
        case kTypeValue: {
          Slice v = GetLengthPrefixedSlice(key_ptr + key_length);
          value->assign(v.data(), v.size());
          return true;
        }
        case kTypeDeletion:
          *s = Status::NotFound(Slice());
          return true;
      }
    }
  }
  return false;
}
```

我们知道，跳表的 Seek 方法将迭代器定位到链表中**第一个大于等于目标内部键的位置**，所以我们还需要额外验证该键的 key 与用户查询的 key 是否一致。这是因为可能存在多个具有相同前缀的键，Seek 可能会返回与查询键具有相同前缀的不同键。例如，查询 "app" 可能返回 "apple" 的记录。

这里注释还特别说明了下，我们**并没有检查 internal key 中的序列号，这是为什么呢**？前面也提到在跳表中，键的排序是基于内部键比较器 (InternalKeyComparator) 来进行的，这里的排序要看键值和序列号。首先**会使用用户定义的比较函数（默认是字典顺序）比较用户键**，键值小的靠前。如果用户键相同，则比较序列号，**序列号大的记录在跳表中位置更前**。这是因为我们通常希望对于相同的用户键，更新的更改（即具有更大序列号的记录）应该被优先访问。

比如有两个内部键，Key1 = "user_key1", Seq = 1002 和 Key1 = "user_key1", Seq = 1001。在跳表中，第一个记录（Seq = 1002）将位于第二个记录（Seq = 1001）之前，因为1002 > 1001。当用 Seek 查找 <Key = user_key1, Seq = 1001> 时，自然会跳过 Seq = 1002 的记录。

所以拿到 internal key 后，不用再检查序列号。只用确认用户 key 相等后，再拿到 64 位的 tag，用 0xff 取出低 8 位的操作类型。对于删除操作会返回"未找到"的状态，说明该键值已经被删除了。对于值操作，则接着从 memtable key 后面解出 value 字节串，然后赋值给 value 指针。

## 友元类声明

除了前面的 Add 和 Get 方法，MemTable 类还声明了一个友元类 `friend class MemTableBackwardIterator;`，看名字是逆向的迭代器。不过在整个代码仓库，并没有找到这个类的定义。可能是开发的时候预留的一个功能，最后没有实现，这里忘记删除无效代码了。这里编译器没有报错是因为C++ 编译器在**处理友元声明时不要求友元类必须已经定义**。编译器仅检查该声明的语法正确性，只有当实际上需要使用那个类（例如创建实例或访问其成员）时，缺少定义才会成为问题。

此外还有一个友元 `friend class MemTableIterator;`，该类实现了 Iterator 接口，用于遍历 memTable 中的键值对。MemTableIterator 的方法如 key() 和 value() 依赖于对内部迭代器 iter_ 的操作，这个迭代器直接工作在 memTable 的 SkipList 上。这些都是 memTable 的私有成员，所以需要声明为友元类。

在 db_impl.cc 中，当需要将 immemtable 落地到 Level0 的 SST文件时，就会用到 MemTableIterator 来遍历 memTable 中的键值对。使用部分的代码如下，BuildTable 中会遍历 memTable，将键值对写入到 SST 文件中。

```cpp
// db/db_impl.cc
Status DBImpl::WriteLevel0Table(MemTable* mem, VersionEdit* edit,
                                Version* base) {
  // ...
  Iterator* iter = mem->NewIterator();
  Log(options_.info_log, "Level-0 table #%llu: started",
      (unsigned long long)meta.number);

  Status s;
  {
    mutex_.Unlock();
    s = BuildTable(dbname_, env_, options_, table_cache_, iter, &meta);
    mutex_.Lock();
  }
  ...
}
```

这里遍历 memtable 时，用到一个友元类，**为啥不直接提供一些 public 的接口来遍历呢**？使用友元类的一个好处是，类的职责划分比较清晰。MemTableIterator 负责遍历 memTable 的数据，而 memTable 负责管理数据的存储。这种分离有助于清晰地定义类的职责，遵循单一职责原则，每个类只处理一组特定的任务，使得系统的设计更加模块化。

## 内存管理

最后来看看 MemTable 的内存管理。MemTable 类有一个 Arena 类的成员变量 arena_，用来管理跳表的内存分配。在插入键值对的时候，编码后的信息就存在 arena_ 分配的内存中。关于内存管理 Arena 类，可以参考[LevelDB 源码阅读：内存分配器、随机数生成、CRC32、整数编解码](https://selfboot.cn/2024/08/29/leveldb_source_utils/#%E5%86%85%E5%AD%98%E7%AE%A1%E7%90%86-Arena-%E7%B1%BB)。

为了能够在不使用 MemTable 的时候，及时释放内存，这里引入了**引用计数**机制来管理内存。引用计数允许共享对 MemTable 的访问权，而不需要担心资源释放的问题。对外也提供了 Ref 和 Unref 两个方法来增加和减少引用计数：

```cpp
  // Increase reference count.
  void Ref() { ++refs_; }

  // Drop reference count.  Delete if no more references exist.
  void Unref() {
    --refs_;
    assert(refs_ >= 0);
    if (refs_ <= 0) {
      delete this;
    }
  }
```

当引用计数减至零时，MemTable 自动删除自己，这时候就会调用析构函数 `~MemTable()` 来释放内存。对象析构时，对于自定义的成员变量，**会调用各自的析构函数来释放资源**。在 MemTable 中，用跳表来存储 key，跳表的内存则是通过 `Arena arena_;` 来管理的。MemTable 析构过程，会调用 area_ 的析构函数来释放之前分配的内存。

```cpp
Arena::~Arena() {
  for (size_t i = 0; i < blocks_.size(); i++) {
    delete[] blocks_[i];
  }
}
```

这里值得注意的是，MemTable 将析构函数 `~MemTable();` 设置为 private，强制外部代码通过 `Unref()` 方法来管理 MemTable 的生命周期。这保证了引用计数逻辑能够正确执行，防止了由于不当的删除操作导致的内存错误。

### 解答疑问

好了，这时候还有最后一个问题了，就是前面留的一个疑问，在 LevelDB Get 方法中，为啥不直接使用成员变量 mem_ 和 imm_ 来读取，而是创建了两个本地指针来引用呢？

**如果直接使用 mem_ 和 imm_ 的话，会有什么问题**？先考虑不加锁的情况，比如一个读线程正在读 mem_，这时候另一个写线程刚好写满了 mem_，触发了 mem_ 转到 imm_ 的逻辑，会重新创建一个空的 mem_，这时候读线程读到的内存地址就无效了。当然，你可以加锁，来把读写 mem_ 和 imm_ 都保护起来，但是这样并发性能就很差，同一时间，只允许一个读操作或者写操作。

为了支持并发，LevelDB 这里的做法比较复杂。读取的时候，先加线程锁，复制 mem_ 和 imm_ 用 Ref() 增加引用计数。之后就可以释放线程锁，在复制的 mem 和 imm 上进行查找操作，这里的查找操作不用线程锁，支持多个读线程并发。读取完成后，再调用 Unref() 减少引用计数，如果引用计数变为零，对象被销毁。

**考虑多个读线程在读 mem_，同时有 1 个写线程在写入 mem_**。每个读线程都会先拿到自己的 mem_ 的引用，然后释放锁开始查找操作。写线程可以往里面继续写入内容，或者写满后创建新的 mem_ 内存。只要有任何一个读线程还在查找，这里最开始的 mem_ 的引用计数就不会为零，内存地址就一直有效。直到所有读线程读完，并且写线程把 mem_ 写满，将它转为 imm_ 并写入 SST 文件后，最开始的 mem_ 的引用计数为零，这时候就触发析构操作，可以回收地址了。

看文字有点绕，我让 AI 整理一个 mermaid 的流程图来帮助理解吧：

![LevelDB 内存表的生命周期图](https://slefboot-1251736664.file.myqcloud.com/20250611_leveldb_source_memtable_life_mermaid.webp)

mermaid 的源码可以在[这里](/downloads/mermaid_leveldb_source_memtable.txt)找到。

## 总结

在整个 LevelDB 架构中，MemTable 扮演着承上启下的角色。它接收来自上层的写入请求，在内存中积累到一定量后，转变为不可变的 Immutable MemTable，最终由后台线程写入磁盘形成 SST 文件。同时，它也是读取路径中优先级最高的组件，确保最新写入的数据能够立即被读取到。

本文我们详细分析了 LevelDB 中 MemTable 的实现原理与工作机制，最后再简单总结下MemTable 的核心设计：

1. **基于跳表的实现**：MemTable 内部使用跳表（SkipList）来存储数据，这种数据结构提供了平衡树的大部分优点，同时实现更为简单，能够高效地支持查找和插入操作。
2. **内存管理机制**：MemTable 通过 Arena 内存分配器来管理内存，统一分配和释放，避免内存碎片和提高内存利用率。
3. **引用计数机制**：通过 Ref() 和 Unref() 方法实现引用计数，支持并发访问，同时保证资源能在不再使用时及时释放。
4. **特定键值编码格式**：MemTable 中存储的键值对采用了特定的编码格式，包含键长度、用户键、序列号和类型标识、值长度以及值本身，支持了 LevelDB 的多版本并发控制（MVCC）。
5. **友元类协作**：通过友元类 MemTableIterator 来遍历 MemTable 中的数据，实现了关注点分离的设计原则。

MemTable 通过细致的内存管理和引用计数机制，解决了并发访问问题；通过跳表数据结构，实现了高效的查询和插入；通过特定的键值编码格式，支持了多版本并发控制。这些设计共同构成了 LevelDB 高性能、高可靠性的基础。