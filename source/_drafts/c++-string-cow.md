---
title: C++ 数据意外修改之深入理解 string 的 COW 写时复制
tags: [C++]
category: 程序设计
toc: true
date: 
description: 
---

最近工作中有小伙伴遇到了一个奇怪的问题，C++中复制一个 string 后，更改复制后的内容，结果原值也被改了。对于不是很熟悉 C++ 的小伙伴来说，这就有点“见鬼”了。本文接下来从问题的简单复现，到背后的原理，以及 C++ 标准的变更，来一起深入讨论这个问题。

![C++字符串修改副本影响到原来内容](https://slefboot-1251736664.file.myqcloud.com/20240115_c++_string_cow_cover.png)

<!-- more -->

## 问题复现

这里直接给出可以稳定复现的代码，定义一个字符串 original，然后复制一份，接着调用一个函数来修改副本字符串的内容。业务中的函数比较复杂，这里复现用了一个简单的函数，只是修改 copy 的第一个字符。在修改副本 copy 前后，打印两个字符串的内容和内存地址。往下看之前，你可以先猜猜下面代码的输出。

```c++
#include <iostream>
#include <cstring>

using namespace std;

void ModifyStringInplace(string &str) {
    size_t len = str.size();
    char *s = const_cast<char *>(str.c_str());
    s[0] = 'X';
    return;
}
int main() {
    string original = "Hello, World!";
    string copy = original;

    // 显示两个字符串的内存地址
    cout << "Original: " << original << ", address: " << static_cast<const void*>(original.c_str()) << endl;
    cout << "Copy    : " <<  copy << ", address: " << static_cast<const void*>(copy.c_str()) << endl;

    // 修改副本
    ModifyStringInplace(copy);

    // 再次显示两个字符串的内存地址
    cout << "After Modification:" << endl;
    cout << "Original: " << original << ", address: " << static_cast<const void*>(original.c_str()) << endl;
    cout << "Copy    : " <<  copy << ", address: " << static_cast<const void*>(copy.c_str()) << endl;

    return 0;
}
```

在业务生产环境上，用 G++ 4.9.3 编译上面的代码，运行结果如下：

```bash
Original: Hello, World!, address: 0x186c028
Copy    : Hello, World!, address: 0x186c028
After Modification:
Original: Xello, World!, address: 0x186c028
Copy    : Xello, World!, address: 0x186c028
```

可以看到在修改副本后，**原始字符串的内容也发生了变化**。还有一点奇怪的是，原始字符串和副本的**内存地址始终是一样的**。这究竟是怎么回事呢？要解决这个疑问，我们需要先了解下 C++ string 的实现机制。

## 字符串写时复制

在低版本的 GCC/G++(5 版本以下) 中，string 类的实现采用了**写时复制**（Copy-On-Write，简称 COW）机制。当一个字符串对象被复制时，它**并不立即复制整个字符串数据，而是与原始字符串共享相同的数据**。只有在字符串的一部分被修改时（即“写入”时），才会创建数据的真实副本。COW 的优点在于它可以大幅度减少不必要的数据复制，特别是在字符串对象**频繁被复制但很少被修改**的场景下。

COW 的一般实现方式：

- **引用计数**：string 对象内部通常包含一个指向字符串数据的指针和一个引用计数。这个引用计数表示有多少个 string 对象共享相同的数据。
- **复制时共享**：当一个 string 对象被复制时，它会简单地复制指向数据的指针和引用计数，而不是数据本身。复制后的字符串对象和原始对象共享相同的数据，并且引用计数增加。
- **写入时复制**：如果任何一个 string 对象试图修改共享的数据，它会首先检查引用计数。如果引用计数大于 1，表示数据被多个对象共享。在这种情况下，修改操作会先创建数据的一个新副本（即“复制”），然后对这个新副本进行修改。引用计数随后更新以反映共享情况的变化。

COW 实现需要仔细管理内存分配和释放，以及引用计数的增加和减少，确保数据的正确性和避免内存泄漏。现在回到上面的复现代码，我们更改了复制后的字符串，但是从输出结果来看，并**没有触发 COW 中的写复制，因为前后地址还是一样的**。这是为什么呢？先来看 ModifyStringInplace 的实现，string 的 c_str() 方法返回一个**指向常量字符数组**的指针，设计上这里是只读的，**不应该通过这个指针来修改字符串的内容**。

但是上面的实现中，用 `const_cast` 移除了对象的 const（常量）属性，然后对内存上的数据进行了修改。通过指针**直接修改底层数据的操作**不会被 string 的内部机制（包括 COW）所识别到，因为它跳过了string 对外暴露接口的状态检查。如果把上面代码稍微改动下，用`[]`来修改字符串的内容，`str[0] = 'X'`，那么就会触发 COW 的写复制，从而导致原始字符串的内容不会被修改。输出如下：

```
Original: Hello, World!, address: 0x607028
Copy    : Hello, World!, address: 0x607028
After Modification:
Original: Hello, World!, address: 0x607028
Copy    : Xello, World!, address: 0x607058
```

其实用 `[]` 只读取字符串中某位的内容，也会触发写时复制。比如下面的代码：

```c++
{
    string original = "Hello, World!";
    string copy = original;

    // 显示两个字符串的内存地址
    cout << "Original: " << original << ", address: " << static_cast<const void*>(original.c_str()) << endl;
    cout << "Copy    : " <<  copy << ", address: " << static_cast<const void*>(copy.c_str()) << endl;

    copy[0];
    // 再次显示两个字符串的内存地址
    cout << "After :" << endl;
    cout << "Original: " << original << ", address: " << static_cast<const void*>(original.c_str()) << endl;
    cout << "Copy    : " <<  copy << ", address: " << static_cast<const void*>(copy.c_str()) << endl;
}
```

在低版本 G++ 上编译运行，可以看到用 operator[] 读取字符串后，复制内容的地址也发生了变化(从 `0x21f2028` 到 `0x21f2058`)，如下：

```shell
Original: Hello, World!, address: 0x21f2028
Copy    : Hello, World!, address: 0x21f2028
After Modification:
Original: Hello, World!, address: 0x21f2028
Copy    : Hello, World!, address: 0x21f2058
```

这是因为 operator[] 返回的是对字符的引用，**可以通过这个引用来修改字符串的内容**，这个接口有"修改"字符串的语义，所以会触发写时复制。虽然上面代码实际并没有修改，但是 COW 机制本身很难感知到这里没修改，这里改成用迭代器 `begin()/end()` 也会有同样的问题。

## 写时复制的缺点

用 COW 实现 string 的好处是可以减少不必要的数据复制，但是它也有一些缺点。先看一个简单示例，参考 [Legality of COW std::string implementation in C++11]([Legality of COW std::string implementation in C++11](https://stackoverflow.com/questions/12199710/legality-of-cow-stdstring-implementation-in-c11)) 下的一个回答。

```c++
int main() {
    std::string s("str");
    const char* p = s.data();
    {
        std::string copy = s;
        std::cout << s[0] << std::endl; // cow: now s new allocation
    }
    std::cout << *p << '\n';  // p is dangling
}
```

在 COW 机制下，当创建 copy 作为 s 的副本时，s 和 copy 实际上共享相同的底层数据，此时，p 指向的是这个共享数据的地址。然后 operator[] 导致 s 会触发重新分配内存，这时 p 对应内存部分的引用只有 copy 了。当 copy 的生命周期结束并被销毁，使得 p 成为**悬空指针（dangling pointer）**。后面访问悬空指针所指向的内存，这是[未定义行为（undefined behavior）](https://selfboot.cn/2016/09/18/c++_undefined_behaviours/)，可能导致程序崩溃或者输出不可预测的结果。如果不使用 COW 机制，这里就不会有这个问题。

不过，就算是 C++11 及以后的标准中，标准库中的 std::string 不再使用 COW 机制了，**保留指向字符串内部数据的指针仍然是一种不安全的做法**，因为任何修改字符串的操作都**可能导致重新分配内部缓冲区，从而使得之前的指针或引用变得无效**。

COW 写时复制除了带来上面这种潜在 bug 外，还有另外一个比较重要的缺陷，就是**不适合多线程环境**，详细可以阅读 [Concurrency Modifications to Basic String](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2008/n2534.html) 这篇文章。

## C++11 标准改进

C++11 之后，STL 里面的 string 类型不允许使用 COW 技术实现，GCC 编译器，从 5.1 开始不再用 COW 实现 string，可以参考 [Dual ABI](https://gcc.gnu.org/onlinedocs/libstdc++/manual/using_dual_abi.html)：

> In the GCC 5.1 release libstdc++ introduced a new library ABI that includes new implementations of string and std::list. These changes were necessary to conform to the 2011 C++ standard which **forbids Copy-On-Write strings** and requires lists to keep track of their size.


如果用COW实现，那么non-const operator[]可能会导致迭代器失效。而标准严格规定了哪些成员方法可以导致迭代器失效，其中不包括这个方法。