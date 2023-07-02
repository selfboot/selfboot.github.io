---
title: 复杂 C++ 项目堆栈保留以及分析
tags:
---

在构建和维护复杂的 C++ 项目时，性能优化和内存管理是至关重要的。当我们面对性能瓶颈或内存泄露时，可以使用eBPF（Extended Berkeley Packet Filter）和 BCC（BPF Compiler Collection）工具来分析。如我们在[Redis Issue 分析：流数据读写导致的“死锁”问题(1)](https://selfboot.cn/2023/06/14/bug_redis_deadlock_1/)文中看到的一样，我们用 BCC 的 profile 工具分析 Redis 的 CPU 占用，画了 CPU 火焰图，然后就能比较容易找到耗时占比大的函数以及其调用链。

![CPU 火焰图](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230613_bug_redis_deadlock_cpu.svg)

这里使用 profile 分析的一个大前提就是，服务的二进制文件要保留函数的堆栈信息。堆栈信息是程序执行过程中函数调用和局部变量的记录，当程序执行到某一点时，通过查看堆栈信息，我们可以知道哪些函数被调用，以及它们是如何相互关联的。这对于调试和优化代码至关重要，特别是在处理性能问题和内存泄露时。

<!--more-->

## 程序的堆栈信息

在计算机科学中，`堆栈（Stack）`是一种基本的数据结构，它遵循后进先出（LIFO）的原则。这意味着最后一个被添加到堆栈的元素是第一个被移除的。堆栈在程序设计中有很多用途，其中最常见的是在函数调用和局部变量存储中的应用。

在程序执行过程中，堆栈被用于管理函数调用，这称为`“调用堆栈”`或`“执行堆栈”`。当一个函数被调用时，一个新的堆栈帧被创建并压入调用堆栈。这个堆栈帧包含：

1. 返回地址：函数执行完成后，程序应该继续执行的内存地址。
2. 函数参数：传递给函数的参数。
3. 局部变量：在函数内部定义的变量。
4. 帧指针：指向前一个堆栈帧的指针，以便在当前函数返回时恢复前一个堆栈帧的上下文。

当函数执行完成时，其堆栈帧被弹出，控制返回到保存的返回地址。堆栈在内存中的分布如下图：

[函数调用堆栈内存分布图](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230702_c++_frame_pointer_stack_mem.png)

### Perf 的 DWARF 堆栈信息保存

[DWARF](https://en.wikipedia.org/wiki/DWARF)


### eBPF 的 FramePointer

DWARF 是在 Linux 和 Unix-like 系统上使用 GCC 和 Clang 编译器时最常见的格式。DWARF 包含了丰富的调试信息，包括堆栈帧、变量名、类型信息等，但是有一些限制：

1. 占用太大空间；
2. 基于 eBPF 的工具不能读取里面的堆栈信息。

在 eBPF 中使用另外方法读取堆栈信息，那就是帧指针(frame pointer)，帧指针可以为我们提供完整的堆栈跟踪。帧指针是 perf 的默认堆栈遍历，也是目前 bcc-tools 或 bpftrace 支持的唯一堆栈遍历技术。

## 复杂 C++ 项目编译

### 动态依赖与静态依赖

### 编译选项与依赖

## 复杂 C++ 项目分析示例

### 依赖库堆栈缺失

### 依赖库堆栈信息完整


## 更多文章

[Practical Linux tracing ( Part 1/5) : symbols, debug symbols and stack unwinding](https://medium.com/coccoc-engineering-blog/things-you-should-know-to-begin-playing-with-linux-tracing-tools-part-i-x-225aae1aaf13)  
[Understanding how function call works](https://zhu45.org/posts/2017/Jul/30/understanding-how-function-call-works/)  
[Hacking With GDB](https://kuafu1994.github.io/HackWithGDB/ASM.html)  