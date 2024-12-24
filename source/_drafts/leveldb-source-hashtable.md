---
title: LevelDB 源码阅读：设计一个高性能哈希表
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
date: 2024-12-18 21:00:00
---

哈希表(HashTable) 是一个经典的数据结构，只要写点过代码，应该都有用过哈希表。每种语言都有自己的哈希表实现，基本都是开箱即用。以至于虽然用过哈希表的人很多，但自己动手写过哈希表的人估计没多少吧。

要设计一个高性能的哈希表，其实还是有不少细节需要考虑的。比如如何处理哈希冲突，如何处理哈希表扩容等。一些成熟的哈希表实现，比如 C++ 标准库中的哈希表，[代码量](https://github.com/gcc-mirror/gcc/blob/master/libstdc%2B%2B-v3/include/tr1/hashtable.h)比较大，也比较难理解。

好在 LevelDB 在实现 LRU Cache 的时候，顺便实现了一个[简单高效的哈希表](https://github.com/google/leveldb/blob/main/util/cache.cc#L70)，整体代码写的很精简，麻雀虽小五脏俱全，非常值得学习。本文以 LevelDB 的哈希表实现为例，分析下如何设计一个高性能的哈希表。

<!-- more -->

## LevelDB 实现哈希表的原因

C++ 标准库已经有了哈希表实现，为什么 LevelDB 还要实现一个自己的哈希表呢？官方是这样说的：

> We provide our own simple hash table since it removes a whole bunch
> of porting hacks and is also faster than some of the built-in hash
> table implementations in some of the compiler/runtime combinations
> we have tested.  E.g., readrandom speeds up by ~5% over the g++
> 4.4.3's builtin hashtable.

这里简单总结就是，其他实现有些冗杂，这里自己实现不依赖第三方库，代码精简的同时，也能保证实现的性能。

## LevelDB 哈希表实现原理

这里 HashTable 实现的思想其实和 C++ 标准库中的哈希表实现差不多，用数组来存储哈希桶。**插入、查找、删除操作的平均时间复杂度都是 O(1)，首先根据 key 的 hash 值定位到具体某个哈希桶，然后在冲突链表上执行相应的操作**。同时，如果插入的时候发现哈希表的负载因子过高，则进行扩容。

这里补充一点，因为 LevelDB 的哈希表是用来实现 LRU Cache 的，所以这里哈希表的元素类型是 `LRUHandle`，除了有 key 和 value 两个字段外，还有一个 next_hash 指针，用链地址法来处理哈希冲突。另外，这里也存储了 hash 值，一般是调用方生成后保存下来。这样在后续的查找、插入和删除操作中，可以直接使用这个 hash 值来定位到具体的哈希桶。LRUHandle 的其他字段主要是在 LRU Cache 中使用，这里就不展开了。
 
### FindPointer 查找位置

接着我们先看看查找指定 key 的操作，LevelDB 封装了一个基础的 `FindPointer()` 方法，返回了一个指向 key 的二级指针。[具体实现](https://github.com/google/leveldb/blob/main/util/cache.cc#L115)如下：

```cpp
  // Return a pointer to slot that points to a cache entry that
  // matches key/hash.  If there is no such cache entry, return a
  // pointer to the trailing slot in the corresponding linked list.
  LRUHandle** FindPointer(const Slice& key, uint32_t hash) {
    LRUHandle** ptr = &list_[hash & (length_ - 1)];
    while (*ptr != nullptr && ((*ptr)->hash != hash || key != (*ptr)->key())) {
      ptr = &(*ptr)->next_hash;
    }
    return ptr;
  }
```

这里根据 key 的 hash 值定位到具体的哈希桶，如果桶为空，则直接返回指向桶头指针 nullptr 的地址。如果桶不为空，**则用经典的链地址法处理哈希冲突**。遍历哈希桶上的冲突链表，如果找到对应的 key，则返回指向该节点的二级指针。如果遍历完链表都没有找到，则返回链表的尾指针地址。

这里比较巧妙的是**返回了一个二级指针，这样就能在查找、插入和删除操作中都复用该方法**。在查找时，直接解引用返回的指针就能获得目标节点。在插入时，通过这个指针可以既能检查是否存在相同key的节点，又能直接在正确的位置插入新节点。在删除时，可以直接通过修改这个指针指向的值来完成节点的移除，而不需要额外记录前驱节点。

### Remove 删除节点

查找节点就是直接调前面的 `FindPointer` 方法，然后解引用即可，这里不再赘述。我们来看看删除 key 的 [Remove 方法](https://github.com/google/leveldb/blob/main/util/cache.cc#L95)，代码如下：

```cpp
  LRUHandle* Remove(const Slice& key, uint32_t hash) {
    LRUHandle** ptr = FindPointer(key, hash);
    LRUHandle* result = *ptr;
    if (result != nullptr) {
      *ptr = result->next_hash;
      --elems_;
    }
    return result;
  }
```

很简单吧！为了在一个链表中删除指定节点，这里先用 FindPointer 找到指向链表节点指针的地址，然后**将要删除节点的下一个节点地址(result->next_hash)赋值给原指针位置**，就完成了删除操作。本方法返回了被删除的节点指针，方便调用者进行后续处理（如内存释放等）。这里的实现方式，**不需要额外记录前驱节点，操作简单高效，也能够正确处理链表头节点的删除情况**。

这里的删除方法可以优雅下面的所有情况：

| 情况 | 描述 | 初始状态 | 删除后状态 |
|------|------|----------|------------|
| 1 | 删除链表第一个节点 A | list_[i] --> [A] --> [B] --> [C] --> nullptr | list_[i] --> [B] --> [C] --> nullptr |
| 2 | 删除链表中间节点 B | list_[i] --> [A] --> [B] --> [C] --> nullptr | list_[i] --> [A] --> [C] --> nullptr |
| 3 | 删除链表最后节点 C | list_[i] --> [A] --> [B] --> [C] --> nullptr | list_[i] --> [A] --> [B] --> nullptr |
| 4 | 删除链表唯一节点 A | list_[i] --> [A] --> nullptr | list_[i] --> nullptr |
| 5 | 要删除的key不存在 | list_[i] --> [A] --> [B] --> nullptr | list_[i] --> [A] --> [B] --> nullptr |
| 6 | hash桶为空 | list_[i] --> nullptr | list_[i] --> nullptr |

### Insert 插入节点

插入节点的方法 [Insert](https://github.com/google/leveldb/blob/main/util/cache.cc#L79) 和删除节点有点类似，也是先找到插入位置，然后进行插入操作。

```cpp
  LRUHandle* Insert(LRUHandle* h) {
    LRUHandle** ptr = FindPointer(h->key(), h->hash);
    LRUHandle* old = *ptr;
    h->next_hash = (old == nullptr ? nullptr : old->next_hash);
    *ptr = h;
    // ...
    return old;
  }
```

这里第 4 行，用二级指针一次性处理了下面所有情况，文章后面会再详细介绍这里的二级指针。

| 情况 | 描述 | 初始状态 | 插入后状态 | 返回值 |
|------|------|----------|------------|--------|
| 1 | 插入到空桶 | list_[i] --> nullptr | list_[i] --> [H] --> nullptr | nullptr |
| 2 | 插入时key已存在(第一个节点) | list_[i] --> [A] --> [B] --> nullptr | list_[i] --> [H] --> [B] --> nullptr | A |
| 3 | 插入时key已存在(中间节点) | list_[i] --> [A] --> [B] --> [C] --> nullptr | list_[i] --> [A] --> [H] --> [C] --> nullptr | B |
| 4 | 插入时key已存在(最后节点) | list_[i] --> [A] --> [B] --> nullptr | list_[i] --> [A] --> [H] --> nullptr | B |
| 5 | 插入新key(非空桶) | list_[i] --> [A] --> [B] --> nullptr | list_[i] --> [A] --> [B] --> [H] --> nullptr | nullptr |

这里插入后，还会根据 old 判断是否是新增节点，如果是新增节点，则更新哈希表的元素数量，并且要判断是否需要动态扩容，接下来看看这里扩容逻辑。

## 高负载因子动态扩容

对于某个固定桶数量的哈希表，**随着插入元素的变多，哈希冲突的概率会变大**。极端情况下，可能每个 key 都有很长的冲突链表，导致 hashtable 的查找和删除性能退化。为了**衡量这里哈希冲突的严重程度**，我们可以定义**负载因子 = 哈希表的元素数量 / 哈希桶数量**，一旦这个值超过某个阈值，则需要进行扩容。

前面 Insert 方法在插入元素的时候，会统计当前 hashtable 的元素数量。一旦负载因子超过阈值 1，则调用 `Resize()` 进行扩容。

```cpp
if (old == nullptr) {
    ++elems_;
    if (elems_ > length_) {
    // Since each cache entry is fairly large, we aim for a small
    // average linked list length (<= 1).
    Resize();
    }
}
```

这里**扩容第一个要解决的问题就是决定新的哈希桶数量**。LevelDB 的实现如下：

```cpp
void Resize() {
    uint32_t new_length = 4;
    while (new_length < elems_) {
      new_length *= 2;
    }
    //...
}
```

其实在标准库的 vector 扩容时候，也是选择按照 2 的整数倍进行扩容。这里**扩容系数如果选择的太大，可能浪费比较多空间，选择倍数太小，可能导致频繁扩容**。工程实践中，一般会选择 2 作为扩容倍数。

决定好新的桶大小后，就先创建这个更大容量的哈希桶，然后**遍历所有旧的哈希桶，对于每个桶，还要遍历冲突链表上的每个 key，然后将每个 key 插入到新的链表上**。核心的实现如下：

```cpp
void Resize() {
    // ...
    LRUHandle** new_list = new LRUHandle*[new_length];
    memset(new_list, 0, sizeof(new_list[0]) * new_length);
    uint32_t count = 0;
    for (uint32_t i = 0; i < length_; i++) {
      LRUHandle* h = list_[i];
      while (h != nullptr) {
        LRUHandle* next = h->next_hash;
        // 头插法插入到新哈希表
        h = next;
        count++;
      }
    }
    assert(elems_ == count);
    delete[] list_;
    list_ = new_list;
    length_ = new_length;
}
```

这里在 Resize 的时候，每次成功一个 key 到新的哈希表中，都会更新哈希表的元素数量。之后会用 assert 断言来检查扩容后，哈希表的元素数量是否正确。所有 key 都插入到新哈希表后，就可以回收旧哈希表的内存，然后替换 list_ 为新哈希表，并更新哈希表容量。

前面省略了关键的插入部分逻辑，这里**在 while 循环中会遍历旧哈希表冲突链表中的每个 key，然后用头插法插入到新哈希表中**，下面看看头插法的详细实现。

## 头插法优化链表插入

这里前面 Resize 省略的头插法的核心代码如下：

```cpp
 void Resize() {
    // ...
    for (uint32_t i = 0; i < length_; i++) {
      LRUHandle* h = list_[i];
      while (h != nullptr) {
        // ... 
        uint32_t hash = h->hash;
        LRUHandle** ptr = &new_list[hash & (new_length - 1)];
        h->next_hash = *ptr;
        *ptr = h;
        // ...
      }
    }
    // ...
  }
};
```

头插法的核心思想是：**将新节点插入到链表的头部**。假设原始链表中如下：

```
list_[i] --> [A] --> [B] --> [C] --> nullptr
```

**重哈希过程会依次处理 A、B、C 三个节点，将其插入到新哈希表中**。如果在新的哈希表中，A、B 个节点依旧在同一个桶中，则重哈希后的链表状态如下：

```
new_list[hash_a] --> [B] --> [A] --> nullptr
new_list[hash_c] --> [C] -->nullptr
```

这里 A 和 B 在同一个桶中，在新的链表中，A 和 B 的顺序反过来了。相比传统的遍历到链表尾部进行插入，**头插法的实现比较简单，不需要遍历到链表尾部，操作时间复杂度是O(1)**。并且使用头插法也不需要维护尾指针，**空间效率更高**。此外，**头插法还有缓存局部性，最近插入的节点在链表头部，对于某些访问模式下查找效率更高**。   

## C++ 二级指针详解

