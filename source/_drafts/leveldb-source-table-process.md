title: LevelDB 源码阅读：SSTable 文件生成与解析
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
---

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

每个块基本作用如下：

- **Data Blocks**: 存储实际的键值对数据。每个块通常包含多个键值对，块的大小可以在 LevelDB 的配置中设置。
- **Filter Block**: 一个可选的块，用于快速检查一个键是否存在于某个数据块中，通常使用布隆过滤器（Bloom Filter）来实现。
- **Meta Index Block**: 存储了元数据，如过滤块的位置信息。
- **Index Block**: 存储每个数据块的最大键和该数据块在文件中的偏移量。通过索引块，LevelDB 可以快速定位到包含特定键的数据块。
- **Footer**: 包含了元索引块和索引块的偏移量和大小。还包含了用于标识文件类型和版本的魔法数字。

通过这些块，LevelDB 在查找键时可以高效地定位数据。块的构建和解析，在另一篇 [LevelDB 源码阅读：SSTable 中数据块 Block 的处理](/leveldb_source_table_block/) 里有详细说明，本篇文章主要讲解 SSTable 文件的创建和解析，涉及了 2 个核心文件：

- **table/table_builder.cc**: 负责 SSTable 文件的创建。TableBuilder 类提供了向 SST 文件中添加键值对的接口，可以用该类生成一个完整的 SST 文件。
- **table/table.cc**: 负责 SSTable 文件的读取和解析。Table 类用于打开 SST 文件，并从中读取数据。

## TableBuilder 写文件

我们先来看 TableBuilder 类，该类可以将有序键值对转换为磁盘中的 SSTable 文件，确保数据的查询效率以及存储效率。该类只有一个私有成员变量，是一个 Rep* 指针，里面保存各种状态信息，比如当前的 DataBlock、IndexBlock 等。这里 Rep* 用到了 Pimpl 的设计模式，可以看本系列的 [LevelDB 源码阅读：理解其中的 C++ 高级技巧](leveldb_source_unstand_c++/#Pimpl-类设计) 了解关于 Pimpl 的更多细节。

该类最重要的接口有 Add，Finish，接下来从这两个接口入手，分析 TableBuilder 类的实现。

### Add 添加键值

TableBuilder::Add 方法是向 SSTable 文件中添加键值对的核心函数，其实现如下：

```cpp
void TableBuilder::Add(const Slice& key, const Slice& value) {
  // 1. 前置校验
  // 2. 处理索引块
  // 3. 处理过滤块
  // 4. 处理数据块
  // 5. 适当时机落盘
}
```

在 Add 方法中，首先会先读出来 rep_ 的数据，做一些前置校验，比如验证文件没有被关闭，保证键值对是有序的。

```cpp
  Rep* r = rep_;
  assert(!r->closed);
  if (!ok()) return;
  if (r->num_entries > 0) {
    assert(r->options.comparator->Compare(key, Slice(r->last_key)) > 0);
  }
```

接着会检查是否需要更新索引块 (IndexBlock)，该块用来快速检索某个 key 可能落在哪个 DataBlock 中。**每个 DataBlock 都对应索引块中的一条记录**，每当处理完一个 DataBlock 时，就会将 pending_index_entry 设置为 true，等到下次全新的 DataBlock 增加第一个 key 前，再更新上个 DataBlock 的索引记录。

这里之所以要等到新 DataBlock 增加第一个 key 的时候才更新索引块，是**为了减少索引键的长度**，从而减少索引块的大小。比如前一个 DataBlock 中的最后(也是最大)一个 key 是 "the quick brown fox"，新的 DataBlock 即将插入的第一个(也是最小) key 是 "the who"，那么索引块中增加的索引键可以为 "the w"。这里 "the w" 是位于 "the quick brown fox" 和 "the who" 之间的**最短分隔 key**。这里计算字符串之间的最短分割 key，是通过调用 options.comparator->FindShortestSeparator，其默认实现在 `util/comparator.cc`。

每个 DataBlock 索引记录的 value 是该块在文件内的偏移和 size，这是通过 pending_handle 来记录的。当通过 WriteRawBlock 将 DataBlock 写文件的时候，会更新 pending_handle 的偏移和大小。然后写索引的时候，用 EncodeTo 将偏移和 size 编码到字符串中，和前面的索引 key 一起插入到 IndexBlock 中。索引部分的核心代码如下：

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

接着处理 FilterBlock 过滤索引块，该块用来快速判断某个 key 是否存在于当前 SSTable 中。FilterBlock 是可选的，如果设置了 options.filter_policy，那么就会在 TableBuilder 中创建一个 FilterBlock。其核心代码如下：

```cpp
  if (r->filter_block != nullptr) {
    r->filter_block->AddKey(key);
  }
```

### Finish 写入文件



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

