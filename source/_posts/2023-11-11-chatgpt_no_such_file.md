---
title: ChatGPT 协助分析诡异的 no such file 问题
tags: [ChatGPT]
category: 人工智能
toc: true
description: 本文深入分析了在执行二进制文件时遇到的诡异报错，揭示了背后的排查过程。比较了搜索引擎和ChatGPT排查问题的区别，最后结合人工查看文档，最终找到了问题的根源。
date: 2023-11-11 21:21:26
---

前段时间遇见了一个奇怪的问题，在执行二进制文件 protoc 的时候，报错 `no such file or directory: ./protoc`。文件明明就在那里，可是一直报这个错，莫不是系统有 bug 了？每次遇到诡异的问题，怀疑操作系统、怀疑编译器，结果**小丑往往是自己**。这次也不例外，经过不断尝试，发现这竟然是系统的 feature。

![奇怪的报错 No such file](https://slefboot-1251736664.file.myqcloud.com/20231111_chatgpt_no_such_file.webp)

其实如果是一个新手，第一次遇见这种问题，基本是无从下手，根本没有排查的思路。在继续往下看之前，各位也可以先猜测下，可能是哪些原因导致执行二进制文件，会返回这个错误。

<!-- more -->

## 搜索引擎的答案

这里的二进制文件真实存在，检查权限也是对的，偏偏执行报错。第一次遇见这种问题，一时间都没有啥排查思路，这看起来就是根本不会发生的事。

```shell
$ ./protoc
zsh: no such file or directory: ./protoc
$ ls -alh protoc
-rwxr-xr-x 1 test users 1.1M Jun 17 10:20 protoc
```

在有 ChatGPT 之前，遇见解决不了的问题，就先去搜索引擎看看，搜索 `no such file or directory but file exist`，有不少结果：

![奇怪的报错 No such file](https://slefboot-1251736664.file.myqcloud.com/20231111_chatgpt_no_such_file_google_search.png)

这里第一个结果 [No such file or directory? But the file exists!](https://askubuntu.com/questions/133389/no-such-file-or-directory-but-the-file-exists) 比较匹配我的问题，在问题的高赞回答中，上来就给出了结论：可能是因为**在不支持 32 位环境的 64 位机器中运行一个 32 位的二进制**。具体到我的这个二进制文件，确实是从一个老的机器上拷到 64 位机器执行的。可以用 `file` 命令来看看文件的格式，结果如下：

```
$ file protoc
protoc: ELF 32-bit LSB executable, Intel 80386, version 1 (SYSV), dynamically linked, interpreter /lib/ld-linux.so.2, for GNU/Linux 2.6.4, stripped
```

看来确实是这个原因导致，但是为什么会有这个报错？别人是怎么排查到这里的原因呢？搜索引擎找到的答案，**只是给出了结论，并没有给出排查的具体步骤，也没给出对问题根源的解释**。如果想进一步深入，就需要更换关键词，不断从更多页面尝试深挖。

## 和 ChatGPT 对话

自从有了 ChatGPT，平时遇到问题，第一反应都是拿来问 ChatGPT。这个问题，直接把命令报错贴给 ChatGPT，然后问它明明文件存在，权限也有，为啥告诉我文件不存在。然后 ChatGPT 给出了几个排查方向，初步看了下，都不是这几个问题。然后继续追问：

> 有什么其他方法可以来排查这个问题吗？

ChatGPT 又列出了很多排查方向，其中有一个看起来很有启发，Debug with strace：使用 `strace ./protoc` 来**追踪系统调用，看看在执行过程中是否有错误发生**。strace 命令自己也知道，之前也有用过，不过这里的问题自己之前并没想到用 strace 来跟踪。ChatGPT 点醒我后，拿来跑了下，果真出错：

```shell
$ strace -f ./protoc
execve("./protoc", ["./protoc"], 0x7fff2cd172f8 /* 40 vars */) = -1 ENOENT (No such file or directory)
strace: exec: No such file or directory
+++ exited with 1 +++
```

看起来 execve 命令返回了 `ENOENT`，这是命令行执行报错的根源。接着把上面报错直接贴给 ChatGPT，让它继续解释。得到的结果还是可以的，ChatGPT 解释很全面，strace 的输出显示 execve 系统调用失败，execve 用来执行一个程序，这里尝试执行的是 `./protoc`。找不到文件可能的原因有不少，比如：

- 架构不匹配：如果 protoc 是为不同的硬件架构编译的（例如，在64位系统上运行32位程序而没有必要的库支持），则可能导致这个错误。
- 动态链接库问题：如果 protoc 依赖的动态链接库（.so 文件）缺失或路径不正确，也可能导致这个问题。可以用 `ldd ./protoc` 检查依赖。

接着可以让 ChatGPT 给出具体方法来验证这里的猜测原因，结果如下：

![奇怪的报错 No such file](https://slefboot-1251736664.file.myqcloud.com/20231111_chatgpt_no_such_file_explain.png)

那么还有最后一个问题，**在64位系统上运行32位程序而没有必要的库支持，为什么会报这个错误呢？有没有相应的文档对这种情况做过说明呢？**问了下 ChatGPT，**并没有给出详细的文档来源**，只是提了一些自己的解释：默认情况下，许多64位系统可能没有预装32位兼容性库，因为现代软件主要是64位的。如果尝试运行一个32位的程序，系统就需要这些32位版本的库。如果这些库不存在，操作系统的加载器无法加载程序所需的 32 位动态链接库，导致执行失败并返回 "No such file or directory" 错误。

## execve 文档

ChatGPT 虽然**没有从文档中找到相关解释**，不过既然定位到了是 execve 报错，接下来可以直接阅读 [man 手册](https://man7.org/linux/man-pages/man2/execve.2.html)了。在手册直接搜错误码 `ENOENT`，找到如下解释：

> ENOENT: The file pathname or a script or ELF interpreter does not exist.
>
> If the executable is a dynamically linked ELF executable, the interpreter named in the PT_INTERP segment is used to load the needed shared objects.  This interpreter is typically /lib/ld-linux.so.2 for binaries linked with glibc (see ld-linux.so(8)).

可以看到这里因为在我目前的64位机器环境中，没有 `ELF interpreter`，所以报这个错误。至此，才算完全搞明白了这里报错的根本原因。

## 总结

在面对这个诡异问题时，搜索引擎、ChatGPT 和个人各自扮演着不可或缺的角色。搜索引擎，如谷歌，提供了一个广泛的信息池，让我们能够迅速接触到各种可能的解决方案和历史案例。然而，搜索引擎的局限在于它们通常只能提供现成的信息，而不是针对特定情境的定制化建议。

而 ChatGPT **在提供解决方案时更加具有交互性和针对性**。它能够根据具体问题提供更加定制化的解决方案，帮助缩小解决方案的范围，并在排查过程中提供逻辑和步骤上的指导。未来，ChatGPT 应该会逐渐替代搜索引擎，成为个人最大的帮手。