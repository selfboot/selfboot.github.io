---
title: Minbpe 源码阅读：从零实现 BPE 分词器
tags: [Python, LLM]
category: 源码剖析
toc: true
description: 
---

Andrej Karpathy 为了清晰介绍 BPE 的实现原理，开源了 [minbpe](https://github.com/karpathy/minbpe) 项目。整体代码量不多，但麻雀虽小，五脏俱全，对于理解 BPE 还是有不少帮助的。

