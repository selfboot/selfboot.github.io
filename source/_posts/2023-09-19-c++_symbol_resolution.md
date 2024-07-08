---
title: 深入理解 C++ 链接符号决议：从符号重定义说起
tags:
  - C++
  - ChatGPT
category: 计算机基础
toc: true
description: 本文深入剖析了C++静态库链接时的符号决议机制，以符号重定义错误为切入点，通过简单示例逐步说明了静态库中目标文件全链接的关键。指出了链接器从左向右决议符号，一旦库中目标文件有一个符号被需要，就会引入整个目标文件，并与经典教材内容对比验证。
date: 2023-09-19 22:17:02
updated: 2023-09-20 22:00:01
---

在 [C++ 中使用 Protobuf 诡异的字段丢失问题排查](https://selfboot.cn/2023/09/07/protobuf_redefine/)这篇文章中，分析过因为两个一样的 proto 文件，导致链接错了 pb，最终反序列化的时候丢失了部分字段。当时也提到过符号决议的过程，不管是动态链接还是静态链接，实际用的都是靠前面的库的符号定义。本来以为对这里的理解很深入了，直到最近又遇见一个奇怪的“**符号重定义**”问题。

![C++ 符号编译、链接概图](https://slefboot-1251736664.file.myqcloud.com/20230918_c++_symbol_resolution_index.webp)

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

```cpp
int sum(int a, int b);
```

具体实现在各自的 cpp 文件中，DemoB 中的输出是 "DemoB"，这样通过输出就知道用的哪个库里面的实现。DemoA 中的 cpp 定义如下：

```cpp
#include "sum.h"
#include <iostream>
int sum(int a, int b) {
    std::cout << "DemoA" << std::endl;
    return a + b;
}
```

main.cpp 很简单，就是调用一个 sum：

```cpp
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

```cpp
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

```cpp
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

```cpp
int main() {
    int result = sum(1, 2);
    Demo de(10, 10);
    return 0;
}
```

这里复现了符号重定义的问题了！如果 `-lDemoA -lDemoB` 的顺序，就会报 sum 的重定义。但是如果反过来 `-lDemoB -lDemoA`，就一切正常，输出也是符合前面的认知。

![C++ 符号编译、链接概图](https://slefboot-1251736664.file.myqcloud.com/20230918_c++_symbol_resolution_multiple_definition.png)

问题是复现了，不过自己确实有点迷惑了。这里 DemoA 库在前面的话，应该是先从这里拿到 sum，后面到 DemoB 的时候，**链接器应该丢掉 sum 就可以了**，为啥会报重复定义呢？毕竟**前面只有函数的示例中，就是这样链接的**啊。

## 原因猜测

有了 ChatGPT 之后，都不怎么用搜索了，直接把问题给 ChatGPT，看它怎么解释。其实前面的复现过程中，也都一直跟 ChatGPT 有交流，让它对上下文有了了解。

### ChatGPT 的解释

这里为了让它全面了解问题细节，又把上面重定义部分的复现代码、编译链接和报错一起喂给了它，于是它解释如下。

链接器首先查找 libDemoA.a，找到 sum(int, int) 和 Demo::Demo(int)。然后链接器会去 libDemoB.a 查找符号。此时，由于 main.cpp 实际上使用了 demoB 版本的 Demo::Demo(int, int)（注意这里有两个参数），链接器会尝试从 libDemoB.a 中解析这个新符号。在 libDemoB.a 中，链接器找到了与 libDemoA.a 中相冲突的 sum(int, int)，因此报告“多重定义”。

不过我还是有疑问，**链接器首先查找 libDemoA.a，找到 sum(int, int) ，这时候sum已经被找到，后面在 libDemoB.a 中，就会忽略这个符号的呀**。直接去问 ChatGPT，它就开始“悔过”了：

![ChatGPT C++符号链接过程的错误回答](https://slefboot-1251736664.file.myqcloud.com/20230919_c++_symbol_resolution_chatgpt_error.png)

然后进一步让它解释为啥最开始的复现中没有报错，如下：

![ChatGPT C++符号链接过程的错误解释](https://slefboot-1251736664.file.myqcloud.com/20230919_c++_symbol_resolution_chatgpt.png)

看来直接问这条路走不通了。接着想看看能不能打印一些链接的中间过程，于是添加了 `-Wl,--verbose` 选项进行链接，也没发现啥有用的信息。这里我想如果能打印 ld 链接过程的符号未决议集合和已经决议集合，以及决议符号的具体步骤，就能排查出来。结果没发现有啥办法可以打印这些。

### 大胆猜测

这里其实最好是直接去看链接器的实现，毕竟**源码之下了无秘密**。不过我这里重新回顾了下上面两个测试过程的差异，并做出了一个猜测，拿来问 ChatGPT：

> 这里我这样测试，demoA/sum.h 和 demoB/sum.h 如果都是只有 sum 函数，那么无论哪个先链接，都不会有问题。
> 但是一旦里面有 class ，定义不一样，那么就会出错。**这里“第一个赢” 是不是只有在后面出现的库里，没有一个符号被需要的话，才不会重复定义。**
>   
> **只要后面出现的库，有一个符号被需要，就会重复定义？**

终于得到了一个靠谱的解释：

![C++ 链接静态库符号重定义的详细解释](https://slefboot-1251736664.file.myqcloud.com/20230919_c++_symbol_resolution_chatgpt_right.png)

也就是说**当链接器从静态库的 .o 文件中引用一个符号时，它实际上会把包含该符号的整个对象文件都链接到最终的可执行文件**。为了验证这一点，把 demoB/sum.cpp 里面 Demo 类的构造函数定义拆分出来为一个新的编译单元 demo.cpp，如下：

```cpp
// cat demoB/demo.cpp
#include "sum.h"
#include <iostream>

Demo::Demo(int a, int b){
    num = a;
    std::cout << "DemoB init" << std::endl;
}
```

然后重新编译 DemoB 静态库，编译、链接 main，发现不会有符号重定义了，结果如下：

```shell
(base) ➜ g++ main.cpp -o main -LdemoA -LdemoB -lDemoB -lDemoA
(base) ➜  link_check ./main
DemoB
DemoB init
(base) ➜  link_check g++ main.cpp -o main -LdemoA -LdemoB -lDemoA -lDemoB
(base) ➜  link_check ./main
DemoA
DemoB init
```

这里因为用到的 Demo 在静态库 B 中有一个单独的可重定向目标文件 demo.o，而 sum.o 里面没有任何需要引入的符号，所以没有被链接进去，因此不会有符号重定义了。
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

## 一些讨论

文章在 [V2EX](https://www.v2ex.com/t/975233) 上引起了一些小伙伴的讨论，其中有些观点还挺不错，这里就记录下来。[geelaw](https://www.v2ex.com/t/975233#r_13670523) 这里说到：

> 无论是看代码还是**问 ChatGPT 却不查证**都是非常糟糕的学习方法，第一步应该是理解 C++ 标准是如何规定的。
> 文章里无论是 int sum(int, int) 还是 class Demo 都是非常严重的 ODR(One-definition rule) violation。
> 
> 在 [basic.def.odr]/14 里规定了 (14.1) 非内联非模板函数在多个翻译单元中有定义时 (14) 程序不良，且在非模块中无需报错，这适用于 sum 的情况。
> 
> 在 [basic.def.odr]/14 里规定了 (14.2) 多个翻译单元中有定义的 class 如果不满足 (14.4) 在所有可达的翻译单元中定义是相同的记号（ token ）序列，则 (14) 程序不良，且在非模块中无需报错，这适用于 class Demo 的情况。

至于某个具体的编译器、链接器产生的什么行为，不过是巧合罢了。这里贴一下 C++ 标准的文档地址：[basic.def.odr#14](https://eel.is/c++draft/basic.def.odr#14)。就算 sum 这种能编译，链接成功，也是一个很坏的代码习惯。能正常运行的，结果符合预期的，也不一定就是对的实现，可能是编译器的巧合行为，说不定后面就不行了。实际项目中，可以通过**命名空间，或者重构重复部分代码、调整代码结果来避免这样的 ODR 问题**。

当然，上面是用的 GNU ld 链接，如 [tool2d](https://www.v2ex.com/t/975233#r_13670827) 所说:

> 这算是 gcc 的问题，你换 vc 一开始 sum 就不能链接成功。
> 符号一样，什么前面的函数体去覆盖后面的函数体，对于微软来说，是完全不存在的事情。
> 还有一点，linux so 动态链接库里的符号可以是未决的，但是 dll 缺一个函数，都没办法生成。光是这点，微软就已经领先 100 年。

这里我没试过用 vc 链接，仅供参考。
## 参考资料

[深入理解计算机系统: 7.6 符号解析](https://hansimov.gitbook.io/csapp/part2/ch07-linking/7.6-symbol-resolution)
[Library order in static linking](https://eli.thegreenplace.net/2013/07/09/library-order-in-static-linking)