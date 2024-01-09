---
title: C++ 数据意外修改之深入理解 string 的 COW 写时复制
tags: [C++]
category: 程序设计
toc: true
date: 
description: 
---

<!-- more -->

C++ 中，const_cast 用于移除对象的 const（常量）属性。通常情况下，std::string 的 c_str() 方法返回一个指向常量字符数组的指针。所以我们**不应该通过这个指针修改字符串的内容**，因为它是设计为只读的。上面的例子中，使用 const_cast 来强制去除这个 const 限定符，然后通过 memmove 修改数据，这种直接修改底层数据的操作不会被 std::string 的内部机制（包括 COW）所识别，因为它跳过了所有的高层接口和内部状态检查。因此，COW 机制可能不会触发，因为 std::string 实现可能没有检测到通过其正常接口之外的方式进行的修改。

这种做法是不安全的，多线程环境下，有可能会产生数据竞争，导致未定义的行为。最好的做法是避免使用 const_cast 来修改 std::string，并且始终通过提供的公共接口进行操作。

## COW 简单介绍

在低版本的 GCC(4.*) 中，std::string 类的实现采用了**写时复制**（Copy-On-Write，简称 COW）机制。当一个字符串对象被复制时，它**并不立即复制整个字符串数据，而是与原始字符串共享相同的数据**。只有在字符串的一部分被修改时（即“写入”时），才会创建数据的真实副本。COW 的优点在于它可以大幅度减少不必要的数据复制，特别是在字符串对象**频繁被复制但很少被修改**的场景下。

COW 的一般实现方式：

- 引用计数：std::string 对象内部通常包含一个指向字符串数据的指针和一个引用计数。这个引用计数表示有多少个 std::string 对象共享相同的数据。
- 复制时共享：当一个 std::string 对象被复制时，它会简单地复制指向数据的指针和引用计数，而不是数据本身。复制后的字符串对象和原始对象共享相同的数据，并且引用计数增加。
- 写入时复制：如果任何一个 std::string 对象试图修改共享的数据，它会首先检查引用计数。如果引用计数大于 1，表示数据被多个对象共享。在这种情况下，修改操作会先创建数据的一个新副本（即“复制”），然后对这个新副本进行修改。引用计数随后更新以反映共享情况的变化。

COW 实现需要仔细管理内存分配和释放，以及引用计数的增加和减少，确保数据的正确性和避免内存泄漏。

## C++11 不再使用 COW

C++11 之后，STL 里面的 string 类型不允许使用 COW 技术实现，可以参考 [Legality of COW std::string implementation in C++11](https://stackoverflow.com/questions/12199710/legality-of-cow-stdstring-implementation-in-c11)。GCC 编译器，从 5.1 开始不再用 COW 实现 string，可以参考 [Dual ABI](https://gcc.gnu.org/onlinedocs/libstdc++/manual/using_dual_abi.html)：

> In the GCC 5.1 release libstdc++ introduced a new library ABI that includes new implementations of std::string and std::list. These changes were necessary to conform to the 2011 C++ standard which **forbids Copy-On-Write strings** and requires lists to keep track of their size.

C++ 11 里关于 string 实现的改动部分，可以在[Concurrency Modifications to Basic String](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2008/n2534.html)找到，这里之所以不允许 COW，主要基于下面几个考虑。

如果用COW实现，那么non-const operator[]可能会导致迭代器失效。而标准严格规定了哪些成员方法可以导致迭代器失效，其中不包括这个方法。示例如下：


