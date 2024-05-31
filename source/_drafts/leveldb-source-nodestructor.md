---
title: LevelDB 源码阅读：禁止对象被析构
tags: [C++, LevalDB]
category: 源码剖析
toc: true
description: 
---

LevelDB 源码中有一个获取 Comparator 的函数，第一次看到的时候觉得有点奇怪，看起来像是构造了一个单例，但又略复杂。完整代码如下：

```c++
// util/comparator.cc
const Comparator* BytewiseComparator() {
  static NoDestructor<BytewiseComparatorImpl> singleton;
  return singleton.get();
}
```

这里的 `NoDestructor` 是一个模板类，看名字是用于**禁止对象析构**。为什么要禁止对象析构，又是如何做到禁止析构呢？这篇文章来深入探讨下这个问题。

<!-- more -->

## NoDestructor 模板类

我们先来看看 `NoDestructor` 模板类，它用于**包装一个实例，使得其析构函数不会被调用**。这个模板类用了比较多的高级特性，如模板编程、完美转发、静态断言、对齐要求、以及原地构造（placement new）等，接下来一一解释。这里先给出完整的代码实现：

```c++
// util/no_destructor.h
// Wraps an instance whose destructor is never called.
// This is intended for use with function-level static variables.
template <typename InstanceType>
class NoDestructor {
 public:
  template <typename... ConstructorArgTypes>
  explicit NoDestructor(ConstructorArgTypes&&... constructor_args) {
    static_assert(sizeof(instance_storage_) >= sizeof(InstanceType),
                  "instance_storage_ is not large enough to hold the instance");
    static_assert(
        alignof(decltype(instance_storage_)) >= alignof(InstanceType),
        "instance_storage_ does not meet the instance's alignment requirement");
    new (&instance_storage_)
        InstanceType(std::forward<ConstructorArgTypes>(constructor_args)...);
  }

  ~NoDestructor() = default;

  NoDestructor(const NoDestructor&) = delete;
  NoDestructor& operator=(const NoDestructor&) = delete;

  InstanceType* get() {
    return reinterpret_cast<InstanceType*>(&instance_storage_);
  }

 private:
  typename std::aligned_storage<sizeof(InstanceType),
                                alignof(InstanceType)>::type instance_storage_;
};
```

先来看构造函数部分。`typename... ConstructorArgTypes` 表示这是一个变参模板函数，可以接受任意数量和类型的参数。这使得 NoDestructor 类可以用于任何类型的 InstanceType，不管其构造函数需要多少个参数或是什么类型的参数。关于变参模板，也可以看看我之前写的一篇文章：[C++ 函数可变参实现方法的演进](https://selfboot.cn/2024/05/07/variadic_arguments_in_c++/)。

构造函数的参数 `ConstructorArgTypes&&... constructor_args` 是一个万能引用（universal reference）参数包，结合 std::forward 使用，可以实现参数的完美转发。

构造函数开始是两个**静态断言（static_assert），用于检查 instance_storage_ 是否足够大以及是否满足对齐要求**。第一个 static_assert 确保为 InstanceType 分配的存储空间 instance_storage_ 至少要和 InstanceType 实例本身一样大，这是为了**确保有足够的空间来存放该类型的对象**。第二个 static_assert 确保 instance_storage_ 的对齐方式满足 InstanceType 的对齐要求。对象只所以有内存对齐要求，和性能有关，这里不再展开。

接着开始构造对象，这里使用了 **C++ 的原地构造语法（placement new）**。`&instance_storage_` 提供了一个地址，告诉编译器在这个已经分配好的内存地址上构造 InstanceType 的对象。这样做避免了额外的内存分配，直接在预留的内存块中构造对象。接下来使用完美转发，`std::forward<ConstructorArgTypes>(constructor_args)...` 确保所有的构造函数参数都以正确的类型（保持左值或右值属性）传递给 InstanceType 的构造函数。这是现代 C++ 中参数传递的最佳实践，能够减少不必要的拷贝或移动操作，提高效率。

前面 placement new 原地构造的时候用的内存地址由成员变量 instance_storage_ 提供，instance_storage_ 的类型由 [std::aligned_storage](https://en.cppreference.com/w/cpp/types/aligned_storage) 模板定义。这是一个特别设计的类型，**用于提供一个可以安全地存储任何类型的原始内存块，同时确保所存储的对象类型（这里是 InstanceType）具有适当的大小和对齐要求**。这里 std::aligned_storage 创建的原始内存区域和 NoDestructor 对象所在的内存区域一致，也就是说如果 NoDestructor 被定义为一个函数内的局部变量，那么它和其内的 instance_storage_ 都会位于栈上。如果 NoDestructor 被定义为静态或全局变量，它和 instance_storage_ 将位于静态存储区，静态存储区的对象具有整个程序执行期间的生命周期。

值得注意的是 C++23 标准里，将废弃 std::aligned_storage，具体可以参考 [Why is std::aligned_storage to be deprecated in C++23 and what to use instead?](https://stackoverflow.com/questions/71828288/why-is-stdaligned-storage-to-be-deprecated-in-c23-and-what-to-use-instead)。

回到文章开始的例子，singleton 对象是一个静态局部变量，第一次调用 BytewiseComparator() 时被初始化，它的生命周期和程序的整个生命周期一样长。程序退出的时候，**singleton 对象本身会被析构销毁掉**，但是 NoDestructor 没有在其析构函数中添加任何逻辑来析构 instance_storage_ 中构造的对象，因此 instance_storage_ 中的 BytewiseComparatorImpl 对象永远不会被析构。

```c++
const Comparator* BytewiseComparator() {
  static NoDestructor<BytewiseComparatorImpl> singleton;
  return singleton.get();
}
```

LevelDB 中还提供了一个测试用例，用来验证这里的 NoDestructor 是否符合预期。

## 测试用例

在 `util/no_destructor_test.cc` 中首先定义了一个结构体 `DoNotDestruct`，这个结构体在析构函数中调用了 std::abort()。如果程序运行或者最后退出的时候，调用了 DoNotDestruct 对象的析构函数，那么测试程序将会异常终止。

```c++
struct DoNotDestruct {
 public:
  DoNotDestruct(uint32_t a, uint64_t b) : a(a), b(b) {}
  ~DoNotDestruct() { std::abort(); }

  // Used to check constructor argument forwarding.
  uint32_t a;
  uint64_t b;
};
```

接着定义了 2 个测试用例，一个定义了栈上的 NoDestructor 对象，另一个定义了一个静态的 NoDestructor 对象。这两个测试用例分别验证 NoDestructor 对象在栈上和静态存储区上的行为。

```c++
TEST(NoDestructorTest, StackInstance) {
  NoDestructor<DoNotDestruct> instance(kGoldenA, kGoldenB);
  ASSERT_EQ(kGoldenA, instance.get()->a);
  ASSERT_EQ(kGoldenB, instance.get()->b);
}

TEST(NoDestructorTest, StaticInstance) {
  static NoDestructor<DoNotDestruct> instance(kGoldenA, kGoldenB);
  ASSERT_EQ(kGoldenA, instance.get()->a);
  ASSERT_EQ(kGoldenB, instance.get()->b);
}
```

如果 NoDestructor 的实现有问题，无法保证传入对象的析构不被执行，那么测试程序将会异常终止掉。我们跑下这两个测试用例，结果如下：

![测试用例通过，析构函数没有被调用](https://slefboot-1251736664.file.myqcloud.com/20240531_leveldb_source_nodestructor_testcase.png)

这里我们可以增加个测试用例，验证下如果直接定义 DoNotDestruct 对象的话，测试进程会不会异常终止。可以先定义一个栈上的对象来测试，放在其他 2 个测试用例前面，如下：

```c++
TEST(NoDestructorTest, Instance) {
  DoNotDestruct instance(kGoldenA, kGoldenB);
  ASSERT_EQ(kGoldenA, instance.a);
  ASSERT_EQ(kGoldenB, instance.b);
}
```

运行结果如下，这个测试用例执行过程中会异常终止，说明 DoNotDestruct 对象的析构函数被调用了。

![测试进程异常终止，说明调用了析构](https://slefboot-1251736664.file.myqcloud.com/20240531_leveldb_source_nodestructor_testcase_2.png)

其实这里可以再改下，用 static 直接定义这里的 instance 对象，然后编译重新运行测试用例，就会发现 3 个测试用例都通过了，不过最后测试进程还是 abort 掉，这是因为进程退出的时候，才会析构静态对象，这时 DoNotDestruct 对象的析构函数被调用了。

## 为什么不能析构？

上面的例子中，我们看到了 NoDestructor 模板类的实现，它的作用是禁止静态局部的单例对象析构。那么为什么要禁止对象析构呢？简单来说，**C++ 标准没有规定不同编译单元中静态局部变量的析构顺序**，如果静态变量之间存在依赖关系，而它们的析构顺序错误，可能会导致程序访问已经析构的对象，从而产生未定义行为，可能导致程序崩溃。

举一个例子，假设有两个类，一个是日志系统，另一个是某种服务，服务在析构时需要向日志系统记录信息。日志类的代码如下：

```c++
// logger.h
#include <iostream>
#include <string>
#include <cassert> // Include assert

class Logger {
public:
    bool isAlive; // Flag to check if the object has been destructed

    static Logger& getInstance() {
        static Logger instance; // 静态局部变量
        return instance;
    }

    Logger() : isAlive(true) {} // Constructor initializes isAlive to true

    ~Logger() {
        std::cout << "Logger destroyed." << std::endl;
        isAlive = false; // Mark as destructed
    }

    void log(const std::string& message) {
        assert(isAlive); // Assert the object is not destructed
        std::cout << "Log: " << message << std::endl;
    }
};
```

注意这个类的 isAlive 成员变量，在构造函数中初始化为 true，析构函数中置为 false。在 log 函数中，会先检查 isAlive 是否为 true，如果为 false，就会触发断言失败。接着是服务类的代码，这里作为示例，只让它在析构的时候用日志类的静态局部变量记录一条日志。

```c++
// Service.h
#include <string>

class Service {
public:
    ~Service() {
        Logger::getInstance().log("Service destroyed."); // 在析构时记录日志
    }
};
```

在 main 函数中，使用全局变量 globalService 和 globalLogger，其中 globalService 是一个全局 Service 实例，globalLogger 是一个 Logger 单例。

```c++  
// main.cpp
#include "logger.h"
#include "service.h"

Service globalService; // 全局Service实例
Logger& globalLogger = Logger::getInstance(); // 全局Logger实例

int main() {
    return 0;
}
```

编译运行这个程序：

```shell
$ g++ -g -fno-omit-frame-pointer -o main main.cpp
```

运行后 assert 断言**大概率会失败**。我们知道**在单个编译单元(这里是 main.cpp)中，全局变量按照出现的顺序来初始化，然后按照相反的顺序来析构**。这里 globalLogger 会先析构，然后是 globalService，在 globalService 的析构函数中会调用 Logger 的 log 函数，但这时 globalLogger 已经被析构，isAlive 被置为 false，所以大概率会触发断言失败。之所以说大概率是因为，globalLogger 对象析构后，其占用的内存空间可能还**未被操作系统回收或用于其他目的**，对其成员变量 isAlive 的访问可能仍能“正常”。下面是我运行的结果：

```shell
Logger destroyed.
main: logger.h:22: void Logger::log(const string&): Assertion `isAlive' failed.
[1]    1017435 abort      ./main
```

其实这里如果不加 isAlive 相关逻辑，运行的话输出大概率如下：

```shell
Logger destroyed.
Log: Service destroyed.
```

从输出可以看到和前面一样 globalLogger 先析构，lobalService 后析构。只是这里进程大概率不会 crash 掉，这是因为 globalLogger 被析构后，**虽然其生命周期已结束，但是对成员函数的调用仍可能“正常”执行**。这里成员函数的执行通常依赖于类的代码（位于代码段），只要代码段内容没有被重新写，并且方法不依赖于已经被破坏或改变的成员变量，它可能仍能运行而不出错。

当然就算这里没有触发程序崩溃，使用已析构对象的行为在 C++ 中是[未定义的（Undefined Behavior）](https://selfboot.cn/2016/09/18/c++_undefined_behaviours/)。未定义行为意味着程序可能崩溃、可能正常运行，或者产生不可预期的结果。此类行为的结果可能在不同的系统或不同的运行时有所不同，我们在开发中一定要避免这种情况的发生。

其实就 LevelDB 这里的实现来说，BytewiseComparatorImpl 是一个平凡可析构 [trivially destructible](https://en.cppreference.com/w/cpp/language/destructor#Trivial_destructor) 对象，它不依赖其他全局变量，因此它本身析构不会有问题。如果用它生成一个静态局部的单例对象，然后在其他静态局部对象或者全局对象中使用，那么在这些对象析构时，会调用 BytewiseComparatorImpl 的析构函数。而根据前面的分析，这里 BytewiseComparatorImpl 本身是一个静态局部对象，**在进程结束资源回收时，可能早于使用它的对象被被析构**。这样就会导致重复析构，产生未定义行为。

更多关于静态变量析构的解释也可以参考 [Safe Static Initialization, No Destruction](https://ppwwyyxx.com/blog/2023/Safe-Static-Initialization-No-Destruction/) 这篇文章，作者详细讨论了这个问题。