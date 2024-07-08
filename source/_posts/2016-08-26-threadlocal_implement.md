title: 深入理解Python中的ThreadLocal变量（中）
date: 2016-08-26 00:02:50
category: 源码剖析
tags: [Python, Thread]
toc: true
description: 深入探讨Python中ThreadLocal变量的实现。这篇文章详细介绍了ThreadLocal变量的工作原理，以及如何在Python中实现它。对于希望深入理解Python多线程编程的读者来说，这是一篇必读的文章。
---

在 [深入理解Python中的ThreadLocal变量（上）](http://selfboot.cn/2016/08/22/threadlocal_overview/) 中我们看到 ThreadLocal 的引入，使得可以很方便地在多线程环境中使用局部变量。如此美妙的功能到底是怎样实现的？如果你对它的实现原理没有好奇心或一探究竟的冲动，那么接下来的内容估计会让你后悔自己的浅尝辄止了。

简单来说，Python 中 ThreadLocal 就是通过<a name="img_1"></a>下图中的方法，将全局变量伪装成线程局部变量，相信读完本篇文章你会理解图中内容的。（对这张图不眼熟的话，可以回顾下[上篇]((http://selfboot.cn/2016/08/22/threadlocal_overview/))）。

![ThreadLocal 实现机制][1]

<!--more-->

# 在哪里找到源码？

好了，终于要来分析 ThreadLocal 是如何实现的啦，不过，等等，怎么找到它的源码呢？上一篇中我们只是用过它（`from threading import local`），从这里只能看出它是在 threading 模块实现的，那么如何找到 threading 模块的源码呢。

如果你在使用 PyCharm，恭喜你，你可以用 `View source`（OS X 快捷键是 ⌘↓）找到 local 定义的地方。现在许多 IDE 都有这个功能，可以查看 IDE 的帮助来找到该功能。接着我们就会发现 local 是这样子的（这里以 python 2.7 为例）：

```python
# get thread-local implementation, either from the thread
# module, or from the python fallback
try:
    from thread import _local as local
except ImportError:
    from _threading_local import local
```

嗯，自带解释，非常好。我们要做的是继续往下深挖具体实现，用同样的方法（⌘↓）找 _local 的实现，好像不太妙，没有找到纯 python 实现：

```cpp
class _local(object):
    """ Thread-local data """
    def __delattr__(self, name): # real signature unknown; restored from __doc__
        """ x.__delattr__('name') <==> del x.name """
        pass
    ...
```

没关系，继续来看下_threading_local吧，这下子终于找到了local的纯 python 实现。开始就是很长的一段注释文档，告诉我们这个模块是什么，如何用。这个文档的质量非常高，值得我们去学习。所以，再次后悔自己的浅尝辄止了吧，差点错过了这么优秀的文档范文！

## 将源码私有化

在具体动手分析这个模块之前，我们先把它拷出来放在一个单独的文件 `thread_local.py` 中，这样可以方便我们随意肢解它（比如在适当的地方加上log），并用修改后的实现验证我们的一些想法。此外，如果你真的理解了_threading_local.py最开始的一段，你就会发现这样做是多么的有必要。因为python的threading.local不一定是用的_threading_local（还记得class _local(object) 吗？）。

所以如果你用 threading.local 来验证自己对_threading_local.py的理解，你很可能会一头雾水的。不幸的是，我开始就这样干的，所以被下面的代码坑了好久：

```python
from threading import local, current_thread
data = local()
key = object.__getattribute__(data, '_local__key')
print current_thread().__dict__.get(key)
# AttributeError: 'thread._local' object has no attribute '_local__key'
```

当然，你可能不理解这里是什么意思，没关系，我只是想强调在 threading.local 没有用到_threading_local.py，你必须要创建一个模块（我将它命名为 thread_local.py）来保存_threading_local里面的内容，然后像下面这样验证自己的想法：

```python
from threading import current_thread
from thread_local import local

data = local()
key = object.__getattribute__(data, '_local__key')
print current_thread().__dict__.get(key)
```

# 如何去理解源码

现在可以静下心来读读这不到两百行的代码了，不过，等等，好像有许多奇怪的内容（黑魔法）：

* [\_\_slots\_\_](https://docs.python.org/2/reference/datamodel.html#slots)
* [\_\_new\_\_](https://docs.python.org/2.7/reference/datamodel.html#basic-customization)
* [\_\_getattribute\_\_／\_\_setattr\_\_／\_\_delattr\_\_](https://docs.python.org/2.7/reference/datamodel.html#customizing-attribute-access)
* [Rlock](https://docs.python.org/2/library/threading.html#rlock-objects)

这些是什么？如果你不知道，没关系，千万不要被这些纸老虎吓到，我们有丰富的文档，查文档就对了（这里不建议直接去网上搜相关关键字，最好是先读文档，读完了有疑问再去搜）。

## python 黑魔法

下面是我对上面提到的内容的一点总结，如果觉得读的明白，那么可以继续往下分析源码了。如果还有不理解的，再读几遍文档（或者我错了，欢迎指出来）。

* 简单来说，python 中创建一个**新式类**的实例时，首先会调用`__new__(cls[, ...])`创建实例，如果它成功返回cls类型的对象，然后才会调用\_\_init\_\_来对对象进行初始化。
* 新式类中我们可以用\_\_slots\_\_指定该类可以拥有的属性名称，这样每个对象就不会再创建\_\_dict\_\_，从而节省对象占用的空间。特别需要注意的是，基类的\_\_slots\_\_并不会屏蔽派生类中_\_dict\_\_的创建。
* 可以通过重载`__setattr__，__delattr__和__getattribute__`这些方法，来控制自定义类的属性访问（x.name），它们分别对应属性的赋值，删除，读取。
* 锁是操作系统中为了保证操作原子性而引入的概念，python 中 RLock是一种可重入锁（reentrant lock，也可以叫作递归锁），Rlock.acquire()可以不被阻塞地多次进入同一个线程。
* `__dict__`用来保存对象的（可写）属性，可以是一个字典，或者其他映射对象。

## 源码剖析

对这些相关的知识有了大概的了解后，再读源码就亲切了很多。为了彻底理解，我们首先回想下**平时是如何使用local对象的，然后分析源码在背后的调用流程**。这里从定义一个最简单的thread-local对象开始，也就是说当我们写下下面这句时，发生了什么？

```
data = local()
```

上面这句会调用 `_localbase.__new__` 来为data对象设置一些属性（还不知道有些属性是做什么的，不要怕，后面遇见再说），然后将data的属性字典(`__dict__`)作为当前线程的一个属性值（这个属性的 key 是根据 id(data) 生成的身份识别码）。

这里很值得玩味：在创建ThreadLocal对象时，同时在线程（也是一个对象，没错万物皆对象）的属性字典`__dict__`里面保存了ThreadLocal对象的属性字典。还记得文章开始的[图片](#img_1)吗，红色虚线就表示这个操作。

接着我们考虑在线程 Thread-1 中对ThreadLocal变量进行一些常用的操作，比如下面的一个操作序列：

```
data.name = "Thread 1(main)" # 调用 __setattr__
print data.name     # 调用 __getattribute__
del data.name       # 调用 __delattr__
print data.__dict__
# Thread 1(main)
# {}
```

那么背后又是如何操作的呢？上面的操作包括了给属性赋值，读属性值，删除属性。这里我们以\_\_getattribute\_\_的实现为例（读取值）进行分析，属性的\_\_setattr\_\_和\_\_delattr\_\_和前者差不多，区别在于禁止了对\_\_dict\_\_属性的更改以及删除操作。

```python
def __getattribute__(self, name):
    lock = object.__getattribute__(self, '_local__lock')
    lock.acquire()
    try:
        _patch(self)
        return object.__getattribute__(self, name)
    finally:
        lock.release()
```

函数中首先获得了ThreadLocal变量的`_local__lock`属性值（知道这个变量从哪里来的吗，回顾下\_localbase吧），然后用它来保证 `_patch(self)` 操作的原子性，还用 **try-finally 保证即使抛出了异常也会释放锁资源，避免了线程意外情况下永久持有锁而导致死锁**。现在问题是\_patch究竟做了什么？答案还是在源码中：

```python
def _patch(self):
    key = object.__getattribute__(self, '_local__key')  # ThreadLocal变量 的标识符
    d = current_thread().__dict__.get(key)  # ThreadLocal变量在该线程下的数据
    if d is None:
        d = {}
        current_thread().__dict__[key] = d
        object.__setattr__(self, '__dict__', d)

        # we have a new instance dict, so call out __init__ if we have one
        cls = type(self)
        if cls.__init__ is not object.__init__:
            args, kw = object.__getattribute__(self, '_local__args')
            cls.__init__(self, *args, **kw)
    else:
        object.__setattr__(self, '__dict__', d)
```

_patch做的正是整个ThreadLocal实现中最核心的部分，**从当前正在执行的线程对象那里拿到该线程的私有数据，然后将其交给ThreadLocal变量**，就是本文开始[图片](#img_1)中的虚线2。这里需要补充说明以下几点：

* 这里说的线程的私有数据，其实就是指通过x.name可以拿到的数据（其中 x 为ThreadLocal变量）
* 主线程中在创建ThreadLocal对象后，就有了对应的数据（还记得红色虚线的意义吗？）
* 对于那些第一次访问ThreadLocal变量的线程来说，需要创建一个空的字典来保存私有数据，然后还要调用该变量的初始化函数。
* 还记得\_localbase基类里\_\_new\_\_函数设置的属性   \_local\_\_args 吗？在这里被用来进行初始化。

到此，整个源码核心部分已经理解的差不多了，只剩下`local.__del__`用来执行清除工作。因为每次创建一个ThreadLocal 变量，都会在进程对象的\_\_dict\_\_中添加相应的数据，当该变量被回收时，我们需要在相应的线程中删除保存的对应数据。

# 从源码中学到了什么？

经过一番努力，终于揭开了 ThreadLocal 的神秘面纱，整个过程可以说是收获颇丰，下面一一说来。

不得不承认，计算机基础知识很重要。你得知道进程、线程是什么，CPU 的工作机制，什么是操作的原子性，锁是什么，为什么锁使用不当会导致死锁等等。

其次就是语言层面的知识也必不可少，就ThreadLocal的实现来说，如果对\_\_new\_\_，\_\_slots\_\_等不了解，根本不知道如何去做。所以，学语言还是要有深度，不然下面的代码都看不懂：

```python
class dict_test:
    pass

d = dict_test()
print d.__dict__
d.__dict__ = {'name': 'Jack', 'value': 12}
print d.name
```

还有就是高质量的功能实现需要考虑各方各面的因素，以ThreadLocal 为例，在基类\_localbase中用\_\_slots\_\_节省空间，用try...finally保证异常环境也能正常释放锁，最后还用\_\_del\_\_来及时的清除无效的信息。

最后不得不说，好的文档和注释简直就是画龙点睛，不过**写文档和注释是门技术活，绝对需要不断学习的**。

# 更多阅读

[Python's use of \_\_new\_\_ and \_\_init\_\_?](http://stackoverflow.com/questions/674304/pythons-use-of-new-and-init)
[Understanding \_\_new\_\_ and \_\_init\_\_](http://spyhce.com/blog/understanding-new-and-init)
[Usage of \_\_slots\_\_?](http://stackoverflow.com/questions/472000/usage-of-slots)
[weakref – Garbage-collectable references to objects](https://pymotw.com/2/weakref/)
[How do I find the source code of a function in Python?](https://www.quora.com/How-do-I-find-the-source-code-of-a-function-in-Python)
[How do I find the location of Python module sources?](http://stackoverflow.com/questions/269795/how-do-i-find-the-location-of-python-module-sources)
[Is self.\_\_dict\_\_.update(**kwargs) good or poor style?](http://stackoverflow.com/questions/9728243/is-self-dict-updatekwargs-good-or-poor-style)
[Doc: weakref — Weak references](https://docs.python.org/2/library/weakref.html)
[python class 全面分析](https://github.com/xuelangZF/CS_Offer/blob/master/Python/Class.md#构造与析构)

[我是如何阅读开源项目的源代码的](http://vincestyling.com/posts/2014/how-am-i-read-open-source-projects-code.html)
[高效阅读源代码指南](http://blog.a0z.me/2016/04/28/how-to-read-open-project/)
[如何阅读程序源代码？](https://www.zhihu.com/question/19625320)
[如何看懂源代码--(分析源代码方法)](http://www.cnblogs.com/ToDoToTry/archive/2009/06/21/1507760.html)


[1]: https://slefboot-1251736664.file.myqcloud.com/20160826_threadlocal_implement_1.png


