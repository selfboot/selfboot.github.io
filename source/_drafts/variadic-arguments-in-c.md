---
title: C++ 函数可变参实现方法的演进
tags: [C++]
category: 程序设计
toc: true
description: 
---

可变参数函数是**接受可变数量参数的函数**，在不少场景下，可变参数函数是非常有用的。比如想打印日志时，可以接受任意数量的参数，然后将这些参数拼接输出到控制台，如下：

```c++
{
    // ...;
    LogInfo(user, cost, action, result);
}
```

在C++中，可变参数函数的实现方式有多种，包括C风格的**可变参数列表，变参模板，折叠表达式**，本文接下来介绍这三种方法的演进之路。

<!-- more -->

## C 风格变长参数列表

C 风格的变长参数通过 `<cstdarg>` 中定义的宏实现，主要包括：`va_list, va_start, va_arg, va_end`。下面是一个使用C风格变长参数的例子，实现了一个函数，计算任意数量整数的和：

```c++
#include <cstdarg>
#include <iostream>

// 需要提供参数个数
int sum(int n, ...) {
    int total = 0;
    va_list args;
    va_start(args, n);
    for (int i = 0; i < n; ++i) {
        total += va_arg(args, int);
    }
    va_end(args);
    return total;
}

int main() {
    std::cout << sum(5, 1, 2, 3, 4, 5) << std::endl; // 输出: 15
    return 0;
}
```

变长参数函数在汇编层面的实现依赖于特定的平台和调用约定。基本的思想是**通过栈（或在某些情况下是寄存器）来传递参数，并使用指针运算在内部遍历这些参数**。优点是提供与C语言良好的兼容性，适用于需要与C代码接口的场合。

但是这种实现中，需要在**调用函数时显式提供参数的个数**。这是因为编译器在编译时**不检查省略号后面参数的类型或数量**，因此必须有一种方式来确定传递了多少个参数以及如何正确处理它们。最常见的方法是通过一个固定的参数指定后续参数的数量，不过也有其他方法，比如 **printf 使用格式字符串中的格式说明符来确定后续参数的数量和类型**。对于 `printf("i = %d, pi = %.2f, s = %s\n", i, pi, s);`，通过格式字符串中的`%d, %.2f, 和%s`自动推断出它需要从可变参数中读取一个整数(int), 一个双精度浮点数(double), 和一个字符串(char*)。

另外要注意这种方式**不检查数据类型**，错误地传递参数类型可能导致运行时错误。比如下面的调用中，第 1 个参数传成了字符串，编译器不会报错，但是运行时计算出来的结果是不对的。

```c++
std::cout << sum(5, "1", 2, 3, 4, 5) << std::endl;
```

## C++11 的变参模板

好在 C++11 引入了变参模板，它提供了一个类型安全的解决方案，**不需要在调用时指定参数的个数，而是通过模板和递归函数展开来处理任意数量和类型的参数**。上面的 sum 函数用变参模板实现如下：

```c++
#include <iostream>

// 基本案例：当只有一个参数时，直接返回该参数
template<typename T>
T sum(T t) {
    return t;
}

// 递归展开：接受一个参数和一个参数包，处理一个参数后，将剩余的参数包传递给下一个递归调用
template<typename T, typename... Args>
T sum(T first, Args... args) {
    return first + sum(args...);
}

int main() {
    std::cout << sum(1, 2, 3, 4, 5) << std::endl; // 输出: 15
    return 0;
}
```

在底层，变参模板的实现依赖于**编译器对模板的实例化过程**。编译器会递归地将变参模板实例化为多个重载函数，每个函数处理一个参数，直到参数包被完全展开。这个过程完全在编译时进行，不涉及运行时性能开销。

- 递归展开：编译器会生成一系列函数实例，每次调用中使用一个参数，直到参数列表为空。在上述例子中，sum(1, 2, 3, 4, 5) 会被展开为 1 + sum(2, 3, 4, 5)，接着 sum(2, 3, 4, 5) 被展开为 2 + sum(3, 4, 5)，以此类推。
- 终止条件：递归展开的过程需要一个终止条件来结束递归调用。在上述例子中，当参数包中只剩下一个参数时，会调用基础案例的sum(T t)，作为递归的终止条件。

我们可以在上面模板函数中添加打印语句，然后在运行时观察到模板展开的结果。虽然这种方法不能直接展示编译时的情况，但它可以帮助理解模板是如何逐步被实例化和展开的。

```c++
template<typename T>
T sum(T t) {
    std::cout << "Base case with " << t << std::endl;
    return t;
}

template<typename T, typename... Args>
T sum(T first, Args... args) {
    std::cout << "Processing " << first << std::endl;
    return first + sum(args...);
}
```

运行结果如下：

```shell
Processing 1
Processing 2
Processing 3
Processing 4
Base case with 5
15
```

### 模板递归实例化

为了能够直观看到编译时模板的递归展开，我们可以用 Clang 提供的`-Xclang -ast-print`选项，显示模板展开后的抽象语法树（AST）。完整命令如下：

```shell
clang++ -fsyntax-only -Xclang -ast-print -std=c++11 test.cpp
```

可以看到下面结果：

![模板递归展开变参函数](https://slefboot-1251736664.file.myqcloud.com/20240505_variadic_arguments_in_c++_template.png)

可以看到当函数 `sum(1, 2, 3, 4, 5)` 被调用时，编译器生成如下展开：

```c++
sum<int, int, int, int, int>(int first, int args, int args, int args, int args)
sum<int, int, int, int>(int first, int args, int args, int args)
sum<int, int, int>(int first, int args, int args)
sum<int, int>(int first, int args)
sum<int>(int first)
```

这些展开显示了**如何逐步减少参数的数量**，每次调用处理一个参数并将剩余的参数传递到下一个递归调用。


### 类型安全

变参模板有一个优点就是**类型安全**，这是因为变参模板的实现依赖于**编译器的模板展开机制，可以在编译时进行类型检查**。前面 C 风格的变长参数 sum 实现中，函数调用时候，如果传入参数是一个 string，是可以通过编译的，在运行时结果才会出错。

```c++
std::cout << sum(1, "2", 3, 4, 5) << std::endl; // 输出: 15
```

而在变参模板中，函数调用每个参数都是**在编译时明确指定的类型**，编译器将**检查加法操作是否对每种类型有效，这就确保了类型安全**。上面代码尝试把int和string类型相加，将在编译时就直接报错，而不是等到运行时。如下图：

![变参模板是类型安全的](https://slefboot-1251736664.file.myqcloud.com/20240505_variadic_arguments_in_c++_type_safe.png)

通过使用变参模板而不是传统的C风格变长参数，所有类型错误都在编译时被捕捉，不会在运行时突然崩溃。对于不支持的操作，比如尝试打印一个没有重载输出运算符的复杂对象，编译器会报错。这样的代码更加安全、清晰且易于维护。

### 变参模板的局限

接下来思考一个问题：**所有的变参函数调用都能用这种方式进行递归展开吗**？熟悉递归的人可能会想到，递归展开的深度往往是有限的。这个问题在变参模板中也是存在的，**编译器对递归展开的深度有限制，当参数过多时，可能会导致编译失败**。Clang 编译器的默认**模板递归实例化深度在 Mac 上是 1024 层**，可以使用下面的 C++ 程序来测试 Clang 的模板递归深度限制。

```c++
#include <iostream>

template<int N>
struct Depth {
    static const int value = 1 + Depth<N - 1>::value;
};

template<>
struct Depth<0> {
    static const int value = 0;
};

int main() {
    std::cout << "The depth is " << Depth<5000>::value << std::endl;
    return 0;
}
```

上面代码尝试实例化模板 `Depth<5000>`，如果超过了编译器默认的递归实例化深度限制，则会出现编译错误。

![Clang 编译器默认的递归实例化深度限制](https://slefboot-1251736664.file.myqcloud.com/20240505_variadic_arguments_in_c++_depth.png)

除了递归深度问题，还有一些其他缺点也值得关注：

1. 在一些性能敏感的环境，递归模板函数的编译结果可能不如手写的迭代代码高效。
2. **编译速度变慢。**变参模板的处理需要编译器在编译时展开和实例化模板，特别是当涉及复杂的递归展开和多层模板嵌套时，编译器的工作量显著增加。
3. **代码膨胀（二进制大小增加）**。每次使用变参模板函数时，如果涉及到不同的参数类型组合，编译器需要生成该特定组合的新实例。**每个实例都是一个单独的函数，这会增加最终可执行文件的大小**。

## C++17 的折叠表达式

C++17 引入了折叠表达式，它提供了一种**非递归的方式来处理变参模板**，有效解决了深度递归和编译效率问题。折叠表达式是一种新的语法，可以在编译时展开参数包，将参数包中的所有参数组合成一个表达式。先来看简单示例代码：

```c++
#include <iostream>

// 变参的 sum 函数使用折叠表达式实现
template<typename... Args>
auto sum(Args... args) -> decltype((args + ...)) {
    return (args + ...);
}

// 变参的打印日志函数
template<typename... Args>
void show(Args&&... args) {
    (std::cout << ... << args) << '\n';  // C++17 折叠表达式
}

int main() {
    // 调用 sum 函数
    auto result = sum(1, 2, 3, 4, 5);
    std::cout << "The result is: " << result << std::endl;

    // 可以处理不同类型的数据，结果类型会根据传入参数自动推导
    auto result2 = sum(1, 2.5, 3.0, 4.5);
    std::cout << "The result with mixed types is: " << result2 << std::endl;

    // 类型安全检查会发现这里有问题，编译不过
    // auto result2 = sum(1, "2.5", 3.0, 4.5);

    show("This is a", " variadic", " template", " with", " folding", " expression.", 123, 45.67);
    return 0;
}
```

上面实现了一个 sum 和一个打印变量的方法，`sum`函数利用了C++17的折叠表达式语法 `(args + ...)`。这种语法告诉编译器将加法运算符应用于所有给定的参数。如果函数被调用如 `sum(1, 2, 3, 4, 5)`，折叠表达式将展开为 `1 + 2 + 3 + 4 + 5`。同理，折叠表达式(`std::cout << ... << args`)将会对每个args进行展开，并应用`<<`运算符，这样做避免了递归调用，直接在一行中处理所有参数。

和模板变参一样，折叠表达式也是**在编译时展开的**，不会引入运行时开销。折叠表达式的优点在于**简洁、高效**，并且**不会引入递归深度限制**。同时，也是**类型安全**的，编译器会在编译时检查参数的类型，确保所有参数都可以正确地应用到表达式中。

### 实现细节

折叠表达式允许编译器通过**一种简洁的语法规则来展开参数包**，这种展开是在编译时完成的，具体的实现依赖于编译器的内部机制。从结果来看，当编译器遇到折叠表达式时，它会将表达式中的操作符应用于参数包中的每个元素。对于二元操作符如 `+，<<` 等，编译器生成一系列操作，这些操作按照指定的折叠模式（**左折叠或右折叠**）连接起来。

- 左折叠 `((... op args))`：如果参数包为 {1, 2, 3}，结果为 ((1 + 2) + 3)。左折叠的应用场景如逻辑运算 AND 或 OR 操作，可以确保从左到右的短路评估。
- 右折叠 `((args op ...))`：如果参数包为 {1, 2, 3}，结果为 (1 + (2 + 3))。右折叠的应用场景如**函数组合**，从右至左组合函数更自然，因为这符合数学中的复合函数（g(f(x))）顺序。

用 clang 可以看到编译器展开折叠表达式的结果，结果如下：

![折叠表达式展开](https://slefboot-1251736664.file.myqcloud.com/20240506_variadic_arguments_in_c++_foldargs.png)

可以看到这里对于每个模板调用，生成了一个展开的函数。