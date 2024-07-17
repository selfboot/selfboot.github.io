---
title: LevelDB 源码阅读：总述篇
tags: [C++, LevelDB]
category: 源码剖析
toc: true
description: 
---

断断续续边阅读 LevelDB 的源码，边梳理总结文章，终于完成了 LevelDB 源码阅读系列的文章。这系列文章会涵盖 LevelDB 代码实现的方方面面，会讲 C++ 语言的高级特性，会深入 LevelDB 的实现细节，也会去解读测试用例。这些文章不止是写给大家看的，更是自己在阅读源码中思考的沉淀。很多次，在写着写着，就会发现一些之前没有注意到的问题，大概写作过程也是一种更深入的思考过程吧。

<!-- more -->

下面是系列文章的链接：
<!-- TODO -->



虽然本系列文章写的很详细，包含大量代码细节，以及 LevelDB 实现背后的解释，但是不要奢想读完这系列文章，就可以对 LevelDB 的源码了如指掌。毕竟，绝知此事要躬行，只有自己亲自去读，去反复读，才能真正理解吧。我只希望这系列文章能够引起你对 LevelDB 源码的兴趣。

## 缘起

为什么要阅读 LevelDB 源码，并整理一系列文章？

工作以来，做业务开发比较久，更多是**围绕产品需求来做开发**。写的代码比较多，但似乎没有太多高深技术含量。平常读的代码，也是业务代码为主，偶尔也会去看一些开源代码，但是还没有**系统完整地读完一个开源项目的源码**。于是就想着选一个比较经典的开源项目，系统地读一读，看看别人是怎么写代码的。

之前工作上用过 LevelDB，知道它是一个**高性能的键值存储引擎**，是 Google 的 Jeff Dean 和 Sanjay Ghemawat 两位大神写的。LevelDB 十分经典，业界广泛使用的存储组件 Rocksdb 也是基于 LevelDB 改进的。这么优秀的代码，自然值得阅读。此外，相比其他经典开源项目，**LevelDB 的代码量不大**，不至于耗费太长时间来理解(实践下来，发现要读完也费了不少时间)。

另外，现在有了 LLM 大语言模型，**可以用 GPT4 和 Claude 来帮忙解读代码**。万一遇到看不太明白的地方，可以随时丢给 AI 来解读，不会在一个地方卡太久。在实际阅读代码过程中，AI 确实给了不少帮助，提供了不少很有意思的视野。

**写作是另一个维度地思考，是更深入的思考**。所以在阅读源码的过程中，我写了这系列文章，来记录思考的过程。其实网上已经有不少 LevelDB 源码解析的文章，但是大多数**重点在讲整体实现思想，没有讲很多代码实现细节**。看完之后，只觉得 LevelDB 的设计确实精妙，但终究有种雾里看花的感觉，似乎懂了，又似乎没懂。比如 LevelDB 会定期做 compaction，但是具体怎么做的，中间有什么优化细节，就不太清楚了。

本系列文章中，我会深入到代码实现细节中，会附带大量的代码片段，尽量通过代码来理解 LevelDB 的实现。

## LevelDB 并不简单

LevelDB 的代码量并不大，但是阅读起来并不简单。

## 代码的艺术

LevelDB 不愧是 Google 大师出品，代码逻辑清晰、设计优雅、注释详细、测试充分、优化极致，是我读过最美的代码。

### 清晰的处理逻辑


### 优秀的代码设计


### 极致的优化细节


为了减少 SSTable 中索引的大小，在创建 DataBlock 的时候，会使用最短分割字符串作为索引 key，具体可以参考 [LevelDB 源码阅读：SSTable 文件生成与解析](leveldb_source_table_process/) 

```cpp
  if (r->pending_index_entry) {
    assert(r->data_block.empty());
    r->options.comparator->FindShortestSeparator(&r->last_key, key);
    std::string handle_encoding;
    r->pending_handle.EncodeTo(&handle_encoding);
    r->index_block.Add(r->last_key, Slice(handle_encoding));
    r->pending_index_entry = false;
  }
```

### 无处不在的校验


### 完整的测试


## AI 帮助读代码

整个阅读源码过程中，经常会求助 ChatGPT，让 AI 来帮我解释下。提问也很简单，直接给出一段代码，然后让 AI 解读一下，甚至都不用什么复杂的提示词，GPT 4 就能给出很好的解释。


