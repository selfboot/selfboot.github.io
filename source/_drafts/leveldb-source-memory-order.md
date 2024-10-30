---
title: LevelDB 源码阅读：C++ 原子类型与内存序
tags:
  - C++
  - LevelDB
category: 源码剖析
toc: true
mathjax: true
---

在 LevelDB 源码中，有不少需要处理并发的地方，会用到 C++11 的 `std::atomic` 原子类型，还会用到 `std::memory_order_relaxed` 等内存序原语。比如 [LevelDB 源码阅读：跳表的原理、实现以及可视化](https://selfboot.cn/2024/09/09/leveldb_source_skiplist/#Node-内存屏障) 中提到的 Node 内存屏障等。

C++11 就引入了 std::atomic 原子类型，还定义了6种内存序([memory order](https://en.cppreference.com/w/cpp/atomic/memory_order))，用于控制原子操作的同步行为：

- memory_order_relaxed: 最宽松的内存序，只保证当前操作原子性。
- memory_order_consume: 确保后续依赖于当前读取的操作不会被重排到当前读取之前。
- memory_order_acquire: 确保当前读取操作之后的所有读写操作不会被重排到当前操作之前。
- memory_order_release: 确保当前写入操作之前的所有读写操作不会被重排到当前操作之后。
- memory_order_acq_rel: 结合了acquire和release语义。
- memory_order_seq_cst: 最严格的内存序，提供全局的顺序一致性。

只这样描述还是有点抽象，官方文档读起来也不是那么好懂。如果能结合一些实际的代码来理解会好很多，不过这里涉及编译器或者 CPU 指令重排，很难稳定复现一些内存序问题。本文接下来会尽量通过一些技巧，用实际代码示例，方便大家理解并发情况下不同同步原语的差异。

<!-- more -->

## 先理解原子操作


这里用了 atomic 原子类型，保证了读写这个值的操作是原子的，不会被其他线程打断。如果不用原子操作，会出现下面这种竞争情况：

时间轴   | 线程1                 |线程2                  | max_height
--------|----------------------|----------------------|----------
   t1   |读取 max_height (5)    |                      |    5
   t2   |                      |读取 max_height (5)    |    5
   t3   |计算新height (7)       |                      |    5
   t4   |                      |计算新height (6)       |    5
   t5   |更新 max_height (7)    |                      |    7
   t6   |                      | 更新 max_height (6)   |    6
   t7   |                      |                      |    6 (错误)

这里丢失了最大高度 7 的信息，导致了错误的结果。所以这里最大高度一定要原子操作，保证线程安全。**其实更理想的情况下，最大高度更新和插入节点后各层指针的更新应该放到一起，作为一个原子操作，不被其他线程打断**。但是 LevelDB 这里并没有加锁来保证高度更新和插入节点的原子性，为了性能最优化，只是用了最宽松的 std::memory_order_relaxed 语义。

下面来分析下这样做会不会有线程同步问题。我们知道，**编译器和处理器可能会对指令进行重排，只要这种重排不违反单个线程的执行逻辑就好**。上面 Insert 操作中，设置新高度和后面的更新节点指针顺序可能会被打乱。导致出现下面的情况：


## 复现指令重排

有什么办法能稳定复现编译器或者 CPU 指令重排导致问题吗？


[Memory Model and Synchronization Primitive - Part 1: Memory Barrier](https://www.alibabacloud.com/blog/597460)

[Memory Model and Synchronization Primitive - Part 2: Memory Model](https://www.alibabacloud.com/blog/memory-model-and-synchronization-primitive---part-2-memory-model_597461)