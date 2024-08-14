---
title: LevelDB 源码阅读：读写 WAL 日志保证持久性
tags:
  - C++
  - LevelDB
category: 源码剖析
toc: true
mathjax: true
date: 2024-08-14 21:05:31
description: 探讨 LevelDB 的WAL（Write-Ahead Logging）日志读写接口。详细分析 WAL日志的写入过程，包括数据切分、记录格式和存储方式，同时阐述了日志读取的复杂逻辑，如何处理跨块记录和异常情况。还展示了相关的测试用例，验证WAL日志在各种场景下的正确性。
---

LevelDB 使用 WAL（Write-Ahead Logging）日志来确保数据的持久性。当写入操作发生时，LevelDB 首先将数据写入到日志文件中，然后再应用到内存中的数据结构（如 MemTable）。系统或数据库崩溃后重新启动时，LevelDB 会检查 WAL 日志文件中的记录。通过读取并重放这些日志记录，LevelDB 可以重建那些在崩溃发生时还未被完全写入磁盘的数据状态。

![LevelDB WAL 日志写入流程](https://slefboot-1251736664.file.myqcloud.com/20240723_leveldb_source_wal_log_cover.svg)

整个 WAL 日志相关的操作流程如下：

1. LevelDB首先将数据写入WAL日志。确保即使在系统崩溃的情况下，数据也不会丢失。
2. 数据被写入内存中的MemTable，这个是内存操作，很快。
3. LevelDB向客户端确认写入完成。
4. 随着时间推移，当MemTable满了之后，它会被刷新到磁盘上的SSTable文件中。
5. 一旦MemTable被成功刷新到SSTable，相应的WAL日志就可以被清除了。

接下来详细看看这里的实现。

<!-- more -->

## 写 WAL 日志

先来看看 LevelDB 是如何写 WAL 日志的。在 LevelDB 中，[db/log_writer.h](https://github.com/google/leveldb/blob/main/db/log_writer.h) 中定义了个 Writer 类，用于写入 WAL 日志文件。Writer 类的主要方法是 `AddRecord`，用于将一个记录追加到日志文件中。主要的数据成员是 `WritableFile* dest_;`，指向支持追加写的日志文件。这里 WritableFile 是 [include/leveldb/env.h](https://github.com/google/leveldb/blob/main/include/leveldb/env.h#L277) 中定义的抽象类接口，用于封装顺序写文件的操作，具体接口和实现可以参考 [LevelDB 源码阅读：Posix 文件操作接口实现细节](https://selfboot.cn/2024/08/02/leveldb_source_env_posixfile/#%E9%A1%BA%E5%BA%8F%E5%86%99%E6%96%87%E4%BB%B6)。

WAL 日志写入的主要实现在 [db/log_writer.cc](https://github.com/google/leveldb/blob/main/db/log_writer.cc) 文件中，整体流程比较清晰。AddRecord 方法处理不同大小的数据，确保它们按照正确的格式和类型进行切分，然后调用 [EmitPhysicalRecord](https://github.com/google/leveldb/blob/main/db/log_writer.cc#L82) 设置头部，存储单条记录。

### 单条记录存储格式

单条记录存储格式比较清晰，EmitPhysicalRecord 中有完整的实现。每条记录由 2 部分组成：**7 字节固定长度**的 Header以及长度不定的 Data 部分。Header 部分包括 1 字节的记录类型、2 字节的记录长度和 4 字节的校验码。其中：

- Record Type：记录类型，标识是完整记录、第一部分、中间部分还是最后部分。
- Length：单条记录长度，指的是数据部分的长度，不包括头部的长度。单条记录长度最长为 kBlockSize - kHeaderSize，用 2 个字节表达足够了。
- CRC32：循环冗余校验码，用于检查数据在存储或传输过程中是否发生了更改。

如下图；

```shell
+-----------------+--------------------------------------------------+
|     Header      |                     Data/Payload                  |
+-----------------+--------------------------------------------------+
| Record Type (1B)| Actual data written by the application...         |
| Length (2B)     |                                                  |
| CRC (4B)        |                                                  |
+-----------------+--------------------------------------------------+
```

写单条记录的实现如下，首先计算头部各个字段的值，然后将头部和数据部分写入到日志文件中。

```cpp
Status Writer::EmitPhysicalRecord(RecordType t, const char* ptr,
                                  size_t length) {
  // Format the header
  char buf[kHeaderSize];
  buf[4] = static_cast<char>(length & 0xff);
  buf[5] = static_cast<char>(length >> 8);
  buf[6] = static_cast<char>(t);
  // Compute the crc of the record type and the payload.
  uint32_t crc = crc32c::Extend(type_crc_[t], ptr, length);
  crc = crc32c::Mask(crc);  // Adjust for storage
  EncodeFixed32(buf, crc);

  // Write the header and the payload
  Status s = dest_->Append(Slice(buf, kHeaderSize));
  if (s.ok()) {
    s = dest_->Append(Slice(ptr, length));
    if (s.ok()) {
      s = dest_->Flush();
    }
  }
  block_offset_ += kHeaderSize + length;
  return s;
}
```

这里计算 CRC32 的时候，用了`type_crc_[t]`，这个数组是在 Writer 的构造函数中用 InitTypeCrc 函数来进行初始化，这样可以提高计算效率，避免在每次写入记录时都重新计算 CRC32 校验码。如果没有初始化 type_crc_ 数组，其实也可以使用 `crc32c::Extend(0, ptr, length)` 来计算 CRC 校验码。不过这样的话，只计算了数据部分的 CRC 校验码，而没有考虑**记录类型**。用 type_crc_ 的话，把记录类型作为 crc32 计算的初始值，这样同样的内容，如果类型不同，计算出的 crc32 也不同。

这里提到了记录类型，代码中还记录了一个 `block_offset_`，这些又是做什么用的呢？这就是 AddRecord 中做的**数据切分逻辑**了。

### 数据切分记录

**在写数据的时候，如果单条数据太大，LevelDB 会将数据进行切分，分为多条记录，然后来一点点写入**。经过切分后，一条数据可能就会包含多条记录，因此需要设计好**记录组织格式**，以便在读取时能够正确地重建完整的数据。这里 LevelDB 的做法比较直接，每条记录增加一个记录类型，用于标识是完整记录、第一部分、中间部分还是最后部分。这样在读取时，只要按照记录类型的顺序组装数据即可。这样一条数据可能分下面几种切分情况：

```shell
first(R1), middle(R1), middle(R1), ..., last(R1)
first(R2), last(R2)
full(R3)
```

这里的 first、middle、last 和 full 分别表示记录的类型。所有的记录都放在**逻辑块**中，逻辑块的大小是 kBlockSize（32768=32KB），这个值在 [db/log_format.h](https://github.com/google/leveldb/blob/main/db/log_format.h#L27) 中定义。在切分数据的时候会保证，**单条记录不跨越逻辑块**。整体切分记录的逻辑在 AddRecord 中实现，主要是根据数据的大小，当前逻辑块剩余空间，然后判断是否需要切分。对于需要切分的场景，将数据切分记录，设置好正确的记录类型，然后调用 EmitPhysicalRecord 逐条写入。核心代码如下，去掉了部分注释和 assert 校验逻辑。

```cpp
Status Writer::AddRecord(const Slice& slice) {
  const char* ptr = slice.data();
  size_t left = slice.size();

  Status s;
  bool begin = true;
  do {
    const int leftover = kBlockSize - block_offset_;
    if (leftover < kHeaderSize) {
      // Switch to a new block
      if (leftover > 0) {
        // Fill the trailer (literal below relies on kHeaderSize being 7)
        static_assert(kHeaderSize == 7, "");
        dest_->Append(Slice("\x00\x00\x00\x00\x00\x00", leftover));
      }
      block_offset_ = 0;
    }

    const size_t avail = kBlockSize - block_offset_ - kHeaderSize;
    const size_t fragment_length = (left < avail) ? left : avail;
    RecordType type;
    const bool end = (left == fragment_length);
    if (begin && end) {
      type = kFullType;
    } else if (begin) {
      type = kFirstType;
    } else if (end) {
      type = kLastType;
    } else {
      type = kMiddleType;
    }

    s = EmitPhysicalRecord(type, ptr, fragment_length);
    ptr += fragment_length;
    left -= fragment_length;
    begin = false;
  } while (s.ok() && left > 0);
  return s;
}
```

注意对于长度为 0 的数据，这里也会写入一条记录，记录类型为 fulltype，记录只含有头部，没有数据部分，有测试用例专门来验证这种情况。另外注意如果写入一些记录后，当前逻辑块剩余空间小于 7，不足以写入 Header，则会用 `\x00` 填充剩余空间，然后切换到下一个逻辑块。

这里**判断当前记录类型的实现比较聪明**，只需要维护两个标志 begin 和 end。刚开始写入数据的时候，begin 为 true，写入一条记录后，就更新 begin 为 false。end 的更新则是根据剩余数据长度是否为 0 来判断。然后根据 begin 和 end 的值，就可以确定当前记录的类型了。注意这里 if else 的顺序也很关键，即是 begin 又是 end 的说明是 kFullType 的记录；接着如果只是 begin，就是 kFirstType；如果只是 end，就是 kLastType，其他情况就是 kMiddleType。

这里有个设计值得思考下，**切分记录的时候，为什么不跨逻辑块**？其实如果看后面读取 WAL 日志部分代码，就会发现这样设计后可以按块进行读取。**每个块内的记录都是完整的，这意味着不需要处理跨块的记录，大大简化了读取逻辑**。另外，如果某个块损坏，只会影响该块内的记录，不会影响其他块的记录。

至此，将数据写入 WAL 日志文件的流程就介绍完了。下面我们来看看如何读取 WAL 日志文件。

## 读 WAL 日志

相比把数据切分记录然后写日志文件，读取日志并重构数据的逻辑稍微复杂一些。[db/log_reader.h](https://github.com/google/leveldb/blob/main/db/log_reader.h#L20) 中定义了 Reader 类，用于从日志文件中读取数据。Reader 中主要的数据成员是 `SequentialFile* const file_;`，指向**支持顺序读取的日志文件**。和 WritableFile 类似，SequentialFile 也是在 include/leveldb/env.h 中定义的抽象类接口，封装了文件系统的顺序读取操作，具体接口和实现可以参考 [LevelDB 源码阅读：Posix 文件操作接口实现细节](https://selfboot.cn/2024/08/02/leveldb_source_env_posixfile/#%E9%A1%BA%E5%BA%8F%E8%AF%BB%E6%96%87%E4%BB%B6)。

Reader 类的主要方法是 `ReadRecord`，用于读取一条完整的数据，可以多次调用，顺序读取出所有的数据。读取过程如果发生一些意外数据，比如记录长度不合法、CRC 校验失败等，可以用 Reader 中定义的 Reporter 接口来记录错误信息。此外，Reader 还支持跳过文件中一定长度的数据，用于恢复数据时跳过已经读取过的数据。完整的实现在 [db/log_reader.cc](https://github.com/google/leveldb/blob/main/db/log_reader.cc) 中，下面详细看看。

### 跳过开头数据

Reader 中有一个 last_record_offset_ 记录当前读取到的最新一条完整数据的偏移量，初始化为 0。后续每次读取到 kFullType 或者 kLastType 类型的记录时，会更新这个值。在 ReadRecord 入口处，先判断 last_record_offset_ 和 initial_offset_ 的大小，这里 initial_offset_ 在构造时传入，用于指定跳过读取的数据长度。如果 last_record_offset_ 小于 initial_offset_，则需要跳过文件中开始的 initial_offset_ 部分。这里跳过开头部分的实现如下：

```cpp
// db/log_reader.cc
bool Reader::SkipToInitialBlock() {
  const size_t offset_in_block = initial_offset_ % kBlockSize;
  uint64_t block_start_location = initial_offset_ - offset_in_block;

  // Don't search a block if we'd be in the trailer
  if (offset_in_block > kBlockSize - 6) {
    block_start_location += kBlockSize;
  }
  end_of_buffer_offset_ = block_start_location;
  // Skip to start of first block that can contain the initial record
  if (block_start_location > 0) {
    Status skip_status = file_->Skip(block_start_location);
    if (!skip_status.ok()) {
      ReportDrop(block_start_location, skip_status);
      return false;
    }
  }

  return true;
}
```

这里有个特殊的情况，如果 initial_offset_ 恰好位于一个逻辑块的末尾，这时候需要跳过这整个逻辑块。判断是否处于逻辑块的末尾比较简单，直接拿 initial_offset_ 取模逻辑块的大小(32kb)，如果剩余部分刚好在逻辑块的最后 6 个字节内，则说明处于逻辑块的尾部。注意这里跳的时候，只会跳过整个逻辑块，只保证了从 initial_offset_ 所在的**逻辑块头部**开始读取。可能导致读取到的第一条记录的偏移量小于 initial_offset_，这种情况在后面的 ReadPhysicalRecord 中会处理。

### 解析一条完整数据

ReadRecord 用于从日志文件中读取一条完整的数据，这里的完整数据可能包括多条记录，要把每一条都读出来然后拼接。

首先用 **in_fragmented_record** 来标记目前是否处于一个**拆分的记录**中，初始化为 false。然后进入一个 while 循环，不断调用 ReadPhysicalRecord 读取出记录，保存在 fragment 中，然后根据记录类型进行处理。注意这里有一个 `resyncing_`，在初始化的时候，如果有需要跳过的数据(initial_offset_>0)，则会设置为 true，表示当前处于跳过数据的状态。在这种状态下，只要读取到 kFullType 类型的记录，就会更新 resyncing_ 为 false，表示跳过数据结束，开始正常读取数据。

读取数据部分，会根据当前记录的类型来判断是否需要拼接数据。

- 如果是 kFullType 类型，说明这是一条完整的数据，直接将 fragment 设置为 result，更新 last_record_offset_；
- 如果是 kFirstType 类型，说明这是一条新的数据，将这条记录保存在 scratch 中，设置 in_fragmented_record 为 true；
- 如果是 kMiddleType 类型，说明这是一个数据的中间部分，in_fragmented_record 此时必须为 true，否则就报告错误。这时候 scratch 继续拼接新的记录。
- 如果是 kLastType 类型，说明这是一个数据的最后部分，in_fragmented_record 此时必须为 true，否则就报告错误。将最后部分的 fragment 拼接在 scratch 中，然后将 scratch 设置为 result，更新 last_record_offset_ 后返回。

接着其实还有其他记录类型，比如 kEof 和 kBadRecord，这些都是异常情况，需要特殊处理。ReadRecord 核心逻辑如下，忽略掉部分错误处理的代码：

```cpp
// db/log_reader.cc
bool Reader::ReadRecord(Slice* record, std::string* scratch) {
  // ...
  scratch->clear();
  record->clear();
  bool in_fragmented_record = false;
  Slice fragment;
  while (true) {
    const unsigned int record_type = ReadPhysicalRecord(&fragment);
    if (resyncing_) {
        // ...
    }

    switch (record_type) {
      case kFullType:
        // ...
        *record = fragment;
        last_record_offset_ = prospective_record_offset;
        return true;
      case kFirstType:
        // ...
        scratch->assign(fragment.data(), fragment.size());
        in_fragmented_record = true;
        break;

      case kMiddleType:
        if (!in_fragmented_record) {
          ReportCorruption(fragment.size(),
                           "missing start of fragmented record(1)");
        } else {
          scratch->append(fragment.data(), fragment.size());
        }
        break;

      case kLastType:
        if (!in_fragmented_record) {
          ReportCorruption(fragment.size(),
                           "missing start of fragmented record(2)");
        } else {
          scratch->append(fragment.data(), fragment.size());
          *record = Slice(*scratch);
          last_record_offset_ = prospective_record_offset;
          return true;
        }
        break;
        // ...
    }
  }
  return false;
}
```


### 读取单个逻辑块

ReadPhysicalRecord **封装了从逻辑块提取记录的过程**。一个逻辑块的大小是 kBlockSize=32KB，这个值在 [db/log_format.h](https://github.com/google/leveldb/blob/main/db/log_format.h#L27) 中定义。我们从磁盘读取文件的时候，**以逻辑块为最小读取单元**，读出来后缓存在内存中，然后逐条解析记录。这里最外层是一个 while 循环，首先判断 buffer_ 的大小，如果 buffer_ 中的数据不足以解析出一条记录(长度小于 kHeaderSize)，则从文件中读取一个逻辑块的数据到 buffer_ 中。

- 如果从文件读取出来的长度小于 kBlockSize，说明读到了文件末尾，则设置 eof_ 为 true，然后继续进来循环，清空 buffer_ 中的数据，然后返回 kEof。
- 如果读文件出错，用 ReportDrop 报告读失败，清理 buffer_，设置 eof_ 为 true，然后直接返回 kEof。 
- 如果成功读取到 kBlockSize 的内容到 buffer_ ，则接着开始解析记录。

当然，一个逻辑块 Block 中可能有多条记录，每次解析一条后 ReadPhysicalRecord 就会返回。这里返回前会更新 buffer_ 的指针，指向下一条记录的开始位置。下次重新进入 ReadPhysicalRecord 后，判断 buffer_ 中还有记录(长度大于 kHeaderSize)，则不会从文件读取，直接接着上次的位置从 buffer_ 中解析。

具体解析记录的代码和上面写记录的相反，先从 Header 中解析长度，crc32 等信息，然后把记录数据保存在 result 中，接着更新 buffer_ 的数据，指向下一条记录的开始位置。

```cpp
// db/log_reader.cc
unsigned int Reader::ReadPhysicalRecord(Slice* result) {
  while (true) {
    if (buffer_.size() < kHeaderSize) {
        // ...
    }
    // ...
    const char* header = buffer_.data();
    const uint32_t a = static_cast<uint32_t>(header[4]) & 0xff;
    const uint32_t b = static_cast<uint32_t>(header[5]) & 0xff;
    const unsigned int type = header[6];
    const uint32_t length = a | (b << 8);

    // ...
    buffer_.remove_prefix(kHeaderSize + length);    // 指向下一条记录的开始位置
    // ...
    *result = Slice(header + kHeaderSize, length);
    return type;
  }
```

上面代码注释了一些异常处理部分逻辑，比如记录长度不合法，CRC 校验失败。这里的异常处理主要是通过 Reporter 接口来记录错误信息，然后清空 buffer_。这样即使在读取过程中发生了一些异常，最多只影响当前 buffer_ 解析，不会影响后续逻辑块的读取和解析。

还有一种异常是**当前记录位于跳过的 initial_offset_ 范围内**，这是因为前面我们跳过的时候，只跳过整个逻辑块，保证从 initial_offset_ **所在的逻辑块头部**开始读。如果当前记录的偏移量小于 initial_offset_，则说明这条记录是需要跳过的，调整 buffer_ 的开始部分，然后返回 kBadRecord。

## WAL 读写测试

[db/log_test.cc](https://github.com/google/leveldb/blob/main/db/log_test.cc) 中提供了一些工具辅助类和函数，以及详细的测试用例，来完整测试这里的 WAL 日志读写。比如用 BigString 生成指定长度的字符串，LogTest 类封装了 Reader 和 Writer 的读写逻辑，暴露了方便测试的接口，比如 Write、ShrinkSize、Read 等。此外这里没有直接读取文件，而是自己实现了 StringSource 类，继承自 SequentialFile，用 string 模拟读文件。实现了 StringDest 类，继承自 WritableFile，也是用 string 模拟写文件。

下面是一些正常读写的测试 case：

- Empty：测试直接读空文件，返回 EOF。
- ReadWrite：测试简单的写入和读取，确保写入的数据能够正确读取。这里写入了一个空字符串，也是能正常读出来。
- ManyBlocks：测试写入大量不同长度字符串，占用多个逻辑块。然后逐条读取，确保能够正确读取。
- Fragmentation：测试写入超大的字符串，每条数据需要占用多条记录。然后逐条读取，确保能够正确读取。

此外还构造了一些异常情况的测试 case，比如 TruncatedTrailingRecordIsIgnored 在 LevelDB 的日志系统中用于验证对**日志文件末尾被截断的记录**的处理。当日志文件的最后一个记录未能完整写入（例如，由于系统崩溃或者其他写入中断事件）时，这个不完整的记录会被忽略而不是被视为一个错误。

```cpp
TEST_F(LogTest, TruncatedTrailingRecordIsIgnored) {
  Write("foo");
  ShrinkSize(4);  // Drop all payload as well as a header byte
  ASSERT_EQ("EOF", Read());
  // Truncated last record is ignored, not treated as an error.
  ASSERT_EQ(0, DroppedBytes());
  ASSERT_EQ("", ReportMessage());
}
```

BadLength 用来验证在处理记录长度字段被破坏（corrupted）的情况下的行为。测试确保日志系统能正确识别并且忽略由于**记录长度字段错误导致的不合法记录**，同时能够继续读取之后的有效记录，并且报告适当的错误信息。

```cpp
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

这里用 IncrementByte 把第 4 个字节地方的值加 1，该位置存储的是记录的长度信息，因此导致记录长度增加。在读取的时候，会发现记录长度不合法，然后报告错误信息。校验长度部分逻辑在 ReadPhysicalRecord 中，如下：

```cpp
    if (kHeaderSize + length > buffer_.size()) {
      size_t drop_size = buffer_.size();
      buffer_.clear();
      if (!eof_) {
        ReportCorruption(drop_size, "bad record length");
        return kBadRecord;
      }
      return kEof;
    }
```

此外，还构造了大量的测试 case，用来验证初始跳过长度。这里封装了一个函数 CheckInitialOffsetRecord，来验证初始跳过长度的记录是否被正确跳过。这个函数会写入一些记录，然后设置 initial_offset_ 来读取记录，验证是否跳过了 initial_offset_ 长度的记录。

通过大量的测试用例，保证了 WAL 日志的读写逻辑的正确性。这里的测试用例也是非常值得学习的，可以帮助我们更好地理解 WAL 日志的读写逻辑。