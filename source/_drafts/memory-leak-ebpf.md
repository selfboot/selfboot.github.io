---
title: 深入理解基于 eBPF 的 C/C++ 内存泄漏分析
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

好在有了 eBPF，我们可以使用它来分析内存泄露问题，不需要重新编译程序，对程序运行速度的影响也很小。eBPF 的强大有目共睹，不过 **eBPF 也不是银弹**，用来分析内存泄露也还是**有很多问题需要解决**，本文接下来就来探讨一下基于 eBPF 检测会遇到的常见问题。

<!-- more -->

## 内存泄露模拟

在 C/C++ 中，内存泄露是指程序在运行过程中，由于某些原因导致**未能释放已经不再使用的内存**，从而造成系统内存的浪费。内存泄露问题一旦发生，会导致程序运行速度减慢，甚至进程 OOM 被杀掉。内存泄露问题的发生，往往是由于在编写程序时，**没有及时释放内存**；或者是由于程序设计的缺陷，导致程序在运行过程中，无法释放已经不再使用的内存。

下面是一个简单的内存泄露模拟程序，程序会在循环中分配内存，但是没有释放，从而导致内存泄露。main 程序如下，发生泄露的函数调用链路是 `main->caller->slowMemoryLeak`：

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
        int arrSize = 10;
        while (true) {
            int* p = new int[arrSize];
            for (int i = 0; i < arrSize; ++i) {
                p[i] = i; // Assign values to occupy physical memory
            }
            sleep(1); // wait for 1 second
        }
    }
}
```

注意这里编译的时候，带了帧指针选项（由 `-fno-omit-frame-pointer` 选项控制），这是因为 eBPF 工具需要用到帧指针来进行调用栈回溯。如果这里忽略掉帧指针的话(`-fomit-frame-pointer`)，基于 eBPF 的工具就拿不到内存泄露的堆栈信息。完整编译命令如下(-g 可以不用加，不过这里也先加上，方便用 gdb 查看一些信息)：

```shell
$ g++ main.cpp leak_lib.cpp -o main -fno-omit-frame-pointer -g
```

## memleak 分析

接下来基于 eBPF 来进行内存分析泄露，[BCC](https://github.com/iovisor/bcc) 自带了一个 [memleak](https://github.com/iovisor/bcc/blob/master/tools/memleak.py) 内存分析工具，可以用来分析内存泄露的调用堆栈。拿前面的示例泄露代码来说，编译后执行程序，然后执行内存泄露检测 `memleak -p $(pgrep main) --combined-only`。

![ebpf bcc memleak 内存泄露分析](https://slefboot-1251736664.file.myqcloud.com/20231101_memory_leak_ebpf_bcc_new.png)

目前[版本的 memleak 工具](https://github.com/iovisor/bcc/blob/24822c2e9459f4508fb7071071c26a80d4c9dc5b/tools/memleak.py)有 bug，在带 `--combined-only` 打印的时候，会报错。修改比较简单，我已经提了 [PR #4769](https://github.com/iovisor/bcc/pull/4769/files)，等合并后就可以用了。仔细看脚本的输出，发现这里调用堆栈其实不太完整，丢失了 `slowMemoryLeak` 这个函数调用。

```shell
[11:19:44] Top 10 stacks with outstanding allocations:
	480 bytes in 12 allocations from stack
		operator new(unsigned long)+0x1c [libstdc++.so.6.0.30]
		caller()+0x31 [main]
		main+0x31 [main]
		__libc_start_call_main+0x7a [libc.so.6]
```

### 调用链不完整

这里为啥会丢失中间的函数调用呢？我们知道eBPF 相关的工具，是通过 `frame pointer` 指针来进行调用堆栈回溯的，具体原理可以参考朋友的文章 [消失的调用栈帧-基于fp的栈回溯原理解析](https://mp.weixin.qq.com/s/WWqPO9Q4BCO5SgyuMk8Ddg)。如果遇到调用链不完整，基本都是因为帧指针丢失，下面来验证下。

首先用 `objdump -d -S main > main_with_source.asm` 来生成带源码的汇编指令，找到 `slowMemoryLeak` 函数的汇编代码，如下图所示：

![ebpf bcc main 函数对应的汇编代码](https://slefboot-1251736664.file.myqcloud.com/20231102_memory_leak_ebpf_src_assembly_code.png)

从这段汇编代码中，可以看到 `new int[]` 对应的是一次 `_Znam@plt` 的调用。这是 C++ 的 operator new[] 的名字修饰（name mangling）后的形式，如下：

```shell
$ c++filt _Znam
operator new[](unsigned long)
```

我们知道在 C++ 中，new 操作用来动态分配内存，通常会最终调用底层的内存分配函数如 malloc。这里 `_Znam@plt` 是通过 `PLT（Procedure Linkage Table）` 进行的，它是一个动态解析的符号，通常是 libstdc++（或其他 C++ 标准库的实现）中实现的 `operator new[]`。`_Znam@plt` 对应的汇编代码如下：

```assembly
0000000000001030 <_Znam@plt>:
    1030:       ff 25 ca 2f 00 00       jmp    *0x2fca(%rip)        # 4000 <_Znam@GLIBCXX_3.4>
    1036:       68 00 00 00 00          push   $0x0
    103b:       e9 e0 ff ff ff          jmp    1020 <_init+0x20>
```

这里并没有像 slowMemoryLeak 调用一样去做 `push %rbp` 的操作，所以会丢失堆栈信息。这里为什么会没有保留帧指针呢？前面编译的时候带了 `-fno-omit-frame-pointer` 能保证我们自己的代码带上帧指针，但是对于 libstdc++ 这些依赖到的标准库，我们是无法控制的。当前系统的 C++ 标准库在编译的时候，并没有带上帧指针，可能是因为这样可以减少函数调用的开销(减少执行的指令)。是否在编译的时候默认带上 -fno-omit-frame-pointer 还是比较有争议，文章最后专门放[一节：默认开启帧指针](#默认开启帧指针)来讨论。

## tcmalloc 泄露分析

如果想拿到完整的内存泄露函数调用链路，可以带上帧指针重新编译 libstdc++，不过标准库重新编译比较麻烦。其实日常用的比较多的是 tcmalloc，内存分配管理更加高效些。这里为了验证上面的代码在 tcmalloc 下的表现，我用 -fno-omit-frame-pointer 帧指针编译了 `tcmalloc` 库。如下：

```shell
git clone https://github.com/gperftools/gperftools.git
cd gperftools
./autogen.sh
./configure CXXFLAGS="-fno-omit-frame-pointer" --prefix=/path/to/install/dir
make
make install
```

接着运行上面的二进制，重新用 memleak 来检查内存泄露，注意这里把 libtcmalloc.so 动态库的路径也传递给了 memleak。工具的输出如下，**找不到内存泄露**了：

```shell
$ memleak -p $(pgrep main) --combined-only -O /usr/local/lib/libtcmalloc.so
Attaching to pid 1409827, Ctrl+C to quit.
[19:55:45] Top 10 stacks with outstanding allocations:

[19:55:50] Top 10 stacks with outstanding allocations:
```

明明 new 分配的内存没有释放，**为什么 eBPF 的工具检测不到呢**？

### 深入工具实现

在猜测原因之前，仔细看下 [memleak 工具的代码](https://github.com/iovisor/bcc/blob/master/tools/memleak.py)，完整梳理下工具的实现原理。

这里工具主要

发现在各种分配内存的地方，比如 malloc, cmalloc, realloc 等函数打桩，获取当前调用堆栈 id 和分配的内存量；


### 所有堆栈提取

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

## 默认开启帧指针

前面知道 eBPF 工具依赖帧指针才能进行调用栈回溯，其实栈回溯的方法有不少，比如：

- [DWARF](https://dwarfstd.org/): 调试信息中增加堆栈信息，不需要帧指针也能进行回溯，但缺点是性能比较差，因为需要将堆栈信息复制到用户空间来进行回溯；
- [ORC](https://www.kernel.org/doc/html/v5.3/x86/orc-unwinder.html): 内核中为了展开堆栈创建的一种格式，其目的与 DWARF 相同，只是简单得多，**不能在用户空间使用**；
- [CTF Frame](https://sourceware.org/pipermail/binutils/2022-June/121478.html)：一种新的格式，比 eh_frame 更紧凑，展开堆栈速度更快，并且更容易实现。仍在开发中，不知道什么时候能用上。

所以如果想用**比较低的开销，拿到完整的堆栈信息，帧指针是目前最好的方法**。既然帧指针这么好，为什么有些地方不默认开启呢？在 Linux 的 Fedora 发行版社区中，是否默认打开该选项引起了激烈的讨论，最终达成一致，在 Fedora Linux 38 中，所有的库都会默认开启 -fno-omit-frame-pointer 编译，详细过程可以看 [Fedora wiki: Changes/fno-omit-frame-pointer](https://fedoraproject.org/wiki/Changes/fno-omit-frame-pointer)。

上面 Wiki 中对打开帧指针带来的影响有一个**性能基准测试**，从结果来看：

- 带帧指针使用 GCC 编译的内核，速度会慢 2.4%；
- 使用帧指针构建 openssl/botan/zstd 等库，没有受到显着影响；
- 对于 CPython 的基准测试性能影响在 1-10%；
- Redis 的基准测试基本没性能影响；

当然，不止是 Fedora 社区倾向默认开启，著名性能优化专家 [Brendan Gregg](https://www.brendangregg.com/) 在一次[分享](https://www.brendangregg.com/Slides/SCALE2015_Linux_perf_profiling.pdf)中，建议在 gcc 中直接将 -fno-omit-frame-pointer 设为**默认编译选项**：

> • Once upon a tme, x86 had fewer registers, and the frame pointer register was reused for general purpose to improve performance. This breaks system stack walking.
> • gcc provides -fno-omit-frame-pointer to fix this – **Please make this the default in gcc!** 

此外，在[一篇关于 DWARF 展开的论文](https://inria.hal.science/hal-02297690/document) 提到有 Google 的开发者在分享中提到过，google 的核心代码编译的时候都带上了帧指针。

## 参考文章

[基于 eBPF 的内存泄漏（增长）通用分析方法探索](https://zhuanlan.zhihu.com/p/652850051)  
[Memory Leak (and Growth) Flame Graphs](https://www.brendangregg.com/FlameGraphs/memoryflamegraphs.html)
[DWARF-based Stack Walking Using eBPF](https://www.polarsignals.com/blog/posts/2022/11/29/dwarf-based-stack-walking-using-ebpf)
[Trace all functions in program with bpftrace](https://www.reddit.com/r/linuxquestions/comments/piq9tx/trace_all_functions_in_program_with_bpftrace/)
[Using BPF Tools: Chasing a Memory Leak](https://github.com/goldshtn/linux-tracing-workshop/blob/master/bpf-memleak.md)
[TCMalloc Overview](https://google.github.io/tcmalloc/overview.html)