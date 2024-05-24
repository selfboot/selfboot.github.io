---
title: LevelDB 源码阅读：读写 WAL 日志保证持久性
tags: [C++, LevalDB]
category: 源码剖析
toc: true
date: 
mathjax: true
description:
---


LevelDB 使用 WAL（Write-Ahead Logging）机制来确保数据的持久性和一致性。当写入操作发生时，LevelDB 首先将数据写入到日志文件中，然后再应用到内存中的数据结构（如 MemTable）。这确保了在发生故障时，任何已经写入日志的数据都可以从日志文件恢复，即使它们还没有被持久化到磁盘的 SSTables 中。