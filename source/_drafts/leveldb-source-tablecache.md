---
title: LevelDB 源码阅读：TableCache 的应用和实现
tags: [C++, LevelDB]
category: 源码剖析
toc: true
date: 2024-12-17 21:00:00
description: 深入解析 LevelDB 中 TableCache 的实现原理和应用场景。TableCache 通过缓存 sstable 文件的索引信息来优化数据读取性能，减少磁盘 I/O 操作。文章详细介绍了 TableCache 的初始化配置、缓存添加和淘汰机制，以及其在查询和写入操作中的具体应用。通过分析源码，展示了 LevelDB 如何基于 LRU Cache 实现高效的文件缓存管理，以及如何在性能和资源消耗之间取得平衡。
---

LevelDB 中有大量的 sstable 文件存储在磁盘中，这些文件是 LevelDB 存储数据的基本单位。每次读取 key 的话，如果在内存的 memtable 和 immutable memtable 中没有找到，就需要从 sstable 文件中查找。如果每次都需要从磁盘读取文件，解析里面的文件内容，然后再进行查找，效率会非常低下。

为了提高数据的读取速度，LevelDB 使用了一个 TableCache 来缓存打开 sstable 文件的索引信息。我们知道 sstable 文件以 data block 为存储单位，除了具体的 key-value 数据块，还有索引块等。每次读取 key 的时候，根据索引块能快速定位到对应的 data block，然后读取数据，详细内容可以参考 [LevelDB 源码阅读：SSTable 文件落磁盘以及解析](/2024/06/26/leveldb-source-table-process/)。

LevelDB 在适当的时机**将 sstable 文件的索引信息添加到缓存中**，可以有效减少磁盘 I/O 操作，提高数据的读取速度。当然除了 TableCache，leveldb 还有 BlockCache 用来缓存实际的数据块内容，用来提高热点数据块的访问速度。

本文重点看下 TableCache 的实现，它是在 [LRU cache](/leveldb_source_LRU_cache) 的基础上做了封装，然后提供几个接口用于操作缓存。借助这里 TableCache，我们可以更好地理解 LRU cache 的用法。 

<!-- more -->

## TableCache 的应用

先来看看 TableCache 的应用场景。TableCache 主要用在 DBImpl 类中，用于缓存打开的 sstable 文件。在 [DBImpl 的构造函数](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L135)中，会初始化一个 TableCache 对象，代码如下：

```cpp
DBImpl::DBImpl(const Options& raw_options, const std::string& dbname)
    : env_(raw_options.env),
      // ...
      dbname_(dbname),
      table_cache_(new TableCache(dbname_, options_, TableCacheSize(options_))),
      db_lock_(nullptr),
      //..
```

这里 `TableCacheSize` 函数用来设置 cache 的容量，决定最多可以缓存多少个 sstable 文件。在 LevelDB 的配置([include/leveldb/options.h](https://github.com/google/leveldb/blob/main/include/leveldb/options.h))中，有一个 `max_open_files` 用来决定最多可以打开的文件数。这个值默认是 1000，如果要自定义设置的话，需要考虑以下方面：

1. 操作系统对每个进程可以打开的文件数量通常有限制。如果 max_open_files 设置得过高，超过了操作系统允许的限制，可能导致进程打不开文件。
2. 如果需要频繁访问的数据量比较大，考虑到每个 SSTable 文件推荐占用 2MB 空间，可以适当增大 max_open_files 的值，以提高缓存命中率。
3. 增加 max_open_files 可以减少磁盘I/O，提高性能，但也会增加内存的使用。每个打开的文件都需要一定的内存来维护相关数据结构，如文件描述符和缓冲区。因此，需要在性能提升与内存使用之间找到平衡。

其实 TableCache 在初始化的时候，会从 `max_open_files` 中减去一个常数 `kNumNonTableCacheFiles`（这里是 10），这样可以留出一部分文件描述符给其他用途，比如日志文件和 manifest 文件的使用。

### 添加缓存

首先来看什么时机下会主动将 sstable 文件添加到缓存中。我们知道，LevelDB 内存中的 immutable memtable 会被转换为 sstable 文件，这个过程会调用 `WriteLevel0Table` 函数。这个过程会调用 [db/builder.cc](https://github.com/google/leveldb/blob/main/db/builder.cc) 里的 BuildTable 来生成 Level-0 下的 sstable 文件，然后写入硬盘。

在成功写入磁盘后，LevelDB 就会用 TableCache 读取这个文件，除了用来验证确实写入成功，这个过程也会将[新创建的文件添加到缓存](https://github.com/google/leveldb/blob/main/db/builder.cc#L62)中。

```cpp

Status BuildTable(const std::string& dbname, Env* env, const Options& options,
                  TableCache* table_cache, Iterator* iter, FileMetaData* meta) {
    // ..
    if (s.ok()) {
      // Verify that the table is usable
      Iterator* it = table_cache->NewIterator(ReadOptions(), meta->number,
                                              meta->file_size);
      s = it->status();
      delete it;
    }
  }
  //...
  return s;
}
```

### 使用缓存

其实不止是生成 sstable 文件的时候会主动添加到 TableCache 中，在读取过程中，函数会先尝试从 TableCache 中查找，如果缓存中没有命中，则会从磁盘中读取文件并缓存起来。LevelDB 中的 [Version::Get 方法](https://github.com/google/leveldb/blob/main/db/version_set.cc#L324)用于执行查找操作，这个函数通过查询不同版本的 sstable 文件来查找一个特定的键，并根据查找结果返回相应的值或状态。

```cpp
Status Version::Get(const ReadOptions& options, const LookupKey& k,
                    std::string* value, GetStats* stats) {
    // ...
    static bool Match(void* arg, int level, FileMetaData* f) {
      // ...
      state->s = state->vset->table_cache_->Get(*state->options, f->number,
                                                f->file_size, state->ikey,
                                                &state->saver, SaveValue);
      // ...
    }
  };
  // ...
}
```

在查找的时候，首先通过 `ForEachOverlapping()` 找到可能包含目标 key 的文件，对每个可能的文件，调用 `TableCache::Get()` 进行查找。如果缓存命中，直接从缓存读取；否则需要打开 SSTable 文件并加入缓存。这里打开文件并加到缓存的逻辑在 `TableCache::Get()` 内部实现，后面会介绍。

### 主动淘汰

TableCache 会在一定条件下**主动淘汰一些缓存的 sstable 文件，以释放内存空间**。这个过程主要是通过 [RemoveObsoleteFiles](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L274) 函数实现的，这个函数会遍历数据库文件系统中的所有文件，根据文件的类型和编号决定是否需要保留该文件。如果某个文件不在保留列表中，则会被添加到 files_to_delete 列表中，准备被删除。

删除文件时，除了将其文件名添加到删除列表中，还**需要从 TableCache 中删掉这个文件的缓存**。因为一旦文件被物理删除，其相关的缓存条目就变得无效，继续保留会浪费资源。

```cpp
// db/db_impl.cc
void DBImpl::RemoveObsoleteFiles() {
  std::vector<std::string> filenames;
  env_->GetChildren(dbname_, &filenames);  // Ignoring errors on purpose
  // ...
  for (std::string& filename : filenames) {
    if (ParseFileName(filename, &number, &type)) {
      bool keep = true;
      // ...

      if (!keep) {
        files_to_delete.push_back(std::move(filename));
        if (type == kTableFile) {
          table_cache_->Evict(number);
        }
        // ...
      }
    }
  }
  // ...
}
```

这里用一张图简单总结下：

![TableCache 使用流程](https://slefboot-1251736664.file.myqcloud.com/20241217_leveldb_source_tablecache.png)

```mermaid
graph TD
    A[数据读取请求] --> B{检查 TableCache}
    B -->|缓存命中| C[从缓存获取 Table 对象]
    B -->|缓存未命中| D[打开 SSTable 文件]
    D --> E[解析文件生成 Table 对象]
    E --> F[将 Table 对象加入缓存]
    F --> C
    C --> G[读取数据]

    H[新建 SSTable 文件] --> I[写入磁盘]
    I --> J[主动加入 TableCache]

    K[文件清理] --> L[从文件系统删除]
    L --> M[从 TableCache 中淘汰]
```

## TableCache 的实现

TableCache 类用 LRU Cache 来做缓存，类中成员变量 `Cache* cache_` 是一个 LRU Cache 对象，用于存储 sstable 文件的缓存数据。在 TableCache 的构造函数中，`cache_(NewLRUCache(entries))` 会初始化这个 cache_ 对象。

除了 cache_ 对象，此外还有成员变量 Options 用来记录一些读配置，Env 来支持不同平台的文件操作。

该类对外提供了 3 个接口方法 NewIterator，Get 和 Evict。这 3 个接口在前面应用部分都有介绍使用场景，那么具体怎么实现的呢？Evict 其实比较简单，直接调用 LRUCache 中的 Erase 清理相应 key 即可，下面看看其他 2 个怎么实现的。

### TableCache::FindTable

在开始之前，先来看下内部的私有方法 [FindTable](https://github.com/google/leveldb/blob/main/db/table_cache.cc#L41)，NewIterator 和 Get 中都会用到该方法。

```cpp
Status TableCache::FindTable(uint64_t file_number, uint64_t file_size,
                             Cache::Handle** handle) {
  Status s;
  char buf[sizeof(file_number)];
  EncodeFixed64(buf, file_number);
  Slice key(buf, sizeof(buf));
  *handle = cache_->Lookup(key);
  if (*handle == nullptr) {
    std::string fname = TableFileName(dbname_, file_number);
    RandomAccessFile* file = nullptr;
    Table* table = nullptr;
    s = env_->NewRandomAccessFile(fname, &file);
    if (!s.ok()) {
      std::string old_fname = SSTTableFileName(dbname_, file_number);
      if (env_->NewRandomAccessFile(old_fname, &file).ok()) {
        s = Status::OK();
      }
    }
    if (s.ok()) {
      s = Table::Open(options_, file, file_size, &table);
    }

    if (!s.ok()) {
      assert(table == nullptr);
      delete file;
    } else {
      TableAndFile* tf = new TableAndFile;
      tf->file = file;
      tf->table = table;
      *handle = cache_->Insert(key, tf, 1, &DeleteEntry);
    }
  }
  return s;
}
```

整体上和一般的缓存逻辑差不太多，**先尝试在缓存中查找，如果找到直接返回。找不到的话，就从磁盘中读取并解析文件，然后插入到缓存中**。

接下来看一些细节部分，这里缓存的 key 是根据文件编号（file_number）生成的，因为整个 LevelDB 数据库中所有磁盘文件的编号都是唯一的。具体做法是用 EncodeFixed64 将文件编号编码成固定长度的字符串，接着生成 Slice 对象作为键。EncodeFixed64 在 [LevelDB 源码阅读：内存分配器、随机数生成、CRC32、整数编解码]([/leveldb-source-utils/#整数编、解码](https://selfboot.cn/2024/08/29/leveldb_source_utils/#%E6%95%B4%E6%95%B0%E7%BC%96%E3%80%81%E8%A7%A3%E7%A0%81)) 里面有详细介绍，这里不再赘述。

打开文件部分可以看到会先尝试 TableFileName，失败的话，再尝试 SSTTableFileName。这两个函数的区别在于拿到的文件名后缀不同，TableFileName 是 ".ldb"，SSTTableFileName 是 ".sst"。这是因为新版本用 ".ldb" 作为文件后缀，旧版本用 ".sst" 作为文件后缀。这里**做了版本兼容，如果打开新版本的文件失败，就尝试打开旧版本的文件**。

打开文件后，就会调用 Table::Open 函数来解析文件，生成 Table 对象。如果一切正常，会把文件对象指针和 Table 指针一起放到 TableAndFile 中，然后将 TableAndFile* 作为 value 插入到缓存中。调用 cache_ 的 Insert 插入缓存的时候，TableAndFile* 会隐式转换为 void*。这里 [TableAndFile](https://github.com/google/leveldb/blob/main/db/table_cache.cc#L14) 的定义如下：

```cpp
struct TableAndFile {
  RandomAccessFile* file;
  Table* table;
};
```

这里 file 是文件句柄，使用它可以随机访问底层的 SST 文件。table 指向 Table 对象，这个对象包含了文件的索引块(index block)缓存、元数据块(meta block)缓存、布隆过滤器(如果启用)缓存，值得注意的是数据块(data blocks)默认不会全部加载到内存。这里缓存了索引信息，对于具体的数据块，通过 file 来读写，leveldb 也支持缓存数据块来加速访问。

注意前面在插入 cache_ 的时候，还指定了缓存释放的回调函数 DeleteEntry，这个函数会在缓存淘汰的时候被调用，用于释放相应的资源。注意 cache_ 中的 value 是 void* 类型，提供的回调函数 DeleteEntry 第二个参数也必须是 void* 类型。在 [DeleteEntry](https://github.com/google/leveldb/blob/main/db/table_cache.cc#L19) 中通过 reinterpret_cast 将 void* 转换为 TableAndFile* ，然后释放资源。

```cpp
static void DeleteEntry(const Slice& key, void* value) {
  TableAndFile* tf = reinterpret_cast<TableAndFile*>(value);
  delete tf->table;
  delete tf->file;
  delete tf;
}
```

C++中，void* 是一种特殊的指针类型，用于指向任何类型的数据，但**无法直接对指向的数据进行操作，除非将其转换回其原始类型**。void* 提供了一种在不知道指针具体类型的情况下存储和传递地址的方式。

### TableCache::Get

接着来看看 TableCache 对外提供的 [Get 方法](https://github.com/google/leveldb/blob/main/db/table_cache.cc#L100)，完整代码如下：

```cpp
Status TableCache::Get(const ReadOptions& options, uint64_t file_number,
                       uint64_t file_size, const Slice& k, void* arg,
                       void (*handle_result)(void*, const Slice&,
                                             const Slice&)) {
  Cache::Handle* handle = nullptr;
  Status s = FindTable(file_number, file_size, &handle);
  if (s.ok()) {
    Table* t = reinterpret_cast<TableAndFile*>(cache_->Value(handle))->table;
    s = t->InternalGet(options, k, arg, handle_result);
    cache_->Release(handle);
  }
  return s;
}
```

首先调用 FindTable 方法来拿到 sstable 文件的缓存 handle (如果第一次读需要先解析然后放到 cache 中)，接着从 handle 中拿到对应的 Table* 指针。调用 Table 类的 InternalGet 方法，该方法负责在 sstable 文件中查找键，并使用**提供的回调函数 handle_result**返回解析后的结果。前面提过在 db/version_set.cc 中有调用 Get 方法，就是用函数 SaveValue 将 Table 中读取到的 value 解析为 state->saver。

当然用完缓存之后，需要调用 `cache_->Release(handle);` 来释放对当前 handle 的引用。如果没有其他地方引用这个 key 对应的 LRU handle，就会把这个 key 放到 LRU Cache 的 lru_ 队列。在 cache 容量不够的时候，就可以按照最近一次使用时间来回收 lru_ 队列中的 key。

### TableCache::NewIterator

除了 Get，TableCache 还支持用 NewIterator 返回一个迭代器，可以遍历里面所有 key。虽然使用的时候，没用来遍历所有 key，只是验证 SST 文件写成功。具体实现如下，省略掉一些不重要的边界和异常处理代码。

```cpp
Iterator* TableCache::NewIterator(const ReadOptions& options,
                                  uint64_t file_number, uint64_t file_size,
                                  Table** tableptr) {
  // ...
  Cache::Handle* handle = nullptr;
  Status s = FindTable(file_number, file_size, &handle);
  // ...

  Table* table = reinterpret_cast<TableAndFile*>(cache_->Value(handle))->table;
  Iterator* result = table->NewIterator(options);
  result->RegisterCleanup(&UnrefEntry, cache_, handle);
  if (tableptr != nullptr) {
    *tableptr = table;
  }
  return result;
}
```

这里也是先通过 FindTable 来拿到缓存 handle 指针，解析出 table 后调用 NewIterator 拿到迭代器 result。值得注意的是，这里用迭代器的 RegisterCleanup 方法，来注册迭代器失效后的清理函数 [UnrefEntry](https://github.com/google/leveldb/blob/main/db/table_cache.cc#L26)。UnrefEntry 要做的事情也很简单，释放 LRUCache 的 handle 占用即可。

```cpp
static void UnrefEntry(void* arg1, void* arg2) {
  Cache* cache = reinterpret_cast<Cache*>(arg1);
  Cache::Handle* h = reinterpret_cast<Cache::Handle*>(arg2);
  cache->Release(h);
}
```

RegisterCleanup 的实现在 table/iterator.cc 中，在迭代器对象中维护一个清理操作链表。每次添加新的注册回调，就在链表中增加一个节点。在迭代器析构的时候，遍历这里的链表，取出每个回调函数和参数然后进行处理。

这里的目标就是保证迭代器使用 Table 期间，Table 对象一直在缓存中。当迭代器被删除时，需要释放对 Table 的引用。通过 RegisterCleanup 机制，确保资源能够正确释放。

## 总结

TableCache 是 LevelDB 中一个重要的性能优化组件，它通过缓存 sstable 文件的索引信息来减少磁盘 I/O 操作。TableCache 的实现基于 LRU Cache，在读取数据时会优先查找缓存，只有在缓存未命中时才会从磁盘读取文件并将其加入缓存。

这种机制在保证数据访问效率的同时，也需要合理管理内存资源。通过 max_open_files 参数可以控制缓存的大小，在性能和资源消耗之间取得平衡。

TableCache 不仅在查询操作中发挥作用，在写入新的 sstable 文件时也会主动将其加入缓存，同时在文件被删除时会及时清理相关缓存条目。整个实现充分展示了 LevelDB 在性能优化方面的精心设计，是理解 LevelDB 缓存机制的重要组成部分。