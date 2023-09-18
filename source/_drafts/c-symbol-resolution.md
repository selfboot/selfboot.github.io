---
title: 深入理解 C++ 链接符号决议：从符号重定义说起
tags:
  - C++
  - ChatGPT
category: 计算机基础
toc: true
description: 
date: 
---

在 [C++ 中使用 Protobuf 诡异的字段丢失问题排查](https://selfboot.cn/2023/09/07/protobuf_redefine/)这篇文章中，分析过因为两个一样的 proto 文件，导致链接错了 pb，最终反序列化的时候丢失了部分字段。当时也提到过符号决议的过程，不管是动态链接还是静态链接，实际用的都是靠前面的库的符号定义。本来以为对这里的理解很深入了，直到最近又遇见一个奇怪的“**符号重定义**”问题。

![C++ 符号编译、链接概图](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230918_c++_symbol_resolution_index.webp)

<!-- more -->

## 问题背景

最开始有一个 utils 目录，里面有一些基础代码，编译为一个静态库 A。后来项目中其他目录下又拷贝了一份出来，编译成另一个静态库 B。由于项目复杂的依赖关系(剪不断理还乱啊)，有的目标 target 会同时依赖 A 和 B，好在编译和链接一直都是 OK 的。

最近，在模块 B 中的某个 cpp 中，修改了其中一个类，对构造函数添加了一个默认参数。然后调用的时候，也传了具体的参数进去。结果在编译 target 的时候，报错 `multiple definition`。

按照我之前的理解，这里对于静态库中的符号，链接决议的时候，从左到右扫描，如果一个符号在前面已经找到定义，后面就会忽略掉。上面静态库 A 和 B，虽然确实是有重复的函数定义，不过应该每个符号都能找到一个定义，然后丢弃后面出现的，链接不应该出错才对呀。

## 复现步骤

项目代码太复杂了，不太好直接拿来分析，先来看看能不能写个简单的例子复现这里的问题。这里复现代码的结构如下：

```shell
➜ tree
.
├── demoA
│   ├── libDemoA.a
│   ├── sum.cpp
│   ├── sum.h
│   └── sum.o
├── demoB
│   ├── libDemoB.a
│   ├── sum.cpp
│   ├── sum.h
│   └── sum.o
└── main.cpp
```

### 简单函数调用

从最简单的示例入手，demoA 和 demoB 里面的 sum.h 里声明函数如下:

```c++
int sum(int a, int b);
```

具体实现在各自的 cpp 文件中，DemoB 中的输出是 "DemoB"，这样通过输出就知道用的哪个库里面的实现。DemoA 中的 cpp 定义如下：

```c++
#include "sum.h"
#include <iostream>
int sum(int a, int b) {
    std::cout << "DemoA" << std::endl;
    return a + b;
}
```

main.cpp 很简单，就是调用一个 sum：

```c++
#include "demoB/sum.h"
int main() {
    int result = sum(1, 2);
    return 0;
}
```

把两个目录分别编译为静态库，然后编译、链接 main.cpp，不同链接顺序下，都可以正常链接生成二进制，并能正常输出。

```shell
➜ g++ -c -o demoA/sum.o demoA/sum.cpp
➜ ar rcs demoA/libDemoA.a demoA/sum.o
➜ g++ -c -o demoB/sum.o demoB/sum.cpp
➜ ar rcs demoB/libDemoB.a demoB/sum.o
➜ g++ main.cpp -o main -LdemoA -LdemoB -lDemoA -lDemoB
➜ ./main
DemoA
➜ g++ main.cpp -o main -LdemoA -LdemoB -lDemoB -lDemoA
➜ ./main
DemoB
```

这里符合之前的认知，虽然有两个 sum 函数的定义，但是静态库在链接的时候，会优先用先找到的，后面的会被丢弃掉。不论这里以何种顺序链接，都不会出现重复定义的错误。

### 复现重定义

前面复现代码和项目中的代码还是有一点不同的，接下来尽量模拟项目中的改动方法。在 demoA 的 sum.h 中增加一个类，如下：

```c++
// sum.h
class Demo{
public:
    Demo(int a);

private:
    int num;
};

// sum.cpp
Demo::Demo(int a){
    num = a;
    std::cout << "DemoA init" << std::endl;
}
```

然后对于 DemoB 中的类的构造函数，增加一个默认参数 b：

```c++
// sum.h
class Demo{
public:
    Demo(int a, int b = 0);

private:
    int num;
};

// sum.cpp
Demo::Demo(int a, int b){
    num = a;
    std::cout << "DemoB init" << std::endl;
}
```

之后 main 里面增加一个类对象的定义：

```c++
int main() {
    int result = sum(1, 2);
    Demo de(10, 10);
    return 0;
}
```

这里复现了符号重定义的问题了！如果 `-lDemoA -lDemoB` 的顺序，就会报 sum 的重定义。但是如果反过来 `-lDemoB -lDemoA`，就一切正常，输出也是符合前面的认知。

![C++ 符号编译、链接概图](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230918_c++_symbol_resolution_multiple_definition.png)

问题是复现了，不过自己确实有点迷惑了。这里 DemoA 库在前面的话，应该是先从这里拿到 sum，后面到 DemoB 的时候，**链接器应该丢掉 sum 就可以了**，为啥会报重复定义呢？毕竟**前面只有函数的示例中，就是这样链接的**啊。

## 原因猜测


## 再读经典

经过上面的验证猜测步骤后，再重新读《深入理解计算机系统》的 `7.6 符号解析`，才完全明白了这一节讲的内容，整个链接的核心步骤如下。

链接器读取一组可重定位目标文件，并把它们链接起来，形成一个输出的可执行文件。如果多个目标文件定义相同名字的全局符号，链接器要么标志一个错误，要么以某种方法选出一个定义并抛弃其他定义。

编译器向汇编器输岀每个全局符号，或者是强（strong）或者是弱（weak），而汇编器把这个信息隐含地编码在可重定位目标文件的符号表里。函数和已初始化的全局变量是强符号，未初始化的全局变量是弱符号。Linux 链接器使用下面的规则来处理多重定义的符号名：

- 规则 1：不允许有多个同名的强符号。
- 规则 2：如果有一个强符号和多个弱符号同名，那么选择强符号。
- 规则 3：如果有多个弱符号同名，那么从这些弱符号中任意选择一个。

上面假设链接器读取一组可重定位目标文件，实际上可以链接库。对于静态库来说，它是一组连接起来的可重定位目标文件的集合，有一个头部用来描述每个成员目标文件的大小和位置，文件名由后缀 `.a` 标识。

在符号解析阶段，链接器**从左到右**按照它们在编译器驱动程序命令行上出现的顺序来扫描可重定位目标文件和静态库文件(存档文件)。扫描中，链接器维护一个可重定位目标文件的**集合 E**。如果输入文件是目标文件，**只要目标文件中有一个符号被用到，整个目标文件就会放进集合 E。要是目标文件的所有符号都没有被引用，那么就会丢弃这个目标文件**。如果输入文件是静态库(存档)文件，则会按照上面的方法遍历其中的每一个可重定向目标文件。

扫描完所有文件后，链接器会**合并和重定位 E 中的目标文件**，构建输岀的可执行文件。这时候如果有两个目标文件有同样的符号定义，就会报重复定义错误。

回到前面文章开始部分的重定义问题。在两个库 A 和 B 中都有一个 util.o 目标文件，开始的时候是完全一样的，所以链接顺序上靠后的 B/util.o 会被丢掉，这样是没有问题的。后来改动了 B/util.cpp，增加了 A 中没有的符号，由于其他地方用到了这个符号，导致 B/util.o 也被包含在链接过程。这样就相当于同时链接 A/util.o 和 B/util.o ，这两个目标文件中有很多重复的函数定义，所以会报符号重定义。

## 参考资料

[深入理解计算机系统: 7.6 符号解析](https://hansimov.gitbook.io/csapp/part2/ch07-linking/7.6-symbol-resolution)
[Library order in static linking](https://eli.thegreenplace.net/2013/07/09/library-order-in-static-linking)