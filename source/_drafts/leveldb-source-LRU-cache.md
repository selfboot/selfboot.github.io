---
title: LevelDB 源码阅读：LRU Cache 高性能缓存实现细节
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
date: 2025-01-03 21:00:00
---

LRU(Least Recently Used) 是一种经典的缓存淘汰策略，它的核心思想是：**当缓存满了的时候，淘汰掉最近最少使用的数据**。这里基于的一个经验假设就是“**如果数据最近被访问过，那么将来被访问的几率也更高**”。只要这个假设成立，那么 LRU 就可以显著提高缓存命中率。

在 LevelDB 中，假设每一次读取 DB 都从磁盘读取数据，那么效率会非常低。因此，LevelDB 实现了内存中的 LRU Cache，用于缓存热点数据，提高读写性能。默认情况下，LevelDB 会对 sstable 和 data block 进行缓存，其中 sstable 默认是支持缓存 990 (1000-10) 个，data block 则默认分配了 8MB 的缓存。

LevelDB 实现的 LRU 缓存是一个分片的 LRU，在细节上做了很多优化，非常值得学习。本文将从经典的 LRU 实现思路出发，然后一步步解析 LevelDB 中 [LRU Cache](https://github.com/google/leveldb/blob/main/util/cache.cc) 的实现细节。

<!-- more -->

## 经典的 LRU 实现思路

一个实现良好的 LRU 需要支持 O(1) 时间复杂度的插入、查找、删除操作。经典的实现思路是使用**一个双向链表和一个哈希表**，其中：

- **双向链表用于存储缓存中的数据项，并保持缓存项的使用顺序**。最近被访问的数据项被移动到链表的头部，而最久未被访问的数据项则逐渐移向链表的尾部。当缓存达到容量限制而需要淘汰数据时，链表尾部的数据项（即最少被访问的数据项）会被移除。
- **哈希表用于存储键与双向链表中相应节点的对应关系**，这样任何数据项都可以在常数时间内被快速访问和定位。哈希表的键是数据项的键，值则是指向双向链表中对应节点的指针。

**双向链表保证在常数时间内添加和删除节点，哈希表则提供常数时间的数据访问能力。**对于 Get 操作，通过哈希表快速定位到链表中的节点，如果存在则将其移动到链表头部，更新为最近使用。对于插入 Insert 操作，如果数据已存在，更新数据并移动到链表头部；如果数据不存在，则在链表头部插入新节点，并在哈希表中添加映射，如果超出容量则移除链表尾部节点，并从哈希表中删除相应的映射。

上面的实现思路相信每个学过算法的人都知道，Leetcode 上也有 LRU 实现的题目，比如 [146. LRU 缓存](https://leetcode.com/problems/lru-cache/)，需要实现的接口：

```c++
class LRUCache {
public:
    LRUCache(int capacity) {
    }
    int get(int key) {
    }
    void put(int key, int value) {    
    }
};
```

不过想实现一个工业界可用的高性能 LRU 缓存，还是有点难度的。接下来，我们来看看 LevelDB 是如何实现的。

## LevelDB Cache 接口：依赖倒置

在开始看 LevelDB 的 LRU Cache 实现之前，先看下 LevelDB 中如何使用这里的缓存。比如在 [db/table_cache.cc](https://github.com/google/leveldb/blob/main/db/table_cache.cc) 中，为了缓存 SST table 的元数据信息，TableCache 类定义了一个 Cache 类型的成员变量，然后通过该成员来对缓存进行各种操作。

```cpp
Cache* cache_(NewLRUCache(entries));

*handle = cache_->Lookup(key);
*handle = cache_->Insert(key, tf, 1, &DeleteEntry);
cache_->Release(handle);
cache_->Erase(Slice(buf, sizeof(buf)));
// ...
```

这里 Cache 是一个抽象类，定义了缓存操作的各种接口，具体定义在 [include/leveldb/cache.h](https://github.com/google/leveldb/blob/main/include/leveldb/cache.h) 中。它定义了缓存应该具有的基本操作，如 Insert、Lookup、Release、Erase 等。

这样的设计允许在**不修改缓存使用方的代码的情况下，轻松替换不同的缓存实现**。哈哈，这不就是八股文经常说的，**面向对象编程 SOLID 中的依赖倒置**嘛，应用层依赖于抽象接口(Cache)而不是具体实现(LRUCache)。这样可以降低代码耦合度，提高系统的可扩展性和可维护性。

使用的时候，通过这里的工厂函数来创建具体的缓存实现 [ShardedLRUCache](https://github.com/google/leveldb/blob/main/util/cache.cc#L339)：

```cpp
Cache* NewLRUCache(size_t capacity) { return new ShardedLRUCache(capacity); }

// 可以随时增加新的缓存实现
// Cache* NewClockCache(size_t capacity);
```

ShardedLRUCache 才是具体的缓存实现，它继承自 Cache 抽象类，并实现了 Cache 中的各种接口。ShardedLRUCache 本身并不复杂，它是在 LRUCache 的基础上，增加了分片机制，减少锁竞争来提高并发性能。

## LevelDB LRUCache 实现细节 

核心的缓存逻辑实现在 [LRUCache](https://github.com/google/leveldb/blob/main/util/cache.cc#L151) 类中。我们来看看它的实现细节吧。


LRUCache 是一个 LRU 缓存分片的实现，包含了缓存的核心逻辑，如插入、查找、删除等操作。这个类管理着两个主要的列表：一个是使用中的条目列表（**in_use_**），另一个是最近最少使用的条目列表（**lru_**）。当缓存容量达到上限时，可以根据缓存项在LRU列表中的位置（即它们被访问的历史）来决定哪些缓存项被淘汰。

in_use_ 到 lru_ 的转移：当缓存项的引用计数从2变为1（意味着没有外部引用，仅剩缓存自身的引用）时，它会从 in_use_ 列表中移动到 lru_ 列表中。此时，所有外部引用完成了对缓存项的使用，并调用了 Release 方法手动释放了所有权。
lru_ 到 in_use_ 的转移：当缓存项的引用计数从1变为2时，它会从 lru_ 列表中移动到 in_use_ 列表中。


创建一个新的缓存项（LRUHandle对象），尝试将其加入缓存中，如果加入后超出了缓存的容量上限，则移除最老的缓存项。



`lru_`是一个哑元（dummy node），用作 LRU 链表的头部，**其 next 成员指向 LRU 链表中的第一个实际缓存项**。`lru_.next != &lru_` 这个条件用于检查LRU链表是否为空。如果`lru_.next`等于`&lru_`，意味着LRU链表中没有任何缓存项，即链表只有哑元自身，链表为空。如果不等于，说明链表中至少有一个缓存项。

`哑元（dummy node）`在很多数据结构的实现中被用作简化边界条件处理的技巧。在LRU缓存的上下文中，哑元主要是用来作为链表的头部，这样链表的头部始终存在，即使链表为空时也是如此。这种方法可以简化插入和删除操作，因为在插入和删除操作时**不需要对空链表做特殊处理**。例如，当向链表中添加一个新的元素时，可以直接在哑元和当前的第一个元素之间插入它，而不需要检查链表是否为空。同样，当从链表中删除元素时，你不需要担心删除最后一个元素后如何更新链表头部的问题，因为哑元始终在那里。

在 LRUCache 的实现中，哑元是通过在 LRUCache 类内部声明一个 LRUHandle 类型的成员变量（比如`lru_`）来实现的。在LRUCache的构造函数中，这个哑元会被初始化，其next和prev指针都指向它自己：

```cpp
LRUCache::LRUCache() : capacity_(0), usage_(0) {
  // Make empty circular linked lists.
  lru_.next = &lru_;
  lru_.prev = &lru_;
  in_use_.next = &in_use_;
  in_use_.prev = &in_use_;
}
```

Ref 函数的目的是增加给定缓存项 e 的引用计数。当缓存项的引用计数从1变为2时，表示**除了缓存自身对该项的引用之外，现在还有另一个外部引用**（例如，客户端代码正在使用该缓存项）。此时，缓存项从“最近最少使用（LRU）”列表移动到“正在使用（in_use）”列表。



`FinishErase` 函数为了从缓存中彻底移除一个缓存项（LRUHandle对象）。当我们从缓存中移除缓存项时，会需要两个步骤：

1. 从哈希表中移除：确保了后续的缓存访问请求不会再找到这个缓存项。
2. 从LRU链表中移除，并处理相关资源，比如减少总的缓存使用量（usage_），以及减少引用计数（通过Unref方法）。



### ShardedLRUCache

前面 LRUCache 的实现中，所有的操作都是通过一个锁来保护的，所以性能瓶颈在于锁竞争。为了提高性能，ShardedLRUCache 将缓存分片，每个分片都有自己的锁，这样就可以减少锁竞争。

通过将缓存分成多个分片来减少锁的竞争，从而提高性能。它使用 Shard()函数根据键的哈希值来决定条目属于哪个分片。
