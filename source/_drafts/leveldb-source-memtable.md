---
title: LevelDB 源码阅读：MemTable 内存表的实现细节
tags: [C++, LevalDB]
category: 源码剖析
toc: true
description: 
---

MemTable 的主要作用是存储最近写入的数据。在 LevelDB 中，所有的写操作首先都会被记录到一个 Write-Ahead Log（WAL，预写日志）中，以确保持久性，然后数据会被存储在 MemTable 中。当 MemTable 达到一定的大小阈值后，它会被转换为一个不可变的 Immutable MemTable，并且一个新的 MemTable 会被创建来接收新的写入。此时会触发一个后台过程将其写入磁盘形成 SSTable。这个过程中，一个新的 MemTable 被创建来接受新的写入操作。这样可以保证写入操作的连续性，不受到影响。
