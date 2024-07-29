---
title: LevelDB 源码阅读：封装的各种系统实现
tags: [C++, LevelDB]
category: 源码剖析
toc: true
date: 
description:
---

LevelDB 支持在各种操作系统上运行，为了适配不同的操作系统，需要封装一些系统调用，比如文件操作、线程操作、时间操作等。在对外暴露的 include 文件中，[env.h](https://github.com/google/leveldb/blob/main/include/leveldb/env.h) 文件定义了 LevelDB 用到的各种接口。包括 Env 类，封装文件操作，目录操作等，还有一些文件抽象类，比如 SequentialFile、WritableFile、RandomAccessFile 3 个类，用于顺序读取，随机读取和写入文件。

通过抽象接口，只需要为每个平台实现相应的 Env 子类，LevelDB 就可以在不同的操作系统上运行。这篇文章以 POSIX 系统环境为例，先来看看抽象出来的和文件操作相关的接口是怎么实现的。

<!-- more -->

## 封装文件操作

在 POSIX 环境下，文件操作主要是通过系统调用来实现的，比如 open、read、write、close 等。LevelDB 通过封装这些系统调用，提供了一些抽象类，用于顺序读取、随机读取和写入文件。这些抽象类定义了一些纯虚函数，需要子类实现，以适配不同的操作系统。

## SequentialFile 

SequentialFile 是一个抽象基类，定义**顺序读取文件**的接口。它为文件的顺序读取和跳过操作提供了一个标准的接口，可以用于 WAL 日志文件的读取。类中定义了2个主要的虚函数：

- Read(size_t n, Slice* result, char* scratch)：这个函数用于从文件中读取多达 n 字节的数据。result 是一个指向 Slice 类型的指针，用来存储读取的数据。scratch 是一个字符数组，用作临时缓冲区，函数可能会向这个缓冲区写入数据。
- Skip(uint64_t n)：这个函数用于跳过文件中的 n 字节数据。如果文件读取到末尾，跳过操作将停止在文件末尾，函数返回 OK 状态。

当然，注释里也说明了这个类需要**调用者进行同步，以确保线程安全**。在 POSIX 环境下，这个类的实现是在 [env_posix.cc](https://github.com/google/leveldb/blob/main/util/env_posix.cc#L136) 文件中，PosixSequentialFile 类 final 继承自 SequentialFile，阻止被其他任何类继承，同时实现了上述两个虚函数。其中 Read 的实现如下：

```cpp
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

Skip 的实现则比较简单，直接调用系统调用 [lseek()](https://man7.org/linux/man-pages/man2/lseek.2.html) 来跳过文件中的 n 个字节。这里第三个参数是 SEEK_CUR，表示**从当前位置开始跳过 n 个字节**。操作系统中，每个打开的文件都有一个与之关联的文件位置指针（有时也称为文件偏移量）。这个指针指示了下一次读取或写入操作将在文件中的哪个位置进行。**操作系统负责跟踪和维护这个文件位置指针**。当然也可以指定 SEEK_SET 或 SEEK_END，分别表示从文件开始和文件末尾开始跳过 n 个字节。

```cpp
  Status Skip(uint64_t n) override {
    if (::lseek(fd_, n, SEEK_CUR) == static_cast<off_t>(-1)) {
      return PosixError(filename_, errno);
    }
    return Status::OK();
  }
```

**在对象销毁时也要关闭文件描述符，确保资源被正确释放**。每次打开文件，操作系统会分配一些资源，比如内核缓冲区、文件锁等。然后返回给用户一个文件描述符(非负整数)，之后用户通过这个文件描述符来操作文件。当我们调用 [close](https://man7.org/linux/man-pages/man2/close.2.html) 时，操作系统会减少对该文件的引用计数，如果引用计数为 0，操作系统会释放相应资源。此外每个进程能打开的文件数量有限制，不调用 close(fd) 可能导致进程无法打开新的文件。

```cpp
  ~PosixSequentialFile() override { close(fd_); }
```

## RandomAccessFile

RandomAccessFile 是一个抽象基类，定义**随机读取文件**的接口。它声明了一个纯虚函数 Read，强制子类实现这个方法。Read 方法的设计允许从文件的任意位置读取指定数量的字节。因为是一个只读接口，所以支持无锁多线程并发访问。

```cpp
  virtual Status Read(uint64_t offset, size_t n, Slice* result,
                      char* scratch) const = 0;
```

在 POSIX 环境下，这个类有 2 种实现，一个是用 [pread()](https://man7.org/linux/man-pages/man2/pread.2.html) 实现的 [PosixRandomAccessFile](https://github.com/google/leveldb/blob/main/util/env_posix.cc#L176)，另一个是用 mmap() 实现的 [PosixMmapReadableFile](https://github.com/google/leveldb/blob/main/util/env_posix.cc#L238)。

### PosixRandomAccessFile

PosixRandomAccessFile 类实现了 RandomAccessFile 接口，主要用的是 POSIX 的 pread() 系统调用。该类的构造函数比较有意思，接收 filename，fd 和外部传入的 fd_limiter 指针。fd_limiter 用于限制持有的文件描述符的数量，避免打开的文件描述符过多，类的具体实现在本文 [Limiter](#Limiter) 部分。构造的时候，如果 fd_limiter->Acquire() 返回 true，说明可以一直持有这个文件描述符。否则的话，需要在构造函数中关闭文件描述符，**在后面每次从文件读内容的时候再使用临时文件描述符**。

```cpp
  // The new instance takes ownership of |fd|. |fd_limiter| must outlive this
  // instance, and will be used to determine if .
  PosixRandomAccessFile(std::string filename, int fd, Limiter* fd_limiter)
      : has_permanent_fd_(fd_limiter->Acquire()),
        fd_(has_permanent_fd_ ? fd : -1),
        fd_limiter_(fd_limiter),
        filename_(std::move(filename)) {
    if (!has_permanent_fd_) {
      assert(fd_ == -1);
      ::close(fd);  // The file will be opened on every read.
    }
  }
```

构造函数中还用成员变量 has_permanent_fd_ 来记录是否一直持有打开的文件描述符，如果没有则 fd_ 为 -1。对应的，在析构函数中，如果 has_permanent_fd_ 为 true，就需要调用 close() 关闭文件描述符，并释放 fd_limiter_ 的资源计数。

接下来看该类的核心 Read 方法，代码如下：

```cpp
  Status Read(uint64_t offset, size_t n, Slice* result,
              char* scratch) const override {
    int fd = fd_;
    if (!has_permanent_fd_) {
      fd = ::open(filename_.c_str(), O_RDONLY | kOpenBaseFlags);
      if (fd < 0) {
        return PosixError(filename_, errno);
      }
    }
    assert(fd != -1);
    Status status;
    ssize_t read_size = ::pread(fd, scratch, n, static_cast<off_t>(offset));
    *result = Slice(scratch, (read_size < 0) ? 0 : read_size);
    if (read_size < 0) {
      // An error: return a non-ok status.
      status = PosixError(filename_, errno);
    }
    if (!has_permanent_fd_) {
      // Close the temporary file descriptor opened earlier.
      assert(fd != fd_);
      ::close(fd);
    }
    return status;
  }
```

这里首先判断是否持有持久文件描述符，如果没有则需要在每次读取文件时打开文件。然后调用 pread() 读取文件内容，pread() 与 read() 类似，但是它可以从文件的指定位置读取数据，而不是从当前位置开始读取。pread() 的第一个参数是文件描述符，第二个参数是读取的缓冲区，第三个参数是读取的字节数，第四个参数是文件中的偏移量。如果读取成功，将读取的数据存入 result 中，否则返回错误状态。最后如果没有持有持久文件描述符，需要在读取完数据后关闭临时文件描述符。

PosixRandomAccessFile 类实现简单，直接使用系统文件API，无需额外的内存映射管理，适用于小文件或者不频繁的读取操作。但是如果访问比较频繁，过多的系统调用可能导致性能下降，这时候就可以使用内存映射文件来提高性能。

### PosixMmapReadableFile

PosixMmapReadableFile 类同样实现了 RandomAccessFile 接口，不过通过内存映射（mmap）将文件或文件的一部分映射到进程的地址空间，访问这部分内存就相当于访问文件本身。内存映射允许操作系统利用页缓存，可以显著提高频读取的性能，尤其是在大文件场景下，可以提高读取效率。


## WritableFile

WritableFile 是一个抽象基类，定义**顺序写入文件**的接口。它为文件的顺序写入和同步操作提供了一个标准的接口，可以用于 WAL 日志文件的写入。类中定义了3个主要的虚函数：

- Append(const Slice& data)：向文件对象中追加数据，对于小块数据追加在对象的内存缓存中，对于大块数据则调用 WriteUnbuffered 写磁盘。
- Flush()：将目前内存缓存中的数据调用系统 write 写磁盘，注意这里**不保证数据已被同步到物理磁盘**。
- Sync()：确保内部缓冲区的数据被写入文件，还**确保数据被同步到物理磁盘**，以保证数据的持久性。调用 Sync() 之后，即使发生电源故障或系统崩溃，数据也不会丢失了。

在 POSIX 环境下，这个类的实现是 [PosixWritableFile](https://github.com/google/leveldb/blob/main/util/env_posix.cc#L277)。类内部使用了一个大小为 65536 字节的缓冲区 `buf_`，只有缓冲区满才会将数据写入磁盘文件。如果有大量的短内容写入，就可以先在内存中合并，从而减少对底层文件系统的调用次数，提高写操作的效率。

```cpp
constexpr const size_t kWritableFileBufferSize = 65536;

// buf_[0, pos_ - 1] contains data to be written to fd_.
  char buf_[kWritableFileBufferSize];
```

这里合并写入的策略在 Append 中实现，代码比较清晰。对于写入的内容，如果能够完全放入缓冲区，则直接拷贝到缓冲区中，然后就返回成功。否则先填满缓冲区，然后将缓存区中的数据写入文件，此时如果剩余的数据能够写入缓冲区则直接写，不然就直接刷到磁盘中。完整实现如下：

```cpp
  Status Append(const Slice& data) override {
    size_t write_size = data.size();
    const char* write_data = data.data();

    // Fit as much as possible into buffer.
    size_t copy_size = std::min(write_size, kWritableFileBufferSize - pos_);
    std::memcpy(buf_ + pos_, write_data, copy_size);
    write_data += copy_size;
    write_size -= copy_size;
    pos_ += copy_size;
    if (write_size == 0) {
      return Status::OK();
    }

    // Can't fit in buffer, so need to do at least one write.
    Status status = FlushBuffer();
    if (!status.ok()) {
      return status;
    }

    // Small writes go to buffer, large writes are written directly.
    if (write_size < kWritableFileBufferSize) {
      std::memcpy(buf_, write_data, write_size);
      pos_ = write_size;
      return Status::OK();
    }
    return WriteUnbuffered(write_data, write_size);
  }
```

上面将数据写入磁盘调用的是 WriteUnbuffered 函数，该函数通过系统调用 [write()](https://man7.org/linux/man-pages/man2/write.2.html) 实现，主要代码如下：

```cpp
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

除了 Append 函数，WritableFile 还提供了 Flush 接口，用于将内存缓冲区 buf_ 的数据写入文件，它内部也是通过调用 WriteUnbuffered 来实现。不过值得注意的是，这里 Flush 写磁盘成功，并**不保证数据已经写入磁盘，甚至不能保证磁盘有足够的空间来存储内容**。如果要保证数据写物理磁盘文件成功，需要调用 Sync() 接口，实现如下：

```cpp
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

这里核心是调用 SyncFd() 方法，**确保文件描述符 fd 关联的所有缓冲数据都被同步到物理磁盘**。该函数的实现考虑了不同的操作系统特性和文件系统行为，使用了条件编译指令（#if、#else、#endif）来处理不同的环境。在 macOS 和 iOS 系统上，使用了 fcntl() 函数的 `F_FULLFSYNC` 选项来确保数据被同步到物理磁盘。如果定义了 HAVE_FDATASYNC，将使用 fdatasync() 来同步数据。其他情况下，默认使用 fsync() 函数来实现同样的功能。

注意这里 SyncDirIfManifest 确保如果文件是 manifest 文件(以 “MANIFEST” 开始命名的文件)，相关的目录更改也得到同步。mainfest 文件记录数据库文件的元数据，包括版本信息、合并操作、数据库状态等关键信息。文件系统在创建新文件或修改文件目录项时，这些变更可能并不立即写入磁盘。**在更新 manifest 文件前确保所在目录的数据已被同步到磁盘**，防止系统崩溃时，manifest 文件引用的文件尚未真正写入磁盘。

## Limiter

上面提到为了避免打开的文件描述符过多，使用 Limiter 类的 Acquire 来进行限制，该类的也在实现在 [env_posix.cc](https://github.com/google/leveldb/blob/main/util/env_posix.cc#L73)中。这个类的注释也写的特别棒，把它的作用讲的很明白，主要用来限制资源使用，避免资源耗尽。目前用于限制只读文件描述符和 mmap 文件使用，以避免耗尽文件描述符或虚拟内存，或者在非常大的数据库中遇到内核性能问题。

```cpp
// Helper class to limit resource usage to avoid exhaustion.
// Currently used to limit read-only file descriptors and mmap file usage
// so that we do not run out of file descriptors or virtual memory, or run into
// kernel performance problems for very large databases.
```

构造函数接受一个参数 max_acquires，这个参数设定了可以获取的最大资源数量。类内部维护了一个原子变量 acquires_allowed_ 来跟踪当前允许被获取的资源数量，初始值设置为 max_acquires。这里用到了条件编译，NDEBUG 是一个常用的预处理宏，用来指明程序是否在非调试模式下编译。

```cpp
  // Limit maximum number of resources to |max_acquires|.
  Limiter(int max_acquires)
      :
#if !defined(NDEBUG)
        max_acquires_(max_acquires),
#endif  // !defined(NDEBUG)
        acquires_allowed_(max_acquires) {
    assert(max_acquires >= 0);
  }
```

如果在调试模式下，就用 max_acquires_ 来记录最大资源数量，同时在 Acquire 和 Release 方法中加入了断言，确保资源的获取和释放操作正确。在生产环境中，当 **NDEBUG 被定义时，所有的 assert 调用将被编译器忽略，不会产生任何执行代码**。

该类的核心接口是 Acquire 和 Release，这两个方法分别用来获取和释放资源，Acquire 的代码如下：

```cpp
  bool Acquire() {
    int old_acquires_allowed = acquires_allowed_.fetch_sub(1, std::memory_order_relaxed);
    if (old_acquires_allowed > 0) return true;

    int pre_increment_acquires_allowed = acquires_allowed_.fetch_add(1, std::memory_order_relaxed);

    // Silence compiler warnings about unused arguments when NDEBUG is defined.
    (void)pre_increment_acquires_allowed;
    // If the check below fails, Release() was called more times than acquire.
    assert(pre_increment_acquires_allowed < max_acquires_);
    return false;
  }
```

这里使用 fetch_sub(1, std::memory_order_relaxed) 原子地减少 acquires_allowed_ 的值，并返回减少前的值 old_acquires_allowed。如果 old_acquires_allowed 大于0，说明在减少之前还有资源可以被获取，因此返回 true。如果没有资源可用（即 old_acquires_allowed 为0或负），则通过 fetch_add(1, std::memory_order_relaxed) 原子地将计数器加回1，恢复状态，并返回 false。

Release 方法用来释放之前通过 Acquire 方法成功获取的资源。它使用 fetch_add(1, std::memory_order_relaxed) 原子地增加 acquires_allowed_ 的值，表示资源被释放，同时用断言保证 Release 的调用次数不会超过 Acquire 的成功次数，防止资源计数错误。

这里在操作原子计数的时候，使用的是 std::memory_order_relaxed，表明这些原子操作**不需要对内存进行任何特别的排序约束**，只保证操作的原子性。这是因为这里的操作并不依赖于任何其他的内存操作结果，只是简单地递增或递减计数器。

## Env 文件操作接口

### GetFileSize

在前面使用 mmap 映射文件时，需要获取文件的大小，这里用到了 Env 类的 GetFileSize 接口。这个接口用于获取文件的大小，如果文件不存在或者获取失败，返回 0。Posix 下的实现代码如下：

```cpp
  Status GetFileSize(const std::string& filename, uint64_t* size) override {
    struct ::stat file_stat;
    if (::stat(filename.c_str(), &file_stat) != 0) {
      *size = 0;
      return PosixError(filename, errno);
    }
    *size = file_stat.st_size;
    return Status::OK();
  }
```

通过 [stat](https://man7.org/linux/man-pages/man2/stat.2.html) 系统调用可以获取文件的元数据，包括文件大小、权限、创建时间、最后访问时间等。调用 stat 函数时，需要传递文件名和一个 stat 结构体的指针。系统会检查文件名对应的路径权限，然后获取文件的 inode。inode 是文件系统中的一个数据结构，保存了文件的元数据。文件系统会保持一个 inode 表，用于快速查找和访问 inode 信息。对于大部分文件系统（如 EXT4, NTFS, XFS 等）来说，通常会在内存中缓存常用的 inode，因此获取 inode 一般会十分高效。