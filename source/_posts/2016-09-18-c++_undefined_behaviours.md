title: C++ 中的未定义行为
date: 2016-09-18 22:02:50
category: 程序设计
tags: [C++]
toc: true
description: 深入探讨C++中的未定义行为。这篇文章详细解释了未定义行为的概念，以及为什么它们存在，以及如何避免它们。对于希望提高C++编程技能的读者来说，这是一篇不容错过的文章。
---

现在我们需要一个程序从控制台读入一个 INT 型整数（输入确保是INT），然后输出其绝对值，你可能闭着眼睛就会写出下面的代码：

```cpp
#include <iostream>

int main()
{
    int n;
    std::cin >> n;
    std::cout << abs(n) << std::endl;
}
```

等下，好好思考两分钟，然后写几个测试例子跑一下程序。那么你找出程序存在的问题了吗？好了，欢迎走进未定义行为 (Undefined Behavior) 的世界。

![][1]

<!-- more -->

# 什么是未定义行为

文章一开始的程序中用到了 abs 求绝对值函数，当n为 INT_MIN 时，函数返回什么呢？[C++ 标准](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2013/n3797.pdf)中有这么一条：

> If during the evaluation of an expression, the result is not mathematically defined or not in the range of representable values for its type, the behavior is undefined.

在一个2进制系统中，当 n 是 INT_MIN 时，`int abs(int n)` 返回的值超出了 int 的范围，所以这将导致一个未定义行为。很多时候，标准过于精炼，不便于我们快速查找，因此我们可以在 [cppreference](http://en.cppreference.com/w/cpp) 找到需要的信息，以 abs函数为例，cppreference 明确指出可能导致未定义行为：

> Computes the absolute value of an integer number. The behavior is undefined if the result cannot be represented by the return type.

那么到底什么是未定义行为呢？简单来说，就是某个操作逻辑上是不合法的，比如越界访问数组等，但是C++ 标准并没有告诉我们遇到这种情况该如何去处理。

我们知道在大部分语言（比如 Python 和 Java）中，一个语句要么按照我们的预期正确执行，要么立即抛出异常。但是在 C++ 中，还有一种情况就是，某条语句并没有按照预期执行（逻辑上已经出错了），但是程序还是可以继续执行（C++标准没有告诉怎么继续执行）。只不过程序的行为已经不可预测了，也就是说程序可能发生运行时错误，也可能给出错误的结果，甚至还可能给出正确的结果。

有一点需要注意的是，对于有的未定义行为，现代编译器有时候可以给出警告，或者是编译失败的提示信息。此外，不同编译器对于未定义行为的处理方式也不同。

# 常见的未定义行为

C++ 标准中有大量的未定义行为，如果在标准中查找 `undefined behavior`，将会看到几十条相关内容。如此众多的未定义行为，无疑给我们带来了许多麻烦，下面我们将列出一些常见的未定义行为，写程序时应该尽量避免。

指针相关的常见未定义行为有如下内容：

* 解引用 nullptr 指针；
* 解引用一个未初始化的指针；
* 解引用 new 操作失败返回的指针；
* 指针访问越界（解引用一个超出数组边界的指针）；
* 解引用一个指向已销毁对象的指针；

解引用一个指向已销毁对象的指针，有时候很容易就会犯这个错误，例如在[函数中返回局部指针地址](https://github.com/xuelangZF/CS_Offer/blob/master/C%2B%2B/Function.md#函数返回值)。 一些简单的错误代码如下：

```cpp
#include <iostream>

int * get(int tmp){
    return &tmp;
}
int main()
{
    int *foo = get(10);
    std::cout << *foo << std::endl; // Undefined Behavior;

    int arr[] = {1,2,3,4};
    std::cout << *(arr+4) << std::endl; // Undefined Behavior;

    int *bar=0;
    *bar = 2;                       // Undefined Behavior;
    std::cout << *bar << std::endl;
    return 0;
}
```

其他常见未定义行为如下：

* 有符号整数溢出（文章开头的例子）；
* 整数做左移操作时，移动的位数为负数；
* 整数做移位操作时，移动的位数超出整型占的位数。（int64_t i = 1; i <<= 72）；
* 尝试修改字符串字面值或者常量的内容；
* 对自动初始化且没有赋初值的变量进行操作；（int i; i++; cout << i;）
* 在有返回值的函数结束时不返回内容；

更完整的未定义行为列表可以在[这里](http://stackoverflow.com/questions/367633/what-are-all-the-common-undefined-behaviours-that-a-c-programmer-should-know-a)找到。

# 为什么存在未定义行为

C++ 程序经常因为未定义行为而出现各种千奇百怪的 Bug，调试起来也十分困难。相反，其他很多语言中并没有未定义行为，比如 python，当访问 list 越界时会抛出 `list index out of range`，这些语言中不会因为未定义行为出现各种奇怪的错误。那么为什么 C++ 标准为什么要搞这么多未定义行为呢？

原因是这样可以**简化编译器的工作，有时候还可以产生更加高效的代码**。举个例子来说，如果我们想让解引用指针的操作行为变的明确起来（成功或者抛出异常），就需要在编译期知道指针使用是否合法，那么编译器至少需要做下面这些工作：

* 检查指针是否为 nullptr；
* 通过某种机制检查指针保存的地址是否合法；
* 通过某种机制抛出错误

这样的话编译器的实现会复杂很多。此外，如果我们有一个循环需要对大量的指针进行操作，那么编译生成的代码就会因为做各种附加检查而导致效率低下。

实际上，很多未定义行为，都是因为程序违反了某一先决条件而导致的，比如赋给指针的地址值必须是可访问的，数组访问时下标在正确的范围内。对 C++来说，语言设计者认为这是程序员（大家都是成年人了）需要保证的内容，语言层面并不会去做相应的检查。

不过，好消息是现在很多编译器已经可以诊断出一些可能导致未定义行为的操作，可以帮我们写出更加健壮的程序。

# 其他一些行为

C++ 标准还规定了一些 **Unspecified Behavior**，一个简单的例子（一个大公司曾经的笔试题目）如下：

```cpp
#include <iostream>
using namespace std;

int get(int i){
    cout << i << endl;
    return i+1;
}

int Cal(int a, int b) {
    return a+b;
}

int main() {
    cout << Cal(get(0), get(10)) << endl;
    return 0;
}
```

程序输出多少？答案是视编译器而定，可能是0 10 12，也可能是 10 0 12。这是因为**函数参数的执行顺序是 Unspecified Behavior**，引用C++标准对 Unspecified Behavior 的说明：

> Unspecified behavior use of an unspecified value, or other behavior where this International Standard provides two or more possibilities and imposes no further requirements on which is chosen in any instance.

此外，C++标准中还有所谓的 `implementation-defined behavior`，比如C++标准说需要一个数据类型，然后具体的编译器去选择该类型占用的字节数，或者是存储方式（大端还是小端）。

一般情况下，我们需要关心的只有未定义行为，因为它通常会导致程序出错。而其他的两种行为，不需要我们去关心。

# 更多阅读

[Cppreference：Undefined behavior](http://en.cppreference.com/w/cpp/language/ub)
[What are all the common undefined behaviors that a C++ programmer should know about? ](http://stackoverflow.com/questions/367633/what-are-all-the-common-undefined-behaviours-that-a-c-programmer-should-know-a)
[What are the common undefined/unspecified behavior for C that you run into?](http://stackoverflow.com/questions/98340/what-are-the-common-undefined-unspecified-behavior-for-c-that-you-run-into)
[function parameter evaluation order](http://stackoverflow.com/questions/9566187/function-parameter-evaluation-order)
[A Guide to Undefined Behavior in C and C++, Part 1](http://blog.regehr.org/archives/213)
[A Guide to Undefined Behavior in C and C++, Part 2](http://blog.regehr.org/archives/213)
[Why is there so much undefined behavior in C++? ](https://www.quora.com/Why-is-there-so-much-undefined-behaviour-in-C++-Wouldnt-it-be-better-if-some-of-them-were-pre-defined-in-the-standard)
[Cplusplus: abs](http://www.cplusplus.com/reference/cstdlib/abs/?kw=abs)
[What Every C Programmer Should Know About Undefined Behavior](http://blog.llvm.org/2011/05/what-every-c-programmer-should-know.html)
[Undefined behavior and sequence points](http://stackoverflow.com/questions/4176328/undefined-behavior-and-sequence-points)
[Undefined, unspecified and implementation-defined behavior](http://stackoverflow.com/questions/2397984/undefined-unspecified-and-implementation-defined-behavior)
[Where do I find the current C or C++ standard documents?](http://stackoverflow.com/questions/81656/where-do-i-find-the-current-c-or-c-standard-documents)


[1]: https://slefboot-1251736664.file.myqcloud.com/20160918_ub.png

