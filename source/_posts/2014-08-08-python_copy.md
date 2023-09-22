title: 操作之灵魂——拷贝
tags: [Python]
category: 程序设计
toc: true
description: 深入探索Python中拷贝机制的工作原理，包括赋值、引用、浅拷贝和深拷贝。这篇文章详细解释了Python中的拷贝机制是如何工作的，包括浅拷贝和深拷贝的概念和使用场景。通过实例代码，帮助你更深入地理解Python中的拷贝机制。无论你是Python初学者还是有经验的开发者，这篇文章都能帮助你更深入地理解Python中的拷贝机制。
---

首先需要搞清楚两个概念：`赋值`和`引用`，对于操作 target = source:

1. 赋值操作：程序先新建对象target，然后将source的值拷贝到target中。这里，target和source值相同，但是它们是两个完全不同的对象。

2. 引用操作：程序直接将target指向source，也就是说target和source是同一个对象，target只不过是source的一个别名。

**python中没有赋值，只有引用。**

```python
>>> source = 12
>>> target = source
>>> target is source
True
```

如果我们想拷贝一个对象，而不仅仅是创建一个引用，那么该如何操作呢？万能的python提供了两种拷贝机制`浅拷贝(shallow copy)、深拷贝(deep copy)`供我们选择，浅拷贝和深拷贝的唯一区别在于对嵌套对象的拷贝处理上。

Function             | Description
---------------------|--------------------
copy.copy(x)         | Return a shallow copy of x.
copy.deepcopy(x)     | Return a deep copy of x.
exception copy.error | Raised for module specific errors.

<!-- more -->

# 简单引用：浅拷贝

对于嵌套对象比如说source = [1, 2, [3, 4]]，浅拷贝创建新的列表对象target，target中的所有元素均是source中元素的引用，也就是说target中的元素只是source中元素的别名。

切片操作`[start:end]`属于浅拷贝。

```python
>>> source = [1, 2, [3, 4]]
>>> target = source[:]
>>> source is target
False
>>> for i in range(3):
...     print source[i] is target[i]
...
True
True
True
>>> source[2][1] = "see here"
>>> source, target
([1, 2, [3, 'see here']], [1, 2, [3, 'see here']])
```

![浅拷贝][1]

# 递归拷贝：深拷贝

大多时候有浅拷贝就足够了，但是某些情况下深拷贝仍有着举足轻重的作用。

深拷贝，其实就是递归拷贝。也就是说对于嵌套对象比如说source = [1, 2, [3, 4]]，深拷贝时创建新的列表对象target，然后`递归`地将source中的所有对象均拷贝到target中。即如果source中的元素是列表、字典等，那么python将拷贝这些列表、字典中的对象到target中去，就这样迭代下去，直到不存在嵌套结构。

```python
>>> source = [1, 2, [3, 4]]
>>> import copy
>>> target = copy.deepcopy(source)
>>> target is source
False
>>> for i in range(3):
...     print target[i] is source[i]
...
True
True
False
>>> source[2].append(5)
>>> source, target
([1, 2, [3, 4, 5]], [1, 2, [3, 4]])
```

![深拷贝][2]

深拷贝存在两个问题：

1. 对一个递归对象进行深拷贝会导致递归循环。比如values = [values, 2]；
2. 由于深拷贝要拷贝所有对象，因此有时候会拷贝多余的内容，比如管理用的数据结构应该在不同拷贝间共享。

不过`_deepcopy()_`函数提供了两个解决方案避免以上问题：

1. 拷贝过程中维护一个备忘字典"memo"，字典中存放已经拷贝过的对象;
2. 允许用户在自定义的类中重写拷贝操作或重写要拷贝的组件。


# 更多阅读
[python的赋值操作](http://www.zhihu.com/question/21000872)
[Python Copy Through Assignment?](https://stackoverflow.com/questions/2438938/python-copy-through-assignment)
[copy module 学习笔记](http://hi.baidu.com/hifinan/item/61ce39ccefeab752ad00ef5a)


[1]: https://slefboot-1251736664.file.myqcloud.com/20140808_shallow_copy.png
[2]: https://slefboot-1251736664.file.myqcloud.com/20140808_deep_copy.png


