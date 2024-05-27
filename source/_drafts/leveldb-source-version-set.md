---
title: LevelDB 源码阅读：多版本并发读写
tags: [C++, LevalDB]
category: 源码剖析
toc: true
description: 
---


在 LevelDB 中，每个 Version 代表了数据库在某一特定时刻的状态，包括所有的键值对和与之相关的元数据（如文件索引和状态信息），每个版本通过管理一系列的 SSTable 文件来存储数据。

VersionEdit 是 LevelDB 用于版本管理的一个重要载体，它记录了**从一个版本转换到另一个版本所需的所有更改**。当 LevelDB 进行压缩、添加或删除 SSTable 文件时，会创建一个新的 VersionEdit 来描述这些变更。包括添加新文件、删除旧文件、更新元数据等操作。

每次 VersionEdit 被应用到当前版本集（VersionSet）时，它会生成一个新的 Version 对象，这个对象反映了所有最新的更改。这样，LevelDB 可以无缝地切换到新的数据库状态，同时保持对旧版本的引用，直到不再需要。这种设计提供了强大的灵活性和效率，允许系统在不影响正在进行的读取操作的情况下，进行持续的写入和优化。

比如 `immutable memtable` 落地到 Level0 的 SST 文件过程

```c++
void DBImpl::CompactMemTable() {
  mutex_.AssertHeld();
  assert(imm_ != nullptr);
  // Save the contents of the memtable as a new Table
  VersionEdit edit;
  Version* base = versions_->current();
  base->Ref();
  Status s = WriteLevel0Table(imm_, &edit, base);
  base->Unref();
  // ...
  // Replace immutable memtable with the generated Table
  if (s.ok()) {
    edit.SetPrevLogNumber(0);
    edit.SetLogNumber(logfile_number_);  // Earlier logs no longer needed
    s = versions_->LogAndApply(&edit, &mutex_);
  }
  // ...
}
```

## Version


## VersionEdit

在 immutable memtable 落盘到 SSTable 文件，或者 compaction 过程中新建或删除 SSTable 文件时，需要将这里的版本变更记录下来。这时候就会用到 VersionEdit 对象，用它来存储变更信息。这个类包含了一系列的成员变量，用来记录发生了变化的元数据信息。此外，还提供了一些方法，来将该对象序列化、反序列化，以及将变更应用到某个版本集中。

### 变更字段记录

先来看看 VersionEdit 里面用来保存元数据的字段：

```cpp
  std::string comparator_;
  uint64_t log_number_;
  uint64_t prev_log_number_;
  uint64_t next_file_number_;
  SequenceNumber last_sequence_;
  std::vector<std::pair<int, InternalKey>> compact_pointers_;
  DeletedFileSet deleted_files_;
  std::vector<std::pair<int, FileMetaData>> new_files_;
```

**comparator_** ：LevelDB 中键值是有序存储的，因此需要指定一个比较器来对键进行排序。comparator_ 字段记录了当前数据库使用的比较器的名称。可以搜索 `SetComparatorName` 来查看设置比较器的位置，比如在 `DBImpl::NewDB` 函数中：

```cpp
Status DBImpl::NewDB() {
  VersionEdit new_db;
  new_db.SetComparatorName(user_comparator()->Name());
  new_db.SetLogNumber(0);
  new_db.SetNextFile(2);
  new_db.SetLastSequence(0);
  // ...
```

这里设置的是 `InternalKeyComparator` 的name，是一个固定值 "leveldb.InternalKeyComparator"。这里的 InternalKeyComparator 是 LevelDB 中用来比较内部键的比较器，但它**并不直接实现键的比较逻辑**。它实际上是一个包装器（wrapper），它封装了一个用户定义的比较器 `user_comparator_`，这个用户比较器用于比较用户的键。InternalKeyComparator 主要是为了在用户键的基础上加入了一些内部控制信息（如序列号和值类型），使得数据库可以有效地管理版本和删除标记。关于 InternalKeyComparator 的详细实现介绍，可以参考 $$REF$$。

**log_number_ 和 prev_log_number_** ：记录 [WAL 日志文件](leveldb_source_wal_log/) 的编号。在正常操作中，log_number_ 标识当前活跃的日志文件，里面会记录最新的写入操作。然而，如果系统在日志切换（log rolling）过程中崩溃，可能有两个日志文件都包含未持久化到 SSTables 的数据。prev_log_number_ 记录了这种情况下前一个活跃的日志文件编号。在恢复时，LevelDB 需要检查 prev_log_number_ 所指示的日志文件，以确保从中恢复所有必要的数据。

**next_file_number_** ：用于管理文件编号的分配。这个字段维护了下一个将被创建的文件的唯一编号。在 LevelDB 的实现中，每个新的文件（无论是日志文件、SSTable 文件还是其他类型的文件）都被分配一个递增的编号，以确保每个文件都具有唯一的标识符。

**last_sequence_** ：记录的是最新的序列号，这是一个非常重要的计数器。序列号是一个单调递增的数字，每次数据库的写入操作（如插入、更新或删除）都会被分配一个新的序列号。在 LevelDB 重启或从崩溃中恢复时，需要先读取 `last_sequence_`，确保能够正确地继续操作序列号的分配。

**compact_pointers_** ：用于记录[合并（compaction）操作](/leveldb_source_compaction)中的关键点。这些关键点（称为压缩指针）表示在数据库的各个层级中，下一次合并操作应该从哪里开始。通常存储为一个键值对的列表，每个元素是一个层级与该层级的最小（或最大）键的对应关系。这个键表示了当前层次的数据应从哪里开始下一轮的合并操作。

**deleted_files_** ：记录在某次版本变化中需要删除的 SST 文件的信息。每个条目包含一个层级和文件编号的对，指明了具体哪个层级的哪个文件应该被删除。这里 SST 文件被删除的原因可能是数据重复、过期或已被合并到更高层级的新文件中了。

**new_files_** ：记录新生成的 SST 文件的一些元信息。这些元信息用 FileMetaData 记录，包括文件编号、文件大小以及文件中包含的键的范围（最小键和最大键）等。new_files_ 是一个数组，里面每一项都是一个 pair，包括层级和 FileMetaData 对象。

当然，上面的这些字段不是必须设置的，只需要设置有发生变化的元数据即可。比如last_sequence_，在前面 CompactMemTable 的代码中，序列号没有在VersionEdit 中单独记录。因为序列号的更新和管理是在写入操作时处理的，而不是在压缩过程中。同理，prev_log_number_ 在上面被设置为 0，因为在 CompactMemTable 中没有涉及到日志文件的切换，表示旧日志文件已经被安全地删除，所有需要的数据已经被持久化到 SST 文件了。

这些字段中的基础类型字段还配置有一个 bool 类型的 `has_**_` 成员，用来标识是否设置了某个字段。在序列化时，会根据这个标志位来判断是否需要写入这个字段。

### 主要操作

这里 VersionEdit 提供的方法主要分为两类，第一类是设置各种前面提到的各种记录，比如：

```c++
void RemoveFile(int level, uint64_t file);
void AddFile(int level, uint64_t file, uint64_t file_size,
               const InternalKey& smallest, const InternalKey& largest);
void SetCompactPointer(int level, const InternalKey& key);
void SetLogNumber(uint64_t num)
```

这类方法比较简单，这里不再赘述了。第二类就是序列化和反序列化的方法了，这里主要是 `EncodeTo` 和 `DecodeFrom` 方法，确保所有重要的状态信息都能被编码并在需要时重新解码来重建对象的状态。每个成员变量的序列化都开始于一个标签（Tag 枚举），该标签唯一地标识了随后的数据类型和意图。标签之后是该字段的实际数据，数据格式依据数据类型有所不同（如使用变长整数或长度前缀字符串）。

```c++
// db/version_edit.cc
void VersionEdit::EncodeTo(std::string* dst) const {
  if (has_comparator_) {
    PutVarint32(dst, kComparator);
    PutLengthPrefixedSlice(dst, comparator_);
  }
  if (has_log_number_) {
    PutVarint32(dst, kLogNumber);
    PutVarint64(dst, log_number_);
  }
  // ...
  for (const auto& deleted_file_kvp : deleted_files_) {
    PutVarint32(dst, kDeletedFile);
    PutVarint32(dst, deleted_file_kvp.first);   // level
    PutVarint64(dst, deleted_file_kvp.second);  // file number
  }
  // ...
```

VersionEdit::DecodeFrom 则是对 EncodeTo 的逆操作，将序列化的数据解析为 VersionEdit 对象。这里循环读取 input 数据，通过 GetVarint32 读取字段的标签（tag），然后确定如何解析后续的数据。

### 自动化测试

这里的测试也是比较简单的，主要验证 VersionEdit 对象的序列化 (EncodeTo) 和反序列化 (DecodeFrom) 有没有问题。

```c++
// db/version_edit_test.cc
static void TestEncodeDecode(const VersionEdit& edit) {
  std::string encoded, encoded2;
  edit.EncodeTo(&encoded);
  VersionEdit parsed;
  Status s = parsed.DecodeFrom(encoded);
  ASSERT_TRUE(s.ok()) << s.ToString();
  parsed.EncodeTo(&encoded2);
  ASSERT_EQ(encoded, encoded2);
}
```

这里 `ASSERT_TRUE(s.ok()) << s.ToString();` 如果 s.ok() 为 false，会输出错误信息，这样可以方便地查看解析失败的原因。