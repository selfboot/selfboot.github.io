---
title: LevelDB 源码阅读：利用 Clang 的静态线程安全分析
tags:
  - C++
  - LevelDB
category: 源码剖析
toc: true
description: 本文介绍 LevelDB 中使用 Clang 的静态线程安全分析工具，通过在代码中添加宏注解，支持在编译期检测潜在的线程安全问题。
date: 2025-01-02 22:00:00
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

LevelDB 实现的时候，加了很多类似的线程安全注解，**不仅可以明确告诉其他开发者这个变量需要锁保护，还可以在编译期就发现潜在的线程安全问题，从而减少多线程环境下可能出现的竞态条件、死锁等问题**。

### 锁保护线程注解示例

下面通过一个完整的例子来看看 Clang 的线程安全注解作用。这里 SharedData 类中，`counter_` 变量需要锁保护，`mutex_` 是我们封装的一个锁实现。

```cpp
// guard.cpp
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

    // Wrong case: Accessing shared variable without holding the lock
    void UnsafeIncrement() {
        counter_++;
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
    data.UnsafeIncrement();
    data.UnsafeIncrement2();
    return 0;
}
```

当然这里的测试代码为了直接能运行，就没有依赖 LevelDB 中的宏定义 GUARDED_BY。下面的 `__attribute__((guarded_by(mutex_)))` 和宏展开的结果是一样的。

用 Clang 编译上面的代码，就能看到告警信息：

```shell
$ clang++ -pthread -Wthread-safety -std=c++17 guard.cpp -o guard
guard.cpp:16:9: warning: writing variable 'counter_' requires holding mutex 'mutex_' exclusively [-Wthread-safety-analysis]
        counter_++;
        ^
guard.cpp:22:9: warning: writing variable 'counter_' requires holding mutex 'mutex_' exclusively [-Wthread-safety-analysis]
        counter_++;
        ^
guard.cpp:27:9: warning: writing variable 'counter_' requires holding mutex 'mutex_' exclusively [-Wthread-safety-analysis]
        counter_++;
        ^
3 warnings generated
```

可以看到，编译器在编译的时候，就发现了 `counter_` 变量在未持有 `mutex_` 锁的情况下被访问，从而告警。

### PT_GUARDED_BY 指针保护

这里 GUARDED_BY 通常用在对象的非指针成员上，用来保护成员变量自身。而 **PT_GUARDED_BY 则是用在指针和智能指针成员上，用来保护指针指向的数据**。注意这里 PT_GUARDED_BY **只保护指针指向的数据，指针本身并没有约束的**。可以看下面的例子：

```cpp
Mutex mu;
int *p1             GUARDED_BY(mu);
int *p2             PT_GUARDED_BY(mu);
unique_ptr<int> p3  PT_GUARDED_BY(mu);

void test() {
  p1 = 0;             // Warning!

  *p2 = 42;           // Warning!
  p2 = new int;       // OK.

  *p3 = 42;           // Warning!
  p3.reset(new int);  // OK.
}
```

## capability 属性注解

上面的例子中，我们没有直接用标准库的 mutex 互斥锁，而是简单封装了一个 `Mutex` 类。在类定义那里，用了 `__attribute__((capability("mutex")))` 注解。

这是因为 Clang 的线程安全分析需要**知道哪些类型是锁，需要去追踪锁的获取和释放状态**。而标准库的类型没有这些注解，不能直接用于 Clang 的线程安全分析。这里用到了 clang 的 `capability("mutex")` 属性，用来指定该类具有锁的特性。

LevelDB 中定义锁的代码也用到了注解，不过稍微不同，用的是 `LOCKABLE`，代码如下：

```cpp
class LOCKABLE Mutex {
 public:
  Mutex() = default;
  ~Mutex() = default;

  Mutex(const Mutex&) = delete;
  Mutex& operator=(const Mutex&) = delete;
  ...
```

这是因为早期版本的 Clang 使用 lockable 属性，后来引入了更通用的 capability 属性。为了向后兼容，lockable 被保留为 capability("mutex") 的别名。所以，这两者是等效的。

## 线程安全分析的能力

上面例子有点简单，其实从本质上来看，这里 clang 静态线程安全分析想做的事情，**就是在编译器提供一种保护资源的能力**。这里资源可以是数据成员，比如前面的 `counter_`，也可以是提供对某些底层资源访问的函数/方法。clang 可以在编译期确保，除非某个线程有访问资源的能力，否则它无法访问资源。

这里线程安全分析**使用属性来声明这里的资源约束**，属性可以附加到类、方法和数据成员前面。Clang 官方也提供了一系列属性定义宏，可以直接拿来用。LevelDB 中定义了自己的宏，也可以参考。

前面给的例子中，注解主要用在数据成员上，其实也可以用在函数上。比如 LevelDB 中定义的锁对象 Mutex，在成员函数上用到了这些注解：

```cpp
class LOCKABLE Mutex {
  // ...
  void Lock() EXCLUSIVE_LOCK_FUNCTION() { mu_.lock(); }
  void Unlock() UNLOCK_FUNCTION() { mu_.unlock(); }
  void AssertHeld() ASSERT_EXCLUSIVE_LOCK() {}
  // ...
};
```

这些注解主要用于标记锁对象的成员函数，告诉编译器这些函数会如何改变锁的状态：

- **EXCLUSIVE_LOCK_FUNCTION**: 表示函数会获取互斥锁的独占访问权，调用前锁必须是未持有状态，调用后锁会被当前线程独占；
- **UNLOCK_FUNCTION**: 表示函数会释放锁，调用前锁必须是被持有状态（可以是独占或共享），调用后锁会被释放；
- **ASSERT_EXCLUSIVE_LOCK**: 用于断言当前线程持有锁的独占权，通常用在调试代码中，确保代码运行在正确的加锁状态下。

当然这些是 clang 早期的线程安全注解，主要为了锁来命名。上面这几个现在可以用 [ACQUIRE(…), ACQUIRE_SHARED(…), RELEASE(…), RELEASE_SHARED(…)](https://clang.llvm.org/docs/ThreadSafetyAnalysis.html#acquire-acquire-shared-release-release-shared-release-generic) 来替代。

此外，还有其他一些注解，可以参考 Clang 官方的文档 [Thread Safety Analysis](https://clang.llvm.org/docs/ThreadSafetyAnalysis.html) 了解更多细节。
