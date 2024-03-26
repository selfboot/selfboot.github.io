---
title: 深入理解 C++ 对象的内存布局
tags: [C++]
category: 程序设计
toc: true
description: 
---


<!-- more -->

## 简单对象内存分布

下面以一个最简单的 Basic 类为例，来看看只含有基本数据类型的对象是怎么分配内存的。

```c++
#include <iostream>
using namespace std;

class Basic {
public:
    int a;
    double b;
};

int main() {
    Basic temp;
    temp.a = 10;
    cout << temp.a << endl;
    cout << temp.b << endl;
    return 0;
}
```

编译运行后，可以用 GDB 来查看对象的内存分布。如下图：

![Basic 基础数据类的内存分布-GDB调试](https://slefboot-1251736664.file.myqcloud.com/20240326_c++_object_model_basic_gdb.png)

对象 temp 的起始地址是 0x7fffffffe3b0，这是整个对象在内存中的位置。成员变量a的地址也是 0x7fffffffe3b0，表明int a是对象temp中的第一个成员，位于对象的起始位置。成员变量b的类型为double，其地址是 0x7fffffffe3b8(a的地址+8)，内存布局如下图：

![Basic 基础数据类的内存分布示意图](https://slefboot-1251736664.file.myqcloud.com/20240326_c++_object_model_basic_demo.png)

int类型在当前平台上占用4个字节（可以用sizeof(int)验证），而这里double成员的起始地址与int成员的起始地址之间相差8个字节，说明在a之后存在**内存对齐填充**（具体取决于编译器的实现细节和平台的对齐要求）


## 地址空间布局随机化

前面的例子中，如果用 GDB 多次运行程序，对象的**虚拟内存地址每次都一样**，这是为什么呢？

我们知道现代操作系统中，每个运行的程序都使用**虚拟内存地址空间**，通过操作系统的内存管理单元（MMU）映射到物理内存的。虚拟内存有很多优势，包括**提高安全性、允许更灵活的内存管理等**。为了防止**缓冲区溢出攻击**等安全漏洞，操作系统还会在每次程序启动时**随机化进程的地址空间布局**，这就是地址空间布局随机化（ASLR，[Address Space Layout Randomization](https://en.wikipedia.org/wiki/Address_space_layout_randomization)）。

在 Linux 操作系统上，可以通过 `cat /proc/sys/kernel/randomize_va_space` 查看当前系统的 ASLR 是否启用，基本上默认都是开启状态(值为 2)，如果是 0，则是禁用状态。

前面使用 GDB 进行调试时，可能会观察到内存地址是固定不变的，这是因为 GDB 默认禁用了ASLR，以便于调试过程中更容易重现问题。可以在使用 GDB 时启用 ASLR，从而让调试环境更贴近实际运行环境。启动 GDB 后，可以通过下面命令开启地址空间的随机化。

```
(gdb) set disable-randomization off
```

之后再多次运行，这里的地址就会变化了。

![GDB 开启地址空间布局随机化](https://slefboot-1251736664.file.myqcloud.com/20240319_c++_object_model_gdb_disable.png)