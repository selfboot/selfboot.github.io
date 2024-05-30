---
title: LevelDB 源码阅读：MemTable 内存表的实现细节
tags: [C++, LevalDB]
category: 源码剖析
toc: true
description: 
---

MemTable 的主要作用是存储最近写入的数据。在 LevelDB 中，所有的写操作首先都会被记录到一个 [Write-Ahead Log（WAL，预写日志）](/leveldb-source-wal-log)中，以确保持久性，然后数据会被存储在 MemTable 中。当 MemTable 达到一定的大小阈值后，它会被转换为一个不可变的 Immutable MemTable，并且一个新的 MemTable 会被创建来接收新的写入。此时会触发一个后台过程将其写入磁盘形成 SSTable。这个过程中，一个新的 MemTable 被创建来接受新的写入操作。这样可以保证写入操作的连续性，不受到影响。

<!-- more -->

在读取数据时，LevelDB 首先查询 MemTable。如果在 MemTable 中找不到，然后会依次查询不可变的 Immutable MemTable，最后是磁盘上的 SSTables。

## Memtable 实现

MemTable 内部使用跳表（Skip List）来存储键值对，跳表提供了平衡树的大部分优点（如有序性、插入和查找的对数时间复杂性），但是实现起来更为简单。关于跳表的详细实现，可以参考[LevelDB 源码阅读：从原理到实现深入理解跳表](/leveldb_source_skiplist)。

类内部来声明了一个跳表对象 table_ 成员变量，跳表的 key 是 `const char*` 类型，value 是 `KeyComparator` 类型。KeyComparator 是一个自定义的比较器，它包含了一个 `InternalKeyComparator` 类型的成员变量 comparator，用来比较 internal key 的大小。比较器的 `operator()` 重载了函数调用操作符，先解码 length-prefixed string，拿到 internal key 然后调用 comparator 的 Compare 方法来比较大小。 

```c++
int MemTable::KeyComparator::operator()(const char* aptr,
                                        const char* bptr) const {
  // Internal keys are encoded as length-prefixed strings.
  Slice a = GetLengthPrefixedSlice(aptr);
  Slice b = GetLengthPrefixedSlice(bptr);
  return comparator.Compare(a, b);
}
```

这里 levelDB 的 **internal key** 其实是拼接了用户传入的 key 和内部的 sequence number，然后再加上一个类型标识。这样可以保证相同 key 的不同版本是有序的，具体的比较方法在 `db/dbformat.cc` 中的 InternalKeyComparator::Compare。

Memtable 封装后的跳表，主要支持下面两个方法：

```c++
  // Add an entry into memtable that maps key to value at the
  // specified sequence number and with the specified type.
  // Typically value will be empty if type==kTypeDeletion.
  void Add(SequenceNumber seq, ValueType type, const Slice& key,
           const Slice& value);

  // If memtable contains a value for key, store it in *value and return true.
  // If memtable contains a deletion for key, store a NotFound() error
  // in *status and return true.
  // Else, return false.
  bool Get(const LookupKey& key, std::string* value, Status* s);
```

下面来看看这两个函数的实现。

### Add 添加 key

Add 方法用于往 MemTable 中添加一个键值对，其中 key 和 value 是用户传入的键值对，sequence number 是写入时的序列号，value type 是写入的类型，有两种类型：kTypeValue 和 kTypeDeletion。kTypeValue 表示插入操作，kTypeDeletion 表示删除操作。LevelDB 中的删除操作，内部其实是插入一个标记为删除的键值对。

在 LevelDB 的 `db/write_batch.cc` 中定义的 MemTableInserter 类中有写入 memtable 的逻辑，主要是调用 MemTable 的 Add 方法来添加键值对。这里 write_batch 的实现，可以参考 [LevelDB 源码阅读：批量写的优雅设计](/leveldb_source_write_batch/)。

```c++
  void Put(const Slice& key, const Slice& value) override {
    mem_->Add(sequence_, kTypeValue, key, value);
    sequence_++;
  }
```

下面来看看具体的写入逻辑：

```c++
// db/memtable.cc
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

这里的 `EncodeVarint32` 和 `EncodeFixed64` 是一些编码函数，用来将整数编码到字节流中。具体可以参考[LevelDB 源码阅读：utils 组件代码](/leveldb_source_utils#整数编、解码)。整体写跳表的代码很清晰，首先计算出存储到跳表中需要的内存大小 encoded_len，接着用 arena_ 分配了相应的内存 buf，然后写入各个部分的值，最后插入到跳表中。

这里写入键值对的格式在代码注释中写的很清晰，主要由 5 部分组成：

```c++
+-----------+-----------+----------------------+----------+--------+
| Key Size  | User Key  |          tag         | Val Size | Value  |
+-----------+-----------+----------------------+----------+--------+
| varint32  | key bytes | 64 位，后 8 位为 type  | varint32 | value  |
```

这里第一部分的 keysize 是用 Varint 编码的用户 key 长度加上 8 字节 tag，tag 是序列号和 value type 的组合，高 56 位存储序列号，低 8 位存储 value type。其他部分比较简单，这里不再赘述。

### Get 查询 key

从 memtable 中查询 key 主要是通过跳表的 Seek 方法来查找 key，然后根据 key 的 tag 来确定返回结果。完整代码如下：

```c++
// db/memtable.cc
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

这里接口传入的 key 是一个 LookupKey 对象，在 `db/dbformat.h` 中有定义，它包含了用户查询的 key 和 sequence number。在查询时，先用 LookupKey 对象的 memtable_key 方法拿到前面提到的 internal key，然后调用跳表的 Seek 方法来查找。Seek 方法将迭代器定位到链表中**第一个大于等于目标内部键的位置**，接着需要验证该键的 key 与用户查询的 key 是否一致。因为可能存在多个具有相同前缀的键，Seek 可能会返回与查询键具有相同前缀的不同键。例如，查询 "app" 可能返回 "apple" 的记录。

这里并没有检查 internal key 中的序列号，这是为什么呢？前面也提到在跳表中，内部键的排序是基于内部键比较器 (InternalKeyComparator) 来进行的，这里的**排序要看键值和序列号**。首先**使用用户定义的比较函数（如按字典顺序）比较用户键**，键值小的靠前。如果用户键相同，则比较序列号，**序列号的比较是反向的，即序列号大的记录在跳表中位置更前**。这是因为我们通常希望对于相同的用户键，更新的更改（即具有更大序列号的记录）应该被优先访问。

比如有两个内部键，Key1 = "user_key1", Seq = 1002 和 Key1 = "user_key1", Seq = 1001。在跳表中，第一个记录（Seq = 1002）将位于第二个记录（Seq = 1001）之前，因为1002 > 1001。当用 Seek 查找“user_key1”时，首先会找到 Seq = 1002 的记录。

所以拿到 internal key 后，不用再检查序列号。只用确认用户 key 相等后，再拿到 64 位的 tag，用 0xff 取出低 8 位的操作类型。对于删除操作会返回“未找到”的状态，说明该键值已经被删除了。

## 友元类声明

除了前面的 Add 和 Get 方法，MemTable 类还声明了一个友元类 `friend class MemTableBackwardIterator;`，看名字是逆向的迭代器。不过在整个代码仓库，并没有找到这个类的定义。可能是开发的时候预留的一个功能，最后没有实现，这里忘记删除无效代码了。这里编译器没有报错是因为C++ 编译器在**处理友元声明时不要求友元类必须已经定义**。编译器仅检查该声明的语法正确性，只有当实际上需要使用那个类（例如创建实例或访问其成员）时，缺少定义才会成为问题。

此外还有一个友元 `friend class MemTableIterator;`，该类实现了 Iterator 接口，用于遍历 memTable 中的键值对。MemTableIterator 的方法如 key() 和 value() 依赖于对内部迭代器 iter_ 的操作，这个迭代器直接工作在 memTable 的 SkipList 上。这些都是 memTable 的私有成员，所以需要声明为友元类。

在 db_impl.cc 中，当需要将 immemtable 落地到 Level0 的 SST文件时，就会用到 MemTableIterator 来遍历 memTable 中的键值对。使用部分的代码如下，BuildTable 中会遍历 memTable，将键值对写入到 SST 文件中。

```c++
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

这里遍历 memtable 时，用到一个友元类，为啥不直接提供一些 public 的接口来遍历呢？友元类设计的一个好处是，**类的职责划分比较清晰**。MemTableIterator 负责遍历 MemTable 的数据，而 MemTable 负责管理数据的存储。这种分离有助于清晰地定义类的职责，遵循单一职责原则，每个类只处理一组特定的任务，使得系统的设计更加模块化。

## 内存管理

最后来看看 MemTable 的内存管理。MemTable 使用**引用计数**机制来管理内存，引用计数允许多个部分的代码共享对 MemTable 的访问权，而不需要担心资源释放的问题。这里对外提供了 Ref 和 Unref 两个方法来增加和减少引用计数：

```c++
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

当引用计数减至零时，MemTable 自动删除自己，然后就会调用析构函数 `~MemTable()` 来释放内存。对象析构时，对于自定义的成员变量，**会调用各自的析构函数来释放资源**。在 MemTable 中，用跳表来存储 key，跳表的内存则是通过 `Arena arena_;` 来管理的。MemTable 析构过程，会调用 area_ 的析构函数来释放之前分配的内存。

```c++
Arena::~Arena() {
  for (size_t i = 0; i < blocks_.size(); i++) {
    delete[] blocks_[i];
  }
}
```

Arena 类是 LevelDB 自己实现的内存管理类，具体内存分配和回收可以参考 [内存管理 Arena 类](/leveldb_source_utils/#内存管理-Arena-类)。

这里值得注意的是，MemTable 将析构函数 `~MemTable();` 设置为 private，强制外部代码通过 `Unref()` 方法来管理 MemTable 的生命周期。这保证了引用计数逻辑能够正确执行，防止了由于不当的删除操作导致的内存错误。
