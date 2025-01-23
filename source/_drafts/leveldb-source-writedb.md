---
title: LevelDB 源码阅读：写入操作到底做了什么？
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
date: 2025-01-20
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

这里 Put 接口具体做了什么？数据的写入又是如何进行的？LevelDB 又有哪些优化？本文一起来看看。

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

当然也可以每次都写入单个键值，这时候 LevelDB 内部会通过 WriteBatch 来处理。如果 在高并发情况下，可能会在内部合并多个写操作，然后将这批键值对写入 WAL 并更新到 memtable。

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

### 合并写入任务

接下来处理流程中会先判断 updates 是否为空，如果为空，这里会调用 MakeRoomForWrite 方法，来确保有足够的空间来写入数据。这里 updates 为空的场景，对应内部的一些操作，比如 Compaction，不是用户的写入请求。这里我们先忽略这种场景，放到后续其他文章来详细分析 MakeRoomForWrite 部分逻辑。

```cpp
  //...
  // May temporarily unlock and wait.
  Status status = MakeRoomForWrite(updates == nullptr);
  uint64_t last_sequence = versions_->LastSequence();
  Writer* last_writer = &w;
  if (status.ok() && updates != nullptr) {  // nullptr batch is for compactions
    // ...
  }
  // ...
```

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

为了**提高写入并发性能，每次写入的时候，不止需要写队首的任务，还会尝试合并队列中后续的写入任务**。这里合并的逻辑放在 [BuildBatchGroup](https://github.com/google/leveldb/blob/main/db/db_impl.cc#L1280) 中，主要是遍历整个写入队列，**在控制整体批次的大小，以及保证刷磁盘的级别情况下，不断把队列后面的写入任务扩到队首的写入任务**中。整体构建好的写入批次，会放到一个临时的对象 tmp_batch_ 中，在完整的写入操作完成后，会清空 tmp_batch_ 对象。

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


## 其他实现细节问题

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


## Compaction 机制


当存在未完成的压缩任务或 Level 0 文件过多时，写操作会通过调用 background_work_finished_signal_.Wait() 进入等待状态。这里的等待是为了防止新的写入操作进一步加剧存储压力

等待的触发条件：
1. MemTable 已满，Immutable MemTable (imm_) 正在压缩：当前活动的 MemTable 已经达到其容量上限并转换为 Immutable MemTable，但由于上一个 Immutable MemTable 还没有完成压缩转换为 SST 文件，新的写入操作必须等待。
2. Level 0 文件过多：LevelDB 设有阈值 (config::kL0_StopWritesTrigger)，用于限制 Level 0 SST 文件的数量。如果文件数量达到此阈值，将阻止进一步的写入以避免过度压缩和性能下降。

当后台压缩任务完成后，它将触发 background_work_finished_signal_ 的信号。完成压缩意味着已经有一个或多个 Immutable MemTable 被成功转换为 SST 文件，并从内存中清除，从而为新的写入操作腾出空间。类似地，当 Level 0 的 SST 文件数量通过压缩减少到安全的水平以下时，后台进程也会触发等待信号，允许被阻塞的写操作继续执行。

如果压缩过程出现问题（例如因为 I/O 错误、资源限制或程序错误而卡住），那么依赖 background_work_finished_signal_ 的写操作将会继续等待，**直到收到唤醒信号**。在实际的系统运行中，这种情况需要通过适当的监控和故障处理机制来识别和解决，例如通过日志监控、错误报告以及可能的手动干预或系统重启。

