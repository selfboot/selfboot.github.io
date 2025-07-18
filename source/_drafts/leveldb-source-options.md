---
title: LevelDB 源码阅读：全面深入理解 LevelDB 的配置选项
tags: [C++, LevelDB]
category: 源码剖析
toc: true
date: 2025-07-18 21:00:00
description: 全面深入理解 LevelDB 的配置选项，包括内存缓存、压缩、索引、写入和读取等各个方面的配置。通过分析源码，展示了 LevelDB 如何通过这些配置选项来优化性能和资源消耗。
---

LevelDB 的配置选项非常多，包括内存缓存、压缩、索引、写入和读取等各个方面的配置。通过分析源码，展示了 LevelDB 如何通过这些配置选项来优化性能和资源消耗。

## 配置选项

WriteBufferSizeM=512
MemTableBloomSizeRatio=2
ArenaBlockSizeK=1024
SkiplistSegCnt=200000
TableCacheSizeM=2048
BlockCacheSizeM=1024
MaxCacheBlockSizeK=16
BlockSizeK=4
CompressedBlockSizeK=4
BlockRestartInterval=1
BlockAligned=1
UseCompression=1
CompressionLevel=3
UseBloomFilter=1
FullFilter=1
NoFilterLevel=2
NoPrefixFilterLevel=2
NumLevels=5
Level0FileNumCompactionTrigger=2
Level0SlowdownWritesTrigger=12
Level0StopWritesTrigger=20
TargetFileSizeM=100
MaxSizeMForLevelBase=800
MaxBackgroundCompactions=4
PrefixLen=11
DumpSleepMS=10
CompactSleepMS=10
WriteWorkerNum=5
; end level-db config options
CompactionBeginTime=1
CompactionEndTime=6
UpdateIndexSleepMS=100
UpdateIndexBeginTime=0
UpdateIndexEndTime=7
SelectAllRecordCnt=0
SelectAllRecordLimit=60000
SelectAllSizeMLimit=60