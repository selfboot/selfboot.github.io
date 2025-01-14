---
title: LevelDB 源码阅读：写操作的详细流程
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
date: 2025-01-13
---

读、写是 key-value 数据库中最重要的两个操作，LevelDB 中提供了一个 Put 接口，用于写入 key-value 数据。使用很简单：

```cpp
leveldb::Status status = leveldb::DB::Open(options, "./db", &db);
status = db->Put(leveldb::WriteOptions(), key, value);
```

这里 Put 接口具体做了什么？数据的写入又是如何进行的？LevelDB 又有哪些优化？本文一起来看看。

<!-- more -->

如果一次只写入一个键值对，LevelDB 内部也是通过 WriteBatch 来处理。如果 在高并发情况下，可能会在内部合并多个写操作，然后将这批键值对写入 WAL 并更新到 memtable。

如果想利用批量写入的性能优势，则需要在**应用层聚合这些写入操作**。例如，我们可以设计一个缓冲机制，收集一定时间内的写入请求，然后将它们打包在一个 WriteBatch 中提交。这种方式可以减少对磁盘的写入次数和上下文切换，从而提高性能。


## 


当存在未完成的压缩任务或 Level 0 文件过多时，写操作会通过调用 background_work_finished_signal_.Wait() 进入等待状态。这里的等待是为了防止新的写入操作进一步加剧存储压力

等待的触发条件：
1. MemTable 已满，Immutable MemTable (imm_) 正在压缩：当前活动的 MemTable 已经达到其容量上限并转换为 Immutable MemTable，但由于上一个 Immutable MemTable 还没有完成压缩转换为 SST 文件，新的写入操作必须等待。
2. Level 0 文件过多：LevelDB 设有阈值 (config::kL0_StopWritesTrigger)，用于限制 Level 0 SST 文件的数量。如果文件数量达到此阈值，将阻止进一步的写入以避免过度压缩和性能下降。

当后台压缩任务完成后，它将触发 background_work_finished_signal_ 的信号。完成压缩意味着已经有一个或多个 Immutable MemTable 被成功转换为 SST 文件，并从内存中清除，从而为新的写入操作腾出空间。类似地，当 Level 0 的 SST 文件数量通过压缩减少到安全的水平以下时，后台进程也会触发等待信号，允许被阻塞的写操作继续执行。

如果压缩过程出现问题（例如因为 I/O 错误、资源限制或程序错误而卡住），那么依赖 background_work_finished_signal_ 的写操作将会继续等待，**直到收到唤醒信号**。在实际的系统运行中，这种情况需要通过适当的监控和故障处理机制来识别和解决，例如通过日志监控、错误报告以及可能的手动干预或系统重启。

