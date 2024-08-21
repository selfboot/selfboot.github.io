---
title: The Surprising Truth Behind C++ Symbol Redefinition
tags:
  - C++
category: Programming
toc: true
description: This article deeply analyzes the symbol resolution mechanism during C++ static library linking, using symbol redefinition errors as an entry point. Through simple examples, it gradually explains the key to full linking of object files in static libraries. It points out that the linker resolves symbols from left to right, and once a symbol in a library's object file is needed, it will introduce the entire object file. This is then compared and verified with classic textbook content.
date: 2023-09-19 22:17:02
updated: 2023-09-20 22:00:01
lang: en
---

In the article [Investigating the Mysterious Field Loss Problem When Using Protobuf in C++](https://selfboot.cn/en/2023/09/07/protobuf_redefine/), we analyzed how two identical proto files led to linking the wrong pb, ultimately causing some fields to be lost during deserialization. At that time, we also mentioned the process of symbol resolution, where whether it's dynamic linking or static linking, the symbol definition from the library listed earlier is actually used. I thought I had a deep understanding of this, until I recently encountered another strange "**symbol redefinition**" problem.

![C++ Symbol Compilation and Linking Overview](https://slefboot-1251736664.file.myqcloud.com/20230918_c++_symbol_resolution_index.webp)

<!-- more -->

## Problem Background

Initially, there was a utils directory containing some basic code, compiled into a static library A. Later, another copy was made in another directory of the project, compiled into another static library B. Due to the project's complex dependency relationships (it's a tangled mess), some target targets would depend on both A and B, but compilation and linking had always been OK.

Recently, in a cpp file in module B, one of the classes was modified, adding a default parameter to the constructor. Then, when calling it, a specific parameter was passed in. As a result, when compiling the target, an error was reported: `multiple definition`.

According to my previous understanding, for symbols in static libraries, during link resolution, the linker scans from left to right, and if a symbol definition is already found earlier, it will ignore the later ones. For the above static libraries A and B, although there are indeed duplicate function definitions, each symbol should be able to find a definition, then discard the later occurrences, and linking should not fail.

## Reproduction Steps

The project code is too complex to analyze directly, so let's see if we can write a simple example to reproduce this problem. The structure of the reproduction code is as follows:

```shell
➜ tree
.
├── demoA
│   ├── libDemoA.a
│   ├── sum.cpp
│   ├── sum.h
│   └── sum.o
├── demoB
│   ├── libDemoB.a
│   ├── sum.cpp
│   ├── sum.h
│   └── sum.o
└── main.cpp
```

### Simple Function Call

Starting with the simplest example, the sum.h in demoA and demoB declares the function as follows:

```cpp
int sum(int a, int b);
```

The specific implementation is in each cpp file, with the output in DemoB being "DemoB", so we know which library's implementation is being used. The cpp definition in DemoA is as follows:

```cpp
#include "sum.h"
#include <iostream>
int sum(int a, int b) {
    std::cout << "DemoA" << std::endl;
    return a + b;
}
```

main.cpp is simple, just calling sum:

```cpp
#include "demoB/sum.h"
int main() {
    int result = sum(1, 2);
    return 0;
}
```

Compile the two directories into static libraries, then compile and link main.cpp. Under different linking orders, it can normally link to generate binaries and output normally.

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

This conforms to previous understanding. Although there are two definitions of the sum function, when linking static libraries, the one found first will be used preferentially, and the later ones will be discarded. No matter in which order they are linked here, there will be no duplicate definition error.

### Reproducing Redefinition

The reproduction code above is still a bit different from the code in the project. Next, let's try to simulate the changes in the project. Add a class in demoA's sum.h as follows:

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

Then for the constructor of the class in DemoB, add a default parameter b:

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

Then add a class object definition in main:

```cpp
int main() {
    int result = sum(1, 2);
    Demo de(10, 10);
    return 0;
}
```

Now we've reproduced the symbol redefinition problem! If the order is `-lDemoA -lDemoB`, it will report a redefinition of sum. But if it's reversed to `-lDemoB -lDemoA`, everything is normal, and the output also conforms to previous understanding.

![C++ Symbol Compilation and Linking Overview](https://slefboot-1251736664.file.myqcloud.com/20230918_c++_symbol_resolution_multiple_definition.png)

The problem has been reproduced, but I'm indeed a bit confused. If DemoA library is in front, it should first get sum from here, and when it gets to DemoB later, **the linker should just discard sum**, why would it report a duplicate definition? After all, **in the previous example with only functions, it linked like this**.

## Speculating the Reason

After having ChatGPT, I don't use search much anymore, I directly give the problem to ChatGPT to see how it explains. In fact, during the previous reproduction process, I've been communicating with ChatGPT, letting it understand the context.

### ChatGPT's Explanation

To make it fully understand the problem details, I fed it the reproduction code, compilation and linking, and error messages from the redefinition part above, and it explained as follows.

The linker first looks for libDemoA.a, finding sum(int, int) and Demo::Demo(int). Then the linker will look for symbols in libDemoB.a. At this point, since main.cpp actually uses the DemoB version of Demo::Demo(int, int) (note there are two parameters here), the linker will try to resolve this new symbol from libDemoB.a. In libDemoB.a, the linker finds sum(int, int) that conflicts with the one in libDemoA.a, thus reporting "multiple definition".

However, I still have questions, **when the linker first looks for libDemoA.a and finds sum(int, int), sum has already been found, so shouldn't it ignore this symbol later in libDemoB.a**? Asking ChatGPT directly, it started to "repent":

![ChatGPT's incorrect answer about C++ symbol linking process](https://slefboot-1251736664.file.myqcloud.com/20230919_c++_symbol_resolution_chatgpt_error.png)

Then I asked it to explain why there was no error in the initial reproduction, as follows:

![ChatGPT's incorrect explanation of C++ symbol linking process](https://slefboot-1251736664.file.myqcloud.com/20230919_c++_symbol_resolution_chatgpt.png)

It seems this direct questioning approach isn't working. Then I thought about whether I could print some intermediate processes of linking, so I added the `-Wl,--verbose` option for linking, but didn't find any useful information. I thought if I could print the unresolved symbol set and resolved symbol set during the ld linking process, as well as the specific steps of resolving symbols, I could figure it out. But I couldn't find any way to print these.

### Bold Guess

The best thing here would be to directly look at the implementation of the linker, after all, **there are no secrets under the source code**. However, I reviewed the differences between the two test processes above and made a guess, which I asked ChatGPT:

> Here's how I tested: if demoA/sum.h and demoB/sum.h both only have the sum function, there won't be any problem no matter which one is linked first.
> But once there's a class in them with different definitions, an error occurs. **Is "first wins" only applicable when no symbol from the later library is needed?**
>   
> **As long as one symbol from the later library is needed, will there be a redefinition?**

Finally, I got a plausible explanation:

![Detailed explanation of C++ symbol redefinition when linking static libraries](https://slefboot-1251736664.file.myqcloud.com/20230919_c++_symbol_resolution_chatgpt_right.png)

In other words, **when the linker references a symbol from a .o file in a static library, it actually links the entire object file containing that symbol to the final executable**. To verify this, I split the constructor definition of the Demo class in demoB/sum.cpp into a new compilation unit demo.cpp, as follows:

```cpp
// cat demoB/demo.cpp
#include "sum.h"
#include <iostream>

Demo::Demo(int a, int b){
    num = a;
    std::cout << "DemoB init" << std::endl;
}
```

Then recompile the DemoB static library, compile and link main, and find that there's no symbol redefinition anymore. The result is as follows:

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

Here, because the Demo used has a separate relocatable object file demo.o in static library B, and there are no symbols that need to be introduced in sum.o, it's not linked in, so there's no symbol redefinition.

## Rereading the Classic

After verifying the guess above, when I reread the "7.6 Symbol Resolution" section of "Computer Systems: A Programmer's Perspective", I fully understood the content of this section. The core steps of the entire linking process are as follows.

The linker reads a set of relocatable object files and links them together to form an output executable file. If multiple object files define global symbols with the same name, the linker either flags an error or chooses one definition in some way and discards the others.

The compiler outputs each global symbol to the assembler as either strong or weak, and the assembler implicitly encodes this information in the symbol table of the relocatable object file. Functions and initialized global variables are strong symbols, while uninitialized global variables are weak symbols. The Linux linker uses the following rules to handle multiply-defined symbol names:

- Rule 1: Multiple strong symbols with the same name are not allowed.
- Rule 2: Given a strong symbol and multiple weak symbols with the same name, choose the strong symbol.
- Rule 3: Given multiple weak symbols with the same name, choose any of the weak symbols.

The above assumes that the linker reads a set of relocatable object files, but in reality, it can link libraries. For static libraries, it's a collection of linked relocatable object files, with a header describing the size and location of each member object file, identified by the suffix `.a`.

During the symbol resolution phase, the linker scans relocatable object files and archive files **from left to right** in the order they appear on the compiler driver program command line. During the scan, the linker maintains a **set E** of relocatable object files. If the input file is an object file, **as long as one symbol in the object file is used, the entire object file is placed in set E. If all symbols in the object file are not referenced, then the object file is discarded**. If the input file is a static library (archive) file, then each relocatable object file in it is traversed using the above method.

After scanning all files, the linker **merges and relocates the object files in E** to construct the output executable file. At this time, if two object files have the same symbol definition, a duplicate definition error will be reported.

Going back to the redefinition problem at the beginning of the article. There's a util.o object file in both libraries A and B, which were completely identical at the beginning, so the B/util.o that's later in the linking order would be discarded, which is fine. Later, B/util.cpp was modified, adding symbols that A doesn't have, and because these symbols are used elsewhere, B/util.o is also included in the linking process. This is equivalent to linking both A/util.o and B/util.o at the same time, and these two object files have many duplicate function definitions, so a symbol redefinition will be reported.

## Some Discussions

The article sparked some discussions among readers on [V2EX](https://www.v2ex.com/t/975233), and some of the viewpoints were quite good. I'll record them here. [geelaw](https://www.v2ex.com/t/975233#r_13670523) said:

> Whether it's looking at code or **asking ChatGPT without verification**, both are very poor learning methods. The first step should be to understand how the C++ standard specifies it.
> Both int sum(int, int) and class Demo in the article are very serious ODR (One-definition rule) violations.
> 
> [basic.def.odr]/14 stipulates that (14.1) when a non-inline non-template function has definitions in multiple translation units, (14) the program is ill-formed, and no error needs to be reported in non-modules. This applies to the sum situation.
> 
> [basic.def.odr]/14 stipulates that (14.2) for a class defined in multiple translation units, if it doesn't satisfy (14.4) the definitions are the same token sequence in all reachable translation units, then (14) the program is ill-formed, and no error needs to be reported in non-modules. This applies to the class Demo situation.

As for what behavior a specific compiler or linker produces, it's just a coincidence. Here's the link to the C++ standard document: [basic.def.odr#14](https://eel.is/c++draft/basic.def.odr#14). Even if something like sum can be compiled and linked successfully, it's a very bad coding habit. Even if it can run normally and the results meet expectations, it doesn't necessarily mean it's the correct implementation. It might be a coincidental behavior of the compiler, and it might not work later. In actual projects, you can avoid such ODR problems by **using namespaces, or refactoring duplicate code parts, adjusting code results**.

Of course, the above uses GNU ld for linking. As [tool2d](https://www.v2ex.com/t/975233#r_13670827) said:

> This is considered a gcc problem. If you switch to vc, sum can't be linked successfully from the beginning.
> For Microsoft, the idea of the function body in front overriding the function body behind when symbols are the same is completely non-existent.
> Another point is that symbols in Linux so dynamic link libraries can be unresolved, but if a dll is missing a function, it can't be generated at all. Just on this point, Microsoft is already 100 years ahead.

I haven't tried linking with vc here, this is just for reference.

## References

[Computer Systems: A Programmer's Perspective: 7.6 Symbol Resolution](https://hansimov.gitbook.io/csapp/part2/ch07-linking/7.6-symbol-resolution)
[Library order in static linking](https://eli.thegreenplace.net/2013/07/09/library-order-in-static-linking)