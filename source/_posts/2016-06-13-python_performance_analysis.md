title: Python 性能分析大全
date: 2016-06-13 22:02:50
category: 程序设计
tags: [总结, Python]
toc: true
description: 这篇文章是Python性能分析的全面指南。我们详细介绍了如何使用Python的timeit模块、profile和cProfile模块，以及line_profiler等工具进行性能分析。文章中还包含了大量的示例代码和实际应用场景，帮助读者更好地理解和应用这些工具。无论你是Python新手，还是经验丰富的开发者，这篇文章都能帮你提升代码的性能和效率。
---

虽然运行速度慢是 Python 与生俱来的特点，大多数时候我们用 Python 就意味着放弃对性能的追求。但是，就算是用纯 Python 完成同一个任务，老手写出来的代码可能会比菜鸟写的代码块几倍，甚至是几十倍（这里不考虑算法的因素，只考虑语言方面的因素）。很多时候，我们将自己的代码运行缓慢地原因归结于python本来就很慢，从而心安理得地放弃深入探究。

但是，事实真的是这样吗？面对python代码，你有分析下面这些问题吗：

* 程序运行的速度如何？
* 程序运行时间的瓶颈在哪里？
* 能否稍加改进以提高运行速度呢？

为了更好了解python程序，我们需要一套工具，能够记录代码运行时间，生成一个性能分析报告，方便彻底了解代码，从而进行针对性的优化（本篇侧重于代码性能分析，不关注如何优化）。

<!-- more -->

# 谁快谁慢

假设有一个字符串，想将里面的空格替换为字符‘-’，用python实现起来很简单，下面是四种方案：

```python
def slowest_replace(orignal_str):
    replace_list = []
    for i, char in enumerate(orignal_str):
        c = char if char != " " else "-"
        replace_list.append(c)
    return "".join(replace_list)

def slow_replace(orignal_str):
    replace_str = ""
    for i, char in enumerate(orignal_str):
        c = char if char != " " else "-"
        replace_str += c
    return replace_str

def fast_replace(orignal_str):
    return "-".join(orignal_str.split())

def fastest_replace(orignal_str):
    return orignal_str.replace(" ", "-")
```

这四种方案的效率如何呢，哪种方案比较慢呢？这是一个问题！

# 时间断点

最直接的想法是在开始 replace 函数之前记录时间，程序结束后再记录时间，计算时间差即为程序运行时间。python提供了模块 time，其中 time.clock() 在Unix/Linux下返回的是CPU时间(浮点数表示的秒数)，Win下返回的是以秒为单位的真实时间(Wall-clock time)。

由于替换函数耗时可能非常短，所以这里考虑分别执行 100000次，然后查看不同函数的效率。我们的性能分析辅助函数如下：

```python
def _time_analyze_(func):
    from time import clock
    start = clock()
    for i in range(exec_times):
        func()
    finish = clock()
    print "{:<20}{:10.6} s".format(func.__name__ + ":", finish - start)
```

这样就可以了解上面程序的运行时间情况：

![程序运行时间检测][1]

第一种方案耗时是第四种的 45 倍多，大跌眼镜了吧！同样是 python代码，完成一样的功能，耗时可以差这么多。为了避免每次在程序开始、结束时插入时间断点，然后计算耗时，可以考虑实现一个上下文管理器，具体代码如下：

```python
class Timer(object):
    def __init__(self, verbose=False):
        self.verbose = verbose

    def __enter__(self):
        self.start = clock()
        return self

    def __exit__(self, *args):
        self.end = clock()
        self.secs = self.end - self.start
        self.msecs = self.secs * 1000  # millisecs
        if self.verbose:
            print 'elapsed time: %f ms' % self.msecs
```

使用时只需要将要测量时间的代码段放进 with 语句即可，具体的使用例子放在 [gist](https://gist.github.com/xuelangZF/1d83cd5da734836bc7641bcc92b13ce0) 上。

# [timeit](https://docs.python.org/2/library/timeit.html)

上面手工插断点的方法十分原始，用起来不是那么方便，即使用了上下文管理器实现起来还是略显笨重。还好 Python 提供了timeit模块，用来测试代码块的运行时间。它既提供了命令行接口，又能用于代码文件之中。

### 命令行接口

命令行接口可以像下面这样使用：

```python
$ python -m timeit -n 1000000 '"I like to reading.".replace(" ", "-")'
1000000 loops, best of 3: 0.253 usec per loop
$ python -m timeit -s 'orignal_str = "I like to reading."' '"-".join(orignal_str.split())'
1000000 loops, best of 3: 0.53 usec per loop
```

具体参数使用可以用命令 `python -m timeit -h` 查看帮助。使用较多的是下面的选项：

* -s S, --setup=S: 用来初始化statement中的变量，只运行一次；
* -n N, --number=N: 执行statement的次数，默认会选择一个合适的数字；
* -r N, --repeat=N: 重复测试的次数，默认为3；

### Python 接口

可以用下面的程序测试四种 replace函数的运行情况（完整的测试程序可以在 [gist](https://gist.github.com/xuelangZF/67c97f92d4e4d70208d1e592a1bac1da) 上找到）：

```python
def _timeit_analyze_(func):
    from timeit import Timer
    t1 = Timer("%s()" % func.__name__, "from __main__ import %s" % func.__name__)
    print "{:<20}{:10.6} s".format(func.__name__ + ":", t1.timeit(exec_times))
```

运行结果如下：

![timeit 模块使用][2]

Python的timeit提供了 timeit.Timer() 类，类构造方法如下：

```python
Timer(stmt='pass', setup='pass', timer=<timer function>)
```

其中：

* stmt: 要计时的语句或者函数；
* setup: 为stmt语句构建环境的导入语句；
* timer: 基于平台的时间函数(timer function)；

Timer()类有三个方法：

* timeit(number=1000000): 返回stmt执行number次的秒数(float)；
* repeat(repeat=3, number=1000000): repeat为重复整个测试的次数，number为执行stmt的次数，返回以秒记录的每个测试循环的耗时列表；
* print_exc(file=None): 打印stmt的跟踪信息。

此外，timeit 还提供了另外三个函数方便使用，参数和 Timer 差不多。

```python
timeit.timeit(stmt='pass', setup='pass', timer=<default timer>, number=1000000)
timeit.repeat(stmt='pass', setup='pass', timer=<default timer>, repeat=3, number=1000000)
timeit.default_timer()
```

# [profile](https://docs.python.org/2/library/profile.html)

以上方法适用于比较简单的场合，更复杂的情况下，可以用标准库里面的profile或者cProfile，它可以统计程序里每一个函数的运行时间，并且提供了可视化的报表。大多情况下，建议使用cProfile，它是profile的C实现，适用于运行时间长的程序。不过有的系统可能不支持cProfile，此时只好用profile。

可以用下面程序测试 timeit_profile() 函数运行时间分配情况。

```python
import cProfile
from time_profile import *

cProfile.run("timeit_profile()")
```

这样的输出可能会很长，很多时候我们感兴趣的可能只有耗时最多的几个函数，这个时候先将cProfile 的输出保存到诊断文件中，然后用 pstats 定制更加有好的输出（完整代码在 [gist](https://gist.github.com/xuelangZF/b1787c8ab4159de9f797fc13dad47808) 上）。

```python
cProfile.run("timeit_profile()", "timeit")
p = pstats.Stats('timeit')
p.sort_stats('time')
p.print_stats(6)
```

输出结果如下：

![pstats 输出][3]

如果觉得 pstats 使用不方便，还可以使用一些图形化工具，比如 [gprof2dot](https://github.com/jrfonseca/gprof2dot) 来可视化分析 cProfile 的诊断结果。

### vprof

[vprof](https://github.com/nvdv/vprof) 也是一个不错的可视化工具，可以用来分析 Python 程序运行时间情况。如下图：

![vprof 性能诊断][4]

# [line_profiler](https://github.com/rkern/line_profiler)

上面的测试最多统计到函数的执行时间，很多时候我们想知道函数里面每一行代码的执行效率，这时候就可以用到 line_profiler 了。

line_profiler 的使用特别简单，在需要监控的函数前面加上 `@profile` 装饰器。然后用它提供的 `kernprof -l -v [source_code.py]` 行进行诊断。下面是一个简单的测试程序 line_profile.py：

```python
from time_profile import slow_replace, slowest_replace

for i in xrange(10000):
    slow_replace()
    slowest_replace()
```

运行后结果如下：

![line_profiler 使用示例][5]

输出每列的含义如下：

* Line #: 行号
* Hits: 当前行执行的次数.
* Time: 当前行执行耗费的时间，单位为 "Timer unit:"
* Per Hit: 平均执行一次耗费的时间.
* % Time: 当前行执行时间占总时间的比例.
* Line Contents: 当前行的代码

line_profiler 执行时间的估计不是特别精确，不过可以用来分析当前函数中哪些行是瓶颈。

# 更多阅读

[A guide to analyzing Python performance](https://www.huyng.com/posts/python-performance-analysis)
[timeit – Time the execution of small bits of Python code](https://pymotw.com/2/timeit/)
[Profiling Python using cProfile: a concrete case](https://julien.danjou.info/blog/2015/guide-to-python-profiling-cprofile-concrete-case-carbonara)
[profile, cProfile, and pstats – Performance analysis of Python programs.](https://pymotw.com/2/profile/)
[How can you profile a Python script?](https://stackoverflow.com/questions/582336/how-can-you-profile-a-python-script)
[检测Python程序执行效率及内存和CPU使用的7种方法](http://python.jobbole.com/80754/)
[代码优化概要](http://coolshell.cn/articles/2967.html)
[Python性能优化的20条建议](https://segmentfault.com/a/1190000000666603)



[1]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160613_simple_analyze.png
[2]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160613_timeit_analyze.png
[3]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160613_cprofile_analyze.png
[4]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160613_vprof_analyze.png
[5]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160613_line_analyze.png


