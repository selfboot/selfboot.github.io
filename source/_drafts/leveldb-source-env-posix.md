---
title: LevelDB 源码阅读：封装的各种系统实现
tags: [C++, LevalDB]
category: 源码剖析
toc: true
date: 
description:
---

`include/leveldb/env.h` 文件定义了 LevelDB 的系统环境接口，主要包括文件操作、线程操作、时间操作等。这些接口的实现是为了适配不同的操作系统，使得 LevelDB 能够在不同的平台上运行。

## SequentialFile 

`SequentialFile` 是一个抽象基类，定义**顺序读取文件**的接口。它为文件的顺序读取和跳过操作提供了一个标准的接口，可以用于 WAL 日志文件的读取。类中定义了2个主要的虚函数：

- Read(size_t n, Slice* result, char* scratch)：这个函数用于从文件中读取多达 n 字节的数据。result 是一个指向 Slice 类型的指针，用来存储读取的数据。scratch 是一个字符数组，用作临时缓冲区，函数可能会向这个缓冲区写入数据。
- Skip(uint64_t n)：这个函数用于跳过文件中的 n 字节数据。如果文件读取到末尾，跳过操作将停止在文件末尾，函数返回 OK 状态。

当然，注释里也说明了这个类需要**调用者进行同步，以确保线程安全**。在 POSIX 环境下，这个类的实现是 `PosixSequentialFile`。这个类 final 继承自 SequentialFile，阻止被其他任何类继承，同时实现了上述两个虚函数。其中 Read 的实现如下：

```c++
Status Read(size_t n, Slice* result, char* scratch) override {
    Status status;
    while (true) {
      ::ssize_t read_size = ::read(fd_, scratch, n);
      if (read_size < 0) {  // Read error.
        if (errno == EINTR) {
          continue;  // Retry
        }
        status = PosixError(filename_, errno);
        break;
      }
      *result = Slice(scratch, read_size);
      break;
    }
    return status;
  }
```

这里当系统调用 [read()](https://man7.org/linux/man-pages/man2/read.2.html) 返回值小于 0 时，会根据 errno 的值判断是否是 EINTR 错误，如果是则**重试读取**。这是因为，当对一个设置了 O_NONBLOCK 标志的文件描述符进行 read() 操作时，如果没有足够的数据可供读取，read() 会立即返回而不是阻塞等待数据变得可用。这种情况下，read() 将返回 -1 并且 errno 被设置为 EAGAIN，表明没有数据可读，可以稍后再试。

## WritableFile

`WritableFile` 是一个抽象基类，定义**顺序写入文件**的接口。它为文件的顺序写入和同步操作提供了一个标准的接口，可以用于 WAL 日志文件的写入。类中定义了3个主要的虚函数：

- Append(const Slice& data)：向文件对象中追加数据，对于小块数据追加在对象的内存缓存中，对于大块数据则调用 WriteUnbuffered 写磁盘。
- Close()：关闭文件。
- Flush()：将目前内存缓存中的数据调用系统 write 写磁盘，注意这里**不保证数据已被同步到物理磁盘**。
- Sync()：确保内部缓冲区的数据被写入文件，还**确保数据被同步到物理磁盘**，以保证数据的持久性。调用 Sync() 之后，即使发生电源故障或系统崩溃，数据也不会丢失了。

在 POSIX 环境下，这个类的实现是 `PosixWritableFile`。类内部使用了一个缓冲区 `buf_`，Append的时候将小的写操作缓存起来，一次性写入较大块数据到文件系统，这样可以减少对底层文件系统的调用次数，从而提高写操作的效率。如果是写入大块内容，则直接写入文件。把数据写入文件通过系统调用 [write()](https://man7.org/linux/man-pages/man2/write.2.html) 实现，主要代码如下：

```c++
  Status WriteUnbuffered(const char* data, size_t size) {
    while (size > 0) {
      ssize_t write_result = ::write(fd_, data, size);
      if (write_result < 0) {
        if (errno == EINTR) {
          continue;  // Retry
        }
        return PosixError(filename_, errno);
      }
      data += write_result;
      size -= write_result;
    }
    return Status::OK();
  }
```

这里返回成功，不保证数据已经写入磁盘，甚至不能保证磁盘有足够的空间来存储内容。如果要保证数据写物理磁盘文件成功，需要调用 Sync() 方法，如下：

```c++
  Status Sync() override {
    Status status = SyncDirIfManifest();
    if (!status.ok()) {
      return status;
    }
    status = FlushBuffer();
    if (!status.ok()) {
      return status;
    }

    return SyncFd(fd_, filename_);
  }
```

这里核心是调用 SyncFd() 方法，确保文件描述符 fd 关联的所有缓冲数据都被同步到物理磁盘。该函数的实现考虑了不同的操作系统特性和文件系统行为，使用了条件编译指令（#if、#else、#endif）来处理不同的环境。在 macOS 和 iOS 系统上，使用了 fcntl() 函数的 `F_FULLFSYNC` 选项来确保数据被同步到物理磁盘。如果定义了 HAVE_FDATASYNC，将使用 fdatasync() 来同步数据。其他情况下，默认使用 fsync() 函数来实现同样的功能。

注意这里 SyncDirIfManifest 确保如果文件是 manifest 文件(以 “MANIFEST” 开始命名的文件)，相关的目录更改也得到同步。mainfest 文件记录数据库文件的元数据，包括版本信息、合并操作、数据库状态等关键信息。文件系统在创建新文件或修改文件目录项时，这些变更可能并不立即写入磁盘。在更新 manifest 文件前确保所在目录的数据已被同步到磁盘，防止系统崩溃时，manifest 文件引用的文件尚未真正写入磁盘。

