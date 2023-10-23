---
title: memory_leak_ebpf
tags:
---



eBPF（Extended Berkeley Packet Filter）主要用于内核跟踪和其他底层任务，可能不总是能准确捕获到用户态应用程序的完整调用堆栈，尤其是当涉及到内存分配（如 malloc）这种由标准库提供的函数时。

如果你的程序或库没有编译帧指针（由 -fno-omit-frame-pointer 选项控制），则 eBPF 工具（如 memleak）可能无法准确地获取调用堆栈。这主要是因为在没有帧指针的情况下，进行堆栈回溯要困难得多。


## 参考文章

[基于 eBPF 的内存泄漏（增长）通用分析方法探索](https://zhuanlan.zhihu.com/p/652850051)
[DWARF-based Stack Walking Using eBPF](https://www.polarsignals.com/blog/posts/2022/11/29/dwarf-based-stack-walking-using-ebpf)