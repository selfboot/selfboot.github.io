---
title: LevelDB 源码阅读：总述篇
tags: [C++, LevalDB]
category: 源码剖析
toc: true
description: 
---

断断续续边阅读 LevelDB 的源码，边梳理总结文章，终于完成了这个系列。

## 缘起

为什么要阅读 LevelDB 源码，并整理一系列文章？

网上已经有不少 LevelDB 源码阅读的文章，但是大多数重点在讲整体实现思想，没有讲很多代码实现细节。看这些文章，只觉得 LevelDB 的设计确实精妙，但终究有种雾里看花的感觉，似乎懂了，又似乎没懂。


## LevelDB 并不简单

LevelDB 的代码量并不大，但是阅读起来并不简单。

## 代码的艺术

LevelDB 不愧是 Google 的大师出品，代码写得非常漂亮，注释也很详细。

### 无处不在的校验


