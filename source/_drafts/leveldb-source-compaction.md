---
title: LevelDB 源码阅读：Compaction 的时机和方法
tags: [C++, LevalDB]
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