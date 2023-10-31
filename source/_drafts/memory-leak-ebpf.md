---
title: 基于eBPF的C/C++内存泄漏深度分析：从原理到实践
tags:
  - ChatGPT
  - C++
  - ebpf
category: 计算机基础
toc: true
description: 
---

对于 C/C++ 程序员来说，内存泄露问题是一个老生常谈的问题。排查内存泄露的方法有很多，比如使用 valgrind、gdb、asan、tsan 等工具，但是这些工具都有各自的局限性，比如 valgrind 会使程序运行速度变慢，gdb 需要了解代码并且手动打断点，asan 和 tsan 需要重新编译程序。对于比较复杂，并且在运行中的服务来说，这些方法都不是很方便。

![ebpf 分析拿到的内存泄露火焰图](https://slefboot-1251736664.file.myqcloud.com/20231030_memory_leak_ebpf_index.png)

好在有了 eBPF，我们可以使用它来分析内存泄露问题，不需要重新编译程序，对程序运行速度的影响也很小。eBPF 的强大有目共睹，不过 eBPF 也不是银弹，用来分析内存泄露也还是有很多问题需要解决，本文接下来就来探讨一下基于 eBPF 的内存泄漏分析方法。

<!-- more -->

## 内存泄露模拟

在 C/C++ 中，内存泄露是指程序在运行过程中，由于某些原因导致程序未能释放已经不再使用的内存，从而造成系统内存的浪费。内存泄露问题一旦发生，会导致程序运行速度减慢，甚至系统崩溃。内存泄露问题的发生，往往是由于程序员在编写程序时，没有注意到内存的分配和释放，或者是由于程序设计的缺陷，导致程序在运行过程中，无法释放已经不再使用的内存。

下面是一个简单的内存泄露模拟程序，程序会在循环中分配内存，但是没有释放，从而导致内存泄露。main 程序如下：

```c++
#include <iostream>

namespace LeakLib {
    void slowMemoryLeak();
}

int caller() {
    std::cout << "In caller" << std::endl;
    LeakLib::slowMemoryLeak();
    return 0;
}
int main() {
    std::cout << "Starting slow memory leak program..." << std::endl;
    caller();
    return 0;
}
```

其中内存泄露的代码在 `slowMemoryLeak` 函数中，具体如下：

```c++
namespace LeakLib {
    void slowMemoryLeak() {
        int oneMbSize = 262144;
        while (true) {
            int* p = new int[oneMbSize];
            for (int i = 0; i < oneMbSize; ++i) {
                p[i] = i; // Assign values to occupy physical memory
            }
            sleep(1); // wait for 1 second
        }
    }
}
```

注意这里编译的时候，带了帧指针选项（由 `-fno-omit-frame-pointer` 选项控制），这是因为 eBPF 工具需要用到帧指针来进行调用栈回溯。如果这里忽略掉帧指针的话(`-fomit-frame-pointer`)，eBPF 的工具拿不到内存泄露的堆栈信息。完整编译命令如下(-g 可以不用加，不过这里也先加上，方便用 gdb 查看一些信息)：

```shell
$ g++ main.cpp leak_lib.cpp -o main -fno-omit-frame-pointer -g
```

### memleak 分析




```shell
$ slow BPFTRACE_MAX_BPF_PROGS=2500 BPFTRACE_MAX_PROBES=2500 bpftrace -e 'u:/usr/local/lib/libtcmalloc.so.4:* { printf("%s called: %s", probe, ustack()); }'
Attaching 2500 probes...
ERROR: Offset outside the function bounds ('register_tm_clones' size is 0)
$ slow
$ slow objdump --syms main | grep register_tm_clones
00000000000010d0 l     F .text	0000000000000000              deregister_tm_clones
0000000000001100 l     F .text	0000000000000000              register_tm_clones
```

简单解释下 `objdump --syms` 的输出，其中：

1. 第一列函数地址，比如 00000000000010d0 和 0000000000001100 
2. 第二列 l 表示这是一个局部（local）符号。
3. 第三列 F 表示这是一个函数。
4. 第四列 .text 表示这个符号位于文本（代码）段。
5. 第五列 0000000000000000 表示函数的大小，这里是0。
6. 第六列 deregister_tm_clones 和 register_tm_clones 是函数名。

对于 bpftrace，没有内建的方法来过滤函数，所以可能需要手动创建一个脚本来生成所有非空的函数列表，并生成一个bpftrace 脚本，然后运行它。假设有一个文件 `functions.txt`，其中列出了所有想要跟踪的函数名。对于上面的例子，可以过滤掉所有 size=0 的函数，然后用下面脚本生成 bpftrace 脚本：

```python
with open('functions.txt', 'r') as f:
    functions = f.readlines()

with open('generated_bpftrace.bt', 'w') as f:
    f.write('#!/usr/bin/env bpftrace\n\n')
    for function in functions:
        f.write(f'uprobe:/usr/local/lib/libtcmalloc.so.4:{function.strip()} {{\n')
        f.write('    printf("%s called: %s", probe, ustack());\n')
        f.write('}\n')
```

## 参考文章

[基于 eBPF 的内存泄漏（增长）通用分析方法探索](https://zhuanlan.zhihu.com/p/652850051)
[DWARF-based Stack Walking Using eBPF](https://www.polarsignals.com/blog/posts/2022/11/29/dwarf-based-stack-walking-using-ebpf)
[Trace all functions in program with bpftrace](https://www.reddit.com/r/linuxquestions/comments/piq9tx/trace_all_functions_in_program_with_bpftrace/)
[Using BPF Tools: Chasing a Memory Leak](https://github.com/goldshtn/linux-tracing-workshop/blob/master/bpf-memleak.md)
[TCMalloc Overview](https://google.github.io/tcmalloc/overview.html)