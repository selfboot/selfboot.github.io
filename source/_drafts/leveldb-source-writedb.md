---
title: LevelDB 源码阅读：写操作的详细流程
tags: [C++, LevalDB]
category: 源码剖析
toc: true
description: 
---


当存在未完成的压缩任务或 Level 0 文件过多时，写操作会通过调用 background_work_finished_signal_.Wait() 进入等待状态。这里的等待是为了防止新的写入操作进一步加剧存储压力

等待的触发条件：
1. MemTable 已满，Immutable MemTable (imm_) 正在压缩：当前活动的 MemTable 已经达到其容量上限并转换为 Immutable MemTable，但由于上一个 Immutable MemTable 还没有完成压缩转换为 SST 文件，新的写入操作必须等待。
2. Level 0 文件过多：LevelDB 设有阈值 (config::kL0_StopWritesTrigger)，用于限制 Level 0 SST 文件的数量。如果文件数量达到此阈值，将阻止进一步的写入以避免过度压缩和性能下降。

当后台压缩任务完成后，它将触发 background_work_finished_signal_ 的信号。完成压缩意味着已经有一个或多个 Immutable MemTable 被成功转换为 SST 文件，并从内存中清除，从而为新的写入操作腾出空间。类似地，当 Level 0 的 SST 文件数量通过压缩减少到安全的水平以下时，后台进程也会触发等待信号，允许被阻塞的写操作继续执行。

如果压缩过程出现问题（例如因为 I/O 错误、资源限制或程序错误而卡住），那么依赖 background_work_finished_signal_ 的写操作将会继续等待，**直到收到唤醒信号**。在实际的系统运行中，这种情况需要通过适当的监控和故障处理机制来识别和解决，例如通过日志监控、错误报告以及可能的手动干预或系统重启。

