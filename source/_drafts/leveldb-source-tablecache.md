---
title: LevelDB 源码阅读：TableCache 的应用和实现
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
---

LevelDB 中有大量的 sstable 文件存储在磁盘中，这些文件是 LevelDB 存储数据的基本单位。每次读取 key 的话，如果在内存的 memtable 和 immutable memtable 中没有找到，就需要从 sstable 文件中查找。如果每次都需要从磁盘读取文件，解析里面的文件内容，然后再进行查找，效率会非常低下。

为了提高数据的读取速度，LevelDB 使用了一个 TableCache 来缓存打开的 sstable 文件，LevelDB 在适当的时机将打开的文件添加到缓存中，又在删除文件的时候主动淘汰缓存的 sstable 文件。通过维护这里的缓存，可以有效减少磁盘 I/O 操作，提高数据的读取速度。

TableCache 实现比较简单，在 [LRU cache](/leveldb_source_LRU_cache) 的基础上做了封装，然后提供几个接口用于操作缓存。借助这里 TableCache，我们可以更好地理解 LRU cache 的用法。 

<!-- more -->

## TableCache 的应用

先来看看 TableCache 的应用场景。TableCache 主要用在 DBImpl 类中，用于缓存打开的 sstable 文件。在 DBImpl 的构造函数中，会初始化一个 TableCache 对象，代码如下：

```c++
DBImpl::DBImpl(const Options& raw_options, const std::string& dbname)
    : env_(raw_options.env),
      // ...
      dbname_(dbname),
      table_cache_(new TableCache(dbname_, options_, TableCacheSize(options_))),
      db_lock_(nullptr),
      //..
```

这里 `TableCacheSize` 函数用来设置 cache 的容量，决定最多可以缓存多少个 sstable 文件。在 LevelDB 的配置(include/leveldb/options.h)中，有一个 `max_open_files` 用来决定最多可以打开的文件数。这个值默认是 1000，如果要自定义设置的话，需要考虑以下方面：

1. 操作系统对每个进程可以打开的文件数量通常有限制。如果 max_open_files 设置得过高，超过了操作系统允许的限制，可能导致进程打不开文件。
2. 如果需要频繁访问的数据量比较大，考虑到每个 SSTable 文件推荐占用 2MB 空间，可以适当增大 max_open_files 的值，以提高缓存命中率。
3. 增加 max_open_files 可以减少磁盘I/O，提高性能，但也会增加内存的使用。每个打开的文件都需要一定的内存来维护相关数据结构，如文件描述符和缓冲区。因此，需要在性能提升与内存使用之间找到平衡。

其实 TableCache 在初始化的时候，会从 `max_open_files` 中减去一个常数 `kNumNonTableCacheFiles`（这里是 10），这样可以留出一部分文件描述符给其他用途，比如日志文件和 manifest 文件的使用。

### 添加缓存

首先来看什么时机下会主动将 sstable 文件添加到缓存中。我们知道，LevelDB 内存中的 immutable memtable 会被转换为 sstable 文件，这个过程会调用 `WriteLevel0Table` 函数。这个过程会调用 BuildTable 来生成 Level-0 下的 sstable 文件，然后写入硬盘。在成功写入磁盘后，LevelDB 就会用 TableCache 读取这个文件，除了用来验证确实写入成功，这个过程也会将新创建的文件添加到缓存中。

```c++

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

其实不止是生成 sstable 文件的时候会主动添加到 TableCache 中，在读取过程中，函数会先尝试从 TableCache 中查找，如果缓存中没有命中，则会从磁盘中读取文件并缓存起来。LevelDB 中的 Version::Get 方法用于执行查找操作，这个函数通过查询不同版本的 sstable 文件来查找一个特定的键，并根据查找结果返回相应的值或状态。在查找的时候，对于每个 sstable 文件，

```c++
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

### 主动淘汰

TableCache 会在一定条件下**主动淘汰一些缓存的 sstable 文件，以释放内存空间**。这个过程主要是通过 RemoveObsoleteFiles 函数实现的，这个函数会遍历数据库文件系统中的所有文件，根据文件的类型和编号决定是否需要保留该文件。如果某个文件不在保留列表中，则会被添加到 files_to_delete 列表中，准备被删除。

删除文件时，除了将其文件名添加到删除列表中，还**需要从 TableCache 中删掉这个文件的缓存**。这是因为，一旦文件被物理删除，其相关的缓存条目就变得无效，继续保留会浪费资源。

```c++
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

## TableCache 的实现

TableCache 用 LRU Cache 来做缓存，对外提供了 3 个接口 NewIterator，Get 和 Evict。这三个接口在前面应用部分都有介绍使用场景，接下来看看具体是怎么实现的。

TableCache 类中成员变量 `Cache* cache_` 是一个 LRU Cache 对象，用于存储 sstable 文件的缓存。在 TableCache 的构造函数中，`cache_(NewLRUCache(entries))` 会初始化这个 cache_ 对象。此外还有成员变量 Options 用来记录一些读配置，Env 来支持不同平台的文件操作。该类核心逻辑放在私有方法 `FindTable`，下面是实现代码。

```c++
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

整体上和一般的缓存业务流程差不太多，**先尝试在缓存中查找，如果找到直接返回。找不到的话，就从磁盘中读取并解析文件，然后插入到缓存中**。

接下来看一些细节部分，这里缓存的 key 是根据文件编号（file_number）生成的，因为整个 LevelDB 数据库中所有磁盘文件的编号都是唯一的。具体做法是用 EncodeFixed64 将文件编号编码成固定长度的字符串，接着生成 Slice 对象作为键。EncodeFixed64 在 [整数编、解码](/leveldb-source-utils/#整数编、解码) 里面有详细介绍，这里不再赘述。

打开文件部分可以看到会先尝试 TableFileName，失败的话，再尝试 SSTTableFileName。这两个函数的区别在于拿到的文件名后缀不同，TableFileName 是 ".ldb"，SSTTableFileName 是 ".sst"。这是因为新版本用 ".ldb" 作为文件后缀，旧版本用 ".sst" 作为文件后缀。这里做了版本兼容，如果打开新版本的文件失败，就尝试打开旧版本的文件。

打开文件后，就会调用 Table::Open 函数来解析文件，生成 Table 对象。如果中间一切正常，会把文件对象指针和 Table 指针一起放到 TableAndFile 中，然后将 TableAndFile* 作为 value 插入到缓存中。调用 cache_ 的 Insert 插入缓存的时候，TableAndFile* 会隐式转换为 void*。这里 TableAndFile 的定义如下：

```c++
struct TableAndFile {
  RandomAccessFile* file;
  Table* table;
};
```

在插入 cache_ 的时候，还指定了缓存释放的回调函数 DeleteEntry，这个函数会在缓存淘汰的时候被调用，用于释放资源。

```c++
static void DeleteEntry(const Slice& key, void* value) {
  TableAndFile* tf = reinterpret_cast<TableAndFile*>(value);
  delete tf->table;
  delete tf->file;
  delete tf;
}
```

注意 cache_ 中的 value 是 void* 类型，提供的回调函数第二个参数也必须是 void* 类型。然后在 DeleteEntry 中通过 reinterpret_cast 将 void* 转换为 TableAndFile* ，然后释放资源。C++中，void* 是一种特殊的指针类型，用于指向任何类型的数据，但**无法直接对指向的数据进行操作，除非将其转换回其原始类型**。void* 提供了一种在不知道指针具体类型的情况下存储和传递地址的方式。

### 接口实现