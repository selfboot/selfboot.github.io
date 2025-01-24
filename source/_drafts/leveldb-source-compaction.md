---
title: LevelDB 源码阅读：Compaction 的时机和方法
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
---


在 LevelDB 中，compaction 是一个重要的过程，用于优化数据库的存储结构和提高数据访问效率。LevelDB 使用分层的存储结构，通常包括多个层级（默认最多是 7 层），每个层级包含多个 SST（Sorted String Table）文件。Compaction 主要发生在这些层级之间，有两种类型：Minor Compaction 和 Major Compaction。


## Minor Compaction
Minor Compaction 主要涉及将 MemTable 转换成 SST 文件，并将其写入到最低的层级（通常是 Level 0）。这个过程发生在 MemTable 填满后。Level 0 的特点是文件之间可能会有重叠，这是因为新生成的 SST 文件直接从 MemTable 转换来，未进行合并或排序。

## Major Compaction

Major Compaction 涉及将一个层级的文件与下一个层级的文件合并，通常从 Level 0 开始向下进行。LevelDB 的层级结构设计是为了减少读放大、写放大和空间放大：

- Level 0：包含多个可能重叠的 SST 文件。
- Level 1 及以上：每个层级的文件不与同层的其他文件重叠，但可能与下一层级的文件重叠。随着层级的增加，每个层级的数据容量通常呈指数增长。

在执行 Major Compaction 时，选择某个层级的一个或多个文件，将这些文件与下一层级的可能重叠的文件合并。合并过程中，删除过期的键版本，只保留最新的数据，同时解决键的重叠问题，最终生成新的 SST 文件放入更低的层级。

Compaction 的触发原因和目标：

- 容量触发：当某层级的数据总量超过预定阈值时。
- 性能优化：减少数据访问时的读放大，提高查询效率。
- 空间回收：删除过时的数据版本，优化存储利用率。



## Compaction 机制


当存在未完成的压缩任务或 Level 0 文件过多时，写操作会通过调用 background_work_finished_signal_.Wait() 进入等待状态。这里的等待是为了防止新的写入操作进一步加剧存储压力

等待的触发条件：
1. MemTable 已满，Immutable MemTable (imm_) 正在压缩：当前活动的 MemTable 已经达到其容量上限并转换为 Immutable MemTable，但由于上一个 Immutable MemTable 还没有完成压缩转换为 SST 文件，新的写入操作必须等待。
2. Level 0 文件过多：LevelDB 设有阈值 (config::kL0_StopWritesTrigger)，用于限制 Level 0 SST 文件的数量。如果文件数量达到此阈值，将阻止进一步的写入以避免过度压缩和性能下降。

当后台压缩任务完成后，它将触发 background_work_finished_signal_ 的信号。完成压缩意味着已经有一个或多个 Immutable MemTable 被成功转换为 SST 文件，并从内存中清除，从而为新的写入操作腾出空间。类似地，当 Level 0 的 SST 文件数量通过压缩减少到安全的水平以下时，后台进程也会触发等待信号，允许被阻塞的写操作继续执行。

如果压缩过程出现问题（例如因为 I/O 错误、资源限制或程序错误而卡住），那么依赖 background_work_finished_signal_ 的写操作将会继续等待，**直到收到唤醒信号**。在实际的系统运行中，这种情况需要通过适当的监控和故障处理机制来识别和解决，例如通过日志监控、错误报告以及可能的手动干预或系统重启。
