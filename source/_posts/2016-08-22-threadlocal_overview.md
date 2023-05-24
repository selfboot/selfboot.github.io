title: 深入理解Python中的ThreadLocal变量（上）
date: 2016-08-22 22:02:50
category: 程序设计
tags: [Python, Thread]
toc: true
---

我们知道多线程环境下，每一个线程均可以使用所属进程的全局变量。如果一个线程对全局变量进行了修改，将会影响到其他所有的线程。为了避免多个线程同时对变量进行修改，引入了线程同步机制，通过互斥锁，条件变量或者读写锁来控制对全局变量的访问。

只用全局变量并不能满足多线程环境的需求，很多时候线程还需要拥有自己的私有数据，这些数据对于其他线程来说不可见。因此线程中也可以使用局部变量，局部变量只有线程自身可以访问，同一个进程下的其他线程不可访问。

有时候使用局部变量不太方便，因此 python 还提供了 ThreadLocal 变量，它本身是一个全局变量，但是每个线程却可以利用它来保存属于自己的私有数据，这些私有数据对其他线程也是不可见的。下图给出了线程中这几种变量的存在情况：

![线程变量][1]

<!--more-->

# 全局 VS 局部变量

首先借助一个小程序来看看多线程环境下全局变量的同步问题。

```python
import threading
global_num = 0

def thread_cal():
    global global_num
    for i in xrange(1000):
        global_num += 1

# Get 10 threads, run them and wait them all finished.
threads = []
for i in range(10):
    threads.append(threading.Thread(target=thread_cal))
    threads[i].start()
for i in range(10):
    threads[i].join()

# Value of global variable can be confused.
print global_num
```

这里我们创建了10个线程，每个线程均对全局变量 global_num 进行1000次的加1操作（循环1000次加1是为了延长单个线程执行时间，使线程执行时被中断切换），当10个线程执行完毕时，全局变量的值是多少呢？答案是不确定。简单来说是因为 `global_num += 1` 并不是一个原子操作，因此执行过程可能被其他线程中断，导致其他线程读到一个脏值。以两个线程执行 +1 为例，其中一个可能的执行序列如下（此情况下最后结果为1）：

![多线程全局变量同步][2]

多线程中使用全局变量时普遍存在这个问题，解决办法也很简单，可以使用互斥锁、条件变量或者是读写锁。下面考虑用互斥锁来解决上面代码的问题，只需要在进行 +1 运算前加锁，运算完毕释放锁即可，这样就可以保证运算的原子性。

```python
l = threading.Lock()
...
    l.acquire()
    global_num += 1
    l.release()
```

在线程中使用局部变量则不存在这个问题，因为每个线程的局部变量不能被其他线程访问。下面我们用10个线程分别对各自的局部变量进行1000次加1操作，每个线程结束时打印一共执行的操作次数（每个线程均为1000）：

```python
def show(num):
    print threading.current_thread().getName(), num

def thread_cal():
    local_num = 0
    for _ in xrange(1000):
        local_num += 1
    show(local_num)

threads = []
for i in range(10):
    threads.append(threading.Thread(target=thread_cal))
    threads[i].start()
```

可以看出这里每个线程都有自己的 local_num，各个线程之间互不干涉。

# Thread-local 对象

上面程序中我们需要给 show 函数传递 local_num 局部变量，并没有什么不妥。不过考虑在实际生产环境中，我们可能会调用很多函数，每个函数都需要很多局部变量，这时候用传递参数的方法会很不友好。

为了解决这个问题，一个直观的的方法就是建立一个全局字典，保存进程 ID 到该进程局部变量的映射关系，运行中的线程可以根据自己的 ID 来获取本身拥有的数据。这样，就可以避免在函数调用中传递参数，如下示例：

```python
global_data = {}
def show():
    cur_thread = threading.current_thread()
    print cur_thread.getName(), global_data[cur_thread]

def thread_cal():
    cur_thread = threading.current_thread()
    global_data[cur_thread] = 0
    for _ in xrange(1000):
        global_data[cur_thread] += 1
    show()  # Need no local variable.  Looks good.
...
```

保存一个全局字典，然后将线程标识符作为key，相应线程的局部数据作为 value，这种做法并不完美。首先，每个函数在需要线程局部数据时，都需要先取得自己的线程ID，略显繁琐。更糟糕的是，这里并没有真正做到线程之间数据的隔离，因为每个线程都可以读取到全局的字典，每个线程都可以对字典内容进行更改。

为了更好解决这个问题，python 线程库实现了 ThreadLocal 变量（很多语言都有类似的实现，比如Java）。ThreadLocal 真正做到了线程之间的数据隔离，并且使用时不需要手动获取自己的线程 ID，如下示例：

```python
global_data = threading.local()

def show():
    print threading.current_thread().getName(), global_data.num

def thread_cal():
    global_data.num = 0
    for _ in xrange(1000):
        global_data.num += 1
    show()

threads = []
...

print "Main thread: ", global_data.__dict__ # {}
```

上面示例中每个线程都可以通过 global_data.num 获得自己独有的数据，并且每个线程读取到的 global_data 都不同，真正做到线程之间的隔离。

Python通过 local 类来实现 ThreadLocal 变量，代码量不多（只有100多行），但是比较难理解，涉及很多 Python 黑魔法，[下一篇](http://selfboot.cn/2016/08/26/threadlocal_implement/)再来详细分析。那么 ThreadLocal 很完美了？不！Python 的 WSGI 工具库 werkzeug 中有一个更好的 [ThreadLocal 实现](https://github.com/pallets/werkzeug/blob/8a84b62b3dd89fe7d720d7948954e20ada690c40/werkzeug/local.py)，甚至支持协程之间的私有数据，实现更加复杂，有机会再分析。

# 更多阅读

[Thread local storage in Python](http://stackoverflow.com/questions/1408171/thread-local-storage-in-python)
[threading – Manage concurrent threads](https://pymotw.com/2/threading/)
[Python线程同步机制](https://harveyqing.gitbooks.io/python-read-and-write/content/python_advance/python_thread_sync.html)
[Linux多线程与同步](http://www.cnblogs.com/vamei/archive/2012/10/09/2715393.html)
[Are local variables in a python function thread safe?](https://www.quora.com/Are-local-variables-in-a-python-function-thread-safe)


[1]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160822_threadlocal_overview_1.png
[2]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160822_threadlocal_overview_2.png


