---
title: 溢出、异常、线程池、阻塞，奇怪的服务重启问题定位
tags:
  - C++
category: 程序设计
toc: true
description: 
date: 
---

最近在业务中遇见一个很奇怪的服务重启问题，定位过程比较有曲折，本文来复盘下。这个问题涉及到 C++ 线程池、整数溢出、异常捕获、阻塞等多个方面，还是挺有意思的。

接下来我会按照**问题排查的过程**来组织本文内容，会先介绍问题背景，接着列出初步的排查思路，定位异常请求的方法。然后，通过代码分析，以及复现问题的一些简单用例，来揭开服务重启的神秘面纱。

<!-- more -->

## 问题背景

我们有个模块 A 对外提供 RPC 服务，主调方 B 会调用 A 的服务。模块 A 是一个 C++ 的多线程服务，在服务启动的时候，通过配置文件指定了处理请求的 worker 线程数。每当有一个 rpc 请求过来，就会分配一个 worker 线程来处理。最近，主调方 B 通过监控发现每天会有几次连不上模块 A 的服务端口，每次持续时间也不长，过一会就自动恢复了。

简单看了下模块 A 的日志，发现在对应时间点，**监控脚本拨测 A 服务失败，于是重启服务**。这里的监控脚本每隔固定时间，会拨测模块 A 的 存活探测 rpc(就是简单回复一个 hello)，来检测服务是否正常。如果连续的几次拨测都失败，则认为服务有问题，就尝试重启服务。这次模块 A 的偶现重启，就是脚控脚本发现一直没法拿到存活探测 rpc 的回复，于是重启服务。

那么**什么时候开始出现这个问题呢？**，把模块 A 的监控时间拉长，发现 7 天前才开始有偶现的诡异重启。模块 A 的每台服务器都有重启，重启频次很低，所以模块 A 也没有告警出来。

按照经验，拨测失败一般是服务进程挂了，比如进程 coredump 退出或者内存泄露导致 OOM 被系统杀了。但是查了下模块 A 的日志，发现并不是上面两种情况。模块 A 没看到 coredump 相关的日志，内存使用在重启时间段都是正常的。那会不会是代码中有**死循环导致 worker 线程被占着一直没法释放呢**？看了下重启时间段的 CPU 使用率，也是正常水平。当然如果死循环中一直 sleep，那么 CPU 使用率也不高，不过业务中并没有什么地方用到 sleep，所以这里初步排查不是死循环。

这就有点奇怪了，接着仔细看服务日志来排查吧。

## 初步排查

找了一台最近有重启的机器，先看看重启时间点服务进程的日志。模块 A 用的 C++ 多线程服务，一共有 N 个 worker 线程并发处理业务的 RPC 请求。框架每隔一段时间，会打印日志，记录当前 worker 中有多少是空闲(idle)的，多少正在处理请求(busy)。正常情况下，打印出来的日志中，大部分线程是 idle 的，只有少部分是 busy。

但是在进程重启前，发现日志中的 worker 线程数有点异常，**idle 线程越来越少，直到为 0**。假设总 worker 数为 200，重启前的相关日志大概如下：

```shell
worker idle 100, busy 100;
worker idle 40, busy 160;
worker idle 0, busy 200;
worker idle 0, busy 200;
worker idle 0, busy 200;
...
```

怪不得监控脚本会拨测失败，此刻服务的所有 worker 都被占用，没有空闲 worker 处理新来的请求，所有新来的请求都会排队等待 worker 直到超时失败。

那么是什么原因导致 worker 一直被占用没有释放出来呢？服务是最近才出现这个问题的，所以首先想到可能和最近的变更有关。把最近的代码变更看了下，没发现什么问题。

接下来其实有两个排查思路，第一个是等服务进程再次卡住的时候，通过 gdb attach 进程，或者 gcore 转储 coredump 文件，这样就可以查看 worker 线程的调用栈，看看是什么函数导致 worker 一直被占用。首先排除掉 gdb attach，第一是出现概率比较低，监控脚本会很短时间内重启服务，不太好找到时机，并且现网服务也不太适合 attach 上去排查问题。gcore 的话，需要改动下监控脚本，在拨测有问题的时候，保存下进程 coredump 文件。不过当时考虑到需要改监控脚本，并且通过 coredump 文件不一定能发现问题，所以暂时没采用。

第二个思路就是找到可以复现的请求，通过复现问题来定位，毕竟**如果一个问题能稳定复现，相当于已经解决了一大半**。这里其实基于这样一个假设，**一般偶发的问题，都是由某类特殊的请求触发了一些边界条件导致**。

对于我们的 RPC 模块来说，如果有一个特殊的请求导致 worker 一直被占用，那么这个请求一定是没有回包的。因此，我们可以在模块接收到请求包以及给出响应包的时候，分别打印出相关日志。然后在服务卡住的时间段，就可以过滤出日志中那些只有请求没有响应的 RPC 请求。

加了日志上线后，刚好又一次出现了服务重启，通过日志，终于找到了可疑请求。结合这个可疑请求，发现了一段有问题的代码，正是这段有问题的代码，成为解决问题的突破口。

## 问题代码分析

我们先来看下这段有问题的代码，简化后并隐去关键信息，大致如下：

```c++
int func() {
	const int gramCount = 3;
	vector<int> posVec;
	// GetPosVec(posVec);

	for (size_t i = 0; i< posVec.size() - gramCount; ++i) {
		posVec[i] = i * 2;
	}
	// ...
}
```

聪明如你，一定发现这段代码的问题了吧。

这里 i 是无符号整数，`posVec.size()` 返回的也是无符号整数类型 size_t。当 posVec.size() 小于 gramCount 时，`posVec.size() - gramCount` 会**溢出**，变成一个很大的正整数。接着在循环中，会用这个很大的正整数来遍历 posVec，就会导致**数组越界**。数组越界是[未定义行为](https://selfboot.cn/2016/09/18/c++_undefined_behaviours/)，一般会导致程序 crash 掉，写了一个简单测试代码，发现确实 segmentation fault 了。

但是模块 A 中这里的代码却没有 crash，而是导致 worker 线程一直被占用，这又是为什么呢？一个可疑的地方就是，上面的代码其实是在一个新开的线程池中跑的。再补充说下这里的背景，模块 A 收到 RPC 请求后，会在一个 worker 线程中处理业务逻辑。有部分业务逻辑比较耗时，为了提高处理速度，会把耗时的部分放到一个额外的线程池来并发执行。

上面有整数溢出的代码，就是放在这个额外的线程池执行的，难道是线程池导致的问题？为了快速验证猜想，写了个简单的测试脚本，把上面代码放到线程池执行，进程果真卡住没反应了。

## 多线程：thread 


## 多线程：async 

### 异常捕获

### 水落石出

## 总结
