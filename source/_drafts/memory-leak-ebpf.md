---
title: memory_leak_ebpf
tags:
---



eBPF（Extended Berkeley Packet Filter）主要用于内核跟踪和其他底层任务，可能不总是能准确捕获到用户态应用程序的完整调用堆栈，尤其是当涉及到内存分配（如 malloc）这种由标准库提供的函数时。

如果你的程序或库没有编译帧指针（由 -fno-omit-frame-pointer 选项控制），则 eBPF 工具（如 memleak）可能无法准确地获取调用堆栈。这主要是因为在没有帧指针的情况下，进行堆栈回溯要困难得多。


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