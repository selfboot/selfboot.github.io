---
title: GPT4 代码解释器：OpenAI 提供了多少 CPU
tags: GPT4
category: 人工智能
toc: true
description: 本文探讨了 OpenAI GPT-4 代码解释器中的 CPU 核心数量。通过实验确定了 GPT-4 能够提供的 CPU 核心数量并解决了一些遇到的问题，包括无法正确估算 CPU 核心数量的问题以及如何改善并行计算效率的问题。
date: 2023-07-17 22:47:24
---

在 [GPT4 代码解释器：资源限制详解](https://selfboot.cn/2023/07/09/gpt4_code_interpreter_limit/) 的文章中，我们实验拿到了 ChatGPT 的 Code Interpreter 提供了16个 X86_64 类型的 CPU 核。但是在验证有没有限制 CPU 进程数的时候遇到了问题，没法正确估算出这里可以用的 CPU 核。本篇文章将尝试回答下面的问题：

1. 为什么之前的代码没法拿到 CPU 核数；
2. 如何拿到 ChatGPT 的 CPU 核数限制；

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

### numpy 并行优化

再回顾下之前脚本的主要计算任务，这个是 ChatGPT 生成的代码，用来模拟 CPU 密集计算。

```python
import numpy as np

def compute_heavy(n):
    # Perform a heavy computation
    np.linalg.eig(np.random.rand(n, n))
    return n
```

我们知道 numpy 是 python 用来做**高性能数据处理**的库，底层一些计算任务会用做很多优化来提高执行速度。一些函数会自动调用多线程并行计算以加速，比如dot、eig、svd等。这依赖于线性代数库如`OpenBLAS`、`MKL`等的多线程实现。这里 `compute_heavy` 在多进程中也没有优化多少执行空间，原因应该就是调用了底层的一些多线程并行计算进行了加速。

## 计算密集任务

既然上面的计算任务会自动在底层进行优化，这里我们重新设计计算任务的代码，让它在单进程中只能串行执行即可。这里可以将 `compute_heavy` 函数修改为计算一个大数的阶乘，这是一个计算密集型的任务，不依赖于 NumPy 的内部并行化。具体实现如下：

```python
def factorial(n):
    # Perform a heavy computation: calculate factorial of a large number
    fact = 1
    for i in range(1, n+1):
        fact *= i
    return fact
```

可以选择一个足够大的数（例如 1000）来计算阶乘，以确保任务是计算密集型的。如果任务太小，那么并行化的开销可能会超过并行化的收益。

### 完整测试代码

这里完整测试代码如下：

```python
import time
import math
from multiprocessing import Pool

def factorial(n):
    # Perform a heavy computation: calculate factorial of a large number
    fact = 1
    for i in range(1, n+1):
        fact *= i
    return fact

def main(task_size, num_tasks):
    # Count number of seconds elapsed when running tasks in parallel
    with Pool() as pool:
        start_time = time.time()
        pool.map(factorial, [task_size]*num_tasks)
        elapsed_time_parallel = time.time() - start_time

    # Count number of seconds elapsed when running tasks in sequence
    start_time = time.time()
    list(map(factorial, [task_size]*num_tasks))
    elapsed_time_sequence = time.time() - start_time

    # If tasks run faster in parallel, it's likely that multiple cores are being used
    cores_estimated = math.ceil(elapsed_time_sequence / elapsed_time_parallel)

    return elapsed_time_parallel, elapsed_time_sequence, cores_estimated

main(50000, 50)
```

通过不断调整 task_size 和 num_tasks，来实验拿到一个最大的 CPU 核数，下面是一些实验结果：

|task_size| num_tasks| time_parallel | time_sequence | cpu |
|--|--|--|--|--|
|1000 | 20 | 0.041 | 0.007 | 1 |
|5000 | 50 | 0.056 | 0.265 | 5 |
|5000 | 500 |0.292 | 2.693| 10 |
|5000 | 5000 | 2.091 | 27.632 | 14 |
|5000 | 10000 | 4.290 | 53.859 | 13 |
|50000| 50 | 2.577 | 30.324| 12|
|50000| 80 | 3.989 | 48.574 | 13 |
|100000| 10 | 2.783 | 25.576 | 10 |

可以看到 `task_size=1000，num_tasks=20` 的时候，串行执行的时间比并行执行的时间还要短，这可能是因为任务切换和进程间通信的开销大于并行处理带来的性能提升。通过增大task_size，从而增加计算任务的耗时，会降低进程开销带来的影响。在同样的计算任务下，总的任务数越多，越能利用好多核的能力。但是任务数太多的话，耗时可能超过 ChatGPt 的 120s 限制，无法得出结果。

![CPU 核数判定](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230717_gpt4_code_interpreter_cpu_timelimit.png)

通过多次实验发现 cpu 最大是 14，也就是说，这里可用的 cpu 核数应该是大于等于 14 核的。