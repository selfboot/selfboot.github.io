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

在猜测原因之前，先仔细看下 [memleak 工具的代码](https://github.com/iovisor/bcc/blob/master/tools/memleak.py)，完整梳理下工具的实现原理。首先能明确的一点是，工具最后的输出部分，是**每个调用栈以及其泄露的内存量**。为了拿到这个结果，用 eBPF **分别在内存分配和释放的时候打桩，记录下当前调用栈的内存分配/释放量**，然后进行统计。核心的逻辑如下：

1. `gen_alloc_enter`: 在各种分配内存的地方，比如 malloc, cmalloc, realloc 等函数入口(malloc_enter)打桩(`attach_uprobe`)，获取当前调用堆栈 id 和分配的内存大小，记录在名为 sizes 的字典中；
2. `gen_alloc_exit2`: 在分配内存的函数退出位置(malloc\_exit)打桩(`attach_uretprobe`)，拿到此次分配的内存起始地址，同时从 sizes 字段拿到分配内存大小，记录 (address, stack_info) 在 allocs 字典中；同时用 `update_statistics_add` 更新最后的结果字典 combined_allocs，存储栈信息和分配的内存大小，次数信息；
3. `gen_free_enter`: 在释放内存的函数入口处打桩(gen_free_enter)，从前面 allocs 字典中根据要释放的内存起始地址，拿到对应的栈信息，然后用 `update_statistics_del` 更新结果字典 combined_allocs，也就是在统计中，减去当前堆栈的内存分配总量和次数。

### GDB 堆栈跟踪

接着回到前面的问题，tcmalloc 通过 new 分配的内存，为啥统计不到呢？很大可能是因为 tcmalloc 底层分配和释放内存的函数并不是 malloc/free，也不在 memleak 工具的 probe 打桩的函数内。那么怎么知道前面示例代码中，分配内存的调用链路呢？比较简单的方法就是用 GDB 调试来跟踪，注意编译 tcmalloc 库的时候，带上 debug 信息，如下：

```shell
$ ./configure CXXFLAGS="-g -fno-omit-frame-pointer" CFLAGS="-g -fno-omit-frame-pointer"
```

编译好后，可以用 objdump 查看 ELF 文件的头信息和各个段的列表，验证动态库中是否有 debug 信息，如下：

```shell
$ objdump -h /usr/local/lib/libtcmalloc_debug.so.4 | grep debug
/usr/local/lib/libtcmalloc_debug.so.4:     file format elf64-x86-64
 29 .debug_aranges 000082c0  0000000000000000  0000000000000000  000b8c67  2**0
 30 .debug_info   00157418  0000000000000000  0000000000000000  000c0f27  2**0
 31 .debug_abbrev 00018a9b  0000000000000000  0000000000000000  0021833f  2**0
 32 .debug_line   00028924  0000000000000000  0000000000000000  00230dda  2**0
 33 .debug_str    0009695d  0000000000000000  0000000000000000  002596fe  2**0
 34 .debug_ranges 00008b30  0000000000000000  0000000000000000  002f005b  2**0
```

接着重新用 debug 版本的动态库编译二进制，用 gdb 跟踪进 new 操作符的内部，得到结果如下图。可以看到确实没有调用 malloc 函数。

![tcmalloc new 操作符对应的函数调用](https://slefboot-1251736664.file.myqcloud.com/20231106_memory_leak_ebpf_tcmalloc_gdb.png)

其实 tcmalloc 的内存分配策略还是很复杂的，里面有各种预先分配好的内存链表，申请不同大小的内存空间时，有不少的策略来选择合适的内存地址。

## 正常内存泄露分析

前面不管是 glibc 还是 tcmalloc，用 new 来分配内存的时候，memleak 拿到的分析结果都不是很完美。这是因为用 eBPF 分析内存泄露，必须满足两个前提：

1. 编译二进制的时候带上帧指针(frame pointer)，如果有依赖到标准库或者第三方库，也都必须带上帧指针；
2. 实际分配内存的函数，必须在工具的 probe 打桩的函数内，比如 malloc, cmalloc, realloc 等函数； 

那么下面就来看下满足这两个条件后，内存泄露的分析结果。修改下上面的 leak_lib.cpp 中内存分配的代码，改为：

```c++
// int* p = new int[arrSize];
int* p = (int*)malloc(arrSize * sizeof(int));
```

重新编译运行程序，这时候 memleak 就能拿到完整的调用栈信息了，如下：


## 默认开启帧指针

文章最后再来解决下前面留下的一个比较有争议的话题，是否在编译的时候默认开启帧指针。我们知道 eBPF 工具依赖帧指针才能进行调用栈回溯，其实栈回溯的方法有不少，比如：

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