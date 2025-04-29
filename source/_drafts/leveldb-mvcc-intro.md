---
title: LevelDB 源码阅读：结合代码理解多版本并发控制(MVCC)
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
---

在数据库系统中，并发访问是一个常见的场景。多个用户同时读写数据库，如何保证每个人的读写结果都是正确的，这就是并发控制要解决的问题。

考虑一个简单的转账场景，开始的时候 A 账户有 1000 元，要转 800 元给 B 账户。转账过程包括两步：从 A 扣钱，给 B 加钱。恰好在这两步中间，有人查询了 A 和 B 的余额。

如果没有任何并发控制，查询者会看到一个异常现象：A 账户已经被扣除了 800 元，只剩 200 元，B 账户还没收到转账，还是原来的金额！这就是典型的数据不一致问题。为了解决这个问题，数据库系统**需要某种并发控制机制**。

最直观的解决方案是加锁，当有人在进行写操作（如转账）时，其他人的读操作必须等待。回到前面的问题，只有在转账的两步都完成之后，才能查到正确的账户余额。但是锁机制存在明显的问题，每次只要写相关 key，所有读该 key 的操作都要排队等待，导致并发上不去，性能会比较差。

现代数据库系统普遍采用 MVCC 来控制并发，LevelDB 也不例外，接下来我们结合源码来理解 LevelDB 的 MVCC 实现。

## 通过 MVCC 控制并发

MVCC([Multi-Version Concurrency Control](https://en.wikipedia.org/wiki/Multiversion_concurrency_control)) 是一种并发控制机制，它通过维护数据的多个版本来实现并发访问。

LevelDB 的 MVCC 实现主要通过以下方式实现：

- 每个 key-value 可以有多个版本，每个版本都有自己的序列号(sequence number)；
- 写操作创建新版本而不是直接修改现有数据。
- 读操作可以看到特定时间点的数据版本，也叫快照(snapshot)。

接下来结合源码，来看看具体实现。

### 写入 key-value 的过程

```cpp
// 写入新值时
key = "user1"
sequence = GetNextSequence()  // 获取新的序列号
// 在 memtable 中的实际存储格式
entry = [user1][sequence<<8|type][value]
```

特点：
- 同一个 key 的多次写入会产生多个版本
- 每个版本都有唯一的 sequence number
- 较新的版本（sequence number 更大）会排在前面

### 3. 读取过程

```cpp
// 创建快照
snapshot = db->GetSnapshot();  // 获取当前最新的 sequence number

// 读取操作
read_options.snapshot = snapshot;
db->Get(read_options, key, &value);
```

读取时的查找过程：
1. 如果没有指定 snapshot，使用当前最新的 sequence number
2. 从 memtable 开始查找，然后是 immutable memtable，最后是各层 SST 文件
3. 对于每个 key，只返回小于等于 snapshot sequence number 的最新版本

## 4. 并发控制示例

假设有以下操作序列：

```
时间点 T1: sequence=100, 写入 key=A, value=1
时间点 T2: sequence=101, 写入 key=A, value=2
时间点 T3: Reader1 获取 snapshot=101
时间点 T4: sequence=102, 写入 key=A, value=3
时间点 T5: Reader2 获取 snapshot=102
```

此时：
- Reader1 读取 key=A 会得到 value=2（sequence=101）
- Reader2 读取 key=A 会得到 value=3（sequence=102）
- 新的读取（不指定 snapshot）会得到 value=3

## 5. 并发读写的保证

1. **读写互不阻塞**：
   - 写入创建新版本
   - 读取基于 snapshot，看到的是某个时间点的一致性视图
   - 不需要加锁

2. **写写并发**：
   - 通过 log 和 memtable 的互斥锁保证写入顺序
   - 每个写入获得唯一的 sequence number

3. **一致性视图**：
   - 每个 snapshot 代表一个一致性视图
   - 读取操作看到的总是某个时间点之前的所有写入

## 6. 垃圾回收

- 旧版本的数据会在 compaction 过程中被清理
- 如果没有 snapshot 在引用某个版本，该版本可以被删除
- 保留的版本数取决于活跃的 snapshot 数量

### 总结

LevelDB 的 MVCC：
1. 通过 sequence number 实现多版本
2. 通过 snapshot 实现读取隔离
3. 写入永远创建新版本
4. 读取看到的是快照时间点的一致视图
5. 实现了无锁的并发读写

这种设计：
- 提供了很好的并发性能
- 保证了读取的一致性
- 避免了读写冲突
- 代价是存储空间的额外开销（保存多个版本）
