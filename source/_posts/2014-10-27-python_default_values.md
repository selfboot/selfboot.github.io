title: 陷阱！python参数默认值
tags: Python
category: 程序设计
---

在stackoverflow上看到这样一个程序：

```python
class demo_list:
    def __init__(self, l=[]):
        self.l = l

    def add(self, ele):
        self.l.append(ele)


def appender(ele):
    obj = demo_list()
    obj.add(ele)
    print obj.l


if __name__ == "__main__":
    for i in range(5):
        appender(i)
```

输出结果是

<!-- more -->

> [0]  
> [0, 1]  
> [0, 1, 2]  
> [0, 1, 2, 3]  
> [0, 1, 2, 3, 4]  

有点奇怪，难道输出不应该是像下面这样吗？

> [0]  
> [1]  
> [2]  
> [3]  
> [4]  

其实想要得到上面的输出，只需要将`obj = intlist()`替换为`obj = intlist(l=[])`。

## 默认参数工作机制

上面怪异的输出简单来说是因为：

> Default values are computed once, then re-used.

因此每次调用`__init__()`，返回的是同一个list。为了验证这一点，下面在\_\_init\_\_函数中添加一条语句，如下：

```python
def __init__(self, l=[]):
    print id(l),
    self.l = l
```

输出结果为:

> 4346933688 [0]  
> 4346933688 [0, 1]  
> 4346933688 [0, 1, 2]  
> 4346933688 [0, 1, 2, 3]  
> 4346933688 [0, 1, 2, 3, 4]  

可以清晰看出每次调用\_\_init\_\_函数时，默认参数l都是同一个对象，其id为4346933688。

关于默认参数，文档中是这样说的：

> Default parameter values are evaluated when the function definition is executed. This means that the expression is evaluated once, when the function is defined, and that the same “pre-computed” value is used for each call.

为了能够更好地理解文档内容，再来看一个例子：

```python
def a():
    print "a executed"
    return []

def b(x=a()):
    print "id(x): ", id(x)
    x.append(5)
    print "x: ", x

for i in range(2):
    print "-" * 15, "Call b()", "-" * 15
    b()
    print b.__defaults__
    print "id(b.__defaults__[0]): ", id(b.__defaults__[0])

for i in range(2):
    print "-" * 15, "Call b(list())", "-" * 15
    b(list())
    print b.__defaults__
    print "id(b.__defaults__[0]): ", id(b.__defaults__[0])
```

注意，**当python执行`def`语句时，它会根据编译好的函数体字节码和命名空间等信息新建一个函数对象，并且会计算默认参数的值**。函数的所有构成要素均可通过它的属性来访问，比如可以用`func_name`属性来查看函数的名称。所有默认参数值则存储在函数对象的`__defaults__`属性中，它的值为一个列表，列表中每一个元素均为一个默认参数的值。

好了，你应该已经知道上面程序的输出内容了吧，一个可能的输出如下(id值可能为不同)：

> a executed    
> --------------- Call b() ---------------  
> id(x):  4316528512  
> x:  [5]  
> ([5],)  
> id(b.\_\_defaults\_\_[0]):  4316528512  
> --------------- Call b() ---------------  
> id(x):  4316528512  
> x:  [5, 5]  
> ([5, 5],)  
> id(b.\_\_defaults\_\_[0]):  4316528512  
> --------------- Call b(list()) ---------------  
> id(x):  4316684872  
> x:  [5]  
> ([5, 5],)  
> id(b.\_\_defaults\_\_[0]):  4316528512  
> --------------- Call b(list()) ---------------  
> id(x):  4316684944  
> x:  [5]  
> ([5, 5],)  
> id(b.\_\_defaults\_\_[0]):  4316528512  

我们看到，在定义函数b(也就是执行def语句)时，已经计算出默认参数x的值，也就是执行了a函数，因此才会打印出`a executed`。之后，对b进行了4次调用，下面简单分析一下：

1. 第一次不提供默认参数x的值进行调用，此时使用函数b定义时计算出来的值作为x的值。所以id(x)和id(b.\_\_defaults\_\_[0])相等，x追加数字后，函数属性中的默认参数值也变为[5]；
2. 第二次仍然没有提供参数值，x的值为经过第一次调用后的默认参数值[5]，然后对x进行追加，同时也对函数属性中的默认参数值追加；
3. 传递参数list()来调用b，此时新建一个列表作为x的值，所以id(x)不同于函数属性中默认参数的id值，追加5后x的值为[5]；
4. 再一次传递参数list()来调用b，仍然是新建列表作为x的值。

如果上面的内容你已经搞明白了，那么你可能会觉得默认参数值的这种设计是python的设计缺陷，毕竟这也太不符合我们对默认参数的认知了。然而事实可能并非如此，更可能是因为：

> Functions in Python are first-class objects, and not only a piece of code.

我们可以这样解读：**`函数也是对象，因此定义的时候就被执行，默认参数是函数的属性，它的值可能会随着函数被调用而改变。`**其他对象不都是如此吗？

## 可变对象作为参数默认值？

参数的默认值为可变对象时，多次调用将返回同一个可变对象，更改对象值可能会造成意外结果。参数的默认值为不可变对象时，虽然多次调用返回同一个对象，但更改对象值并不会造成意外结果。

因此，在代码中我们应该避免将参数的默认值设为可变对象，上面例子中的初始化函数可以更改如下：

```python
def __init__(self, l=None):
    if not l:
        self.l = []
    else:
        self.l = l
```

在这里将None用作占位符来控制参数l的默认值。不过，有时候参数值可能是任意对象(包括None)，这时候就不能将None作为占位符。你可以定义一个object对象作为占位符，如下面例子：

```python
sentinel = object()

def func(var=sentinel):
    if var is sentinel:
        pass
    else:
        print var
```

虽然应该避免默认参数值为可变对象，不过有时候使用可变对象作为默认值会收到不错的效果。比如我们可以用可变对象作为参数默认值来统计函数调用次数，下面例子中使用`collections.Counter()`作为参数的默认值来统计斐波那契数列中每一个值计算的次数。

```python
def fib_direct(n, count=collections.Counter()):
    assert n > 0, 'invalid n'
    count[n] += 1
    if n < 3:
        return n
    else:
        return fib_direct(n - 1) + fib_direct(n - 2)


print fib_direct(10)
print fib_direct.__defaults__[0]
```

运行结果如下：

> 89  
> Counter({2: 34, 1: 21, 3: 21, 4: 13, 5: 8, 6: 5, 7: 3, 8: 2, 9: 1, 10: 1})

我们还可以用默认参数来做简单的缓存，仍然以斐波那契数列作为例子，如下：

```python
def fib_direct(n, count=collections.Counter(), cache={}):
    assert n > 0, 'invalid n'
    count[n] += 1
    if n in cache:
        return cache[n]
    if n < 3:
        value = n
    else:
        value = fib_direct(n - 1) + fib_direct(n - 2)
    cache[n] = value
    return value


print fib_direct(10)
print fib_direct.__defaults__[0]
```

结果为：

> 89  
> Counter({2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 1: 1, 9: 1, 10: 1})

这样就快了太多了，fib_direct(n)调用次数为o(n)，这里也可以用装饰器来实现计数和缓存功能。

# 更多阅读
  
[Python instances and attributes: is this a bug or i got it totally wrong?](https://stackoverflow.com/questions/2402887/python-instances-and-attributes-is-this-a-bug-or-i-got-it-totally-wrong?rq=1)  
[Default Parameter Values in Python](http://effbot.org/zone/default-values.htm)  
[“Least Astonishment” in Python: The Mutable Default Argument](http://stackoverflow.com/questions/1132941/least-astonishment-in-python-the-mutable-default-argument)   
[A few things to remember while coding in Python](https://news.ycombinator.com/item?id=3996708)   
[Using Python's mutable default arguments for fun and profit](http://inglesp.github.io/2012/03/24/mutable-default-arguments.html)   

