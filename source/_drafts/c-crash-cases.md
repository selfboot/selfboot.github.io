---
title: 5 个导致 C++ 进程 Coredump 的经典案例
tags: [C++]
category: 项目实战
toc: true
description: 
date: 2025-01-07 21:00:00
---

只要你写过比较复杂的 C++ 项目，应该都或多或少遇见过进程 Coredump 的问题。Coredump 是程序运行过程中发生严重错误时，操作系统将程序当前的内存状态记录下来的一种机制。

C++ 中导致进程 Coredump 的原因有很多，比如：

1. **访问非法内存地址**：包括空指针解引用、访问已释放的内存、数组越界访问等；
2. **栈溢出**：无限递归、大数组分配在栈上；
3. **段错误**（Segmentation Fault）：试图写入只读内存、访问未映射的内存区域；
4. **异常未捕获**：未处理的异常导致程序终止；

遇到 Coredump 问题时，一般需要打开 core 文件，然后根据 core 文件来进行问题分析和调试。分析 core 文件有时候还是比较难的，需要对 C++ 的内存模型、异常处理机制、系统调用等有深入的理解。

本文不会过多介绍分析 core 文件的方法，而是通过几个真实项目中的案例，来让大家在写代码时候，能够有意识地避免这些错误。

<!-- more -->

## 并发读写导致访问非法内存地址



## 数组下标访问越界

我们都知道在 C++ 中**访问数组的时候如果下标越界，会导致访问非法内存地址，可能导致进程 coredump**。你可能会觉得，怎么会数组访问越界？我遍历的时候限制长度就行了呀。别急，看下面的例子。当然为了演示，这里简化了很多实际业务逻辑，只保留核心部分。

```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> src = {1, 2, 3, 4, 5, 6,7,8,9,10};
    std::vector<int> dest;

    for (size_t i = 0; i < src.size(); i++) {
        // 可能是后面加的业务过滤逻辑
        if(src[i] == 8) {
            continue;
        }
        dest.push_back(src[i] * 100);
    }
    
    // ... 继续根据 src 的内容进行处理
    for (size_t i = 0; i < src.size(); i++) {
        // 其他对 src 的处理
        // 这种用法虽然有问题，但这里内存在堆上，可能还没被回收，也不会 core
        // dest[i] -= 5; 
        dest.at(i) -= 5; // 这种用法会 core
    }
    
    return 0;
}
```

这里刚开始实现的时候，第一遍遍历 src，然后初始化 dest。然后接着又遍历 src，根据 src 的内容对初始化后的 dest 再进行某些处理。然后过了很久，可能加了个需求，需要过滤掉 src 中等于 8 的元素，于是就加了 if 判断。

改动的人，可能没注意到后面对 src 和 dest 的遍历，也可能没意识到过滤会导致 dest 的长度已经变了。
## 访问失效的迭代器



## 灾难性回溯导致的栈溢出

上面的示例其实平时多注意的话，还是能避免的。但下面这个，一般人还是很少知道，很容易踩坑。

我们有个地方需要判断字符串中是否有一对括号，于是用了 C++ 的正则表达式。相关代码简化如下：

```cpp
#include <iostream>
#include <regex>
#include <string>

int main() {
    std::string problematic = "((((";
    problematic += std::string(100000, 'a');
    problematic += "))))";
    std::regex re(R"(\([^\)]+\))");
    std::smatch matches;
    bool found = std::regex_search(problematic, matches, re);
    return 0;
}
```

上面代码中，我构造了一个很长的字符串，然后使用正则表达式来匹配。用 g++ 编译后，运行程序，程序就会 coredump 掉。如果用 gdb 看堆栈的话，如下：

![灾难性回溯导致的栈溢出](https://slefboot-1251736664.file.myqcloud.com/20250107_c++_crash_cases_regex.png)

这是因为正则引擎进行了大量的回溯，每次回溯都会在调用栈上创建新的栈帧。导致这里栈的深度特别长，最终超出栈大小限制，进程 coredump 了。

这个就是所谓的**灾难性回溯（Catastrophic Backtracking）**，实际开发中，对于复杂的文本处理，最好对输入长度进行限制。如果能用循环或者其他非递归的方案解决，就尽量不用正则表达式。如果一定要用正则表达式，可以限制重复次数（使用 {n,m} 而不是 + 或 *），另外也要注意避免嵌套的重复（如 (.+)+）。

上面的正则表达式，可以改成：

```cpp
std::regex re(R"(\([^\)]{1,100}\))");
```

## 总结

