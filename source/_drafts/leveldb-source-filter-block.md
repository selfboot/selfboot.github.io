---
title: LevelDB 源码阅读：SSTable 过滤块的组装和解析
tags: [C++, LevelDB]
category: 源码剖析
toc: true
date: 2025-07-20 21:00:00
description: 深入解析 LevelDB 中过滤块的组装和解析过程。过滤块是 LevelDB 中用于快速过滤 key 的一种数据结构，通过预先计算和存储过滤器，可以显著提高查找性能。文章详细介绍了过滤块的组装过程，包括 Bloom 过滤器和布隆过滤器的实现原理，以及如何在 sstable 文件中存储和读取过滤块。通过分析源码，展示了 LevelDB 如何通过这些配置选项来优化性能和资源消耗。
---

前面在 [LevelDB 源码阅读：一步步拆解 SSTable 文件的创建过程](https://selfboot.cn/2025/06/27/leveldb_source_table_build/) 中，我们介绍了 LevelDB 中 SSTable 文件的创建过程，其中为了能快速知道一个 key 是否在当前 SSTable 中，LevelDB 支持用户设置过滤块。

过滤块的作用就是快速判断一个 key 是否在 SSTable 中，从而避免顺序读整个 DataBlock 的 key。对于这种判定不存在的情况，业界比较常见的就是布隆过滤器。这里 SSTable 中的过滤块默认就是用布隆过滤器来实现的，这篇文章来看看如何用布隆过滤器来实现过滤块。

<!-- more -->

## 如何设计过滤块

在 SSTable 中，我们用 DataBlock 存储有序键值对，同时为了快速定位某个 key 在哪个 DataBlock 中，LevelDB 设计了索引块。索引块中存储了每个 DataBlock 的 key 的边界和 offset，这样我们就可以快速定位到某个 key 可能在哪个 DataBlock 中。

但是这里有个问题，索引块只能知道 key 如果存在的话，应该在哪个 DataBlock 中。为了确认 key 是否存在，只能顺序读 DataBlock 的内容。所以 LevelDB 引入了过滤块，用来快速判断某个 key 在不在 DataBlock 中，从而避免不必要的读操作，从而提高读取性能。

那么过滤块要怎么设计呢？首先我们知道过滤块底层默认用布隆过滤器来存储，所以必须考虑布隆过滤器的接口实现。这里创建一个布隆过滤器很简单，接口如下：

```cpp
void CreateFilter(const Slice* keys, int n, std::string* dst) const override {
```

先确定键的数量 n，并把所有键全部放到数组 keys 中，之后该方法就会依据 bits_per_key(默认是 10，用 10个 hash 位存储一个键)，将布隆过滤器数据编码写入到 dst 中。这里对布隆过滤器怎么实现感兴趣的话，可以参考我之前的文章[LevelDB 源码阅读：布隆过滤器原理、实现、测试与可视化](https://selfboot.cn/2024/08/08/leveldb_source_bloom_filter/)。

### SSTable 整体放到一个布隆过滤器

直观上来说，我们可以为整个 SSTable 中的所有 key 构建一个布隆过滤器。不过因为布隆过滤器需要预先知道键的个数来确定位数组大小，并且要把键放到数组中。所以为了整块构建，必须在流式写 SSTable 的时候，另外把所有 key 放到数组中暂存在内存中，并计算总的键数量，这样会导致内存占用变多。

另外假设 SSTable 

## 过滤块的组装

## 过滤块的解析