---
title: LevelDB 源码阅读：理解其中的 C++ 高级技巧
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
---

## 柔性数组

在 `util/cache.cc` 的 LRUHandle 结构体定义中，有一个柔性数组(**flexible array member**) `char key_data[1]`，用来在`C/C++`中实现**可变长数据结构**。

```cpp
struct LRUHandle {
  // ...
  char key_data[1];  // Beginning of key

  Slice key() const {
    assert(next != this);
    return Slice(key_data, key_length);
  }
};
```

在这个 handle 结构体中，`key_data[1]`实际上只是一个占位符，真正分配给`key_data`的空间要比 1 字节大，它由 malloc 时计算的total_size确定。具体到 LevelDB 的实现中，在插入新的缓存条目时，会根据 key 的长度动态分配内存，然后将 key 的内容拷贝到这块内存中。如下代码：

```cpp
Cache::Handle* LRUCache::Insert(const Slice& key, uint32_t hash, void* value,
                                size_t charge,
                                void (*deleter)(const Slice& key,
                                                void* value)) {
  MutexLock l(&mutex_);
  // 计算好一共需要的内存大小, 注意这里减去 1 是因为 key_data[1] 是一个占位符，本来已经有一个字节了
  LRUHandle* e = reinterpret_cast<LRUHandle*>(malloc(sizeof(LRUHandle) - 1 + key.size()));
  e->value = value;
  // ...
  e->refs = 1;  // for the returned handle.
  // 复制 key 数据到 key_data 中
  std::memcpy(e->key_data, key.data(), key.size());
  // ... 忽略
```

上面代码在单个 malloc 调用中同时为 LRUHandle 结构体和尾部的 key_data 数组**分配连续的内存**。避免了为键数据单独分配内存，从而**减少了额外的内存分配开销和潜在的内存碎片问题**。同时 LRUHandle 的整个数据结构紧凑地存储在一块连续的内存中，提高了空间利用率，还可能改善缓存局部性（cache locality）。如果改为使用 `std::vector` 或 `std::string`，将需要为每个 LRUHandle 对象分配两次内存：一次是为LRUHandle对象本身，一次是std::vector或std::string为存储数据动态分配的内存。在一个高性能的数据库实现中，这种内存分配的开销是不容忽视的。

另外，这里结构体尾部的数组长度为 1，还有不少代码中，**尾部数组长度为 0 或者直接不写**，这两种方法有啥区别吗？其实这两种做法都用于在结构体末尾添加可变长度的数据，`char key_data[];`是一种更明确的尾部数组声明方式，直接表示数组本身没有分配任何空间，是在C99标准中引入。不过这种声明在某些标准 C++ 版本中并不合法，尽管一些编译器可能作为扩展支持它。在C++中，为了避免兼容性问题，通常推荐使用`char key_data[1];`，因为在编译器中通常有更好的支持。

这里有一些讨论，也可以看看：[What's the need of array with zero elements?](https://stackoverflow.com/questions/14643406/whats-the-need-of-array-with-zero-elements) 和 [One element array in struct](https://stackoverflow.com/questions/4559558/one-element-array-in-struct) 。

## 链接符号导出

在 `include/leveldb/*.h` 中的类，定义的时候都带有一个宏 `LEVELDB_EXPORT`，比如：

```cpp
class LEVELDB_EXPORT Iterator {
 public:
 ...
};
```

这里宏的定义在 `include/leveldb/export.h` 中，为了方便看分支，下面加了缩进(实际代码没有)，如下：

```cpp
#if !defined(LEVELDB_EXPORT)
    #if defined(LEVELDB_SHARED_LIBRARY)
        #if defined(_WIN32)
            #if defined(LEVELDB_COMPILE_LIBRARY)
            #define LEVELDB_EXPORT __declspec(dllexport)
            #else
            #define LEVELDB_EXPORT __declspec(dllimport)
        #endif  // defined(LEVELDB_COMPILE_LIBRARY)

        #else  // defined(_WIN32)
            #if defined(LEVELDB_COMPILE_LIBRARY)
            #define LEVELDB_EXPORT __attribute__((visibility("default")))
        #else
            #define LEVELDB_EXPORT
        #endif
    #endif  // defined(_WIN32)
    #else  // defined(LEVELDB_SHARED_LIBRARY)
        #define LEVELDB_EXPORT
    #endif
#endif  // !defined(LEVELDB_EXPORT)
```

我们知道 leveldb 本身不像 mysql、postgres 一样提供数据库服务，它只是一个库，我们可以链接这个库来读写数据。为了将 leveldb 导出为动态链接库，需要控制符号的可见性和链接属性。为了支持跨平台构建，这里根据不同的平台信息来指定不同的属性。

在 Linux 系统上，编译库时如果有定义 LEVELDB_COMPILE_LIBRARY，则会加上 `__attribute__((visibility("default")))` 属性。它会将符号的链接可见性设置为默认的，这样其他链接到这个共享库的代码都可以使用这个类。

如果不加这个宏来导出符号有什么问题吗？在 Linux 环境下，所有符号默认都是可见的，这样会导出更多的符号，这不仅会导致库的尺寸增大，还可能与其他库中的符号发生冲突。而隐藏部分不对外公开的符号则可以帮助链接器优化程序，**提高加载速度，减少内存占用**。此外，通过导出宏，可以显式地控制哪些接口是公共的，哪些是私有的，**隐藏实现细节实现良好的封装**。

在没有定义 `LEVELDB_SHARED_LIBRARY` 的时候，LEVELDB_EXPORT 宏**被定义为空**，这意味着当 leveldb  被编译为静态库时，所有原本可能需要特殊导出导入标记的符号都不需要这样的标记了。静态链接的情况下，符号导出对于链接过程不是必需的，因为静态库的代码在编译时会直接被包含到最终的二进制文件中。

## Pimpl 类设计

在 LevelDB 的许多类中，都是只有一个指针类型的私有成员变量。比如 `include/leveldb/table_builder.h` 头文件的 TableBuild 类定义中，有私有成员变量 Rep *rep_，它是一个指向 Rep 结构体的指针：

```cpp
 private:
  struct Rep;
  Rep* rep_;
```

然后在 `table/table_builder.cc` 文件中定义了 Rep 结构体：

```cpp
struct TableBuilder::Rep {
  Rep(const Options& opt, WritableFile* f)
      : options(opt),
        index_block_options(opt),
        file(f),
// ...
```

这里**为什么不直接在头文件中定义 Rep 结构体**呢？其实这里是使用了 **Pimpl(Pointer to Implementation)** 设计模式，主要有下面几个优点：

- **二进制兼容**（ABI stability）。当 TableBuilder 类库更新时，只要其接口(.h 文件)保持不变，即使实现中 Rep 结构体增加成员，或者更改接口的实现，依赖该库的应用程序**只用更新动态库文件，无需重新编译**。如果没有做到二进制兼容，比如为公开的类增加一些成员变量，应用程序只更新动态库，不重新编译的话，运行时就会因为对象内存分布不一致，导致程序崩溃。可以参考之前业务遇到的类似问题，[Bazel 依赖缺失导致的 C++ 进程 coredump 问题分析](https://selfboot.cn/2024/03/15/object_memory_coredump/)。
- **减少编译依赖**。如果 Rep 结构体的定义在头文件中，那么任何对 Rep 结构体的修改都会导致包含了 table_builder.h 的文件重新编译。而将 Rep 结构体的定义放在源文件中，只有 table_builder.cc 需要重新编译。
- **接口与实现分离**。接口（在 .h 文件中定义的公共方法）和实现（在 .cc 文件中定义的 Rep 结构体以及具体实现）是完全分开的。这使得在不更改公共接口的情况下，开发者可以自由地修改实现细节，如添加新的私有成员变量或修改内部逻辑。

**为什么使用成员指针后，会有上面的优点呢**？这就要从 C++ 对象的内存布局说起，一个类的对象在内存中的布局是连续的，并且直接包含其所有的非静态成员变量。如果成员变量是简单类型（如 int、double 等）或其他类的对象，这些成员将直接嵌入到对象内存布局中。可以参考我之前的文章[结合实例深入理解 C++ 对象的内存布局](https://selfboot.cn/2024/05/10/c++_object_model/) 了解更多内容。

当成员变量是一个指向其他类的指针，该成员在内存中的布局只有一个指针（Impl* pImpl），而不是具体的类对象。这个**指针的大小和对齐方式是固定的，与 Impl 中具体包含什么数据无关**。因此无论指针对应的类内部实现如何变化（例如增加或移除数据成员、改变成员的类型等），外部类的大小和布局都保持不变，也不会受影响。

在 《Effective C++》中，条款 31 就提到用这种方式来减少编译依赖：

> 如果使用 object references 或 object pointers 可以完成任务，就不要使用objects。你可以只靠一个类型声明式就定义出指向该类型的 references 和 pointers；但如果定义某类型的 objects，就需要用到该类型的定义式。

当然，软件开发没有银弹，这里的优点需要付出相应的开销，参考 [cppreference.com: PImpl](https://en.cppreference.com/w/cpp/language/pimpl)：

- **生命周期管理开销（Runtime Overhead）**: Pimpl 通常需要在堆上动态分配内存来存储实现对象（Impl 对象）。这种动态分配比**在栈上分配对象（通常是更快的分配方式）慢**，且涉及到更复杂的内存管理。此外，堆上分配内存，如果没有释放会造成内存泄露。不过就上面例子来说，Rep 在对象构造时分配，并在析构时释放，不会造成内存泄露。
- **访问开销（Access Overhead）**: 每次通过 Pimpl 访问私有成员函数或变量时，都需要通过指针间接访问。
- **空间开销（Space Overhead）**: 每个使用 Pimpl 的类都会在其对象中增加至少一个指针的空间开销来存储实现的指针。如果实现部分需要访问公共成员，可能还需要额外的指针或者通过参数传递指针。

总的来说，对于基础库来说，Pimpl 是一个很好的设计模式。也可以参考 [Is the PIMPL idiom really used in practice?](https://stackoverflow.com/questions/8972588/is-the-pimpl-idiom-really-used-in-practice) 了解更多讨论。

## 其他

### constexpr

`constexpr` 指定了用于声明常量表达式的变量或函数。这种声明的目的是告知编译器**这个值或函数在编译时是已知**的，这允许在编译期间进行更多的优化和检查。

```cpp
static constexpr int kCacheSize = 1000;
```

与 const 相比，constexpr 更强调编译期常量，而 const 变量在声明时就被初始化，但它们**不一定非得在编译时确定**，通常只是表示运行时不可修改。