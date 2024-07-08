---
title: LevelDB 源码阅读：学习利用编译器特性
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
---



## Clang 线程安全分析注解

在很多类的成员变量定义中，都有 `GUARDED_BY(mutex_)` 这样的注解，`GUARDED_BY` 宏定义的实现在 `port/thread_annotations.h`，用于在编译时**使用 Clang 编译器的线程安全分析工具**。这些宏提供了一种在代码中添加注释的方式，这些注释能够帮助 Clang 的线程安全分析工具检测潜在的线程安全问题。

比如 LRU Cache 的定义：

```cpp
class LRUCache {
 public:
 // ...

 private:
  // ...
  mutable port::Mutex mutex_;
  size_t usage_ GUARDED_BY(mutex_);
  // ...
  HandleTable table_ GUARDED_BY(mutex_);
};
```

编译的时候，Clang 会检查所有对 `usage_` 和 `table_` 的访问是否都在持有 `mutex_` 锁的情况下进行。另外，在函数或代码块结束时，编译器还会检查所有应该释放的锁是否都已经释放，可以防止遗漏锁释放导致的资源泄露或死锁。这种编译时检查有助于在编译期就发现潜在的线程安全问题，从而减少多线程环境下可能出现的竞态条件、死锁等问题。

可以参考 Clang 官方的文档 [Thread Safety Analysis](https://clang.llvm.org/docs/ThreadSafetyAnalysis.html) 了解更多细节。