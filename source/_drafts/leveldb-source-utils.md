---
title: LevelDB 源码阅读：utils 组件代码
tags:
  - C++
category: 源码剖析
toc: true
date: 
mathjax: true
description:
---

LevelDB 中实现了不少 utils 工具，比如定制的内存分配器 Arena，随机数生成 Random 类，实现都会考虑到具体的使用场景，做了优化以及取舍，值得好好学习。本篇文章详细聊聊其中下面实现：

- 内存管理 Arena，一个简单高效，适合 LevelDB 的内存分配管理器；
- 随机数 Random，一个不错的线性同余伪随机生成算法，用位运算替代取模优化了执行效率。

<!-- more -->
## 内存管理 Arena 类

LevelDB 没有使用系统默认的 malloc 来分配内存，也没有使用比如 tcmalloc 这些第三方库来管理内存的分配和释放，而是自己实现了一个简单的内存分配器。这里的内存分配器可以说是**量身订制**，主要是因为下面特点：

1. 主要在 memtable 中使用，会有大量的分配，可能有很多小内存分配；
2. 统一回收时机，在 memtable 数据落磁盘后，会一并回收；

内存 memtable 的数据其实存储在 skiplist 中的。每次插入 key，就需要往 skiplist 中插入节点，这里节点使用的内存就是用 arena 来分配的。如果是小 key，这里会优先从当前 block 中剩余内存中拿，不够的话才会走到分配逻辑。Allocate 的代码如下：

```c++
inline char* Arena::Allocate(size_t bytes) {
  assert(bytes > 0);
  if (bytes <= alloc_bytes_remaining_) {
    char* result = alloc_ptr_;
    alloc_ptr_ += bytes;
    alloc_bytes_remaining_ -= bytes;
    return result;
  }
  return AllocateFallback(bytes);
}
```

通过系统调用分配内存的逻辑在 `AllocateFallback` 中，如果需要的内存大于 `kBlockSize / 4`，则按照实际需要分配。否则的话，就直接分配一个 block 的内存，然后更新使用情况。这里没有用完的内存余量，可以在下次分配内存的时候使用。如果不够下次需要的量，则重新走系统调用来分配。

```c++
char* Arena::AllocateFallback(size_t bytes) {
  if (bytes > kBlockSize / 4) {
    // Object is more than a quarter of our block size.  Allocate it separately
    // to avoid wasting too much space in leftover bytes.
    char* result = AllocateNewBlock(bytes);
    return result;
  }

  // We waste the remaining space in the current block.
  alloc_ptr_ = AllocateNewBlock(kBlockSize);
  alloc_bytes_remaining_ = kBlockSize;

  char* result = alloc_ptr_;
  alloc_ptr_ += bytes;
  alloc_bytes_remaining_ -= bytes;
  return result;
}
```

这种方法可能会导致一些**内存浪费**，比如第一次使用 496 byte，实际会分配 4096 byte，剩余 3600 byte。然后下一次使用超过 3600 byte 的话，就会重新申请新的内存，上次分配剩余的 3600 byte 就会被浪费掉。虽然浪费了一定的内存使用率，不过整体代码比较简单，分配效率也比较高。这部分被浪费掉的内存，在 memtable 落磁盘后也会被重新回收掉。

顺便再提一下这里最后的内存回收，每次调用 `new []` 分配内存后，会把首地址放到 vector 中，然后在 Arena 类析构的时候，遍历拿出所有的内存块，统一进行释放。

```c++
char* Arena::AllocateNewBlock(size_t block_bytes) {
  char* result = new char[block_bytes];
  blocks_.push_back(result);
  memory_usage_.fetch_add(block_bytes + sizeof(char*),
                          std::memory_order_relaxed);
  return result;
}
Arena::~Arena() {
  for (size_t i = 0; i < blocks_.size(); i++) {
    delete[] blocks_[i];
  }
}
```

此外这个类还提供了一个原子计数器 `memory_usage_`，统计这个类目前占用的内存大小。

## 随机数 Random 类

LevelDB 的 `util/random.h` 中实现了一个[伪随机数生成器(PRNG)](https://en.wikipedia.org/wiki/Pseudorandom_number_generator)类 Random，用在**跳表生成层高**等场景。这个随机数生成器是基于线性同余生成器（LCG）实现，随机数的生成公式如下：

```shell
seed_ = (seed_ * A) % M
```

根据同余理论，只要 A 和 M 被适当选取，那么上述递推公式将能生成一个周期为 M 的伪随机数序列，且这个序列中不会有重复的数(除了最初的值)。这里模数 M 的值`2^31-1`是一个常见的选择，因为它是一个**梅森素数（Mersenne prime）**，有利于生成具有良好周期性的随机序列。

构造函数接收一个 32 位无符号整数作为种子（seed_），并确保种子落在有效范围内（非 0 且不等于 2147483647L，即 2^31 - 1）。这是因为种子的值直接影响随机数生成过程，而这两个特定的值（0 和 2^31 - 1）在计算过程中会导致生成的序列失去随机性。

```c++
  explicit Random(uint32_t s) : seed_(s & 0x7fffffffu) {
    // Avoid bad seeds.
    if (seed_ == 0 || seed_ == 2147483647L) {
      seed_ = 1;
    }
  }
```

生成随机数的代码很精简，如下（忽略原有注释）：

```c++
  uint32_t Next() {
    static const uint32_t M = 2147483647L;  // 2^31-1
    static const uint64_t A = 16807;        // bits 14, 8, 7, 5, 2, 1, 0
    uint64_t product = seed_ * A;
    seed_ = static_cast<uint32_t>((product >> 31) + (product & M));
    if (seed_ > M) {
      seed_ -= M;
    }
    return seed_;
  }
```

首先是 `product = seed_ * A`，这里乘积 product 可能会超出 32 位的范围，为了**防止溢出**使用 uint64_t 来保持这个中间结果。整数的加减乘除一定要考虑溢出场景，很多软件都有因为溢出导致的漏洞。然后这里 product%M 模运算**用了位操作和加法来代替**，以提高计算效率。

这里主要是基于**模运算的分配律**：$ (a + b) \mod m = ((a \mod m) + (b \mod m)) \mod m $，将 product 分为 `product >> 31 + product & M`，因为 M = 2^31 - 1，这里的与运算取 product 的低31位。

除了基本的随机数生成，Random 类还提供了生成特定范围内随机数的 `Uniform()` 方法，以及概率性返回真或假的 `OneIn()` 方法和生成偏向小数的 `Skewed()` 方法，这些都是在特定场景下非常有用的工具函数。

Skewed 的实现比较有意思，首先从 [0, max_log] 范围内均匀选择一个基数 base，接着用 `Uniform(1 << base)` 返回 [0, 2^base - 1] 范围内的一个随机数。这里基数 base 的选择概率是均匀的，这意味着选择一个较小的 base（从而生成较小的随机数）与选择一个较大的 base（从而生成较大的随机数）的概率是相同的。然而，由于 base 的值越小，能生成的随机数的范围就越小，这自然导致了**函数倾向于生成较小的数值**。

```c++
  // Skewed: pick "base" uniformly from range [0,max_log] and then
  // return "base" random bits.  The effect is to pick a number in the
  // range [0,2^max_log-1] with exponential bias towards smaller numbers.
  uint32_t Skewed(int max_log) { return Uniform(1 << Uniform(max_log + 1)); }
```
