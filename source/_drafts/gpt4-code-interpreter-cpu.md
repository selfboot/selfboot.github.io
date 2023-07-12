---
title: GPT4 代码解释器：OpenAI 提供了多少 CPU
tags: GPT4
category: 人工智能
toc: true
description: 本文探索了GPT-4的代码解释器。
---

在 [GPT4 代码解释器：资源限制详解](https://selfboot.cn/2023/07/09/gpt4_code_interpreter_limit/) 的文章中，我们实验拿到了 ChatGPT 的 Code Interpreter 提供了16个 X86_64 类型的 CPU 核。但是在验证有没有限制 CPU 进程数的时候遇到了问题，没法正确估算出这里可以用的 CPU 核。本篇文章将尝试回答下面的问题：

1. 为什么之前的代码没法拿到 CPU 核数；
2. 如何估算可以用的 CPU 核数；
3. ChatGPT 的 CPU 核数限制是多少；

当然本文还是基于下面的思路来验证可用的 CPU 核数：

> 定义一个比较耗 CPU 时间的计算函数, 串行执行 N 次记录总时间 m1, 然后每个核起一个进程并行运行 N 次，计算总时间 m2，那么总的核数大约是 core = m1/m2。

![CPU 核数判定](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230712_gpt4_code_interpreter_cpu_multicore.png)

<!--more-->

## 并行没加速？

再来回顾 [进程 CPU 限制](https://selfboot.cn/2023/07/09/gpt4_code_interpreter_limit/#%E8%BF%9B%E7%A8%8B-CPU-%E9%99%90%E5%88%B6) 这里的实验代码，运行发现并行的执行时间并没有提高，当时分析可能的原因：

- 计算任务的规模可能不够大，导致进程的启动和管理开销可能占据主导地位，使得并行计算的效率并没有提高。
- 操作系统决定哪个进程在何时运行，以及它应该运行多长时间。根据其调度策略，操作系统可能会决定在同一时间只运行一个或两个进程，而让其他进程等待。

先来看第一个原因，现代操作系统启动一个进程通常需要在毫秒级别（例如，1-10ms），包括加载程序到内存、设置进程控制块（PCB）、建立必要的内核结构等。进程的切换常需要在微秒级别（例如，1-100µs），包括保存当前进程的状态，并加载新进程的状态。这个和整体的计算任务耗时比，基本可以忽略。

再来看第二个原因，这里后来换了几个操作系统，结果跑起来得到的数据都不对，应该不是操作系统对进程资源的限制。那么为什么之前的代码串行和并行运行时间差别不大呢？

### numpy

再回顾下之前脚本的主要计算任务，这个是 ChatGPT 生成的代码，用来模拟 CPU 密集计算。

```python
import numpy as np

def compute_heavy(n):
    # Perform a heavy computation
    np.linalg.eig(np.random.rand(n, n))
    return n
```

我们知道 numpy 是 python 用来做高性能数据处理的库，