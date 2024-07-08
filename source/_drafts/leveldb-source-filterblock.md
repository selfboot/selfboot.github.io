title: LevelDB 源码阅读：布隆过滤器的实现
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
---

布隆过滤器（Bloom Filter）是一种空间效率高、查询效率快的数据结构，它可以用来判断一个元素是否存在于一个集合中。在 LevelDB 中，布隆过滤器被用于 SSTable 文件中的 Filter Block，用于快速检查一个键是否存在于某个数据块中。本文将详细介绍布隆过滤器的原理和实现。