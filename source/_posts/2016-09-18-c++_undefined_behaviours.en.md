---
title: Undefined Behavior in C++
date: 2016-09-18 22:02:50
category: Programming
tags: [C++]
toc: true
description: An in-depth exploration of undefined behavior in C++. This article explains in detail the concept of undefined behavior, why it exists, and how to avoid it. This is a must-read article for readers who want to improve their C++ programming skills.
---

Now we need a program that reads an integer of type INT from the console (input is guaranteed to be INT) and then outputs its absolute value. You might write the following code with your eyes closed:

```cpp
#include <iostream>

int main()
{
    int n;
    std::cin >> n;
    std::cout << abs(n) << std::endl;
}
```

Wait a minute, think carefully for two minutes, and then run the program with a few test cases. Have you found the problem in the program? Well, welcome to the world of Undefined Behavior.

![][1]

<!-- more -->

# What is Undefined Behavior

In the program at the beginning of the article, we used the abs function to calculate the absolute value. What does the function return when n is INT_MIN? The [C++ standard](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2013/n3797.pdf) has this to say:

> If during the evaluation of an expression, the result is not mathematically defined or not in the range of representable values for its type, the behavior is undefined.

In a binary system, when n is INT_MIN, the value returned by `int abs(int n)` is out of the range of int, so this will lead to undefined behavior. Often, the standard is too concise and not convenient for us to quickly look up, so we can find the information we need on [cppreference](http://en.cppreference.com/w/cpp). For the abs function, cppreference explicitly points out the possibility of undefined behavior:

> Computes the absolute value of an integer number. The behavior is undefined if the result cannot be represented by the return type.

So what exactly is undefined behavior? Simply put, it's when an operation is logically invalid, such as accessing an array out of bounds, but the C++ standard doesn't tell us how to handle such situations.

We know that in most languages (such as Python and Java), a statement either executes correctly as expected or immediately throws an exception. But in C++, there's another situation where a statement doesn't execute as expected (logically it has already gone wrong), but the program can still continue to execute (the C++ standard doesn't say how to continue). Only the behavior of the program is no longer predictable, which means the program may encounter a runtime error, give incorrect results, or even give correct results.

One thing to note is that for some undefined behaviors, modern compilers can sometimes give warnings or compilation failure prompts. In addition, different compilers handle undefined behaviors differently.

# Common Undefined Behaviors

There are a large number of undefined behaviors in the C++ standard. If you search for `undefined behavior` in the standard, you will see dozens of related content. Such a large number of undefined behaviors undoubtedly bring us many troubles. Below we will list some common undefined behaviors that should be avoided when writing programs.

Common undefined behaviors related to pointers include the following:

* Dereferencing a nullptr pointer;
* Dereferencing an uninitialized pointer;
* Dereferencing a pointer returned by a failed new operation;
* Pointer out-of-bounds access (dereferencing a pointer beyond the array boundary);
* Dereferencing a pointer to a destroyed object;

Dereferencing a pointer to a destroyed object is sometimes easy to make this mistake, for example, [returning a local pointer address in a function](https://github.com/xuelangZF/CS_Offer/blob/master/C%2B%2B/Function.md#函数返回值). Some simple error code is as follows:

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

Other common undefined behaviors include:

* Signed integer overflow (the example at the beginning of the article);
* When an integer does a left shift operation, the number of bits moved is negative;
* When an integer does a shift operation, the number of bits moved exceeds the number of bits occupied by the integer. (int64_t i = 1; i <<= 72);
* Attempting to modify the content of a string literal or constant;
* Performing operations on automatically initialized variables without assigning initial values; (int i; i++; cout << i;)
* Not returning content at the end of a function with a return value;

A more complete list of undefined behaviors can be found [here](http://stackoverflow.com/questions/367633/what-are-all-the-common-undefined-behaviours-that-a-c-programmer-should-know-a).

# Why Undefined Behaviors Exist

C++ programs often have various strange bugs due to undefined behaviors, which are also very difficult to debug. In contrast, many other languages don't have undefined behaviors, such as Python, which throws `list index out of range` when accessing a list out of bounds. These languages don't have various strange errors due to undefined behaviors. So why does the C++ standard want to have so many undefined behaviors?

The reason is that **this can simplify the work of the compiler and sometimes produce more efficient code**. For example, if we want to make the operation of dereferencing a pointer explicit (success or throw an exception), we need to know whether the pointer usage is legal at compile time, then the compiler needs to do at least the following work:

* Check if the pointer is nullptr;
* Check if the address saved by the pointer is legal through some mechanism;
* Throw an error through some mechanism

This would make the implementation of the compiler much more complex. In addition, if we have a loop that needs to operate on a large number of pointers, the code generated by the compiler would be inefficient due to various additional checks.

In fact, many undefined behaviors are caused by the program violating a prerequisite, such as the address value assigned to a pointer must be accessible, and the index must be in the correct range when accessing an array. For C++, the language designers believe that this is something that programmers (we're all adults) need to ensure, and the language itself will not do corresponding checks.

However, the good news is that many compilers can now diagnose some operations that may lead to undefined behaviors, which can help us write more robust programs.

# Other Behaviors

The C++ standard also specifies some **Unspecified Behavior**. A simple example (once a interview question from a big company) is as follows:

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

What does the program output? The answer depends on the compiler. It could be 0 10 12, or it could be 10 0 12. This is because **the execution order of function parameters is Unspecified Behavior**. Referring to the C++ standard's description of Unspecified Behavior:

> Unspecified behavior use of an unspecified value, or other behavior where this International Standard provides two or more possibilities and imposes no further requirements on which is chosen in any instance.

In addition, there is also so-called `implementation-defined behavior` in the C++ standard. For example, the C++ standard says a data type is needed, and then the specific compiler chooses the number of bytes occupied by that type, or the storage method (big-endian or little-endian).

Generally speaking, we only need to care about undefined behavior, because it usually leads to program errors. As for the other two behaviors, we don't need to care about them.

# Further Reading

[Cppreference：Undefined behavior](http://en.cppreference.com/w/cpp/language/ub)
[What are all the common undefined behaviors that a C++ programmer should know about?](http://stackoverflow.com/questions/367633/what-are-all-the-common-undefined-behaviours-that-a-c-programmer-should-know-a)
[What are the common undefined/unspecified behavior for C that you run into?](http://stackoverflow.com/questions/98340/what-are-the-common-undefined-unspecified-behavior-for-c-that-you-run-into)
[function parameter evaluation order](http://stackoverflow.com/questions/9566187/function-parameter-evaluation-order)
[A Guide to Undefined Behavior in C and C++, Part 1](http://blog.regehr.org/archives/213)
[A Guide to Undefined Behavior in C and C++, Part 2](http://blog.regehr.org/archives/213)
[Why is there so much undefined behavior in C++?](https://www.quora.com/Why-is-there-so-much-undefined-behaviour-in-C++-Wouldnt-it-be-better-if-some-of-them-were-pre-defined-in-the-standard)
[Cplusplus: abs](http://www.cplusplus.com/reference/cstdlib/abs/?kw=abs)
[What Every C Programmer Should Know About Undefined Behavior](http://blog.llvm.org/2011/05/what-every-c-programmer-should-know.html)
[Undefined behavior and sequence points](http://stackoverflow.com/questions/4176328/undefined-behavior-and-sequence-points)
[Undefined, unspecified and implementation-defined behavior](http://stackoverflow.com/questions/2397984/undefined-unspecified-and-implementation-defined-behavior)
[Where do I find the current C or C++ standard documents?](http://stackoverflow.com/questions/81656/where-do-i-find-the-current-c-or-c-standard-documents)


[1]: https://slefboot-1251736664.file.myqcloud.com/20160918_ub.png