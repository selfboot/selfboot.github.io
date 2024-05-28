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


系统或数据库崩溃后重新启动时，LevelDB 会检查 WAL 日志文件中的记录。通过读取并重放这些日志记录，LevelDB 可以重建那些在崩溃发生时还未被完全写入磁盘的数据状态。Writer 类通常用于写入 WAL（Write-Ahead Logging）日志文件。


```c++
// db/log_writer.h

```


## WAL 日志测试用例

测试用例 TruncatedTrailingRecordIsIgnored 在 LevelDB 的日志系统中用于验证对**日志文件末尾被截断的记录**的处理。当日志文件的最后一个记录未能完整写入（例如，由于系统崩溃或者其他写入中断事件）时，这个不完整的记录会被忽略而不是被视为一个错误。

```c++
TEST_F(LogTest, TruncatedTrailingRecordIsIgnored) {
  Write("foo");
  ShrinkSize(4);  // Drop all payload as well as a header byte
  ASSERT_EQ("EOF", Read());
  // Truncated last record is ignored, not treated as an error.
  ASSERT_EQ(0, DroppedBytes());
  ASSERT_EQ("", ReportMessage());
}
```

BadLength 用来验证日志读取器在处理记录长度字段被破坏（corrupted）的情况下的行为。测试确保日志系统能正确识别并且忽略由于**记录长度字段错误导致的不合法记录**，同时能够继续读取之后的有效记录，并且报告适当的错误信息。

```c++
TEST_F(LogTest, BadLength) {
  const int kPayloadSize = kBlockSize - kHeaderSize;
  Write(BigString("bar", kPayloadSize));
  Write("foo");
  // Least significant size byte is stored in header[4].
  IncrementByte(4, 1);
  ASSERT_EQ("foo", Read());
  ASSERT_EQ(kBlockSize, DroppedBytes());
  ASSERT_EQ("OK", MatchError("bad record length"));
}
```