---
title: Bazel 缺失依赖导致的 C++ 进程 coredump 问题分析
tags:
  - C++
  - Debug
category: 程序设计
toc: true
description: 
date: 
---

最近在项目中又遇到了一个奇怪的 coredump 问题，排查过程并不顺利。经过不断分析，找到了一个复现 coredump 的步骤，经过合理猜测和谨慎验证，最终才定位到原因。

![C++ coredump bazel依赖缺失](https://slefboot-1251736664.file.myqcloud.com/20231123_object_memory_coredump_cover.png)

回过头来再看这个问题，发现其实是一个比较常见的**二进制兼容**问题。只是项目代码依赖比较复杂，对 bazel 编译过程的理解也不是很到位，所以定位比较曲折。另外，在复盘过程中，对这里的 coredump 以及 **C++ 对象内存分布**也有了更多理解。于是整理一篇文章，如有错误，欢迎指正。

<!-- more -->

## 问题描述

## 复现步骤

## 猜测与验证

## ABI 二进制兼容

[C++ 工程实践(4)：二进制兼容性](https://www.cppblog.com/Solstice/archive/2011/03/09/141401.html)
