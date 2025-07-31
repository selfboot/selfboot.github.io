---
title: LevelDB 源码阅读：SSTable 过滤块的组装和解析
tags: [C++, LevelDB]
category: 源码剖析
toc: true
date: 2025-07-20 21:00:00
description: 深入解析 LevelDB 中过滤块的组装和解析过程。过滤块是 LevelDB 中用于快速过滤 key 的一种数据结构，通过预先计算和存储过滤器，可以显著提高查找性能。文章详细介绍了过滤块的组装过程，包括 Bloom 过滤器和布隆过滤器的实现原理，以及如何在 sstable 文件中存储和读取过滤块。通过分析源码，展示了 LevelDB 如何通过这些配置选项来优化性能和资源消耗。
---

前面在 [LevelDB 源码阅读：一步步拆解 SSTable 文件的创建过程](https://selfboot.cn/2025/06/27/leveldb_source_table_build/) 中，我们介绍了 LevelDB 中 SSTable 文件的创建过程，其中为了能快速知道一个 key 是否在当前 SSTable 中，LevelDB 支持用户设置过滤块。

LevelDB 实现了布隆过滤器，可以看我之前的文章[LevelDB 源码阅读：布隆过滤器原理、实现、测试与可视化](https://selfboot.cn/2024/08/08/leveldb_source_bloom_filter/)。我们这里过滤块默认就是用布隆过滤器来实现的，这篇文章来看看如何用布隆过滤器来实现过滤块。

<!-- more -->

## 如何设计过滤块

先来回顾下过滤块的作用。在 SSTable 中，我们有存储有序键值对的 DataBlock，同时为了快速定位某个 key 在哪个 DataBlock 中，LevelDB 设计了一个索引块。索引块中存储了每个 DataBlock 的 key 和 offset，这样我们就可以快速定位到某个 key 所在的 DataBlock。

但是这里有个问题，索引块只能知道 key 如果存的话，应该在哪个 DataBlock 中，但是不能知道 key 是否在。为了避免顺序读整个 DataBlock 的 key，LevelDB 支持了过滤块。过滤块的作用就是判断某个 key 在不在 DataBlock 中，这样这样就可以快速过滤掉不在 SSTable 中的 key，从而提高读取性能。

那么过滤块怎么设计呢？

## 过滤块的组装

## 过滤块的解析