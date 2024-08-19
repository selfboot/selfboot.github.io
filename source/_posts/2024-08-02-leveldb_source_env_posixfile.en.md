---
title: LevelDB Explained - Posix File Operation Details
tags:
  - C++
  - LevelDB
category: Source Code Analysis
toc: true
description: This article details LevelDB's abstracted file operations, including the implementation of sequential read/write and random file access under Posix, and how to adapt to different operating systems through abstract interfaces. It also introduces key designs such as buffer optimization, resource limit management, and flexible reading strategies to improve system performance and usability. Additionally, it covers implementation details like the application of the factory method pattern, error handling mechanisms, and cross-platform compatibility considerations.
date: 2024-08-02 10:37:38
lang: en
---

LevelDB supports running on various operating systems. To adapt to different operating systems, it needs to encapsulate some system calls, such as file operations, thread operations, time operations, etc. In the exposed include files, the [env.h](https://github.com/google/leveldb/blob/main/include/leveldb/env.h) file defines various interfaces used by LevelDB. This includes the Env class, which encapsulates file operations, directory operations, etc., as well as some file abstract classes such as SequentialFile, WritableFile, and RandomAccessFile for sequential reading, random reading, and writing files.

Through abstract interfaces, LevelDB can run on different operating systems by implementing the corresponding Env subclass for each platform. This article takes the POSIX system environment as an example to first look at how the abstracted **file operation-related interfaces** are implemented.

<!-- more -->

## Sequential File Reading

First, let's look at the abstract base class SequentialFile for **sequential file reading**, which provides a standard interface for sequential reading and skipping operations on files, and can be used for reading WAL log files. The class defines two main virtual functions:

- Read(size_t n, Slice* result, char* scratch): This function is used to read up to n bytes of data from the file. result is a pointer to a Slice type, used to store the read data. scratch is a character array used as a temporary buffer, and the function may write data to this buffer.
- Skip(uint64_t n): This function is used to skip n bytes of data in the file. If the file is read to the end, the skip operation will stop at the end of the file, and the function returns an OK status.

Of course, the comments also indicate that this class requires **the caller to perform synchronization to ensure thread safety**. In the POSIX environment, the implementation of this class is in the [env_posix.cc](https://github.com/google/leveldb/blob/main/util/env_posix.cc#L136) file, where the PosixSequentialFile class finally inherits from SequentialFile, preventing it from being inherited by any other class, and implements the above two virtual functions. The implementation of Read is as follows:

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

Here, when the system call [read()](https://man7.org/linux/man-pages/man2/read.2.html) returns a value less than 0, it will judge whether it is an EINTR error based on the value of errno, and if so, it will **retry reading**. This is because when performing a read() operation on a file descriptor with the O_NONBLOCK flag set, if there is not enough data available to read, read() will return immediately instead of blocking to wait for data to become available. In this case, read() will return -1 and errno will be set to EAGAIN, indicating that there is no data to read and to try again later.

The implementation of Skip is relatively simple, directly calling the system call [lseek()](https://man7.org/linux/man-pages/man2/lseek.2.html) to skip n bytes in the file. Here, the third parameter is SEEK_CUR, indicating to **skip n bytes from the current position**. In the operating system, each open file has an associated file position pointer (sometimes also called file offset). This pointer indicates where the next read or write operation will take place in the file. **The operating system is responsible for tracking and maintaining this file position pointer**. Of course, you can also specify SEEK_SET or SEEK_END, which represent skipping n bytes from the beginning and end of the file, respectively.

```cpp
  Status Skip(uint64_t n) override {
    if (::lseek(fd_, n, SEEK_CUR) == static_cast<off_t>(-1)) {
      return PosixError(filename_, errno);
    }
    return Status::OK();
  }
```

**The file descriptor should also be closed when the object is destroyed to ensure that resources are properly released**. Each time a file is opened, the operating system allocates some resources, such as kernel buffers, file locks, etc. Then it returns a file descriptor (a non-negative integer) to the user, which the user then uses to operate on the file. When we call [close](https://man7.org/linux/man-pages/man2/close.2.html), the operating system reduces the reference count for that file, and if the reference count becomes 0, the operating system releases the corresponding resources. Additionally, there is a limit to the number of files each process can open, and not calling close(fd) may cause the process to be unable to open new files.

```cpp
  ~PosixSequentialFile() override { close(fd_); }
```

## Random File Reading

RandomAccessFile is an abstract base class that defines the interface for **random file reading**. It declares a pure virtual function Read, forcing subclasses to implement this method. The Read method is designed to allow reading a specified number of bytes from any position in the file. Because it's a read-only interface, it supports lock-free multi-threaded concurrent access.

```cpp
  virtual Status Read(uint64_t offset, size_t n, Slice* result,
                      char* scratch) const = 0;
```

In the POSIX environment, this class has two implementations, one is [PosixRandomAccessFile](https://github.com/google/leveldb/blob/main/util/env_posix.cc#L176) implemented using [pread()](https://man7.org/linux/man-pages/man2/pread.2.html), and the other is [PosixMmapReadableFile](https://github.com/google/leveldb/blob/main/util/env_posix.cc#L238) implemented using mmap().

### Random Reading with pread

The PosixRandomAccessFile class implements the RandomAccessFile interface, mainly using the POSIX pread() system call. The constructor of this class is quite interesting, receiving filename, fd, and an externally passed fd_limiter pointer. fd_limiter is used to limit the number of file descriptors held, avoiding too many open file descriptors. The specific implementation of limiter is in the [Limiter](#Limiter) section of this article. During construction, if fd_limiter->Acquire() returns true, it means it can always hold this file descriptor. Otherwise, the file descriptor needs to be closed in the constructor, and **a temporary file descriptor will be used each time content is read from the file later**.

Here, fd_limiter is created in the factory function of [PosixEnv](#Env-Encapsulation-Interface), and the maximum number of persistent file descriptors is obtained by the MaxOpenFiles function. It first checks if the global variable g_open_read_only_file_limit has been modified to a non-negative number, and if so, uses this value. If not set, it needs to decide based on the system's resource limits. Here, the system call [getrlimit](https://www.man7.org/linux/man-pages/man2/getrlimit.2.html) is used to **get the maximum number of file descriptors that the current process can open**. If the system doesn't limit the number of file descriptors a process can open, it returns the maximum value of an int type, otherwise it allocates 20% of this limit to read-only file operations. If getting the resource limit fails, or if the system (like the Fuchsia operating system) doesn't support getting resource limits, a hard-coded value of 50 is used.

Next, let's look at the constructor of PosixRandomAccessFile:

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

The constructor uses the member variable has_permanent_fd_ to record whether it always holds an open file descriptor, and if not, fd_ is -1. Correspondingly, in the destructor, if has_permanent_fd_ is true, it needs to call close() to close the file descriptor and release the resource count of fd_limiter_. Next, let's look at the core Read method of this class, the code is as follows:

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

Here, it first determines whether it holds a **persistent file descriptor**, and if not, it needs to open the file each time it reads the file. Then it calls pread() to read the file content. pread() is similar to read(), but it can read data from a specified position in the file. The first parameter of pread() is the file descriptor, the second parameter is the buffer for reading, the third parameter is the number of bytes to read, and the fourth parameter is the offset in the file. If the read is successful, the read data is stored in result, otherwise an error status is returned. Finally, if it doesn't hold a persistent file descriptor, it needs to close the temporary file descriptor after reading the data.

The implementation of the PosixRandomAccessFile class is relatively simple, directly using the system file API, without the need for additional memory mapping management, suitable for small files or infrequent read operations. However, if access is frequent, too many system calls may lead to performance degradation, in which case **memory mapping files** can be used to improve performance.

### Random Reading with mmap

The PosixMmapReadableFile class also implements the RandomAccessFile interface, but it maps the file or part of the file to the process's address space through memory mapping (mmap), and accessing this part of memory is equivalent to accessing the file itself. **Memory mapping allows the operating system to utilize page caches, which can significantly improve the performance of frequent reads, especially in large file scenarios, improving read efficiency**.

Unlike PosixRandomAccessFile, here the constructor needs to pass in the mmap_base pointer, which points to the file content mapped through the mmap system call, and also needs to pass in length, which is the length of the mapped area, i.e., the size of the file. The mapping is done in the external NewRandomAccessFile method, and PosixMmapReadableFile directly uses the mapped address.

```cpp
  PosixMmapReadableFile(std::string filename, char* mmap_base, size_t length,
                        Limiter* mmap_limiter)
      : mmap_base_(mmap_base),
        length_(length),
        mmap_limiter_(mmap_limiter),
        filename_(std::move(filename)) {}
```

Of course, mmap also needs to limit resources to avoid exhausting virtual memory. Here, the Limiter class is also used, which will be described in detail later. The Read method **directly reads data from mmap_base_, without the need to call system calls**, which is much more efficient. The overall code is as follows:

```cpp
  Status Read(uint64_t offset, size_t n, Slice* result,
              char* scratch) const override {
    if (offset + n > length_) {
      *result = Slice();
      return PosixError(filename_, EINVAL);
    }

    *result = Slice(mmap_base_ + offset, n);
    return Status::OK();
  }
```

## Sequential File Writing

The previous sections were all about reading files, of course, we can't miss the writing file interface. WritableFile is an abstract base class that defines the interface for **sequential file writing**. It provides a standard interface for sequential writing and synchronization operations on files, which can be used for writing WAL log files. The class defines three main virtual functions:

- Append(const Slice& data): Appends data to the file object. For small blocks of data, it appends to the object's memory cache, and for large blocks of data, it calls WriteUnbuffered to write to disk.
- Flush(): Calls the system write to write the data currently in the memory cache to disk. Note that **this does not guarantee that the data has been synchronized to the physical disk**.
- Sync(): Ensures that the data in the internal buffer is written to the file, and also **ensures that the data is synchronized to the physical disk** to guarantee data persistence. After calling Sync(), the data will not be lost even if a power failure or system crash occurs.

In the POSIX environment, the implementation of this class is [PosixWritableFile](https://github.com/google/leveldb/blob/main/util/env_posix.cc#L277). The class internally uses a **buffer of 65536 bytes** `buf_`, and only writes data to the disk file when the buffer is full. If there are a large number of short content writes, they can be merged in memory first, thereby reducing the number of calls to the underlying file system and improving the efficiency of write operations.

```cpp
constexpr const size_t kWritableFileBufferSize = 65536;

// buf_[0, pos_ - 1] contains data to be written to fd_.
  char buf_[kWritableFileBufferSize];
```

The strategy for merging writes is implemented in Append, and the code is quite clear. For the content to be written, if it can be completely placed in the buffer, it is directly copied to the buffer, and then returns success. Otherwise, it first fills the buffer, then writes the data in the buffer to the file. At this point, if the remaining data can be written to the buffer, it is written directly, otherwise it is flushed directly to the disk. The complete implementation is as follows:

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

The WriteUnbuffered function is called above to write data to disk, which is implemented through the system call [write()](https://man7.org/linux/man-pages/man2/write.2.html). The main code is as follows:

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

In addition to the Append function, WritableFile also provides a Flush interface for writing the data in the memory buffer buf_ to the file, which is also implemented by calling WriteUnbuffered internally. However, it's worth noting that even if Flush writes to disk successfully, it **does not guarantee that the data has been written to the disk, or even that the disk has enough space to store the content**. If you want to ensure that the data is successfully written to the physical disk file, you need to call the Sync() interface, implemented as follows:

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

The core here is calling the SyncFd() method, which **ensures that all buffered data associated with the file descriptor fd is synchronized to the physical disk**. The implementation of this function considers different operating system characteristics and file system behaviors, using conditional compilation directives (#if, #else, #endif) to handle different environments. On macOS and iOS systems, it uses the `F_FULLFSYNC` option of the fcntl() function to ensure that data is synchronized to the physical disk. If HAVE_FDATASYNC is defined, it will use fdatasync() to synchronize data. In other cases, it defaults to using the fsync() function to achieve the same functionality.

Note that SyncDirIfManifest ensures that if the file is a manifest file (named starting with "MANIFEST"), related directory changes are also synchronized. The manifest file records the metadata of the database files, including version information, merge operations, database status, and other critical information. When the file system creates new files or modifies file directory entries, these changes may not be immediately written to disk. **Ensuring that the data of the directory has been synchronized to disk before updating the manifest file** prevents the files referenced by the manifest file from not being actually written to disk when the system crashes.

## Resource Concurrent Limitation

As mentioned above, to avoid having too many open file descriptors, the Acquire method of the Limiter class is used for limitation. This class is also implemented in [env_posix.cc](https://github.com/google/leveldb/blob/main/util/env_posix.cc#L73). The comments for this class are particularly good, clearly explaining its purpose, which is mainly used to limit resource usage to avoid resource exhaustion. It is currently used to limit read-only file descriptors and mmap file usage to avoid running out of file descriptors or virtual memory, or encountering kernel performance problems in very large databases.

```cpp
// Helper class to limit resource usage to avoid exhaustion.
// Currently used to limit read-only file descriptors and mmap file usage
// so that we do not run out of file descriptors or virtual memory, or run into
// kernel performance problems for very large databases.
```

The constructor takes a parameter max_acquires, which sets the maximum number of resources that can be acquired. The class internally maintains an atomic variable acquires_allowed_ to track the number of resources currently allowed to be acquired, with an initial value set to max_acquires. Conditional compilation is used here, NDEBUG is a commonly used preprocessor macro used to indicate whether the program is compiled in non-debug mode.

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

If in debug mode, max_acquires_ is used to record the maximum number of resources, and assertions are added in the Acquire and Release methods to ensure that resource acquisition and release operations are correct. In the production environment, **when NDEBUG is defined, all assert calls will be ignored by the compiler and will not generate any execution code**.

The core interfaces of this class are Acquire and Release. These two methods are used to acquire and release resources respectively. The code for Acquire is as follows:

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

Here, fetch_sub(1, std::memory_order_relaxed) is used to atomically decrease the value of acquires_allowed_ and return the value before the decrease as old_acquires_allowed. If old_acquires_allowed is greater than 0, it means there were resources available before the decrease, so it returns true. If no resources are available (i.e., old_acquires_allowed is 0 or negative), it atomically adds the counter back to 1 using fetch_add(1, std::memory_order_relaxed) to restore the state, and returns false.

The Release method is used to release resources previously successfully acquired through the Acquire method. It uses fetch_add(1, std::memory_order_relaxed) to atomically increase the value of acquires_allowed_, indicating that the resource has been released, and uses an assertion to ensure that the number of Release calls does not exceed the number of successful Acquire calls, preventing resource count errors.

When operating on the atomic counter here, std::memory_order_relaxed is used, indicating that these atomic operations **do not need any special ordering constraints on memory**, only guaranteeing the atomicity of the operation. This is because the operations here do not depend on the results of any other memory operations, they simply increment or decrement the counter.

## Env Encapsulation Interface

In addition to the above file operation classes, there is also an important Env abstract base class, which derives PosixEnv under Posix, encapsulating many implementations.

### Factory Construction of Objects

First are several factory methods used to create file read and write objects like SequentialFile, RandomAccessFile, and WritableFile objects. The NewSequentialFile factory method creates a PosixSequentialFile file object, encapsulating the call to open the file. The advantage of using the factory method here is that it can handle some errors, such as file opening failure. Additionally, the input parameter is `WritableFile**`, supporting polymorphism. If other WritableFile implementations are added in the future, they can be switched to different implementations by modifying the factory method without changing the calling code.

```cpp
  Status NewSequentialFile(const std::string& filename,
                           SequentialFile** result) override {
    int fd = ::open(filename.c_str(), O_RDONLY | kOpenBaseFlags);
    if (fd < 0) {
      *result = nullptr;
      return PosixError(filename, errno);
    }

    *result = new PosixSequentialFile(filename, fd);
    return Status::OK();
  }
```

When opening a file here, in addition to O_RDONLY indicating read-only, there is also a kOpenBaseFlags. kOpenBaseFlags is a flag that is set based on the compilation option HAVE_O_CLOEXEC. If the system supports O_CLOEXEC, this flag will be set. O_CLOEXEC ensures that **the file descriptor is automatically closed when executing exec() series functions, thus preventing file descriptor leakage to the newly executed program**.

By default, when a process creates a child process, all file descriptors are inherited by the child process. Unless explicitly handled for each file descriptor, they will remain open after exec is executed. In most cases, if a process intends to execute another program (usually through exec series functions), it's likely that it doesn't want the new program to access certain resources of the current process, especially file descriptors. The O_CLOEXEC flag ensures that these file descriptors are automatically closed after exec, thus not leaking to the new program. Although LevelDB itself doesn't call exec functions, this flag is still added here, which is a good defensive programming habit.

Of course, this flag may not be supported on all platforms. For cross-platform compatibility, in [CmakeLists.txt](https://github.com/google/leveldb/blob/main/CMakeLists.txt#L54), check_cxx_symbol_exists is used to detect whether the current environment's fcntl.h file has O_CLOEXEC, and if so, the HAVE_O_CLOEXEC macro is defined. It's worth mentioning that check_cxx_symbol_exists is quite useful, it can **determine whether specific features are supported before compilation, so that compilation settings or source code can be adjusted appropriately based on the detection results**. Several macros in LevelDB are detected in this way, such as fdatasync, F_FULLFSYNC, etc.

```cmake
check_cxx_symbol_exists(fdatasync "unistd.h" HAVE_FDATASYNC)
check_cxx_symbol_exists(F_FULLFSYNC "fcntl.h" HAVE_FULLFSYNC)
check_cxx_symbol_exists(O_CLOEXEC "fcntl.h" HAVE_O_CLOEXEC)
```

The NewWritableFile and NewAppendableFile factory functions are similar, first opening the file and then creating a PosixWritableFile object. However, different flags are used when opening the file:

```cpp
int fd = ::open(filename.c_str(), O_TRUNC | O_WRONLY | O_CREAT | kOpenBaseFlags, 0644);
int fd = ::open(filename.c_str(), O_APPEND | O_WRONLY | O_CREAT | kOpenBaseFlags, 0644);
```

O_TRUNC indicates that if the file exists, its length will be truncated to 0. O_APPEND indicates that when writing data, it will always append the data to the end of the file, rather than overwriting existing data in the file.

NewRandomAccessFile is a bit more complex because it supports two modes of random reading. First, it opens the file to get the fd, then uses mmap_limiter_ to limit the number of memory-mapped open files. If it exceeds the mmap limit, it uses pread for random reading. If it doesn't exceed the limit, it uses mmap to memory-map the file, gets the mapped address and file size, and then creates a PosixMmapReadableFile object.

```cpp
  Status NewRandomAccessFile(const std::string& filename,
                             RandomAccessFile** result) override {
    // ...
    int fd = ::open(filename.c_str(), O_RDONLY | kOpenBaseFlags);
    // ...
    if (!mmap_limiter_.Acquire()) {
      *result = new PosixRandomAccessFile(filename, fd, &fd_limiter_);
      return Status::OK();
    }
    uint64_t file_size;
    Status status = GetFileSize(filename, &file_size);
    if (status.ok()) {
      void* mmap_base = ::mmap(/*addr=*/nullptr, file_size, PROT_READ, MAP_SHARED, fd, 0);
      if (mmap_base != MAP_FAILED) {
        *result = new PosixMmapReadableFile(filename,
                                            reinterpret_cast<char*>(mmap_base),
                                            file_size, &mmap_limiter_);
      } 
      // ...
    }
    ::close(fd);
    if (!status.ok()) {
      mmap_limiter_.Release();
    }
    return status;
  }
```

Here, the maximum number of files limited by mmap_limiter_ is obtained by the MaxMmaps function. For 64-bit systems, due to the very large virtual memory address space (usually over 256TB in actual applications), LevelDB allows allocating 1000 memory-mapped areas, which should not have a significant impact on the overall performance of the system. For 32-bit systems, due to the limited virtual memory address space, LevelDB does not allow allocating memory-mapped areas.

```cpp
// Up to 1000 mmap regions for 64-bit binaries; none for 32-bit.
constexpr const int kDefaultMmapLimit = (sizeof(void*) >= 8) ? 1000 : 0;
```

### File Utility Classes

In addition to the several core file classes mentioned above, Env also provides a series of file operation interfaces, including file metadata retrieval, file deletion, etc. This is a good opportunity to familiarize ourselves with [various system calls in the Posix environment](https://github.com/google/leveldb/blob/main/util/env_posix.cc).

FileExists: Determines **whether the current process can access the file (inability to access does not mean the file does not exist)**, implemented by calling the system call [access()](https://man7.org/linux/man-pages/man2/access.2.html);

RemoveFile: If no process is currently using the file (i.e., no open file descriptors point to this file), it will delete the file. Implemented through the system call [unlink()](https://man7.org/linux/man-pages/man2/unlink.2.html), unlink actually deletes the link between the filename and its corresponding inode. If this inode has no other links and no process has this file open, the actual data blocks and inode of the file will be released.

GetFileSize: Gets the size of the file. If the file does not exist or the retrieval fails, it returns 0. This is implemented through the [stat](https://man7.org/linux/man-pages/man2/stat.2.html) system call. When calling the stat function, you need to pass the filename and a pointer to a stat structure. The system will check the path permissions corresponding to the filename, then retrieve the file's inode. The inode is a data structure in the file system that stores the file's metadata, including file size, permissions, creation time, last access time, etc. The file system maintains an inode table for quick lookup and access to inode information, and for most file systems (such as EXT4, NTFS, XFS, etc.), commonly used inodes are usually cached in memory, so retrieving the inode is generally very efficient.

RenameFile: Renames a file or folder. You can specify new and old filenames here, implemented through the system call [rename()](https://man7.org/linux/man-pages/man2/rename.2.html).

CreateDir: Creates a directory with default permissions of 755. This is implemented through the system call [mkdir()](https://man7.org/linux/man-pages/man2/mkdir.2.html). If pathname already exists, it returns failure.

RemoveDir: Deletes a directory, implemented through the system call [rmdir()](https://man7.org/linux/man-pages/man2/rmdir.2.html).

GetChildren: Slightly more complex, it uses the system call opendir to get the directory, then uses readdir to traverse the files in it, and finally remembers to use closedir to clean up resources.

## File Operation Summary

It must be said that a simple file operation encapsulation contains many implementation details. Let's summarize them briefly:

1. Buffer optimization: In the WritableFile implementation, a memory buffer is used, which can merge small write operations, reduce the number of system calls, and improve write efficiency.
2. Resource limit management: The Limiter class is used to limit the number of simultaneously open file descriptors and memory mappings (mmap). By setting reasonable upper limits, resource exhaustion is avoided, improving system stability and performance.
3. Flexible reading strategy: For random reading, LevelDB provides two implementations based on pread and mmap, which can dynamically choose the most appropriate method according to system resource conditions.
4. Factory method pattern: Using factory methods to create file objects encapsulates operations such as file opening, facilitating error handling and future expansion.
5. Cross-platform compatibility: Through conditional compilation and feature detection (such as checking for O_CLOEXEC), code compatibility on different platforms is ensured.
6. Synchronization mechanism: Flush and Sync interfaces are provided, allowing users to choose different levels of data persistence guarantees as needed.

In addition to encapsulating file operations, there are other encapsulations in Env, which we'll see in the next article.