---
title: LevelDB 源码阅读：跳表的原理、实现、测试以及可视化
tags: [C++]
category: 源码剖析
toc: true
date: 2024-08-17 21:00:00
description: 
---

在 LevelDB 中，内存 MemTable 中的数据存储在 SkipList(跳表) 中，用来进行快速插入操作。跳表是William Pugh 在论文 [Skip Lists: A Probabilistic Alternative to Balanced Trees](https://15721.courses.cs.cmu.edu/spring2018/papers/08-oltpindexes1/pugh-skiplists-cacm1990.pdf) 中提出的一种概率性数据结构。有点类似**有序链表**，但是可以有多层，通过空间换时间，允许快速的查询、插入和删除操作，平均时间复杂度为 `O(log n)`。和一些平衡树比起来，代码实现也比较简单，性能稳定，因此应用比较广泛。

![跳表实现的启发思路](https://slefboot-1251736664.file.myqcloud.com/20240321_leveldb_source_skiplist.png)

那么跳表的原理是什么？ LevelDB 中跳表又是怎么实现的呢？本文将从跳表的原理、实现、测试等方面来深入探讨。最后还提供了一个可视化页面，可以直观看到跳表的构建过程。

<!-- more -->

## 跳表简单介绍

为了存储有序的抽象数据类型，最简单的方法

## LevelDB 中实现


## Insert 插入节点

LevelDB 中 skiplist 的实现代码很简练，这里以 Inert 插入函数为例，来分析其中的代码。插入节点的核心逻辑如下：

1. 首先定义一个类型为 `Node*`的数组 prev，长度为跳表最大层高 `kMaxHeight=12`。这个数组**存储要插入的新节点每一层的前驱节点**，在跳表中插入新节点时，可以通过这个 pre 数组找到新节点在每一层插入的位置。这里是通过 `FindGreaterOrEqual` 来填充 prev 数组，这个函数会从高到低层地遍历，找到大于等于当前插入 key 的位置。
2. 通过随机算法，来**决定新节点的层高**。这里 LevelDB 初始层高为 1，然后每层以 **1/4** 的概率决定增加层高。如果新节点的高度超过了当前跳表的最大高度，需要更新最大高度，并将超出的部分的 prev 设置为头节点，因为新的层级是从头节点开始的。
3. 创建一个新的节点，并插入在链表中。具体做法也很简单，遍历新节点的每一层，**使用 NoBarrier_SetNext 方法来设置新节点的下一节点，接着更新 prev 节点的下一节点为新节点，实现了新节点的插入**。NoBarrier_SetNext 说明在这个上下文中，不需要额外的**内存屏障来保证内存操作的可见性**。

完整代码很简练如下，省掉了部份注释。

```cpp
template <typename Key, class Comparator>
void SkipList<Key, Comparator>::Insert(const Key& key) {
  Node* prev[kMaxHeight];           // 1
  Node* x = FindGreaterOrEqual(key, prev);

  // Our data structure does not allow duplicate insertion
  assert(x == nullptr || !Equal(key, x->key));

  int height = RandomHeight();      // 2
  if (height > GetMaxHeight()) {
    for (int i = GetMaxHeight(); i < height; i++) {
      prev[i] = head_;
    }
    max_height_.store(height, std::memory_order_relaxed);
  }

  x = NewNode(key, height);         // 3
  for (int i = 0; i < height; i++) {
    x->NoBarrier_SetNext(i, prev[i]->NoBarrier_Next(i));
    prev[i]->SetNext(i, x);
  }
}
```

### 查找插入位置

这个函数可以查找并返回大于等于 key 的节点 n，查找过程中会填充 prev 数组，保留节点 n 每一层的**前驱节点**。

首先初始化当前节点 x 为头节点 head_。在跳表中，头节点通常是一个哑元节点，其值小于跳表中所有其他节点的值。然后从**最高层开始往右、往下进行搜索**，跳表的层级从 0 开始，所以最高层是 `GetMaxHeight() - 1`。接下来是一个循环搜索过程，直到最下一层才结束。每一轮都是在当前层级 level 上，首先获取节点 x 的下一个节点 next，然后进行比较。

1. 如果 key 位于 next 之后，则继续在当前层级上向右搜索。
2. 如果 key 比 next 节点的值小（或者 next 节点是尽头 nullptr），则 x 就是当前层的前驱节点。如果 prev 非空（即调用者需要记录搜索路径），则在 prev 数组的 level 记录当前节点 x。
   - 如果当前 level 是最底层，则返回 next 节点即可；
   - level 是中间层，还要继续向下找(level--)；

完整的代码如下：

```cpp
template <typename Key, class Comparator>
typename SkipList<Key, Comparator>::Node*
SkipList<Key, Comparator>::FindGreaterOrEqual(const Key& key,
                                              Node** prev) const {
  Node* x = head_;
  int level = GetMaxHeight() - 1;
  while (true) {
    Node* next = x->Next(level);
    if (KeyIsAfterNode(key, next)) {
      // Keep searching in this list
      x = next;
    } else {
      if (prev != nullptr) prev[level] = x;
      if (level == 0) {
        return next;
      } else {
        // Switch to next list
        level--;
      }
    }
  }
}
```

## 跳表在线可视化

为了直观看看跳表构建的过程，我用 Claude3.5 做了一个[跳表可视化页面](https://gallery.selfboot.cn/en/algorithms/skiplist)。可以指定跳表的最大层高，以及调整递增层高的概率，然后可以随机初始化跳表，或者插入、删除、查找节点，观察跳表结构的变化。 

![跳表在线可视化](https://slefboot-1251736664.file.myqcloud.com/20240815_leveldb_source_skiplist_visualization.png)

在最高 12 层，递增概率为 1/4 的情况下，可以看到跳表平均层高还是挺低的。这里也可以调整概率为 1/2，看看跳表的变化。

## 总结

跳表是一种概率性数据结构，可以用来替代平衡树，实现了快速的插入、删除和查找操作。LevelDB 中的跳表实现代码简洁，性能稳定，适合用来存储内存 MemTable 中的数据。本文从跳表的原理、实现、测试等方面来深入探讨，最后还提供了一个可视化页面，可以直观看到跳表的构建过程。