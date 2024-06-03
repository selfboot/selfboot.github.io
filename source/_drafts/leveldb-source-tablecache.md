---
title: LevelDB 源码阅读：TableCache 的应用和实现
tags: [C++, LevalDB]
category: 源码剖析
toc: true
description: 
---

TableCache 是 LevelDB 中用于缓存打开的 sstable 文件的数据结构，以加快数据读取速度。在 TableCacheSize 函数中，从 max_open_files 中减去一个常数 kNumNonTableCacheFiles（通常为 10），是为了留出一部分文件描述符给其他用途，比如日志文件和 manifest 文件的打开。

<!-- more -->

## TableCache 的应用

TableCache 主要用在 DBImpl 类中，用于缓存打开的 sstable 文件。在 DBImpl 的构造函数中，会初始化一个 TableCache 对象，代码如下：

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

其实 TableCache 在初始化的时候，会从 `max_open_files` 中减去一个常数 `kNumNonTableCacheFiles`（通常为 10），这样可以留出一部分文件描述符给其他用途，比如日志文件和 manifest 文件的使用。

### 添加缓存

首先来看什么时机下会主动将 sstable 文件添加到缓存中。

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

