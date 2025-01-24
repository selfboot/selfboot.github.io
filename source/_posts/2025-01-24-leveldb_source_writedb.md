---
title: LevelDB 源码阅读：写入键值的工程实现和优化细节
tags:
  - C++
  - LevelDB
category: 源码剖析
toc: true
date: 2025-01-24 18:00:00
description: 本文深入剖析LevelDB的写入机制，详解从Put接口到WAL日志、MemTable落盘的全流程。通过源码解析揭示LevelDB实现40万次/秒高吞吐写入的奥秘：WriteBatch批量合并策略、双MemTable内存管理、WAL顺序写优化、Level0文件数动态限流等核心技术。探讨混合sync写入处理、小键值合并优化、异常场景数据一致性等工程细节，带你掌握LevelDB高性能写入的设计精髓与实现策略。
---

读、写键值是 KV 数据库中最重要的两个操作，LevelDB 中提供了一个 Put 接口，用于写入键值对。使用方法很简单：

```cpp
leveldb::Status status = leveldb::DB::Open(options, "./db", &db);
status = db->Put(leveldb::WriteOptions(), key, value);
```

LevelDB 最大的优点就是**写入速度也非常快，可以支持很高的并发随机写**。官方给过一个[写入压力测试结果](https://github.com/google/leveldb/tree/main?tab=readme-ov-file#write-performance)：

```shell
fillseq      :       1.765 micros/op;   62.7 MB/s
fillsync     :     268.409 micros/op;    0.4 MB/s (10000 ops)
fillrandom   :       2.460 micros/op;   45.0 MB/s
overwrite    :       2.380 micros/op;   46.5 MB/s
```

可以看到这里不强制要求刷磁盘的话，随机写入的速度达到 45.0 MB/s，每秒支持写入 40 万次。如果强制要求刷磁盘，写入速度会下降不少，也能够到 0.4 MB/s, 每秒支持写入 3700 次左右。

这里 Put 接口具体做了什么？数据的写入又是如何进行的？LevelDB 又有哪些优化？本文一起来看看。开始之前，先看一个大致的流程图：

![LevelDB 写入整体流程图](https://slefboot-1251736664.file.myqcloud.com/20250124_leveldb_source_writedb_flow_zh.png)

<!-- more -->

## LevelDB 写入 key 的 2 种方式

LevelDB 支持一次写入一个键值对，也支持一次写入多个键值对。不论是单个写入，还是批量写内部都是通过 [WriteBatch](https://selfboot.cn/2025/01/13/leveldb_source_write_batch/) 来处理。

```cpp
Status DB::Put(const WriteOptions& opt, const Slice& key, const Slice& value) {
  WriteBatch batch;
  batch.Put(key, value);
  return Write(opt, &batch);
}
```

我们可以选择在调用 LevelDB 接口的应用层聚合写入操作，从而实现批量写入，提高写入吞吐。例如，在应用层可以设计一个缓冲机制，收集一定时间内的写入请求，然后将它们打包在一个 WriteBatch 中提交。这种方式可以减少磁盘的写入次数和上下文切换，从而提高性能。

当然也可以每次都写入单个键值，这时候 LevelDB 内部会通过 WriteBatch 来处理。如果在高并发情况下，可能会在内部合并多个写操作，然后将这批键值对写入 WAL 并更新到 memtable。

这里整体写入还是比较复杂的，本篇文章只先关注写入到 WAL 和 memtable 的过程。

## LevelDB 写入详细步骤

完整的写入部分代码在 [leveldb/db/db_impl.cc 的 DBImpl::Write](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L1205) 方法中，咱们一点点拆开看吧。

```cpp
Status DBImpl::Write(const WriteOptions& options, WriteBatch* updates) {
  Writer w(&mutex_);
  w.batch = updates;
  w.sync = options.sync;
  w.done = false;

  MutexLock l(&mutex_);
  writers_.push_back(&w);
  while (!w.done && &w != writers_.front()) {
    w.cv.Wait();
  }
  if (w.done) {
    return w.status;
  }
  // ...
}
```

开始部分把 WriteBatch 和 sync 参数赋值给 Writer 结构体，然后通过一个 writers_ 队列来管理多个 Writer 结构体。这两个结构体和队列在整个写入过程中还是挺重要的，先来看看。

### Writer 结构和处理队列

这里 [writers_](https://github.com/google/leveldb/blob/main/db/db_impl.h#L186) 是一个 `std::deque<Writer*>` 类型的队列，用于管理多个 Writer 结构体。

```cpp
std::deque<Writer*> writers_ GUARDED_BY(mutex_);
```

这里队列用 `GUARDED_BY(mutex_)` 装饰，表示队列的访问需要通过 `mutex_` 互斥锁来保护。这个用到了 Clang 的静态线程安全分析功能，可以参考我之前的文章 [LevelDB 源码阅读：利用 Clang 的静态线程安全分析](https://selfboot.cn/2025/01/02/leveldb_source_thread_anno/)

这里 Writer 结构体定义如下：

```cpp
struct DBImpl::Writer {
  explicit Writer(port::Mutex* mu)
      : batch(nullptr), sync(false), done(false), cv(mu) {}

  Status status;
  WriteBatch* batch;
  bool sync;
  bool done;
  port::CondVar cv;
};
```

这里 Writer 结构体封装了不少参数，其中最重要是一个 WriteBatch 指针，记录了每个 WriteBatch 写请求的数据。然后用一个 status 用来记录每个 WriteBatch 写请求的错误状态。

此外，用一个 sync **来标记每个 WriteBatch 写请求是否需要立马刷到磁盘中**。默认是 false，不强制刷磁盘，如果系统崩溃，可能会丢掉部分还没来得及写进磁盘的数据。如果打开了 sync 选项，每次写入都会立马刷到磁盘，整体写入耗时会上涨，但是可以保证只要写入成功，数据就不会丢失。关于刷磁盘文件的更多细节，可以参考我之前的文章[LevelDB 源码阅读：Posix 文件操作接口实现细节](https://selfboot.cn/2024/08/02/leveldb_source_env_posixfile/)。

还有一个 **done 则用来标记每个 WriteBatch 的写请求是否完成。**这里因为内部可能会合并写入多个 WriteBatch，当本次写入请求被合并到其他批次写入后，本次请求标记完成，就不需要再处理了。从而避免重复执行，提高并发的写入效率。

为了**实现等待和通知，这里还有一个条件变量 cv，用于支持多个写请求的批量处理，并实现多个写请求的同步**。写入的时候，多个线程可以同时提交写入请求，每个写请求都会先被放入写入队列。**实际写入过程，则是串行化写入，同一时刻只有一批写入过程在执行**。每次会从队列中取出队首的写请求，如果此时队列中还有其他等待的写任务，则会被合并为一个批次一起处理。在当前批次的写入请求处理过程中，后续来的请求进入队列后都需要等待。当前批次的请求处理完成后，会通知后面进入队列在等待中的写请求。

结合这里的介绍，应该能看懂前面 Write 方法开始部分代码的含义了。对于每个写入请求，都会先创建一个 Writer 结构体，然后将其放入 writers_ 队列中。接下来在 while 循环中，判断当前写入请求是否完成，如果完成就会直接返回当前写入的状态结果。如果当前写入请求没在队首，则需要等待在 cv 条件变量上。

如果当前写入请求在队首，那么就需要执行实际的写入操作了，这里具体写入流程是什么样呢？

### 预先分配空间

接下来在正式写入前，要先确保有足够的空间来写入数据。这里会调用 [MakeRoomForWrite](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L1330) 方法，确保在进行写入操作之前，有足够的资源和空间来处理新的写入请求。它负责管理内存表（memtable）的使用情况、控制 Level 0 文件的数量，并在需要时触发后台压缩。

```cpp
// REQUIRES: this thread is currently at the front of the writer queue
Status DBImpl::MakeRoomForWrite(bool force) {
  mutex_.AssertHeld();
  assert(!writers_.empty());
  bool allow_delay = !force;
  Status s;
  while (true) {
    if (!bg_error_.ok()) {
      // Yield previous error
      s = bg_error_;
      break;
    }
    // ...
  }
}
```

这里开始部分是一些验证部分，用 AssertHeld 验证当前线程必须持有 mutex_ 互斥锁，并且 writers_ 队列不能为空。接着会判断 bg_error_ 是否为空，如果不为空，则直接返回 bg_error_ 状态。在下文中会看到，如果写入 WAL 刷磁盘失败，就会设置 bg_error_ ，这样会让后续的写入都直接返回失败。

在 while 循环中，接着是一系列 if 分支检查，处理不同情况。

```cpp
else if (allow_delay && versions_->NumLevelFiles(0) >=
                                  config::kL0_SlowdownWritesTrigger) {
      // We are getting close to hitting a hard limit on the number of
      // L0 files.  Rather than delaying a single write by several
      // seconds when we hit the hard limit, start delaying each
      // individual write by 1ms to reduce latency variance.  Also,
      // this delay hands over some CPU to the compaction thread in
      // case it is sharing the same core as the writer.
      mutex_.Unlock();
      env_->SleepForMicroseconds(1000);
      allow_delay = false;  // Do not delay a single write more than once
      mutex_.Lock();
    }
```

首先当 Level 0 文件数量接近 kL0_SlowdownWritesTrigger=8 阈值时，**暂时释放锁，延迟 1 毫秒，以减缓写入速度**。当然这里只允许延迟一次，避免长时间阻塞单个写入。这里之所以设置一个小的 Level 0 文件数量阈值，是为了防止 Level 0 文件太多后，到达系统瓶颈后，后续写入卡太长时间。在没到瓶颈前，就开始把延迟平摊到每个请求上，从而减缓压力。这里的注释也写的很清楚，上面也都贴出来了。

```cpp
    else if (!force &&
               (mem_->ApproximateMemoryUsage() <= options_.write_buffer_size)) {
      // There is room in current memtable
      break;
    } 
```

接着这里判断如果当前 memtable 的使用量没超过最大容量，就直接返回了。这里 write_buffer_size 是 memtable 的最大容量，默认是 4MB。这里可以调整配置，如果大一点的话，会在内存缓存更多数据，提高写入的性能，但是会占用更多内存，并且下次打开 db 的时候，恢复时间也会更长些。

接下来有两种情况，是当前没有地方可以写入，因此需要等待了。

```cpp
    else if (imm_ != nullptr) {
      // We have filled up the current memtable, but the previous
      // one is still being compacted, so we wait.
      Log(options_.info_log, "Current memtable full; waiting...\n");
      background_work_finished_signal_.Wait();
    } else if (versions_->NumLevelFiles(0) >= config::kL0_StopWritesTrigger) {
      // There are too many level-0 files.
      Log(options_.info_log, "Too many L0 files; waiting...\n");
      background_work_finished_signal_.Wait();
    }
```

第一种情况是不可变的 memtable 还在写入中，因此需要等待它写入完成。LevelDB 会维护两个 memtable，一个是当前可以写入的 memtable mem_，一个是不可变的 memtable imm_。每次写满一个 mem_ 后，就会把它转为 imm_ 然后刷数据到磁盘。如果 imm_ 还没完成刷磁盘，那么就必须等待刷完后才能把现有的 mem_ 转为新的 imm_。

第二种情况是 Level 0 文件数量太多，需要等待压缩完成。LevelDB 配置了 Level 0 文件数量的阈值 kL0_StopWritesTrigger，默认是 12，当 Level 0 文件数量超过这个阈值时，那么当前写入请求就需要等待。因为 Level 0 层的文件之间没有全局排序的保证，多个 Level 0 文件可能包含重叠的键范围。对于读来说，查询操作需要在所有 L0 文件中查找，文件数量过多会增加读取延迟。对于写来说，文件数量多，后台压缩的工作量也会增加，影响整体系统性能。所以这里强制控制 Level 0 的文件数量，达到阈值后就直接不给写入。

接下来的情况就是不可变的 imm_ 为空，同时 mem_ 也没足够空间，这时候要做的事情比较多：

1. **创建新日志文件**：生成新的日志文件号，并尝试创建新的 writable file 作为 WAL（Write-Ahead Log）。如果失败，重用文件号并退出循环，返回错误状态。
2. **关闭旧日志文件**：关闭当前日志文件。如果关闭失败，记录后台错误，阻止后续写入操作。
3. **更新日志文件指针**：设置新的日志文件指针，更新日志编号，创建新的 log::Writer 进行写入。
4. **转换 memtable**：将当前 memtable 转换为不可变 memtable（imm_），并创建新的 memtable 进行写入。通过 has_imm_.store(true, std::memory_order_release) 标记有不可变 memtable 存在。
5. 触发后台压缩：调用 MaybeScheduleCompaction()，触发后台压缩任务，处理不可变 memtable。

这里可以看到 **memtable 和 WAL 文件一一对应的，每个 memtable 对应一个 WAL 文件，WAL 文件记录写入 memtable 的所有操作，当 memtable 满时，同时切换 WAL 文件**。同一时刻，前台 memtable 和新的 WAL 日志文件处理新的请求，同时后台的 imm_ 和旧的 WAL 文件处理压缩任务。等压缩完成，就可以删除旧的 WAL 文件了。

### 合并写入任务

接着是合并写入的逻辑，[核心代码](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L1224)如下：

```cpp
  uint64_t last_sequence = versions_->LastSequence();
  Writer* last_writer = &w;
  if (status.ok() && updates != nullptr) {  // nullptr batch is for compactions
    WriteBatch* write_batch = BuildBatchGroup(&last_writer);
    WriteBatchInternal::SetSequence(write_batch, last_sequence + 1);
    last_sequence += WriteBatchInternal::Count(write_batch);

    {
     // ... 具体写入到 WAL 和 memtable 
    }
    if (write_batch == tmp_batch_) tmp_batch_->Clear();

    versions_->SetLastSequence(last_sequence);
  }
```

首先是获取当前全局的 sequence 值，这里 **sequence 用来记录写入键值对的版本号，全局单调递增**。每个写入请求都会被分配一个唯一的 sequence 值，通过版本号机制来实现 MVCC 等特性。在写入当前批次键值对的时候，会先设置 sequence 值，写入成功后，还会更新 last_sequence 值。

为了**提高写入并发性能，每次写入的时候，不止需要写队首的任务，还会尝试合并队列中后续的写入任务**。这里合并的逻辑放在 [BuildBatchGroup](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L1280) 中，主要是遍历整个写入队列，**在控制整体批次的大小，以及保证刷磁盘的级别情况下，不断把队列后面的写入任务合并到队首的写入任务**中。整体构建好的写入批次，会放到一个临时的对象 tmp_batch_ 中，在完整的写入操作完成后，会清空 tmp_batch_ 对象。

我们提到的每个写入任务其实封装为了一个 WriteBatch 对象，该类的实现支持了不同写入任务合并，以及获取任务的大小等。相关细节实现可以参考我前面的文章 [LevelDB 源码阅读：如何优雅地合并写入和删除操作](https://selfboot.cn/2025/01/13/leveldb_source_write_batch/)。

上面代码其实忽略了核心的写入到 WAL 和 memtable 的逻辑，下面来看看这部分的实现。

### 写入到 WAL 和 memtable

LevelDB 中写入键值对，会先写 WAL 日志，然后写入到 memtable 中。WAL 日志是 LevelDB 中实现数据恢复的关键，memtable 则是 LevelDB 中实现内存缓存和快速查询的关键。写入关键代码如下：

```cpp
    // Add to log and apply to memtable.  We can release the lock
    // during this phase since &w is currently responsible for logging
    // and protects against concurrent loggers and concurrent writes
    // into mem_.
    {
      mutex_.Unlock();
      status = log_->AddRecord(WriteBatchInternal::Contents(write_batch));
      bool sync_error = false;
      if (status.ok() && options.sync) {
        status = logfile_->Sync();
        if (!status.ok()) {
          sync_error = true;
        }
      }
      if (status.ok()) {
        status = WriteBatchInternal::InsertInto(write_batch, mem_);
      }
      mutex_.Lock();
      if (sync_error) {
        // The state of the log file is indeterminate: the log record we
        // just added may or may not show up when the DB is re-opened.
        // So we force the DB into a mode where all future writes fail.
        RecordBackgroundError(status);
      }
    }
```

这里**在写入到 WAL 和 memtable 的时候，会先释放 mutex_ 互斥锁，写入完成后，再重新加锁**。注释也专门解释了下，因为当前队首 `&w` 正在负责写入 WAL 和 memtable，后续的写入调用，可以拿到 mutex_ 互斥锁，因此可以完成入队操作。但是因为不是队首，需要等在条件变量上，只有当前任务处理完成，才有机会执行。所以**写入 WAL 和 memtable 的过程，虽然释放了锁，但整体还是串行化写入的**。WAL 和 memtable 本身也不需要保证线程安全。

不过因为写 WAL 和 memtable 相对耗时，释放锁之后，其他需要用到 mutex_ 的地方，都可以拿到锁继续执行了，整体提高了系统的并发。

WAL（Write-Ahead Logging）是一种日志记录机制，它允许在数据写入磁盘之前，先记录日志。**WAL 日志是追加写入，磁盘的顺序 IO 性能优于随机 IO 性能，因此追加写入一般效率比较高**。写入 WAL 成功后，再把数据放到 memtable 中，memtable 是内存结构，写入效率也很高，等在内存积累到一定量级，再写入磁盘。如果系统崩溃重启，内存中 memtable 的数据可能会丢失，但是通过 WAL 日志，可以重放写入操作，从而恢复数据状态，确保数据的完整性。

这里具体写入，只是简单的调用 log::Writer 对象 log_ 的 AddRecord 方法来写入 WriteBatch 数据。log::Writer 会把这里的数据进行组织，然后在适当的时机写入磁盘，详细实现可以参考我前面的文章[LevelDB 源码阅读：读写 WAL 日志保证持久性](https://selfboot.cn/2024/08/14/leveldb_source_wal_log/)。

当然，如果写入的时候带了 sync=true，那么这里写入 WAL 成功后，会调用 logfile_->Sync() 方法，强制刷磁盘。这里稍微补充说明下，这里**往文件里写内容是会通过系统调用 `write` 来完成，这个系统调用返回成功，并不保证数据一定被写入磁盘。文件系统一般会把数据先放到缓冲区，然后根据情况，选择合适的时机刷到磁盘中**。要保证一定刷到磁盘中去，则需要另外的系统调用，不同平台有不同的接口，具体可以参考我之前的文章[LevelDB 源码阅读：Posix 文件操作接口实现细节](https://selfboot.cn/2024/08/02/leveldb_source_env_posixfile/)。

如果强制刷磁盘过程发生错误，那么这里会调用 RecordBackgroundError 方法，记录错误状态到 bg_error_ 中，这样后续所有的写入操作都会返回失败。

在写入 WAL 成功后，就可以写入 memtable 了。这里调用 WriteBatchInternal::InsertInto 方法，把 WriteBatch 数据插入到 memtable 中。关于 memtable 的实现，我后面文章会详细介绍。

### 更新批次写任务的状态

写入批次完成后，就需要更新批次写任务的状态，从 writers_ 队列的前端取出最先入队的 Writer 对象，然后开始遍历，直到批次中的最后一个写入任务。这里更新所有已经完成任务的状态，然后唤醒所有等待的写入任务。[核心实现](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L1259)如下：

```cpp
  while (true) {
    Writer* ready = writers_.front();
    writers_.pop_front();
    if (ready != &w) {
      ready->status = status;
      ready->done = true;
      ready->cv.Signal();
    }
    if (ready == last_writer) break;
  }

  // Notify new head of write queue
  if (!writers_.empty()) {
    writers_.front()->cv.Signal();
  }
```

最后如果队列中还有写入任务，则需要唤醒队首的写入任务，继续处理。至此整个写入处理完毕，可以返回给调用方写入的结果了。

## 其他工程实现细节

整个写入过程到此分析完了，不过还有些工程实现细节，值得一起看看。

### 混合 sync 和非 sync 写入

如果有一批写入请求，其中既有 sync 又有非 sync 的写入，那么 LevelDB 内部会怎么处理呢？

前面分析可以看到每次取出队首的写入任务后，会尝试合并队列中后续的写入任务。因为每个写入任务可以强制 sync 刷磁盘，也可以不刷，合并的时候，怎么处理这种混合不同 sync 配置的写入任务呢？

这里配置 **sync=true 的时候写入会强制刷磁盘，对于合并后的批次写入，取得是队首的 sync**。[核心代码](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L1237)如下：

```cpp
Status DBImpl::Write(const WriteOptions& options, WriteBatch* updates) {
  //...
  if (status.ok() && updates != nullptr) {  // nullptr batch is for compactions
    // ...
    {
      mutex_.Unlock();
      status = log_->AddRecord(WriteBatchInternal::Contents(write_batch));
      bool sync_error = false;
      if (status.ok() && options.sync) {
        status = logfile_->Sync();
        if (!status.ok()) {
          sync_error = true;
        }
      }
      // ...
    }
  }
}
```

所以，如果队首是的任务是不需要刷磁盘，那么合并的时候，就不能合并 sync=true 的写入任务。[核心实现代码](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L1302)如下：

```cpp
  for (; iter != writers_.end(); ++iter) {
    Writer* w = *iter;
    if (w->sync && !first->sync) {
      // Do not include a sync write into a batch handled by a non-sync write.
      break;
    }
    // ...
  }
```

不过如果队首是 sync=true 的写入任务，那么合并的时候，就不需要考虑被合并的写入任务的 sync 设置。因为整个合并后的批次，都会被强制刷磁盘。这样就**可以保证不会降低写入的持久化保证级别，但是可以适当提升写入的持久化保证级别**。当然这里提升写入的持久化级别保证，其实也并不会导致整体耗时上涨，因为这里队首一定要刷磁盘，顺带着多一点不需要刷磁盘的写入任务，也不会导致耗时上涨。

### 优化大批量小 key 写入延迟

上面实现可以看到，如果大批量并发写入的时候，写入请求会先被放入队列中，然后串行化写入。如果写入的 key 都比较小，那么从队首取出一个写入任务，然后和当前队列中的其他写入合并为一个批次。合并的时候，需要设置一个 max_size 来限制合并的 key 数量，那么这里 max_size 要设置多少合理呢？

这里 LevelDB 给了一个经验值，默认是 1 << 20 个字节。但是考虑一个场景，如果写入的 key 都比较小，合并的时候，可能会合并很多 key，从而导致写入耗时变长。**由于是小 key 的写入，写入耗时长的话，体验上来并不好**。

所以这里加了个小优化，如果当前队首写入任务的整体 size 小于 128 << 10 个字节，那么这里 max_size 就会小很多。当然，这个值应该也只是经验值，我也没找到官方具体的说明。相关代码在
 [BuildBatchGroup](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L1289) 中：

 ```cpp
  // Allow the group to grow up to a maximum size, but if the
  // original write is small, limit the growth so we do not slow
  // down the small write too much.
  size_t max_size = 1 << 20;
  if (size <= (128 << 10)) {
    max_size = size + (128 << 10);
  }
```

### 写入 WAL 成功，但是 memtable 失败

写入过程，会先写入 WAL 日志，写成功后，才写 memtable。但这两个写入并不是原子的，如果写 WAL 失败，不回写 memtable，并且会阻塞后续所有的写入，这样是合理的，也不会有问题。

但是如果写入 WAL 日志成功，但是写入 memtable 失败的话，返回给调用方的状态是写入失败，调用可能认为写失败。但是 WAL 成功写入，并且其他流程都是正常执行，也更新了全局的 sequence。**万一这时候故障，从 WAL 恢复数据的时候，会把写 memtable 失败的也恢复，这样就导致调用方认为写失败的数据，其实成功写入了**。

这里自己暂时还没彻底搞明白，可能是 LevelDB 的潜在 bug，也可能是自己对整体代码还没理解透。这里尝试用 GPT O1 和 Deepseek 的 R1 深度思考分析了下，都倾向这里是 bug。Deepseek 给的思考过程也比较有意思：

> 我需要确认在LevelDB的实际运行中，这种情况发生的概率有多大。MemTable的写入失败通常可能由什么原因引起？比如内存不足，或者其他不可恢复的错误？如果是暂时性的错误，LevelDB是否有重试机制？
>  
> 另外，查看LevelDB的官方文档或相关讨论，是否有提到这种情况的处理方式。比如，是否在写入MemTable失败时，LevelDB会主动删除或无效化对应的WAL记录？
>  
> 可能还需要考虑数据库恢复流程。当LevelDB重启时，会读取WAL并重新构建MemTable。如果某个WAL记录对应的写入在MemTable失败，但WAL存在，恢复时会再次尝试写入MemTable。如果此时条件允许（比如内存足够），写入可能成功，导致不一致。但如果原来的失败是持久性的（如数据结构错误），恢复时可能再次失败，导致数据库无法打开，从而避免不一致。
>  
> 此外，用户的问题是否假设了某些特定场景？例如，MemTable写入失败但数据库没有崩溃，之后正常关闭，这时候WAL未被清除，恢复时重新应用。这种情况是否可能？

AI 现在的深度思考能力，逻辑推理的能力还是非常强的，考虑问题比较全面。这里也欢迎读者留言讨论这个问题哈。

## 总结

文章有点长，这里简单总结下吧。LevelDB 的写入操作设计充分考虑了高并发和性能优化，通过一系列精巧的机制实现了高效的键值对写入。下面是一些值得借鉴的设计：

1. **批量合并写入**: LevelDB 通过 Writer 队列将多个写入请求合并处理，避免了频繁的磁盘 IO。每个写入请求会被放入队列，队列头部的写入请求负责合并后续请求，形成一个大的 WriteBatch。这种设计显著提高了吞吐量，尤其适合高并发的小键值对写入场景。

2. **WAL 日志处理崩溃恢复**: WAL（Write-Ahead Log）：所有写入操作首先顺序写入 WAL 日志，确保数据持久性。写入 WAL 后才更新内存中的 MemTable，这种 "先日志后内存" 的设计是 LevelDB 崩溃恢复的基石。

3. **内存双缓冲机制**: 当 MemTable 写满后，会转换为 Immutable MemTable 并触发后台压缩，同时创建新的 MemTable 和 WAL 文件。这**种双缓冲机制避免了写入阻塞，实现了平滑的内存-磁盘数据流转**。

4. **写入限流与自适应延迟**: 通过 kL0_SlowdownWritesTrigger 和 kL0_StopWritesTrigger 阈值，在 Level 0 文件过多时主动引入写入延迟或暂停写入。这种 "软限流" 策略避免了系统过载后的雪崩效应。

5. **动态批次合并**: 根据当前队列头部请求的大小，动态调整合并批次的最大尺寸（如小请求合并 128KB，大请求合并 1MB），在吞吐量和延迟之间取得平衡。

6. **条件变量唤醒机制**: 通过 CondVar 实现高效的线程等待-通知，确保合并写入时不会长时间阻塞后续请求。

7. **混合 Sync 处理**: 支持同时处理需要强制刷盘（sync=true）和非强制刷盘的请求，优先保证队首请求的持久化级别，避免降低数据安全性。

8. **错误隔离**: WAL 写入失败会标记全局错误状态 bg_error_，直接拒绝掉所有后续写请求，防止数据不一致。

最后，欢迎大家留言讨论，一起学习 LevelDB 的实现细节。