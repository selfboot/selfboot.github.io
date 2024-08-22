---
title: In-depth Understanding of eBPF-based C/C++ Memory Leak Analysis
tags:
  - ChatGPT
  - C++
  - eBPF
category: Programming
toc: true
description: This article simulates a memory leak program to explain the working principles of eBPF and the challenges it faces, particularly its limitations when dealing with incomplete call stacks. It also discusses how to trace tcmalloc using gdb and generate memory leak flame graphs using FlameGraph. Finally, it addresses the controversy of enabling frame pointers by default during compilation.
date: 2023-11-08 13:21:26
lang: en
---

For C/C++ programmers, memory leak is a perennial issue. There are many methods to troubleshoot memory leaks, such as using tools like valgrind, gdb, asan, tsan, etc., but each of these tools has its limitations. For example, valgrind slows down program execution, gdb requires understanding of the code and manual breakpoint setting, while asan and tsan require recompiling the program. For complex services that are already running, these methods are not very convenient.

![Memory leak flame graph obtained through eBPF analysis](https://slefboot-1251736664.file.myqcloud.com/20231030_memory_leak_ebpf_index.png)

Fortunately, with eBPF, we can analyze memory leak problems without recompiling the program and with minimal impact on program execution speed. The power of eBPF is evident, but **eBPF is not a silver bullet**. There are still **many issues to be resolved** when using it to analyze memory leaks. This article will discuss the common problems encountered in eBPF-based detection.

<!-- more -->

## Memory Leak Simulation

In C/C++, a memory leak refers to a situation where the program, for some reason, **fails to release memory that is no longer in use** during its execution, resulting in a waste of system memory. Once a memory leak occurs, it can cause the program to run slower or even be killed by OOM (Out of Memory). Memory leaks often occur due to **not releasing memory in a timely manner** when writing programs, or due to design flaws that prevent the program from releasing memory that is no longer in use during execution.

Below is a simple memory leak simulation program. The program allocates memory in a loop but doesn't release it, leading to a memory leak. The main program is as follows, with the leaking function call chain being `main->caller->slowMemoryLeak`:

```cpp
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

The memory-leaking code is in the `slowMemoryLeak` function, specifically as follows:

```cpp
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

Note that during compilation, the frame pointer option is included (controlled by the `-fno-omit-frame-pointer` option). This is because eBPF tools need to use the frame pointer for call stack tracing. If we ignore the frame pointer here (`-fomit-frame-pointer`), eBPF-based tools won't be able to get the stack information of the memory leak. The complete compilation command is as follows (-g can be omitted, but it's added here to facilitate viewing some information with gdb):

```shell
$ g++ main.cpp leak_lib.cpp -o main -fno-omit-frame-pointer -g
```

## memleak Analysis

Next, let's perform memory leak analysis based on eBPF. [BCC](https://github.com/iovisor/bcc) comes with a [memleak](https://github.com/iovisor/bcc/blob/master/tools/memleak.py) memory analysis tool that can be used to analyze the call stack of memory leaks. For the example leak code above, after compilation and execution of the program, run the memory leak detection `memleak -p $(pgrep main) --combined-only`.

![eBPF bcc memleak memory leak analysis](https://slefboot-1251736664.file.myqcloud.com/20231101_memory_leak_ebpf_bcc_new.png)

The [current version of the memleak tool](https://github.com/iovisor/bcc/blob/24822c2e9459f4508fb7071071c26a80d4c9dc5b/tools/memleak.py) has a bug that causes an error when printing with `--combined-only`. The fix is simple, and I've submitted [PR #4769](https://github.com/iovisor/bcc/pull/4769/files), which has been merged into master. Looking closely at the script's output, we can see that the call stack here is actually incomplete, missing the `slowMemoryLeak` function call.

```shell
[11:19:44] Top 10 stacks with outstanding allocations:
	480 bytes in 12 allocations from stack
		operator new(unsigned long)+0x1c [libstdc++.so.6.0.30]
		caller()+0x31 [main]
		main+0x31 [main]
		__libc_start_call_main+0x7a [libc.so.6]
```

### Incomplete Call Chain

Why is the intermediate function call lost here? We know that eBPF-related tools use the `frame pointer` to trace the call stack. For the specific principle, you can refer to my friend's article [The Disappearing Call Stack Frame - Principle Analysis of FP-based Stack Tracing](https://mp.weixin.qq.com/s/WWqPO9Q4BCO5SgyuMk8Ddg). If you encounter an incomplete call chain, it's usually due to a missing frame pointer. Let's verify this.

First, use `objdump -d -S main > main_with_source.asm` to generate assembly instructions with source code. Find the assembly code for the `slowMemoryLeak` function, as shown in the following image:

![Assembly code corresponding to the main function in eBPF bcc](https://slefboot-1251736664.file.myqcloud.com/20231102_memory_leak_ebpf_src_assembly_code.png)

From this assembly code, we can see that `new int[]` corresponds to a call to `_Znam@plt`. This is the name-mangled form of C++'s operator new[], as follows:

```shell
$ c++filt _Znam
operator new[](unsigned long)
```

We know that in C++, the new operation is used for dynamic memory allocation and usually ends up calling underlying memory allocation functions like malloc. Here, `_Znam@plt` is done through the `PLT (Procedure Linkage Table)`, which is a dynamically resolved symbol, typically implemented as `operator new[]` in libstdc++ (or other C++ standard library implementations). The assembly code corresponding to `_Znam@plt` is as follows:

```assembly
0000000000001030 <_Znam@plt>:
    1030:       ff 25 ca 2f 00 00       jmp    *0x2fca(%rip)        # 4000 <_Znam@GLIBCXX_3.4>
    1036:       68 00 00 00 00          push   $0x0
    103b:       e9 e0 ff ff ff          jmp    1020 <_init+0x20>
```

There's no `push %rbp` operation here like in the slowMemoryLeak call, so stack information will be lost. Why isn't the frame pointer retained here? The `-fno-omit-frame-pointer` we used during compilation ensures that our own code includes frame pointers, but we have no control over the standard libraries we depend on, like libstdc++. The C++ standard library on the current system wasn't compiled with frame pointers, possibly to reduce the overhead of function calls (by reducing the number of instructions executed). Whether to include -fno-omit-frame-pointer by default during compilation is quite controversial. There's a [dedicated section: Enabling Frame Pointers by Default](#enabling-frame-pointers-by-default) at the end of the article to discuss this.

## tcmalloc Leak Analysis

If you want to get the complete memory leak function call chain, you can recompile `libstdc++` with frame pointers, although recompiling the standard library is quite troublesome. In fact, tcmalloc is more commonly used in daily work, with more efficient memory allocation management. To verify the performance of the above code under tcmalloc, I compiled the `tcmalloc` library with the -fno-omit-frame-pointer frame pointer. As follows:

```shell
git clone https://github.com/gperftools/gperftools.git
cd gperftools
./autogen.sh
./configure CXXFLAGS="-fno-omit-frame-pointer" --prefix=/path/to/install/dir
make
make install
```

Then run the above binary and use memleak to check for memory leaks again. **Note that -O is used here to pass the path of the libtcmalloc.so dynamic library to memleak.** The parameter value is stored in obj and used in attach_uprobe to specify the binary object to attach uprobes or uretprobes to, which can be the library path or executable file of the function to be traced. For detailed documentation, refer to [bcc: 4. attach_uprobe](https://github.com/iovisor/bcc/blob/master/docs/reference_guide.md#4-attach_uprobe). For example, the following call method:

```python
# Set a breakpoint at the entry of the getaddrinfo function in libc. When entering the function, it will call the custom do_entry function
b.attach_uprobe(name="c", sym="getaddrinfo", fn_name="do_entry")
```

Note that in the previous example, -O was not specified, so the default was "c", which means using libc for memory allocation. When using the tcmalloc dynamic library, `attach_uprobe` and `attach_uretprobe` must specify the library path:

```python
bpf.attach_uprobe(name=obj, sym=sym, fn_name=fn_prefix + "_enter", pid=pid)
bpf.attach_uretprobe(name=obj, sym=sym, fn_name=fn_prefix + "_exit", pid=pid)
```

However, the tool's output is a bit surprising, as it **doesn't output any leaking stack**:

```shell
$ memleak -p $(pgrep main) --combined-only -O /usr/local/lib/libtcmalloc.so
Attaching to pid 1409827, Ctrl+C to quit.
[19:55:45] Top 10 stacks with outstanding allocations:

[19:55:50] Top 10 stacks with outstanding allocations:
```

The memory allocated by new is clearly not being released, **so why can't the eBPF tool detect it**?

### Deep Dive into Tool Implementation

Before guessing the reason, let's take a closer look at the [code of the memleak tool](https://github.com/iovisor/bcc/blob/master/tools/memleak.py) and fully understand the tool's implementation principle. First, we can be clear that the final output of the tool is **each call stack and its leaked memory amount**. To get this result, eBPF **sets breakpoints at both memory allocation and deallocation, records the memory allocation/deallocation amount of the current call stack**, and then performs statistics. The core logic is as follows:

1. `gen_alloc_enter`: Set breakpoints (`attach_uprobe`) at various memory allocation points, such as the entry of malloc, cmalloc, realloc, and other functions (malloc_enter), get the current call stack ID and the size of allocated memory, and record them in a dictionary named sizes;
2. `gen_alloc_exit2`: Set breakpoints (`attach_uretprobe`) at the exit of memory allocation functions (malloc_exit), get the starting address of this memory allocation, and at the same time get the size of allocated memory from the sizes field, record (address, stack_info) in the allocs dictionary; meanwhile, use `update_statistics_add` to update the final result dictionary combined_allocs, storing stack information and allocated memory size, count information;
3. `gen_free_enter`: Set breakpoints at the entry of memory deallocation functions (gen_free_enter), get the corresponding stack information from the previous allocs dictionary based on the starting address of the memory to be freed, then use `update_statistics_del` to update the result dictionary combined_allocs, that is, in the statistics, subtract the total memory allocation and count of the current stack.

### GDB Stack Tracing

Now back to the previous question, why can't the memory allocated by new through tcmalloc be counted? There's a high possibility that the underlying functions for allocating and freeing memory in tcmalloc are not malloc/free, and are not within the functions where the memleak tool sets probes. So how do we know the memory allocation call chain in the previous example code? A simple method is to use GDB debugging to trace. Note that when compiling the tcmalloc library, include debug information, as follows:

```shell
$ ./configure CXXFLAGS="-g -fno-omit-frame-pointer" CFLAGS="-g -fno-omit-frame-pointer"
```

After compilation, you can use objdump to view the header information of the ELF file and the list of each section to verify if there is debug information in the dynamic library, as follows:

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

Then recompile the binary with the debug version of the dynamic library, use gdb to trace into the internal of the new operator, and get the result as shown in the following figure. We can see that indeed the malloc function is not called.

![Function calls corresponding to tcmalloc new operator](https://slefboot-1251736664.file.myqcloud.com/20231106_memory_leak_ebpf_tcmalloc_gdb.png)

In fact, tcmalloc's memory allocation strategy is quite complex, with various pre-allocated memory lists inside. When requesting memory spaces of different sizes, there are many strategies to choose the appropriate memory address.

## Normal Memory Leak Analysis

In the previous examples, whether using glibc or tcmalloc, when using new to allocate memory, the analysis results obtained by memleak were not perfect. This is because using eBPF to analyze memory leaks must meet two prerequisites:

1. When compiling the binary, include the frame pointer. If there are dependencies on standard libraries or third-party libraries, they must also include frame pointers;
2. The actual memory allocation function must be within the functions where the tool sets probes, such as malloc, cmalloc, realloc, etc.

So let's look at the memory leak analysis results after satisfying these two conditions. Modify the memory allocation code in leak_lib.cpp above:

```cpp
// int* p = new int[arrSize];
int* p = (int*)malloc(arrSize * sizeof(int));
```

Then recompile and run the program. Now memleak can get **the complete call stack information**, as follows:

```shell
$ g++ main.cpp leak_lib.cpp -o main -fno-omit-frame-pointer -g
# run main binary here

$ memleak -p $(pgrep main) --combined-only
Attaching to pid 2025595, Ctrl+C to quit.
[10:21:09] Top 10 stacks with outstanding allocations:
	200 bytes in 5 allocations from stack
		LeakLib::slowMemoryLeak()+0x20 [main]
		caller()+0x31 [main]
		main+0x31 [main]
		__libc_start_call_main+0x7a [libc.so.6]
[10:21:14] Top 10 stacks with outstanding allocations:
	400 bytes in 10 allocations from stack
		LeakLib::slowMemoryLeak()+0x20 [main]
		caller()+0x31 [main]
		main+0x31 [main]
		__libc_start_call_main+0x7a [libc.so.6]
```

If tcmalloc is used when allocating memory, it's also possible to get the complete leak stack.

## Memory Flame Graph Visualization

In my previous article [Frame Pointer Retention and eBPF Performance Analysis in Complex C++ Projects](https://selfboot.cn/2023/10/17/c++_frame_pointer/), when using BCC tools for CPU profiling, we could use [FlameGraph](https://github.com/brendangregg/FlameGraph/tree/master) to convert the output results into a CPU flame graph, clearly identifying the hot spots in CPU usage. For memory leaks, we can similarly generate **memory flame graphs**.

The steps to generate a memory flame graph are similar to those for CPU. First, use a collection tool like a BCC script to collect data, then convert the collected data into a format that FlameGraph can understand, and finally use the FlameGraph script to generate an SVG image from the converted data. **Each function call corresponds to a block in the image, with the width of the block representing the frequency of that function in the samples, thus identifying resource usage hotspots**. The format of each line of data that FlameGraph recognizes is typically as follows:

```shell
[Stack trace] [Sample value]
main;foo;bar 58
```

Here, the "**stack trace**" refers to a snapshot of the function call stack, usually a semicolon-separated list of function names representing the path from the bottom of the call stack (usually the main function or the thread's starting point) to the top (the currently executing function). The "sample value" could be CPU time spent on that call stack, memory usage, or other resource metrics. For memory leak analysis, **the sample value can be the amount of memory leaked or the number of memory leak occurrences**.

Unfortunately, the current memleak doesn't support generating data formats that can be converted into flame graphs. However, this is not difficult to modify. [PR 4766](https://github.com/iovisor/bcc/pull/4766) has implemented a simple version. Let's use the code in this PR as an example to generate a memory leak flame graph.

![Modified memleak generates collection files supporting flame graph format](https://slefboot-1251736664.file.myqcloud.com/20231108_memory_leak_ebpf_memleak_svg.png)

As you can see, the collection file generated here is very simple, in the format mentioned above:

```shell
__libc_start_call_main+0x7a [libc.so.6];main+0x31 [main];caller()+0x31 [main];LeakLib::slowMemoryLeak()+0x20 [main] 480
```

Finally, use the FlameGraph script to generate a flame graph, as follows:

![Memory leak flame graph generated from the collection file](https://slefboot-1251736664.file.myqcloud.com/20231108_memory_leak_ebpf_memleak_demo.svg)

## Enabling Frame Pointers by Default

At the end of the article, let's address a controversial topic we left earlier: whether to enable frame pointers by default during compilation. We know that eBPF tools rely on frame pointers to perform call stack tracing. In fact, there are several methods for stack tracing, such as:

- [DWARF](https://dwarfstd.org/): Adds stack information to debug information, allowing for tracing without frame pointers, but the downside is poor performance as stack information needs to be copied to user space for tracing;
- [ORC](https://www.kernel.org/doc/html/v5.3/x86/orc-unwinder.html): A format created in the kernel for unwinding the stack, with the same purpose as DWARF but much simpler. **It cannot be used in user space**;
- [CTF Frame](https://sourceware.org/pipermail/binutils/2022-June/121478.html): A new format that is more compact than eh_frame, unwinds the stack faster, and is easier to implement. It's still in development, and it's uncertain when it will be available for use.

So if you want to **get complete stack information with relatively low overhead, frame pointers are currently the best method**. If frame pointers are so good, why aren't they enabled by default in some places? In the Linux Fedora distribution community, whether to enable this option by default sparked intense discussion. Eventually, a consensus was reached that in Fedora Linux 38, all libraries would be compiled with -fno-omit-frame-pointer by default. For detailed process, see [Fedora wiki: Changes/fno-omit-frame-pointer](https://fedoraproject.org/wiki/Changes/fno-omit-frame-pointer).

The wiki above has a **performance benchmark** on the impact of enabling frame pointers. The results show:

- Kernels compiled with GCC using frame pointers are 2.4% slower;
- Building libraries like openssl/botan/zstd with frame pointers didn't have a significant impact;
- For CPython's benchmark tests, the performance impact is between 1-10%;
- Redis benchmark tests showed virtually no performance impact;

Of course, it's not just the Fedora community that tends to enable this by default. Famous performance optimization expert [Brendan Gregg](https://www.brendangregg.com/) suggested in a [presentation](https://www.brendangregg.com/Slides/SCALE2015_Linux_perf_profiling.pdf) that -fno-omit-frame-pointer should be set as the **default compilation option** in gcc:

> • Once upon a time, x86 had fewer registers, and the frame pointer register was reused for general purpose to improve performance. This breaks system stack walking.
> • gcc provides -fno-omit-frame-pointer to fix this – **Please make this the default in gcc!** 

Additionally, in [a paper about DWARF unwinding](https://inria.hal.science/hal-02297690/document), it's mentioned that a Google developer shared that Google's core code is compiled with frame pointers.

## Reference Articles

[Exploration of General Analysis Methods for Memory Leaks (Growth) Based on eBPF](https://zhuanlan.zhihu.com/p/652850051)  
[Memory Leak (and Growth) Flame Graphs](https://www.brendangregg.com/FlameGraphs/memoryflamegraphs.html)
[DWARF-based Stack Walking Using eBPF](https://www.polarsignals.com/blog/posts/2022/11/29/dwarf-based-stack-walking-using-ebpf)
[Trace all functions in program with bpftrace](https://www.reddit.com/r/linuxquestions/comments/piq9tx/trace_all_functions_in_program_with_bpftrace/)
[Using BPF Tools: Chasing a Memory Leak](https://github.com/goldshtn/linux-tracing-workshop/blob/master/bpf-memleak.md)
[TCMalloc Overview](https://google.github.io/tcmalloc/overview.html)