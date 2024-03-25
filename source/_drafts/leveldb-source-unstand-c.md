---
title: LevelDB 源码阅读：理解其中的 C++ 高级技巧
tags: [C++]
category: 源码剖析
toc: true
description: 
---

## 模板


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