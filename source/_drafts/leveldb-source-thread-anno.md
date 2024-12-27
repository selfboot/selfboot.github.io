---
title: LevelDB 源码阅读：利用 Clang 的静态线程安全分析
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 本文介绍了 LevelDB 中使用 Clang 的静态线程安全分析工具，通过在代码中添加宏注释，来检测潜在的线程安全问题。
date: 2024-12-27
---

LevelDB 中有一些宏比较有意思，平时自己写代码的时候，还基本没用过。这些宏在 [thread_annotations.h](https://github.com/google/leveldb/blob/main/port/thread_annotations.h) 中定义，可以在编译时**使用 Clang 编译器的线程安全分析工具，来检测潜在的线程安全问题**。

![Clang 编译器的线程安全分析工具](https://slefboot-1251736664.file.myqcloud.com/20241227_leveldb_source_thread_anno_code.png)

<!-- more -->

比如下面这些宏，到底有什么作用呢？本文就一起来看看吧。

```cpp
GUARDED_BY(x)          // 表示变量必须在持有锁x时才能访问
PT_GUARDED_BY(x)       // 指针类型的 GUARDED_BY
ACQUIRED_AFTER(...)    // 指定锁的获取顺序，防止死锁
// ...
```

## GUARDED_BY 锁保护

在很多类的成员变量定义中，都有 `GUARDED_BY(mutex_)` 这样的注解，有什么作用呢？比如 LRU Cache 的定义：

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

其实这就是 Clang 的线程安全注解，编译的时候，Clang 会检查所有对 `usage_` 和 `table_` 的访问是否都在持有 `mutex_` 锁的情况下进行。另外，在函数或代码块结束时，编译器还会检查所有应该释放的锁是否都已经释放，可以防止遗漏锁释放导致的资源泄露或死锁。

反观我们平时在写业务代码的时候，几乎没用过这些线程安全注解。顶多注释下这里不是线程安全的，要加锁访问，全靠开发的自觉。可想而知，业务中肯定会遇见各种奇怪的多线程数据竞争问题。

通过这里的线程安全注解，**不仅可以明确告诉其他开发者这个变量需要锁保护，还可以在编译期就发现潜在的线程安全问题，从而减少多线程环境下可能出现的竞态条件、死锁等问题**。

### 线程注解示例

下面看一个完整的例子：

```cpp
#include <mutex>
#include <iostream>

class __attribute__((capability("mutex"))) Mutex {
public:
    void lock() { mutex_.lock(); }
    void unlock() { mutex_.unlock(); }
private:
    std::mutex mutex_;
};

class SharedData {
public:
    void Increment() {
        mutex_.lock();
        counter_++;
        mutex_.unlock();
    }

    int GetValue() {
        mutex_.lock();
        int value = counter_;
        mutex_.unlock();
        return value;
    }

    // Wrong case: Accessing shared variable without holding the lock
    void UnsafeIncrement() {
        counter_++;
    }

    void UnsafeGetValue() {
        std::cout << counter_ << std::endl;
    }

    void UnsafeIncrement2() {
        mutex_.lock();
        counter_++;
        // Forgot to unlock, will trigger warning
    }

private:
    Mutex mutex_;
    int counter_ __attribute__((guarded_by(mutex_)));
};

int main() {
    SharedData data;

    data.Increment();
    std::cout << "Value: " << data.GetValue() << std::endl;

    data.UnsafeIncrement();
    data.UnsafeGetValue();
    data.UnsafeIncrement2();

    return 0;
}
```

这里编译告警：

```shell
clang++ -pthread -Wthread-safety -std=c++17 guard.cpp -o guard
guard.cpp:16:9: warning: writing variable 'counter_' requires holding mutex 'mutex_' exclusively [-Wthread-safety-analysis]
        counter_++;
        ^
guard.cpp:22:21: warning: reading variable 'counter_' requires holding mutex 'mutex_' [-Wthread-safety-analysis]
        int value = counter_;
                    ^
guard.cpp:29:9: warning: writing variable 'counter_' requires holding mutex 'mutex_' exclusively [-Wthread-safety-analysis]
        counter_++;
        ^
guard.cpp:33:22: warning: reading variable 'counter_' requires holding mutex 'mutex_' [-Wthread-safety-analysis]
        std::cout << counter_ << std::endl;
                     ^
guard.cpp:38:9: warning: writing variable 'counter_' requires holding mutex 'mutex_' exclusively [-Wthread-safety-analysis]
        counter_++;
        ^
5 warnings generated.
```

## 总结

可以参考 Clang 官方的文档 [Thread Safety Analysis](https://clang.llvm.org/docs/ThreadSafetyAnalysis.html) 了解更多细节。
