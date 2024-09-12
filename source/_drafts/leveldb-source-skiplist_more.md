---
title: LevelDB 源码阅读：跳表的测试以及性能分析
tags: [C++]
category: 源码剖析
toc: true
date: 2024-09-15 21:00:00
mathjax: true
description: 
---

在上篇 [LevelDB 源码阅读：跳表的原理、实现以及可视化](https://selfboot.cn/2024/09/09/leveldb_source_skiplist/)中，从当前二叉搜索树和平衡树的一些缺点出发，引出了跳表这种数据结构。然后结合论文，解释了跳表的实现原理。接着详细分析了 LevelDB 的代码实现，包括迭代器实现，以及**并发读的极致性能优化**。最后还提供了一个可视化页面，可以直观看到跳表的构建过程。

但是还有两个问题：

1. 怎么测试 LevelDB 跳表的代码，保证功能的正确性？特别是怎么保证并发读情况下跳表实现的正确性。
2. 怎么定量分析跳表的时间复杂度？

接下来通过分析 LevelDB 的测试代码，结合 LevelDB 论文的推导，来解答这两个疑问。
<!-- more -->

## 跳表测试分析

上篇文章分析了 LevelDB 跳表的实现，那么这里的实现是否正确呢？如果要写测试用例，应该怎么写？需要从哪些方面来测试跳表的正确性？下面一起看看 LevelDB 的测试代码 [skiplist_test.cc](https://github.com/google/leveldb/blob/main/db/skiplist_test.cc)。

首先是**空跳表的测试**，验证空跳表不包含任何元素，检查空跳表的迭代器操作 SeekToFirst, Seek, SeekToLast 等。接着是插入、查找、迭代器的测试用例，通过不断插入大量随机生成的键值对，验证跳表是否正确包含这些键，以及测试迭代器的前向和后向遍历。

```cpp
TEST(SkipTest, InsertAndLookup) {
  // 测试插入和查找功能
  // 插入随机生成的键值对
  // 验证跳表正确包含这些键
  // 测试迭代器的前向和后向遍历
}  
```

这些都是比较常规的测试用例，这里不展开了。我们重点来看看 LevelDB 的**并发测试**。

### 并发 Key 设计

LevelDB 的跳表支持单线程写，多线程并发读，在上篇详细分析过这里的并发读实现细节，那么要如何测试呢？先定义测试目标，多个线程并发读的时候，**每个读线程初始化迭代器后，应该要能读到当前跳表的所有元素**。因为有写线程在同时运行，所以读线程可能**也会读到后续新插入的元素**。读线程在任何时刻，**读到的元素都应该满足跳表的性质**，即前一个元素小于等于后一个元素。

LevelDB 的测试方法设计的还是比较巧妙的。首先是一个**精心设计的元素值 Key**，注释部分写的很清晰：

```cpp
// We generate multi-part keys:
//     <key,gen,hash>
// where:
//     key is in range [0..K-1]
//     gen is a generation number for key
//     hash is hash(key,gen)
//
// The insertion code picks a random key, sets gen to be 1 + the last
// generation number inserted for that key, and sets hash to Hash(key,gen).
//
``` 

跳表元素值由三部分组成，key 是随机生成，gen 是插入的递增序号，hash 是 key 和 gen 的 hash 值。三部分都放在一个 uint64_t 的整数中，高 24 位是 key，中间 32 位是 gen，低 8 位是 hash。下面是根据 Key 提取三个部分，以及从 key 和 gen 生成 Key 的代码：

```cpp
typedef uint64_t Key;

class ConcurrentTest {
 private:
  static constexpr uint32_t K = 4;

  static uint64_t key(Key key) { return (key >> 40); }
  static uint64_t gen(Key key) { return (key >> 8) & 0xffffffffu; }
  static uint64_t hash(Key key) { return key & 0xff; }
  // ...
  static Key MakeKey(uint64_t k, uint64_t g) {
    static_assert(sizeof(Key) == sizeof(uint64_t), "");
    assert(k <= K);  // We sometimes pass K to seek to the end of the skiplist
    assert(g <= 0xffffffffu);
    return ((k << 40) | (g << 8) | (HashNumbers(k, g) & 0xff));
  }
```

这样设计的好处不少，插入的时候保证 gen 递增，那么读线程就可以用 gen 来验证跳表中元素插入的顺序。每个 Key 的低 8 位是 hash，可以用来验证从跳表中读出来的元素和插入的元素是否一致，如下 IsValidKey 方法：

```cpp
  static uint64_t HashNumbers(uint64_t k, uint64_t g) {
    uint64_t data[2] = {k, g};
    return Hash(reinterpret_cast<char*>(data), sizeof(data), 0);
  }
  static bool IsValidKey(Key k) {
    return hash(k) == (HashNumbers(key(k), gen(k)) & 0xff);
  }
```

这里取出 Key 的低 8 位，和从 key 和 gen 生成的 hash 值对比，如果相等，则说明元素是有效的。上面实现都放在 [ConcurrentTest 类](https://github.com/google/leveldb/blob/main/db/skiplist_test.cc#L152)，这个类作为辅助类，定义了系列 Key 相关的方法，以及读写跳表部分。

### 写线程操作

接下来看测试代码中，写线程的操作 WriteStep 是 ConcurrentTest 类的 public 成员方法，核心代码如下:

```cpp
  // REQUIRES: External synchronization
  void WriteStep(Random* rnd) {
    const uint32_t k = rnd->Next() % K;
    const intptr_t g = current_.Get(k) + 1;
    const Key key = MakeKey(k, g);
    list_.Insert(key);
    current_.Set(k, g);
  }
```

这里随机生成一个 key，然后拿到上次该 key 对应的 gen 值，递增生成新的 gen 值，调用 Insert 方法往跳表插入新的元素。新的元素用前面的 MakeKey 方法，根据 key 和 gen 生成。之后更新 key 对应的 gen 值，这样就保证了每个 key 下插入的元素 gen 是递增的。这里 key 的取值在 0 到 K-1 之间，K 这里取 4 <TODO： 为啥这么小> 

这里的 current_ 是一个 State 结构体，保存了每个 key 对应的 gen 值，代码如下：

```cpp
  struct State {
    std::atomic<int> generation[K];
    void Set(int k, int v) {
      generation[k].store(v, std::memory_order_release);
    }
    int Get(int k) { return generation[k].load(std::memory_order_acquire); }

    State() {
      for (int k = 0; k < K; k++) {
        Set(k, 0);
      }
    }
  };
```

State 结构体中有一个 atomic 数组 generation，保存了每个 key 对应的 gen 值。这里用 atomic 原子类型和 memory_order_release, memory_order_acquire 语义来保证，写线程一旦更新了 key 的 gen 值，读线程立马就能读到新的值。关于 atomic 内存屏障语义的理解，可以参考上篇跳表实现中 Node 类的设计。

### 读线程操作

上面写线程比较简单，不断往跳表插入新的元素即可。读线程相对复杂了很多，**除了从跳表中读取元素，还需要验证整个跳表数据是符合预期的**。


### 单线程读写测试

### 并发读测试

## 并发测试正确性

上面并发测试比较详细，但是这里值得再多说一点。对于这种并发下的代码，特别是涉及内存屏障相关的代码，有时候**测试通过可能只是因为没触发问题而已**(出现问题的概率很低，可能和编译器，cpu 型号也有关)。比如这里我把 Insert 操作稍微改下：

```cpp
  for (int i = 0; i < height; i++) {
    // NoBarrier_SetNext() suffices since we will add a barrier when
    // we publish a pointer to "x" in prev[i].
    x->NoBarrier_SetNext(i, prev[i]->NoBarrier_Next(i));
    prev[i]->NoBarrier_SetNext(i, x); // Change here, Use NoBarrier_SetNext
  }
```

这里两个指针都用 NoBarrier_SetNext 方法来设置，然后重新编译 LevelDB 库和测试程序，运行多次，都是能通过测试用例的。

## 跳表性能分析

通过上面的原理、实现和可视化工具，我们可以推测出来，在极端情况下，可能每个节点的高度都是 1，那么跳表的查找、插入、删除操作的时间复杂度都会退化到 O(n)。在这种情况下，性能比平衡树差了不少。当然，因为有随机性在里面，所以**没有输入序列能始终导致性能最差**。

跳表的平均性能如何呢？前面给出过结论，和平衡树的平均性能差不多。引入一个简单的随机高度，就能保证跳表的平均性能和平衡树差不多。这背后有没有什么分析方法，能够分析跳表的性能呢？还得看论文，论文中给出了一个不错的分析方法，这里可以一起看看。

## 总结

看到这里，大家应该能彻底理解 LevelDB 的跳表实现了吧。