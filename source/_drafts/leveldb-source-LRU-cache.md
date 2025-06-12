---
title: LevelDB 源码阅读：LRU Cache 高性能缓存实现细节
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
date: 2025-06-16 21:00:00
mathjax: true
---

计算机系统中，缓存无处不在。从 CPU 缓存到内存缓存，从磁盘缓存到网络缓存，缓存无处不在。缓存的核心思想就是空间换时间，通过将热点数据缓存到高性能的存储中，从而提高性能。因为缓存设备比较贵，所以存储大小有限，就需要淘汰掉一些缓存数据。这里淘汰的策略就非常重要了，因为如果淘汰的策略不合理，把接下来要访问的数据淘汰掉了，那么缓存命中率就会非常低。

缓存淘汰策略有很多种，比如 LRU、LFU、FIFO 等。其中 LRU(Least Recently Used) 就是一种很经典的缓存淘汰策略，它的核心思想是：**当缓存满了的时候，淘汰掉最近最少使用的数据**。这里基于的一个经验假设就是"**如果数据最近被访问过，那么将来被访问的几率也更高**"。只要这个假设成立，那么 LRU 就可以显著提高缓存命中率。

在 LevelDB 中，实现了内存中的 LRU Cache，用于缓存热点数据，提高读写性能。默认情况下，LevelDB 会对 sstable 的索引 和 data block 进行缓存，其中 sstable 默认是支持缓存 990 (1000-10) 个，data block 则默认分配了 8MB 的缓存。

LevelDB 实现的 LRU 缓存是一个分片的 LRU，在细节上做了很多优化，非常值得学习。本文将从经典的 LRU 实现思路出发，然后一步步解析 LevelDB 中 [LRU Cache](https://github.com/google/leveldb/blob/main/util/cache.cc) 的实现细节。

<!-- more -->

## 经典的 LRU 实现思路

一个实现良好的 LRU 需要支持 O(1) 时间复杂度的插入、查找、删除操作。经典的实现思路是使用**一个双向链表和一个哈希表**，其中：

- **双向链表用于存储缓存中的数据项，并保持缓存项的使用顺序**。最近被访问的数据项被移动到链表的头部，而最久未被访问的数据项则逐渐移向链表的尾部。当缓存达到容量限制而需要淘汰数据时，链表尾部的数据项（即最少被访问的数据项）会被移除。
- **哈希表用于存储键与双向链表中相应节点的对应关系**，这样任何数据项都可以在常数时间内被快速访问和定位。哈希表的键是数据项的键，值则是指向双向链表中对应节点的指针。

**双向链表保证在常数时间内添加和删除节点，哈希表则提供常数时间的数据访问能力**。对于 Get 操作，通过哈希表快速定位到链表中的节点，如果存在则将其移动到链表头部，更新为最近使用。对于插入 Insert 操作，如果数据已存在，更新数据并移动到链表头部；如果数据不存在，则在链表头部插入新节点，并在哈希表中添加映射，如果超出容量则移除链表尾部节点，并从哈希表中删除相应的映射。

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

## Cache 接口：依赖倒置

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

这样的设计允许调用方在**不修改使用缓存部分的代码的情况下，轻松替换不同的缓存实现**。哈哈，这不就是八股文经常说的，**面向对象编程 SOLID 中的依赖倒置**嘛，应用层依赖于抽象接口(Cache)而不是具体实现(LRUCache)。这样可以降低代码耦合度，提高系统的可扩展性和可维护性。

具体到使用的时候，通过这里的工厂函数来创建具体的缓存实现 [ShardedLRUCache](https://github.com/google/leveldb/blob/main/util/cache.cc#L339)：

```cpp
Cache* NewLRUCache(size_t capacity) { return new ShardedLRUCache(capacity); }

// 可以随时增加新的缓存实现
// Cache* NewClockCache(size_t capacity);
```

ShardedLRUCache 才是具体的缓存实现，它继承自 Cache 抽象类，并实现了 Cache 中的各种接口。ShardedLRUCache 本身并不复杂，它是在 LRUCache 的基础上，增加了分片机制，减少锁竞争来提高并发性能。LRUCache 才是缓存核心，不过在我们先不管怎么实现 LRUCache，首先要确定**缓存的数据项是什么**。

## LRUHandle 类的实现

在 LevelDB 中，缓存的数据项是一个 LRUHandle 类，定义在 [util/cache.cc](https://github.com/google/leveldb/blob/main/util/cache.cc#L43) 中。这里的注释也说明了，LRUHandle 是一个支持堆分配内存的变长结构体，它会被保存在一个双向链表中，按访问时间排序。我们来看看这个结构体的成员有哪些吧：

```cpp
struct LRUHandle {
  void* value;
  void (*deleter)(const Slice&, void* value);
  LRUHandle* next_hash;
  LRUHandle* next;
  LRUHandle* prev;
  size_t charge;  // TODO(opt): Only allow uint32_t?
  size_t key_length;
  bool in_cache;     // Whether entry is in the cache.
  uint32_t refs;     // References, including cache reference, if present.
  uint32_t hash;     // Hash of key(); used for fast sharding and comparisons
  char key_data[1];  // Beginning of key
}
```

这里还稍微有点复杂，每个字段都还挺重要的，我们一个个来看吧。

- value：存储缓存的实际 value 值，这里是一个 void* 的指针，说明缓存这层不关心具体值的结构，只用知道对象的地址就好；
- deleter：一个函数指针，指向用于删除缓存值的回调函数，当缓存项被移除时，用它来释放缓存值的内存空间；
- next_hash：LRU 缓存实现需要用到哈希表。这里 LevelDB 自己实现了一个高性能的哈希表，在 [LevelDB 源码阅读：如何设计一个高性能哈希表](/2024/12/25/leveldb_source_hashtable/) 中，我们介绍了 LevelDB 中哈希表的实现细节，里面有介绍过 LRUHandle 的 next_hash 字段就是用来解决哈希表的冲突的。
- prev/next：双向链表的前一个/下一个指针，用来维持双向链表，方便快速从双向链表中插入或者删除节点；
- charge：表示该缓存项占用的成本（通常是内存大小），用于计算总缓存使用量，判断是否需要淘汰；
- key_length：键的长度，用于构造 Slice 对象表示键；
- in_cache：标记该项是否在缓存中，如果为 true，表示缓存拥有对该项的引用；
- refs：引用计数，包括缓存本身的引用（如果在缓存中）和使用方的引用，当计数为0时，可以释放该项；
- hash：键的哈希值，用于快速查找和分片；这里同一个 key 也把 hash 值保存下来，避免重复计算；
- key_data：柔性数组成员，存储键的实际数据，使用 malloc 分配足够空间来存储整个键。柔性数组我们在 [LevelDB 源码阅读：理解其中的 C++ 高级技巧](/2024/08/13/leveldb_source_unstand_c++/) 中也有介绍过，这里就不展开了。

这里 LRUHandle 的设计允许缓存高效地管理数据项，跟踪缓存项的引用，并实现 LRU 淘汰策略。特别是 in_cache 和 refs 字段的结合使用，使得我们可以区分"**被缓存但未被客户端引用**"和"**被客户端引用**"的项，从而用两个链表来支持高效淘汰缓存。

下面我们详细看看 LRUCache 类的实现细节，就更容易理解上面各个字段的用途了。

## LRUCache 类的实现细节 

前面看完了缓存的数据项的设计，接着可以来看看这里 LevelDB LRUCache 的具体实现细节了。核心的缓存逻辑实现在 [util/cache.cc](https://github.com/google/leveldb/blob/main/util/cache.cc#L151) 的 LRUCache 类中。该类包含了缓存的核心逻辑，如插入、查找、删除、淘汰等操作。

这里注释(LevelDB 的注释感觉都值得好好品读)中提到，用了两个双向链表来维护缓存项，这又是为什么呢？

```cpp
// The cache keeps two linked lists of items in the cache.  All items in the
// cache are in one list or the other, and never both.  Items still referenced
// by clients but erased from the cache are in neither list.  The lists are:
// - in-use:  contains the items currently referenced by clients, in no
//   particular order.  (This list is used for invariant checking.  If we
//   removed the check, elements that would otherwise be on this list could be
//   left as disconnected singleton lists.)
// - LRU:  contains the items not currently referenced by clients, in LRU order
// Elements are moved between these lists by the Ref() and Unref() methods,
// when they detect an element in the cache acquiring or losing its only
// external reference.
```

### 为什么用两个双向链表？

我们前面也提到，一般的 LRU Cache 实现中用一个双向链表。每次使用一个缓存项时，会将其移动到链表的头部，这样链表的尾部就是最近最少使用的缓存项。淘汰的时候，直接移除链表尾部的节点即可。比如开始提到的 Leetcode 中的题目就可以这样实现来解决，实现中每个缓存项就是一个 int，取的时候直接复制出来就好。**如果要缓存的项是简单的值类型，读的时候直接复制值，不需要引用，那单链表的实现足够了**。

但在 LevelDB 中，缓存的数据项是 LRUHandle 对象，它是一个动态分配内存的变长结构体。在使用的时候，为了高并发和性能考虑，不能通过简单的值复制，而要通过引用计数来管理缓存项。如果还是简单的使用单链表的话，我们考虑下这样的场景。

我们依次访问 A, C, D 项，最后访问了 B, B 项被客户端引用(refs=1)，位于链表头部，如下图中的开始状态。一段时间内，A、C、D都被访问了，但 B 没有被访问。根据 LRU 规则，A、C、D被移到链表头部。**B 虽然仍被引用，但因为长时间未被访问，相对位置逐渐后移**。A 和 D 被访问后，很快使用完，这时候没有引用了。当需要淘汰时，从尾部开始，会发现B项(refs=1)不能淘汰，需要跳过继续往前遍历检查其他项。

![LRUCache 中节点双向链表的状态](https://slefboot-1251736664.file.myqcloud.com/20250611_leveldb_source_lru_cache.webp)

也就是说在这种引用场景下，淘汰节点的时候，如果链表尾部的节点正在被外部引用（refs > 1），则不能淘汰它。这时候需要**遍历链表寻找可淘汰的节点，效率较低**。在最坏情况下，如果所有节点都被引用，可能需要遍历整个链表却无法淘汰任何节点。

为了解决这个问题，在 LRUCache 实现中，用了两个双向链表。一个是**in_use_**，用来存储被引用的缓存项。另一个是**lru_**，用来存储未被引用的缓存项。每个缓存项只能在其中的一个链表中，不能同时在两个链表中。但是可以根据当前是否被引用，在两个链表中互相移动。这样在需要淘汰节点的时候，就可以直接从 lru_ 链表中淘汰，而不用遍历 in_use_ 链表。

### 实现细节

当缓存项的引用计数从2变为1（意味着没有外部引用，仅剩缓存自身的引用）时，它会从 in_use_ 列表中移动到 lru_ 列表中。此时，所有外部引用完成了对缓存项的使用，并调用了 Release 方法手动释放了所有权。
当缓存容量达到上限时，可以根据缓存项在LRU列表中的位置（即它们被访问的历史）来决定哪些缓存项被淘汰。

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

Ref 函数的目的是增加给定缓存项 e 的引用计数。当缓存项的引用计数从1变为2时，表示**除了缓存自身对该项的引用之外，现在还有另一个外部引用**（例如，客户端代码正在使用该缓存项）。此时，缓存项从"最近最少使用（LRU）"列表移动到"正在使用（in_use）"列表。



`FinishErase` 函数为了从缓存中彻底移除一个缓存项（LRUHandle对象）。当我们从缓存中移除缓存项时，会需要两个步骤：

1. 从哈希表中移除：确保了后续的缓存访问请求不会再找到这个缓存项。
2. 从LRU链表中移除，并处理相关资源，比如减少总的缓存使用量（usage_），以及减少引用计数（通过Unref方法）。

## ShardedLRUCache 分片实现

前面 LRUCache 的实现中，插入缓存、查找缓存、删除缓存操作都必须通过一个互斥锁来保护。在多线程环境下，如果只有一个大的缓存，**这个锁就会成为一个全局瓶颈**。当多个线程同时访问缓存时，只有一个线程能获得锁，其他线程都必须等待，这会严重影响并发性能。

为了提高性能，ShardedLRUCache 将缓存分成多个分片（shard_ 数组），每个分片都有自己独立的锁。当一个请求到来时，它会根据 key 的哈希值被路由到特定的分片。这样，不同线程访问不同分片时就可以并行进行，因为它们获取的是不同的锁，从而减少了锁的竞争，提高了整体的吞吐量。

那么需要分多少片呢？LevelDB 这里硬编码了一个 $ kNumShards = 1 << kNumShardBits $，计算出来是 16，算是一个经验选择吧。如果分片数量太少，比如2、4个，在核心数很多的服务器上，锁竞争依然可能很激烈。分片太多的话，每个分片的容量就会很小。这可能导致一个"热"分片频繁淘汰数据，而另一个"冷"分片有很多空闲空间的情况，从而降低了整个缓存的命中率。

选择 16 的话，对于典型的 8 核或 16 核服务器，已经能提供足够好的并发度，同时又不会带来过大的额外开销。同时选择 2 的幂次方，还能通过位运算 $ hash >> (32 - kNumShardBits)$ 快速计算分片索引。

加入分片后，包装了下原始的 LRUCache 类，构造的时候需要指定分片数，每个分片容量等，[实现](https://github.com/google/leveldb/blob/main/util/cache.cc#L352)如下：

```cpp
 public:
  explicit ShardedLRUCache(size_t capacity) : last_id_(0) {
    const size_t per_shard = (capacity + (kNumShards - 1)) / kNumShards;
    for (int s = 0; s < kNumShards; s++) {
      shard_[s].SetCapacity(per_shard);
    }
  }
```

然后其他相关缓存操作，比如插入、查找、删除等，都是通过 Shard 函数来决定操作哪个分片。这里以插入为例，[实现](https://github.com/google/leveldb/blob/main/util/cache.cc#L359)如下：

```cpp
  Handle* Insert(const Slice& key, void* value, size_t charge,
                 void (*deleter)(const Slice& key, void* value)) override {
    const uint32_t hash = HashSlice(key);
    return shard_[Shard(hash)].Insert(key, hash, value, charge, deleter);
  }
```

求 Hash 和计算分片的 Shard 函数没什么难点，这里就忽略了。这里也提下，ShardLRUCache 这里还要继承 Cache 抽象类，实现 Cache 中的各种接口。这样才能被其他调用 Cache 接口的地方使用。

最后这里还有一个小细节，也值得说下，那就是 Cache 接口还有个 NewId 函数。在其他的 LRU 缓存实现中，没见过有支持 Cache 生成一个 Id。**LevelDB 为啥这么做呢？**

### Cache 的 Id 生成

LevelDB 其实提供了注释，但是只看注释似乎也不好明白，我们结合使用场景来分析下。

```cpp
  // Return a new numeric id.  May be used by multiple clients who are
  // sharing the same cache to partition the key space.  Typically the
  // client will allocate a new id at startup and prepend the id to
  // its cache keys.
  virtual uint64_t NewId() = 0;
```

这里补充些背景，我们在打开 LevelDB 数据库时，可以创建一个 Cache 对象，并传入 options.block_cache，用来缓存 SSTTable 文件中的数据块和过滤块。当然如果不传的话，LevelDB 默认也会创建一个 8 MB 的 SharedLRUCache 对象。这里 **Cache 对象是全局共享的，数据库中所有的 Table 对象都会使用这同一个 BlockCache 实例来缓存它们的数据块**。

在 [table/table.cc](https://github.com/google/leveldb/blob/main/table/table.cc#L72) 的 Table::Open 中，我们看到每次打开 SSTTable 文件的时候，就会用 NewId 生成一个 cache_id。这里底层用互斥锁保证，每次生成的 Id 是全局递增的。后面我们要读取 SSTTable 文件中偏移量为 offset 的数据块 block 时，会用 `<cache_id, offset>` 作为缓存的 key 来进行读写。这样不同 SSTTable 文件的 cache_id 不同，即使他们的 offset 一样，这里缓存 key 也不同，不会冲突。

说白了，SharedLRUCache 提供全局递增的 Id 主要是用来区分不同 SSTTable 文件，免得每个文件还要自己维护一个唯一 Id 来做缓存的 key。

## 总结

