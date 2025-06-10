---
title: LevelDB Explained - Understanding Multi-Version Concurrency Control (MVCC)
tags:
  - C++
  - LevelDB
category: Source Code Analysis
toc: true
description: This article provides an in-depth analysis of how LevelDB implements concurrency control through MVCC, with detailed explanations of versioned key data structure design, sorting rules, and implementation details of read/write processes. It explains how LevelDB embeds sequence numbers and type information in keys to achieve multi-version data management, allowing read operations to obtain consistent views without locking, while write operations create new versions rather than overwriting existing data. Through analysis of actual code, the article showcases internal key sorting methods, the working principles of the Snapshot mechanism, and version control logic in key-value read/write processes, helping readers understand the practical engineering implementation of concurrency control in modern database systems.
mathjax: true
date: 2025-06-10 17:47:42
---

In database systems, concurrent access is a common scenario. When multiple users read and write to a database simultaneously, ensuring the correctness of each person's read and write results becomes a challenge that concurrency control mechanisms need to address.

Consider a simple money transfer scenario: account A initially has `$1000` and needs to transfer `$800` to account B. The transfer process includes two steps: deducting money from account A and adding money to account B. If someone queries the balances of accounts A and B between these two steps, what would they see?

Without any concurrency control, the query would reveal an anomaly: account A has been debited by `$800`, leaving only `$200`, while account B hasn't yet received the transfer, still showing its original amount! This is a typical data inconsistency problem. To solve this issue, database systems **need some form of concurrency control mechanism**.

<!-- more -->

The most intuitive solution is locking – when someone is performing a write operation (such as a transfer), others' read operations must wait. Returning to our example, only after both steps of the transfer are completed can users query the correct account balances. However, locking mechanisms have obvious drawbacks: whenever a key is being written, all read operations on that key must wait in line, limiting concurrency and resulting in poor performance.

Modern database systems widely adopt MVCC for concurrency control, and LevelDB is no exception. Let's examine LevelDB's MVCC implementation through its source code.

## Concurrency Control Through MVCC

MVCC ([Multi-Version Concurrency Control](https://en.wikipedia.org/wiki/Multiversion_concurrency_control)) is a concurrency control mechanism that enables concurrent access by maintaining multiple versions of data. Simply put, LevelDB's MVCC implementation has **several key points**:

- **Each key can have multiple versions**, each with its own sequence number;
- **Write operations create new versions instead of directly modifying existing data**. Different writes need to be mutually exclusive with locks to ensure each write gets an incremental version number;
- **Different read operations can run concurrently without locks**. Multiple read operations can also run concurrently with write operations without locks;
- Isolation between reads and writes, or between different reads, is achieved through snapshots, with read operations always seeing data versions from a specific point in time.

This is the core idea of MVCC. Let's understand how MVCC works through a specific operation sequence. Assume we have the following operations:

```
Time T1: sequence=100, write key=A, value=1
Time T2: sequence=101, write key=A, value=2
Time T3: Reader1 gets snapshot=101
Time T4: sequence=102, write key=A, value=3
Time T5: Reader2 gets snapshot=102
```

Regardless of whether Reader1 or Reader2 reads first, Reader1 reading key=A will always get value=2 (sequence=101), while Reader2 reading key=A will get value=3 (sequence=102). If there are subsequent reads without specifying a snapshot, they will get the latest data. The sequence diagram below makes this easier to understand; the mermaid source code is [here](/downloads/mermaid_leveldb_mvcc_en.txt):

![LevelDB Read/Write MVCC Operation Sequence Diagram](https://slefboot-1251736664.file.myqcloud.com/20250610_leveldb_mvcc_intro_r_w_en.webp)

The overall effect of MVCC is as shown above, which is relatively straightforward. Now let's look at how MVCC is implemented in LevelDB.

## LevelDB's Versioned Key Format

A prerequisite for implementing MVCC is that **each key maintains multiple versions**. Therefore, we need to design a data structure that associates keys with version numbers. LevelDB's key format is as follows:

> [key][sequence<<8|type]

LevelDB's approach is quite easy to understand – it appends version information to the original key. This version information is a 64-bit unsigned integer, with the high 56 bits storing the sequence and the low 8 bits storing the operation type. Currently, there are only two operation types, corresponding to write and delete operations.

```cpp
// Value types encoded as the last component of internal keys.
// DO NOT CHANGE THESE ENUM VALUES: they are embedded in the on-disk
// data structures.
enum ValueType { kTypeDeletion = 0x0, kTypeValue = 0x1 };
```

Since the sequence number is only 56 bits, it can support at most $ 2^{56} $ writes. Could this be a problem? Would it fail if I want to <span style="color:red">write more keys</span>? Theoretically yes, but let's analyze from a practical usage perspective. Assuming 1 million writes per second (which is already a very high write QPS), the duration this system could sustain writes would be:

$$ 2^{56} / 1000000 / 3600 / 24 / 365 = 2284 $$ 

Well... it can handle writes for over 2000 years, so this sequence number is sufficient, and there's no need to worry about depletion. Although the data format design is quite simple, it has several advantages:

1. **The same key supports different versions** – when the same key is written multiple times, the most recent write will have a higher sequence number. Concurrent reads of older versions of this key are supported during writes.
2. The type field distinguishes between normal writes and deletions, so deletion doesn't actually remove data but writes a deletion marker, with actual deletion occurring only during compaction.

We know that keys in LevelDB are stored in sequence. When querying a single key, binary search can quickly locate it. When obtaining a series of consecutive keys, binary search can quickly locate the starting point of the range, followed by sequential scanning. But now that we've added version numbers to the keys, the question arises: **how do we sort keys with version numbers**?

### Internal Key Sorting Method

LevelDB's approach is relatively simple and effective, with the following sorting rules:

1. First, sort by key in ascending order, using lexicographical ordering of strings
2. Then, sort by sequence number in descending order, with larger sequence numbers coming first
3. Finally, sort by type in descending order, with write types coming before deletion types

To implement these sorting rules, LevelDB created its own comparator in [db/dbformat.cc](https://github.com/google/leveldb/blob/main/db/dbformat.cc#L47), with the following code:

```cpp
int InternalKeyComparator::Compare(const Slice& akey, const Slice& bkey) const {
  // Order by:
  //    increasing user key (according to user-supplied comparator)
  //    decreasing sequence number
  //    decreasing type (though sequence# should be enough to disambiguate)
  int r = user_comparator_->Compare(ExtractUserKey(akey), ExtractUserKey(bkey));
  if (r == 0) {
    const uint64_t anum = DecodeFixed64(akey.data() + akey.size() - 8);
    const uint64_t bnum = DecodeFixed64(bkey.data() + bkey.size() - 8);
    if (anum > bnum) {
      r = -1;
    } else if (anum < bnum) {
      r = +1;
    }
  }
  return r;
}
```

We can see that it first removes the last 8 bits from the versioned key to get the actual user key, and then compares according to the user key's sorting rules. Additionally, LevelDB provides a default user key comparator, `leveldb.BytewiseComparator`, which compares keys based entirely on their byte sequence. The comparator implementation code is in [util/comparator.cc](https://github.com/google/leveldb/blob/main/util/comparator.cc#L21):

```cpp
class BytewiseComparatorImpl : public Comparator {
 public:
  BytewiseComparatorImpl() = default;

  const char* Name() const override { return "leveldb.BytewiseComparator"; }

  int Compare(const Slice& a, const Slice& b) const override {
    return a.compare(b);
  }
  // ... 
```

Here, Slice is a string class defined in LevelDB to represent a string, and its compare method performs a byte-by-byte comparison. In fact, LevelDB also supports user-defined comparators – users just need to implement the Comparator interface. When using comparators, BytewiseComparator is wrapped in a singleton, with code that might be a bit difficult to understand:

```cpp
const Comparator* BytewiseComparator() {
  static NoDestructor<BytewiseComparatorImpl> singleton;
  return singleton.get();
}
```

I previously wrote an article specifically explaining the NoDestructor template class, for those interested: [LevelDB Explained - Preventing C++ Object Destruction](https://selfboot.cn/en/2024/07/22/leveldb_source_nodestructor/).

The benefits of this sorting approach are evident: first, sorting user keys in ascending order makes range queries highly efficient. When users need to retrieve a series of consecutive keys, they can use binary search to quickly locate the starting point of the range, followed by sequential scanning. Additionally, multiple versions of the same user key are sorted by sequence number in descending order, meaning the newest version comes first, facilitating quick access to the current value. During a query, it only needs to find the first version with a sequence number less than or equal to the current snapshot's, **without having to scan all versions completely**.

That's enough about sorting. Now, let's look at how keys are assembled during read and write operations.

## Writing Versioned Keys

The process of writing key-value pairs in LevelDB is quite complex; you can refer to my previous article: [LevelDB Explained - Implementation and Optimization Details of Key-Value Writing](https://selfboot.cn/en/2025/01/24/leveldb_source_writedb/). Simply put, data is first written to the memtable, then to the immutable memtable, and finally gradually settled (compacted) into SST files at different levels. The first step of the entire process is writing to the memtable, so at the beginning of writing to the memtable, the key is tagged with a version and type, assembled into the versioned internal key format we mentioned earlier.

The code for assembling the key is in the `MemTable::Add` function in [db/memtable.c](https://github.com/google/leveldb/blob/main/db/memtable.cc#L76). In addition to assembling the key, it also concatenates the value part. The implementation is as follows:

```cpp
void MemTable::Add(SequenceNumber s, ValueType type, const Slice& key,
                   const Slice& value) {
  // Format of an entry is concatenation of:
  //  key_size     : varint32 of internal_key.size()
  //  key bytes    : char[internal_key.size()]
  //  tag          : uint64((sequence << 8) | type)
  //  value_size   : varint32 of value.size()
  //  value bytes  : char[value.size()]
  size_t key_size = key.size();
  size_t val_size = value.size();
  size_t internal_key_size = key_size + 8;
  const size_t encoded_len = VarintLength(internal_key_size) +
                             internal_key_size + VarintLength(val_size) +
                             val_size;
  char* buf = arena_.Allocate(encoded_len);
  char* p = EncodeVarint32(buf, internal_key_size);
  std::memcpy(p, key.data(), key_size);
  p += key_size;
  EncodeFixed64(p, (s << 8) | type);
  p += 8;
  p = EncodeVarint32(p, val_size);
  std::memcpy(p, value.data(), val_size);
  assert(p + val_size == buf + encoded_len);
  table_.Insert(buf);
}
```

Here we can see that multiple writes of the same user key produce multiple versions, each with a unique sequence number. Once a user key is converted to an internal key, all subsequent processing is based on this internal key, including MemTable conversion to Immutable MemTable, SST file writing, SST file merging, and so on.

In the Add function, the length of the internal key is also stored before the internal key itself, and the length and internal key are concatenated and inserted into the MemTable together. This key is actually a memtable_key, which is also used for searching in the memtable during reading.

**Why do we need to store the length here?** We know that the SkipList in Memtable uses const char* pointers as the key type, but these pointers are just raw pointers to certain positions in memory. When the skiplist's comparator needs to compare two keys, it needs to know the exact range of each key – that is, the start and end positions. If we directly use the internal key, there's no clear way to know the exact boundaries of an internal key in memory. With length information added, we can quickly locate the boundaries of each key, allowing for correct comparison.

## Key-Value Reading Process

Next, let's look at the process of reading key-values. When reading key-values, the user key is first converted to an internal key, and then a search is performed. However, the first issue here is which sequence number to use. Before answering this question, let's look at the common method for reading keys:

```cpp
std::string newValue;
status = db->Get(leveldb::ReadOptions(), "key500", &newValue);
```

There's a ReadOptions parameter here, which encapsulates a Snapshot object. You can understand this snapshot as the state of the database at a particular point in time, containing all the data before that point but not including writes after that point.

The core implementation of the snapshot is actually saving the maximum sequence number at a certain point in time. When reading, this sequence number is used to assemble the internal key. There are two scenarios during reading: if no snapshot is specified, the latest sequence number is used; if a previously saved snapshot is used, the sequence number of that snapshot is used.

Then, based on the snapshot sequence number and user key, assembly occurs. Here, a LookupKey object is first defined to encapsulate some common operations when using internal keys for lookups. The code is in [db/dbformat.h](https://github.com/google/leveldb/blob/main/db/dbformat.h#L184):

```cpp
// A helper class useful for DBImpl::Get()
class LookupKey {
 public:
  // Initialize *this for looking up user_key at a snapshot with
  // the specified sequence number.
  LookupKey(const Slice& user_key, SequenceNumber sequence);

  LookupKey(const LookupKey&) = delete;
  LookupKey& operator=(const LookupKey&) = delete;

  ~LookupKey();

  // Return a key suitable for lookup in a MemTable.
  Slice memtable_key() const { return Slice(start_, end_ - start_); }
  // Return an internal key (suitable for passing to an internal iterator)
  Slice internal_key() const { return Slice(kstart_, end_ - kstart_); }
  // Return the user key
  Slice user_key() const { return Slice(kstart_, end_ - kstart_ - 8); }

  // ...
}
```

In the LookupKey constructor, the internal key is assembled based on the passed user_key and sequence, with the specific code in [db/dbformat.cc](https://github.com/google/leveldb/blob/main/db/dbformat.cc#L117). When searching in the memtable, memtable_key is used, and when searching in the SST, internal_key is used. The memtable_key here is what we mentioned earlier – adding length information before the internal_key to facilitate quick location of each key's boundaries in the SkipList.

If the key is not found in the memtable and immutable memtable, it will be searched for in the SST. Searching in the SST is considerably more complex, involving the management of multi-version data. I will write a dedicated article to explain this reading process in the future.

## Conclusion

This article's explanation of MVCC is still relatively basic, introducing the general concept and focusing on how sequence numbers are processed during read and write operations. It hasn't delved into multi-version data management or the process of cleaning up old version data. We'll explore these topics in future articles.

In summary, LevelDB implements multi-version concurrency control by introducing version numbers into key-values. It achieves read isolation through snapshots, with writes always creating new versions. For read operations, no locks are needed, allowing concurrent reading. For write operations, locks are required to ensure the order of writes.

This design provides excellent concurrent performance, ensures read consistency, and reduces lock contention. However, the trade-offs are additional storage space overhead and the code complexity that comes with maintaining multiple versions.
