title: 深入理解Python中的ThreadLocal变量（下）
date: 2016-11-03 22:02:50
category: 源码剖析
tags: [Python, Thread, Flask]
toc: true
---

在[上篇](http://selfboot.cn/2016/08/22/threadlocal_overview/)我们看到了 ThreadLocal 变量的简单使用，[中篇](http://selfboot.cn/2016/08/26/threadlocal_implement/)对python中 ThreadLocal 的实现进行了分析，但故事还没有结束。本篇我们一起来看下[Werkzeug](http://werkzeug.pocoo.org/)中ThreadLocal的设计。

Werkzeug 作为一个 WSGI 工具库，由于一些方面的考虑，并没有直接使用python内置的ThreadLocal类，而是自己实现了一系列Local类。包括简单的Local，以及在此基础上实现的LocalStack，LocalManager 和 LocalProxy。接下来我们一起来看看这些类的使用方式，设计的初衷，以及具体的实现技巧。

<!-- more -->

# Local 类的设计

Werkzeug 的设计者认为python自带的ThreadLocal并不能满足需求，主要因为下面两个原因：

1. Werkzeug 主要用“ThreadLocal”来满足并发的要求，python 自带的ThreadLocal只能实现基于线程的并发。而python中还有其他许多并发方式，比如常见的[协程](https://github.com/xuelangZF/CS_Offer/blob/4ab9bed1a0b11b34f1761ba2ead3bf8387350d60/Python/Coroutine.md)（greenlet），因此需要实现一种能够支持协程的Local对象。
2. [WSGI](http://selfboot.cn/2016/08/07/forum_design_wsgi/)不保证每次都会产生一个新的线程来处理请求，也就是说线程是可以复用的（可以维护一个线程池来处理请求）。这样如果werkzeug 使用python自带的ThreadLocal，一个“不干净（存有之前处理过的请求的相关数据）”的线程会被用来处理新的请求。

为了解决这两个问题，werkzeug 中实现了Local类。Local对象可以做到线程和协程之间数据的隔离，此外，还要支持清理某个线程或者协程下的数据（这样就可以在处理一个请求之后，清理相应的数据，然后等待下一个请求的到来）。

具体怎么实现的呢，思想其实特别简单，我们在[深入理解Python中的ThreadLocal变量（上）](http://selfboot.cn/2016/08/22/threadlocal_overview/) 一文的最后有提起过，就是创建一个全局字典，然后将线程（或者协程）标识符作为key，相应线程（或协程）的局部数据作为 value。这里 werkzeug 就是按照上面思路进行实现，不过利用了python的一些黑魔法，最后提供给用户一个清晰、简单的接口。

## 具体实现

Local 类的实现在 [werkzeug.local](https://github.com/pallets/werkzeug/blob/master/werkzeug/local.py) 中，以 [8a84b62](https://github.com/pallets/werkzeug/commit/8a84b62b3dd89fe7d720d7948954e20ada690c40) 版本的代码进行分析。通过前两篇对ThreadLocal的了解，我们已经知道了Local对象的特点和使用方法。所以这里不再给出Local对象的使用例子，我们直接看代码。

```
class Local(object):
    __slots__ = ('__storage__', '__ident_func__')

    def __init__(self):
        object.__setattr__(self, '__storage__', {})
        object.__setattr__(self, '__ident_func__', get_ident)
    ...
```

由于可能有大量的Local对象，为了节省Local对象占用的空间，这里使用 `__slots__` 写死了Local可以拥有的属性：

* \_\_storage\_\_： 值为一个字典，用来保存实际的数据，初始化为空；
* \_\_ident_func\_\_：值为一个函数，用来找到当前线程或者协程的标志符。

由于Local对象实际的数据保存在\_\_storage\_\_中，所以对Local属性的操作其实是对\_\_storage\_\_的操作。对于获取属性而言，这里用魔术方法`__getattr__`拦截\_\_storage\_\_ 和 \_\_ident_func\_\_以外的属性获取，将其导向\_\_storage\_\_存储的当前线程或协程的数据。而对于属性值的set或者del，则分别用\_\_setattr\_\_和\_\_setattr\_\_来实现（这些魔术方法的介绍见[属性控制](https://github.com/xuelangZF/CS_Offer/blob/master/Python/Class.md#属性控制)）。关键代码如下所示：

```python
def __getattr__(self, name):
    try:
        return self.__storage__[self.__ident_func__()][name]
    except KeyError:
        raise AttributeError(name)

def __setattr__(self, name, value):
    ident = self.__ident_func__()
    storage = self.__storage__
    try:
        storage[ident][name] = value
    except KeyError:
        storage[ident] = {name: value}

def __delattr__(self, name):
    try:
        del self.__storage__[self.__ident_func__()][name]
    except KeyError:
        raise AttributeError(name)
```

假设我们有ID为1，2， ... ， N 的N个线程或者协程，每个都用Local对象保存有自己的一些局部数据，那么Local对象的内容如下图所示：

![][1]

此外，Local类还提供了`__release_local__`方法，用来释放当前线程或者协程保存的数据。

# Local 扩展接口

Werkzeug 在 Local 的基础上实现了 LocalStack 和 LocalManager，用来提供更加友好的接口支持。

## LocalStack

LocalStack通过封装Local从而实现了一个线程（或者协程）独立的栈结构，注释里面有具体的使用方法，一个简单的使用例子如下：

```python
ls = LocalStack()
ls.push(12)
print ls.top    # 12
print ls._local.__storage__
# {140735190843392: {'stack': [12]}}
```

LocalStack 的实现比较有意思，它将一个Local对象作为自己的属性`_local`，然后定义接口push, pop 和 top 方法进行相应的栈操作。这里用 **\_local.\_\_storage\_\_.[_local.\_\_ident\_func\_\_()]['stack']** 这个list来模拟栈结构。在接口push, pop和top中，通过操作这个list来模拟栈的操作，需要注意的是在接口函数内部获取这个list时，不用像上面黑体那么复杂，可以直接用\_local的getattr()方法即可。以 push 函数为例，实现如下：

```python
def push(self, obj):
    """Pushes a new item to the stack"""
    rv = getattr(self._local, 'stack', None)
    if rv is None:
        self._local.stack = rv = []
    rv.append(obj)
    return rv
```

pop 和 top 的实现和一般栈类似，都是对 `stack = getattr(self._local, 'stack', None)` 这个列表进行相应的操作。此外，LocalStack还允许我们自定义`__ident_func__`，这里用 [内置函数 property](https://docs.python.org/2/library/functions.html#property) 生成了[描述器](https://github.com/xuelangZF/CS_Offer/blob/master/Python/Descriptor.md)，封装了\_\_ident\_func\_\_的get和set操作，提供了一个属性值\_\_ident\_func\_\_作为接口，具体代码如下：

```python
def _get__ident_func__(self):
    return self._local.__ident_func__

def _set__ident_func__(self, value):
    object.__setattr__(self._local, '__ident_func__', value)
__ident_func__ = property(_get__ident_func__, _set__ident_func__)
del _get__ident_func__, _set__ident_func__
```

# LocalManager

Local 和 LocalStack 都是线程或者协程独立的单个对象，很多时候我们需要一个线程或者协程独立的容器，来组织多个Local或者LocalStack对象（就像我们用一个list来组织多个int或者string类型一样）。

Werkzeug实现了LocalManager，它通过一个list类型的属性locals来存储所管理的Local或者LocalStack对象，还提供cleanup方法来释放所有的Local对象。Werkzeug中LocalManager最主要的接口就是[装饰器](http://selfboot.cn/2014/08/10/python_decorator/)方法`make_middleware`，代码如下：

```
def make_middleware(self, app):
    """Wrap a WSGI application so that cleaning up happens after
    request end.
    """
    def application(environ, start_response):
        return ClosingIterator(app(environ, start_response), self.cleanup)
    return application
```

这个装饰器注册了回调函数cleanup，当一个线程（或者协程）处理完请求之后，就会调用cleanup清理它所管理的Local或者LocalStack 对象（ClosingIterator 的实现在 [werkzeug.wsgi](https://github.com/pallets/werkzeug/blob/master/werkzeug/wsgi.py)中）。下面是一个使用 LocalManager 的简单例子：

```python
from werkzeug.local import Local, LocalManager

local = Local()
local_2 = Local()
local_manager = LocalManager([local, local2])

def application(environ, start_response):
    local.request = request = Request(environ)
    ...

# application 处理完毕后，会自动清理local_manager 的内容
application = local_manager.make_middleware(application)
```

通过LocalManager的make_middleware我们可以在某个线程（协程）处理完一个请求后，清空所有的Local或者LocalStack对象，这样这个线程又可以处理另一个请求了。至此，文章开始时提到的第二个问题就可以解决了。Werkzeug.local 里面还实现了一个 LocalProxy 用来作为Local对象的代理，也非常值得去学习。

通过这三篇文章，相信对 ThreadLocal 有了一个初步的了解。Python标准库和Werkzeug在实现中都用到了很多python的黑魔法，不过最终提供给用户的都是非常友好的接口。Werkzeug作为WSGI 工具集，为了解决Web开发中的特定使用问题，提供了一个改进版本，并且进行了一系列封装，便于使用。不得不说，werkzeug的代码可读性非常好，注释也是写的非常棒，建议去阅读源码。

# 更多阅读

[Context Locals](http://werkzeug.pocoo.org/docs/0.11/local/)
[Private Variables and Class-local References](https://docs.python.org/2/tutorial/classes.html#private-variables-and-class-local-references)
[How does the @property decorator work?](http://stackoverflow.com/questions/17330160/how-does-the-property-decorator-work)
[How do the Proxy, Decorator, Adapter, and Bridge Patterns differ?](http://stackoverflow.com/questions/350404/how-do-the-proxy-decorator-adapter-and-bridge-patterns-differ/350471#350471)

[Flask源码剖析](http://mingxinglai.com/cn/2016/08/flask-source-code/)
[Werkzeug.locals 模块解读](https://www.15yan.com/story/j7BfM4NHEI9/)
[Charming Python: 从Flask的request说起](http://www.zlovezl.cn/articles/charming-python-start-from-flask-request/)
[How to remove a key from a python dictionary?](http://stackoverflow.com/questions/11277432/how-to-remove-a-key-from-a-python-dictionary)
[werkzeug源码分析(local.py)](https://www.ficapy.com/2016/08/03/werkzeug_local_note/)

[1]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20161103_threadlocal_enhance_1.png

