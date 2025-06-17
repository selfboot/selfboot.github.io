---
title: LevelDB 源码阅读：SSTable 文件落磁盘以及解析
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
date: 2025-06-25 18:00:00
---

LevelDB 中，内存表中的键值对在到达一定大小后，会落到磁盘文件中。这里 LevelDB 是怎么组织文件格式的？怎么提高数据的读写性能？实现中有哪些优化点？接下来我们从 SSTable 文件的创建和解析，来看看这里到底怎么实现的。

为了方便大家快速理解，这里先简单**填鸭式**的给大家介绍下 SSTable 文件的格式，至于为什么要这么设计，以及如何提高读写性能，我们后面再慢慢分析。

## SSTable 文件格式概述

SSTable（Sorted String Table）是 LevelDB 中用于**持久化存储键值对的文件格式**。它主要由一系列的数据块（Data Blocks）、一个索引块（Index Block）、一个可选的过滤块（Filter Block）、一个元数据块（Meta Index Block）和一个表尾（Footer）组成。下面是一个简单的 ASCII 图来描述 SSTable 的结构：

```shell
+-------------------+
|   Data Block 0    |
+-------------------+
|   Data Block 1    |
+-------------------+
|       ...         |
+-------------------+
|   Data Block N    |
+-------------------+
|   Filter Block    |  (可选)
+-------------------+
| Meta Index Block  |
+-------------------+
|   Index Block     |
+-------------------+
|      Footer       |
+-------------------+
```

<!-- more -->

我先简单概述下这里每个块基本作用，后面结合代码，我们再详细分析。

- **Data Blocks**: 存储实际的键值对数据。每个块通常包含多个键值对，块的大小可以在 LevelDB 的配置中设置。
- **Filter Block**: 一个可选的块，用于快速检查一个键是否存在于某个数据块中，通常使用布隆过滤器（Bloom Filter）来实现。
- **Meta Index Block**: 存储了元数据，如过滤块的位置信息。
- **Index Block**: 存储每个数据块的最大键和该数据块在文件中的偏移量。通过索引块，LevelDB 可以快速定位到包含特定键的数据块。
- **Footer**: 包含了元索引块和索引块的偏移量和大小。还包含了用于标识文件类型和版本的魔法数字。

至于这些块是怎么构建和解析的，我们先不用管，后面我会在[LevelDB 源码阅读：SSTable 中数据块 Block 的处理](/leveldb_source_table_block/) 这个文章里详细说明。哎，LevelDB 实现就是这么一层套一层，咱们也只能一层层剥离来理解。

本篇文章，咱们主要关注 SSTable 文件的创建和解析过程，也就是说怎么创建一个新的 SSTable 文件，以及怎么从 SSTable 文件中读取数据。这部分实现涉及了 2 个核心文件：

- [table/table_builder.cc](https://github.com/google/leveldb/blob/main/table/table_builder.cc): 负责 SSTable 文件的创建。TableBuilder 类提供了向 SST 文件中添加键值对的接口，可以用该类生成一个完整的 SST 文件。
- [table/table.cc](https://github.com/google/leveldb/blob/main/table/table.cc): 负责 SSTable 文件的读取和解析。Table 类用于打开 SST 文件，并从中读取数据。

## TableBuilder 写文件

我们先来看 TableBuilder 类，该类可以**将有序键值对转换为磁盘中的 SSTable 文件，确保数据的查询效率以及存储效率**。该类只有一个私有成员变量，是一个 Rep* 指针，里面保存各种状态信息，比如当前的 DataBlock、IndexBlock 等。这里 Rep* 用到了 Pimpl 的设计模式，可以看本系列的 [LevelDB 源码阅读：理解其中的 C++ 高级技巧](/2024/08/13/leveldb_source_unstand_c++/#Pimpl-类设计) 了解关于 Pimpl 的更多细节。

该类最重要的接口有 Add，Finish，接下来从这两个接口入手，分析 TableBuilder 类的实现。

### Add 添加键值

[TableBuilder::Add](https://github.com/google/leveldb/blob/main/table/table_builder.cc#L94) 方法是向 SSTable 文件中添加键值对的核心函数，它的实现主要分 5 部分，我这里一个个来说吧。

```cpp
void TableBuilder::Add(const Slice& key, const Slice& value) {
  // 1. 前置校验
  // 2. 处理索引块
  // 3. 处理过滤块
  // 4. 处理数据块
  // 5. 适当时机落盘
}
```

#### 前置校验

在 Add 方法中，首先会先读出来 rep_ 的数据，做一些前置校验，比如验证文件没有被关闭，保证键值对是有序的。

```cpp
  Rep* r = rep_;
  assert(!r->closed);
  if (!ok()) return;
  if (r->num_entries > 0) {
    assert(r->options.comparator->Compare(key, Slice(r->last_key)) > 0);
  }
```

#### 处理索引记录

接着会检查是否需要添加索引记录 (IndexBlock)，这些记录被用来快速检索 key 对应的 DataBlock 位置。**每个 DataBlock 都对应索引块中的一条记录**，每当处理完一个 DataBlock 时，就会将 pending_index_entry 设置为 true，等到下次全新的 DataBlock 增加第一个 key 前，再更新上个 DataBlock 的索引记录。

这里之所以要等到新 DataBlock 增加第一个 key 的时候才更新索引块，是**为了减少索引键的长度**，从而减少索引块的大小。比如前一个 DataBlock 中的最后(也是最大)一个 key 是 "the quick brown fox"，新的 DataBlock 即将插入的第一个(也是最小) key 是 "the who"，那么索引块中增加的索引键可以为 "the w"。这里 "the w" 是位于 "the quick brown fox" 和 "the who" 之间的**最短分隔 key**。这里计算字符串之间的最短分割 key，是通过调用 options.comparator->FindShortestSeparator，其默认实现在 `util/comparator.cc`。

每条索引记录的 value 是**该块在文件内的偏移和 size**，这是通过 pending_handle 来记录的。当通过 WriteRawBlock 将 DataBlock 写文件的时候，会更新 pending_handle 的偏移和大小。然后写索引的时候，用 EncodeTo 将偏移和 size 编码到字符串中，和前面的索引 key 一起插入到 IndexBlock 中。索引部分的核心代码如下：

```cpp
  if (r->pending_index_entry) {
    assert(r->data_block.empty());
    r->options.comparator->FindShortestSeparator(&r->last_key, key);
    std::string handle_encoding;
    r->pending_handle.EncodeTo(&handle_encoding);
    r->index_block.Add(r->last_key, Slice(handle_encoding));
    r->pending_index_entry = false;
  }
```

#### 处理过滤记录

接着处理 FilterBlock 过滤索引块，该块用来**快速判断某个 key 是否存在于当前 SSTable 中**。如果设置需要过滤，在添加 key 的时候，则需要同步添加索引，其核心代码如下：

```cpp
  if (r->filter_block != nullptr) {
    r->filter_block->AddKey(key);
  }
```

这里添加 key 之后，只是在内存中存储索引，要等到最后 TableBuild 写完所有的 Block 之后，才会将 FilterBlock 写入文件。**FilterBlock 本身是可选的**，通过 options.filter_policy 来设置。在初始化 TableBuilder::Rep 的时候，会根据 options.filter_policy 来初始化 FilterBlockBuilder 指针，如下：

```cpp
  Rep(const Options& opt, WritableFile* f)
      : options(opt),
        // ...
        filter_block(opt.filter_policy == nullptr
                         ? nullptr
                         : new FilterBlockBuilder(opt.filter_policy)),
        pending_index_entry(false) {
    // ...
  }
```

这里值得注意的是 filter_block 之所以是指针，主要是因为除了用默认的布隆过滤器，还可以**用多态机制使用自己的过滤器**。这里用 new 在堆上创建的对象，为了**防止内存泄露**，在 TableBuilder 析构的时候，先释放掉 filter_block，再接着释放 rep_。

```cpp
TableBuilder::~TableBuilder() {
  assert(rep_->closed);  // Catch errors where caller forgot to call Finish()
  delete rep_->filter_block;
  delete rep_;
}
```

之所以需要释放 rep_，是因为它是在 TableBuilder 构造的时候，在堆上创建的，如下：

```cpp
TableBuilder::TableBuilder(const Options& options, WritableFile* file)
    : rep_(new Rep(options, file)) {
  if (rep_->filter_block != nullptr) {
    rep_->filter_block->StartBlock(0);
  }
}
```

关于 LevelDB 默认的布隆过滤器实现，可以参考[LevelDB 源码阅读：布隆过滤器的实现](/leveldb_source_filterblock)。

#### 处理数据块

接着需要将键值对添加到 DataBlock 中。DataBlock 是 SSTable 文件中存储实际键值对的地方，代码如下：

```cpp
  r->last_key.assign(key.data(), key.size());
  r->num_entries++;
  r->data_block.Add(key, value);

  const size_t estimated_block_size = r->data_block.CurrentSizeEstimate();
  if (estimated_block_size >= r->options.block_size) {
    Flush();
  }
```

这里调用 BlockBuilder 中的 Add 方法，将键值对添加到 DataBlock 中，关于 BlockBuilder 的实现，参考本系列 [LevelDB 源码阅读：SSTable 中数据块 Block 的处理](/leveldb-source-table-block/)。每次添加键值对后，都会检查当前 DataBlock 的大小是否超过了 block_size，如果超过了，则调用 Flush 方法将 DataBlock 写入磁盘文件。这里的 block_size 是在 options 中设置的，默认是 4KB。这里是键值压缩前的大小，如果开启了压缩，实际写入文件的大小会小于 block_size。

```cpp
  // Approximate size of user data packed per block.  Note that the
  // block size specified here corresponds to uncompressed data.  The
  // actual size of the unit read from disk may be smaller if
  // compression is enabled.  This parameter can be changed dynamically.
  size_t block_size = 4 * 1024;
```

### Flush 写数据块

在前面的 Add 方法中，如果一个块的大小凑够 4KB，就会调用 Flush 方法写磁盘文件。Flush 的实现如下：

```cpp
void TableBuilder::Flush() {
  Rep* r = rep_;
  assert(!r->closed);
  if (!ok()) return;
  if (r->data_block.empty()) return;
  assert(!r->pending_index_entry);
  WriteBlock(&r->data_block, &r->pending_handle);
  if (ok()) {
    r->pending_index_entry = true;
    r->status = r->file->Flush();
  }
  if (r->filter_block != nullptr) {
    r->filter_block->StartBlock(r->offset);
  }
}
```

开始部分也就是一些前置校验，注意 Flush 只是用来刷 DataBlock 部分，如果 data_block 为空，就直接返回。接着调用 WriteBlock 方法将 DataBlock 写入文件，然后**更新 pending_index_entry 为 true，表示下次添加 key 时，需要更新索引块**。最后调用 file->Flush() 强制刷磁盘，确保数据写入硬盘中，不会因为操作系统宕机而丢失。如果有 filter_block，还需要调用 StartBlock 方法，用来记录当前 DataBlock 的偏移量。

### WriteBlock 写文件

Flush 中会调用 WriteBlock 方法将 DataBlock 写入文件，该方法在下面要提到的 Finish 中也会被调用，用来在最后写索引块，过滤块等内容。WriteBlock 的实现比较简单，如果调用 leveldb 时设置了需要压缩，并且编译库时链接了压缩库，就会选择对应的压缩算法对 Block 进行压缩。如果压缩比 (compression_ratio) 小于等于 0.85，就会将压缩后的数据写入文件，否则直接写入原始数据。这里写文件调用 WriteRawBlock 方法，主要代码如下：

```cpp
void TableBuilder::WriteRawBlock(const Slice& block_contents,
                                 CompressionType type, BlockHandle* handle) {
  Rep* r = rep_;
  handle->set_offset(r->offset);
  handle->set_size(block_contents.size());
  r->status = r->file->Append(block_contents);
  if (r->status.ok()) {
    char trailer[kBlockTrailerSize];
    trailer[0] = type;
    uint32_t crc = crc32c::Value(block_contents.data(), block_contents.size());
    crc = crc32c::Extend(crc, trailer, 1);  // Extend crc to cover block type
    EncodeFixed32(trailer + 1, crc32c::Mask(crc));
    r->status = r->file->Append(Slice(trailer, kBlockTrailerSize));
    if (r->status.ok()) {
      r->offset += block_contents.size() + kBlockTrailerSize;
    }
  }
}
```

在每个块的尾部有 5 字节的 trailer 部分，第一个字节是压缩类型，目前支持的压缩算法有 snappy 和 zstd。后面 4 字节是 crc32 校验和，这里用 crc32c::Value 计算数据块的校验和，然后把压缩类型一起计算进去校验和。这里 crc32 部分，可以参考本系列 [LevelDB 源码阅读：utils 组件代码](/leveldb-source-utils/#CRC32-循环冗余校验) 了解更多细节。

### Finish 全部落盘

将 immemtable 保存为 SSTable 文件时，会迭代 immemtable 中的键值对，然后调用上面的 Add 方法来添加。Add 中会更新相关 block 的内容，然后当 DataBlock 超过 block_size 时，会调用 Flush 方法将 DataBlock 写入文件。等所有键值对写完，需要调用 Finish 方法，来进行一些收尾工作，比如将最后一个 Datablock 的数据写入文件，写入 IndexBlock，FilterBlock 等。

Finish 的实现如下，开始之前先用 Flush 把剩余的 DataBlock 部分刷到磁盘文件中，接着会处理其他块：

```cpp
Status TableBuilder::Finish() {
  Rep* r = rep_;
  Flush();
  assert(!r->closed);
  r->closed = true;

  BlockHandle filter_block_handle, metaindex_block_handle, index_block_handle;

  // Write filter block
  // Write metaindex block
  // Write index block
  // Write footer

  return r->status;
}
```

过滤索引块需要

## 创建 SSTable  

在 db/builder.cc 中封装了一个函数 BuildTable 来创建 SSTable 文件，主要就是调用 TableBuilder 类的接口来实现的。省略其他无关代码，核心代码如下：

```cpp
Status BuildTable(const std::string& dbname, Env* env, const Options& options,
                  TableCache* table_cache, Iterator* iter, FileMetaData* meta) {
    // ...
    TableBuilder* builder = new TableBuilder(options, file);
    // ...
    Slice key;
    for (; iter->Valid(); iter->Next()) {
      key = iter->key();
      builder->Add(key, iter->value());
    }
    // ...
    // Finish and check for builder errors
    s = builder->Finish();
    // ...
    delete builder;
    //..
}
```

这里用迭代器 iter 来遍历 immemtable 中的键值对，然后调用 TableBuilder 的 Add 方法将键值对添加到 SSTable 文件中。Memtable 的大小限制默认是 4MB(write_buffer_size = 4*1024*1024)，在用 TableBuilder 添加键值对时，会根据 block_size(4*1024) 来划分数据块。每当凑够一个 DataBlock，就会拼装相应 block 的数据，然后用 flush 追增内容到磁盘 SSTable 文件中。最后调用 TableBuilder 的 Finish 方法写入其他 Block，完成整个SSTable 文件的写入。

除了这里 BuildTable 将 immemtable 中的数据写入 level0 的 SSTable 文件外，还有一个场景是在 Compact 过程中，将多个 SSTable 文件合并成一个 SSTable 文件。这个过程在 db/db_impl.cc 中的 DoCompactionWork 函数中实现，核心步骤和上面区别不大，这里不再赘述。

## Table 解析文件
