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

这里 i 是无符号整数，`posVec.size()` 返回的也是无符号整数类型 size_t。当 posVec.size() 小于 gramCount 时，`posVec.size() - gramCount` 会**溢出**，变成一个很大的正整数。接着在循环中，会用这个很大的正整数来遍历 posVec，就会导致**数组越界**。这里用 operator[] 访问数组的时候，当下标越界就是[未定义行为](https://selfboot.cn/2016/09/18/c++_undefined_behaviours/)，一般会导致程序 crash 掉。写了一个简单测试代码，发现确实 segmentation fault 了。如果用 [at 访问数组](https://cplusplus.com/reference/array/array/at/)的话，如果下标越界，会抛出 out_of_range 异常。

但是模块 A 中这里的代码却没有 crash，而是导致 worker 线程一直被占用，这又是为什么呢？一个可疑的地方就是，上面的代码其实是在一个新开的线程池中跑的。再补充说下这里的背景，模块 A 收到 RPC 请求后，会在一个 worker 线程中处理业务逻辑。有部分业务逻辑比较耗时，为了提高处理速度，会把耗时的部分放到一个额外的线程池来并发执行。

这里线程池的实现稍微有点复杂，大致思路就是**一个任务队列 + 配置好的 N 个 worker 线程**。任务队列用来存放需要执行的任务，worker 线程从任务队列中取任务执行。线程池对外提供了一个接口 `RunTask(concur, max_seq, task);` 其中 concur 是并发执行的线程数，max_seq 是任务总数，task 是任务函数。RunTask 会用 concur 个线程并发执行这个任务函数 task，直到 max_seq 个任务全部完成。

在任务开始前，RunTask 里面定义了一个管道，用来在主线程和任务线程池之间同步消息。一旦所有线程完成任务，最后一个退出的线程会向管道写入一个字符以通知主线程。主线程会等待管道中的字符，然后返回。

上面有整数溢出的代码，就是放在这个额外的线程池执行的，难道是线程池导致的问题？为了快速验证猜想，写了个简单的测试脚本，把上面代码放到线程池执行，进程果真卡住没反应了。首先猜想，会不会是线程池中的线程因为数组越界导致 crash 掉，没有写 pipe，导致主线程一直阻塞在 pipe 的读操作上呢？

下面来验证下。

## 多线程：thread 

为了验证上面的猜想，写了一个简单的测试程序，模拟业务中线程池的工作流程。这里用 C++11 的 thread 来开启 5 个新线程，并且让这些线程 sleep 一段时间模拟执行任务。当所有线程都执行完任务后，最后一个完成的线程向管道写入一个字符，主线程阻塞在管道读取上。测试代码如下：

```c++
#include <iostream>
#include <stdexcept>
#include <thread>
#include <vector>
#include <atomic>
#include <unistd.h>
#include <chrono>
#include <iomanip>
#include <sstream>

std::atomic<int> completedThreads(0);

void printCurrentTimeAndThread(const std::string& prefix) {
    auto now = std::chrono::system_clock::now();
    auto now_c = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << std::put_time(std::localtime(&now_c), "%Y-%m-%d %H:%M:%S");
    std::cout << prefix << " Thread ID: " << std::this_thread::get_id() << " - " << ss.str() << std::endl;
}

void threadFunction(int fds[2], int totalThreads) {
    std::this_thread::sleep_for(std::chrono::seconds(1)); // 模拟一些工作
    int finished = ++completedThreads;
    if (finished == totalThreads) {
        char c = 'o';
        write(fds[1], &c, 1); // 最后一个完成的线程写入管道
    }
    printCurrentTimeAndThread("Completed");
}

int main() {
    printCurrentTimeAndThread("Main thread started");

    int fds[2];
    pipe(fds);

    int totalThreads = 5;
    std::vector<std::thread> threads;
    for (int i = 0; i < totalThreads; ++i) {
        threads.emplace_back(threadFunction, fds, totalThreads);
    }

    char buf;
    std::cout << "Main thread is now waiting for read..." << std::endl;
    read(fds[0], &buf, 1); // 主线程阻塞在这里等待管道写入

    // 这里注释掉会发生什么呢？
    for (auto& thread : threads) {
        if (thread.joinable()) {
            thread.join();
        }
    }

    close(fds[0]);
    close(fds[1]);

    printCurrentTimeAndThread("Main thread finished");

    return 0;
}
```

运行后发现这里是符合预期的，5 个线程并发执行 1s，主线程等最后一个线程执行完，就会从管道中读到结果继续往下执行。结果如下：

```shell
Main thread started Thread ID: 140358584862528 - 2024-06-12 11:40:51
Main thread is now waiting for read...
Completed Thread ID: 140358568072960 - 2024-06-12 11:40:52
Completed Thread ID: 140358559680256 - 2024-06-12 11:40:52
Completed Thread ID: 140358551287552 - 2024-06-12 11:40:52
Completed Thread ID: 140358584858368 - 2024-06-12 11:40:52
Completed Thread ID: 140358576465664 - 2024-06-12 11:40:52
Main thread finished Thread ID: 140358584862528 - 2024-06-12 11:40:52
```

现在让最后一个子线程直接抛出异常，来看看主线程是否阻塞。在上面代码基础上改动如下：

```c++
//...
    if (finished == totalThreads) {
        throw std::out_of_range("Out of range exception"); // 模拟 at 越界访问数组，抛出异常
        char c = 'o';
        write(fds[1], &c, 1); // 最后一个完成的线程写入管道
    }
```

重新编译运行发现整个进程直接 crash 掉了，结果如下：

```shell
Main thread started Thread ID: 140342189496128 - 2024-06-12 11:46:23
Main thread is now waiting for read...
Completed Thread ID: 140342189491968 - 2024-06-12 11:46:24
Completed Thread ID: 140342181099264 - 2024-06-12 11:46:24
Completed Thread ID: 140342172706560 - 2024-06-12 11:46:24
Completed Thread ID: 140342164313856 - 2024-06-12 11:46:24
terminate called after throwing an instance of 'std::out_of_range'
  what():  Out of range exception
[1]    2622429 abort      ./thread_test2
```

看来前面的猜想失败了！在多线程下，单个线程抛出异常导致整个进程 abort 掉了。这是什么原因呢，**C++ 的异常处理机制**又是怎么样的呢？

### C++ 异常处理

在 C++ 中，当程序遇到一个无法自行解决的问题时，它可以抛出（throw）一个异常。异常通常是一个从标准异常类派生的对象，如 std::runtime_error。编程时，可以把可能抛异常的代码放到 try 块里面，然后在后面跟一个或多个 catch 块，用来捕获和处理特定类型的异常。

如果在当前作用域内没有捕获异常，**异常将被传递到调用栈中较高层的 try-catch 结构中**，直到找到合适的 catch 块。如果整个调用栈都没有找到合适的 catch 块，会调用 [std::terminate()](https://en.cppreference.com/w/cpp/error/terminate)，具体执行操作由 std::terminate_handler 指定，默认下是调用 [std::abort](https://en.cppreference.com/w/cpp/utility/program/abort)。如果没有设置信号处理程序捕获 SIGABRT 信号，那么程序就会被异常终止。

对于上面的示例多线程代码来说，最后一个线程抛出异常，但是没有地方捕获，所以最终调用 std::abort() 终止整个进程。从上面的输出也可以看到，最后一行是 abort。

其实 C++ 之所以这样设计，是因为一个未捕获的异常通常意味着程序已经进入一个未知的状态，继续运行可能会导致更严重的错误，如数据损坏或安全漏洞。因此，**立即终止程序被认为是一种安全的失败模式**。

### thread 对象生命周期

这里再提一个地方，上面示例程序，主线程最后会对每个子线程的 thread 对象调用 thread.join()，如果把这里注释掉，运行程序会发生什么呢？进程还是会 crash 掉，并且也是调用的 terminate()。这又是为什么呢？

其实前面 terminate 的文档里有提到，下面这种情况也会调用 terminate：

> 10) A joinable std::thread is destroyed or assigned to.

接着继续查看 std::thread::joinable 的文档，发现如下解释：

> A thread that has finished executing code, but has not yet been joined is still considered an active thread of execution and is therefore joinable.

我们知道，子线程在执行完相关代码后会自动退出，即其执行流程会自行结束。但是，这并不意味着与该线程相关联的 std::thread 对象会自动处理这个线程的所有资源和状态。在 C++ 中，操作系统线程的结束和 std::thread 对象的生命周期管理是两个相关但又相对独立的概念：

- **操作系统的线程**：当线程执行完代码后会自动停止，此时线程的系统资源（如线程描述符和堆栈）通常会被操作系统回收。
- **std::thread 对象的管理**：虽然线程已经结束，但是 std::thread 对象依然需要正确地更新其状态来**反映线程已经不再活跃**。这一点主要是通过 [join()](https://en.cppreference.com/w/cpp/thread/thread/join) 或 detach() 方法来实现的。如果没有调用这些方法，std::thread 对象在被销毁时将检测到它仍然“拥有”一个活跃的线程，这将导致调用 std::terminate()。

前面示例代码中主线程调用 join() 方法，会阻塞等待子线程执行完(其实就这里的例子来说，管道写入字符已经确保执行完了的)，然后标记 std::thread 对象状态为“非活跃”。

那么回到前面的问题，为啥业务代码中线程池中的线程抛出异常，主线程会卡住呢？接着仔细看了下线程池的实现代码，发现这里并不是用 thread 来创建线程，而是用的 [std::async](https://en.cppreference.com/w/cpp/thread/async)。async 是什么？它是怎么工作的，这里线程卡死会和 async 有关吗？

接着一起来验证吧。

## 多线程：async 

C++11 引入了 std::async，这是一个用于**简化并发编程**的高级工具，它可以在**异步的执行上下文中运行一个函数或可调用对象，并返回一个 std::future 对象**来访问该函数的返回值或异常状态。

哈哈，看完这里的介绍，是不是一头雾水、不知所云？没事，先抛开这些，直接看代码先。我们在前面 thread 示例代码的基础上，稍加改动，用 async 来并发执行，完整代码如下：

```c++
#include <iostream>
#include <stdexcept>
#include <future>
#include <vector>
#include <atomic>
#include <unistd.h>
#include <chrono>
#include <iomanip>
#include <sstream>

std::atomic<int> completedThreads(0);

void printCurrentTimeAndThread(const std::string& prefix) {
    auto now = std::chrono::system_clock::now();
    auto now_c = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << std::put_time(std::localtime(&now_c), "%Y-%m-%d %H:%M:%S");
    std::cout << prefix << " Thread ID: " << std::this_thread::get_id() << " - " << ss.str() << std::endl;
}

void threadFunction(int fds[2], int totalThreads) {
    std::this_thread::sleep_for(std::chrono::seconds(1)); // 模拟一些工作
    int finished = ++completedThreads;
    if (finished == totalThreads) {
	throw std::out_of_range("Out of range exception"); // 模拟 at 越界访问数组，抛出异常
        char c = 'o';
        write(fds[1], &c, 1); // 最后一个完成的线程写入管道
    }
    printCurrentTimeAndThread("Completed");
}

int main() {
    printCurrentTimeAndThread("Main thread started");

    int fds[2];
    pipe(fds);

    int totalThreads = 5;
    std::vector<std::future<void>> futures;
    for (int i = 0; i < totalThreads; ++i) {
        futures.push_back(std::async(std::launch::async, threadFunction, fds, totalThreads));
    }

    char buf;
    std::cout << "Main thread is now waiting for read..." << std::endl;
    read(fds[0], &buf, 1); // 主线程阻塞在这里等待管道写入
    close(fds[0]);
    close(fds[1]);

    printCurrentTimeAndThread("Main thread finished");
    return 0;
}
```

运行后发现，主线程卡住了！！运行结果如下：

```shell
Main thread started Thread ID: 140098007660352 - 2024-06-12 21:06:00
Main thread is now waiting for read...
Completed Thread ID: 140097990870784 - 2024-06-12 21:06:01
Completed Thread ID: 140097974085376 - 2024-06-12 21:06:01
Completed Thread ID: 140097999263488 - 2024-06-12 21:06:01
Completed Thread ID: 140098007656192 - 2024-06-12 21:06:01

```


### 异常捕获


## 总结

