---
title: LevelDB 源码阅读：设计一个高性能哈希表
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
date: 2024-12-18 21:00:00
---

哈希表(HashTable) 是一个经典的数据结构，只要写点过代码，应该都有用过哈希表。每种语言都有自己的哈希表实现，基本都是开箱即用。以至于虽然用过哈希表的人很多，但自己动手写过哈希表的人估计没多少吧。

要设计一个高性能的哈希表，其实还是有不少细节需要考虑的。比如如何处理哈希冲突，如何处理哈希表扩容等。LevelDB 在实现 LRU Cache 的时候，顺便实现了一个[简单高效的哈希表](https://github.com/google/leveldb/blob/main/util/cache.cc#L70)，麻雀虽小，五脏俱全，值得借鉴下。

本文以 LevelDB 的哈希表实现为例，分析下如何设计一个高性能的哈希表。

<!-- more -->

## LevelDB 为啥要实现自己的哈希表


## LevelDB 哈希表实现思想

## 补充些 C++ 基础

## 