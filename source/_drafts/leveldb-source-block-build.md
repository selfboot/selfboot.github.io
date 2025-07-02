---
title: LevelDB 源码阅读：SSTable 中 DataBlock 的构建工程优化
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
date: 2025-06-30 21:00:00
---

在 LevelDB 中，SSTable（Sorted Strings Table）是存储键值对数据的文件格式。SSTable 文件由多个数据块（Blocks）组成，这些**块是文件的基本单位**。每个数据块通常包含一系列的键值对，这些键值对按键排序。每个数据块使用一种可配置的压缩算法进行压缩，以减少存储空间和提高读取效率。

LevelDB 中主要有下面 3 个编译单元封装对块的处理操作：

1. **table/format.cc**: 定义了 LevelDB 中使用的所有**数据格式**，包括数据块、索引块、页脚等的具体布局和编码方式。它提供了序列化和反序列化这些结构的函数，是整个数据库中处理数据格式和保证数据一致性的基础。
2. **table/block.cc**: 负责处理数据块的**读取操作**。它使用 format.cc 中定义的数据格式来读取、解析存储在 SSTable 文件中的数据块。
3. **table/block_builder.cc**: 负责**构建新的数据块**。在写入操作中，block_builder.cc 根据 format.cc 的定义，将键值对编码到数据块中。

接下来分别看看具体是怎么做的。

<!-- more -->

