---
title: GPT4 代码解释器：当 AI 可以执行代码
tags:
  - GPT4
category: 人工智能
toc: true
description: 
---

OpenAI 在 2023 年 3 月份的博客 [ChatGPT plugins](https://openai.com/blog/chatgpt-plugins) 中介绍了插件功能，当时就提到了两个十分重要，并且 OpenAI 自己托管的插件 `web browser` 和 `code interpreter`，关于代码解释器(code interpreter)，原文是这样说的：

> We provide our models with a working Python interpreter in a sandboxed, firewalled execution environment, along with some ephemeral disk space. Code run by our interpreter plugin is evaluated in a persistent session that is alive for the duration of a chat conversation (with an upper-bound timeout) and subsequent calls can build on top of each other. We support uploading files to the current conversation workspace and downloading the results of your work.

也就是说，我们可以上传文件，用自然语言去描述具体的需求，然后由 ChatGPT 自行编写 Python 代码，并且在沙箱环境中执行，还可以下载结果文件。官方列出了几个比较好的使用场景：

- 解决定量和定性的数学问题
- 进行数据分析和可视化
- 转换文件的格式

从 2023.7.6 号起，OpenAI 开始逐步给 Plus 用户灰度代码解释器(code interpreter)功能，具体可以看 [ChatGPT — Release Notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)，可以在[官方论坛](https://community.openai.com/tag/code-interpreter)中看到有关代码解释器的一些帖子。接下来本篇文章给大家展示如何用代码解释器来完成一些复杂任务。

<!--more-->

## 运行 Python 代码

## 数据可视化

代码解释器带来的最引人注目的功能之一就是数据可视化。代码解释器使 GPT-4 能够生成广泛的数据可视化，包括 3D 曲面图、散点图、径向条形图和树形图等。

[New York City Airbnb Open Data](https://www.kaggle.com/datasets/dgomonov/new-york-city-airbnb-open-data/code?resource=download) 上面有一个Airbnb给的纽约在2019年的[租房数据集](https://www.kaggle.com/datasets/dgomonov/new-york-city-airbnb-open-data/download?datasetVersionNumber=3)。



## 面临的限制

### 语言和库的限制
目前只支持 Python 语言，后面估计也只会支持一些解释性语言，比如 R, JavaScript 等。具体可以看 [Is the OpenAI Code Interpreter for Python only?](https://community.openai.com/t/is-the-openai-code-interpreter-for-python-only/228669) 这篇帖子的讨论。另外这里的 Python 解释器只能用官方内置提供的一些第三方库，不能自己安装、使用其他库。

那么目前有支持哪些库呢？既然它能自己运行代码，可以直接让它列出支持的库。

### 无互联网网络

**解释器中的代码不能访问互联网**。

### 资源限制

**解释器有资源限制**。

[ChatGPT code interpreter 插件初体验](https://zhuanlan.zhihu.com/p/628095564)