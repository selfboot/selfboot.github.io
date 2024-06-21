---
title: LevelDB 源码阅读：理解其中的 C++ 高级技巧
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
---

## 柔性数组

在 `util/cache.cc` 的 LRUHandle 结构体定义中，有一个柔性数组(**flexible array member**) `char key_data[1]`，用来在`C/C++`中实现**可变长数据结构**。

```c++
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

```c++
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

```c++
class LEVELDB_EXPORT Iterator {
 public:
 ...
};
```

这里宏的定义在 `include/leveldb/export.h` 中，为了方便看分支，下面加了缩进(实际代码没有)，如下：

```c++
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

## 其他

### constexpr

`constexpr` 指定了用于声明常量表达式的变量或函数。这种声明的目的是告知编译器**这个值或函数在编译时是已知**的，这允许在编译期间进行更多的优化和检查。

```c++
static constexpr int kCacheSize = 1000;
```

与 const 相比，constexpr 更强调编译期常量，而 const 变量在声明时就被初始化，但它们**不一定非得在编译时确定**，通常只是表示运行时不可修改。