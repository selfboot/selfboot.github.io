---
title: LevelDB 源码阅读：SSTable 中 DataBlock 存储优化分析
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
date: 2025-07-11 21:00:00
---

在 LevelDB 中，SSTable（Sorted Strings Table）是存储键值对数据的文件格式。前面的文章[LevelDB 源码阅读：一步步拆解 SSTable 文件的创建过程](https://selfboot.cn/2025/06/27/leveldb_source_table_build/) 介绍了 SSTable 文件的创建过程，我们知道了 SSTable 文件由多个数据块组成，这些**块是文件的基本单位**。

这些数据块起始可以分两类，一种是键值对数据块，一种是过滤块数据块。相应的，为了组装这两类数据块，LevelDB 实现了两类 BlockBuilder 类，分别是 BlockBuilder 和 FilterBlockBuilder。这篇文章，我们来看看 BlockBuilder 的实现细节和工程优化。

先来看一个简单的示意图，展示了 LevelDB 中 DataBlock 的存储结构，图的源码在 [leveldb_datablock.dot](https://selfboot.cn/downloads/leveldb_datablock.dot)。

![LevelDB DataBlock 存储结构](https://slefboot-1251736664.file.myqcloud.com/20250711_leveldb_source_block_build_total.webp)

<!-- more -->

## 如何高效存储键值对？

我们知道这里 DataBlock 用来存储有序的键值对，最简单的做法就是直接一个个存储。比如用 [keysize, key, valuesize, value] 这样的格式来存储。那么一个可能的键值对存储结果如下：

```shell
[3, "app", 6, "value1"]
[5, "apple", 6, "value2"] 
[6, "applet", 6, "value3"]
[5, "apply", 6, "value4"]
```

仔细观察这些键，我们会发现一个明显的问题：**存在大量的重复前缀**。

- app, apple, applet, apply 都共享前缀 "app"
- apple, applet 还额外共享前缀 "appl"

这里的例子是我构造的，不过实际的业务场景中，我们的 key 经常都是有大量相同前缀的。这种共同前缀会浪费不少硬盘存储空间，另外读取的时候，也需要传输更多的冗余数据。如果缓存 DataBlock 到内存中，**这种重复数据也会占用更多的内存**。

### 前缀压缩

LevelDB 作为底层的存储组件，肯定要考虑存储效率。为了解决这个问题，LevelDB 采用了**前缀压缩**的存储格式。核心思想是：**<span style="color: red;">对于有序的键值对，后面的键只存储与前一个键不同的部分</span>**。

具体的存储格式变成了：

```shell
[shared_len, non_shared_len, value_len, non_shared_key, value]
```

其中 shared_len 表示与前一个键共享的前缀长度，non_shared_len 表示不共享部分的长度，value_len 表示值的长度，non_shared_key 表示键中不共享的部分，value 表示实际的值。

让我们用前面的例子来看看效果，这里看看前缀压缩后键长度的变化：

| 完整 key | shared_len | non_shared_len | non_shared_key | 存储开销分析 |
|----------|------------|-------|------|-----|
| app      | 0   | 3  | "app"  | 原始：1+3=4，压缩：1+1+3=5，**省1字节** |
| apple    | 3   | 2  | "le"   | 原始：1+5=6，压缩：1+1+2=4，**省2字节** |
| applet   | 5   | 1  | "t"    | 原始：1+6=7，压缩：1+1+1=3，**省4字节** |
| apply    | 3   | 2  | "ly"   | 原始：1+5=6，压缩：1+1+2=4，**省2字节** |

当然这里为了简化，假设长度字段都是 1 字节，实际上LevelDB使用变长编码，不过小长度下，长度也是 1字节的。仔细计算后发现，前缀压缩的效果并不是简单的节省重复前缀，而是需要**权衡前缀长度与额外元数据的存储开销**。

在这个例子中，总体上我们节省了 (2+4+2-1) = 7个字节。其实对于大部分业务场景，这里肯定都能节省不少存储空间的。

### 重启点机制

前缀压缩虽然节省了空间，但带来了新的挑战：**如何快速定位和读取特定的键？**

如果我们想要查找 "apply" 这个键，在压缩存储中我们只能看到：
```
[3, 2, 4, "ly", ...]
```

要重建完整的键 "apply"，我们必须：
1. 从第一个键开始顺序读取
2. 逐步重建每个键的完整形式
3. 直到找到目标键

这在大块数据中会变得非常低效！

### Restart Points：平衡压缩率与查找效率

LevelDB 的巧妙之处在于引入了 **Restart Points（重启点）** 机制来解决这个问题。
