---
title: LevelDB 源码阅读：代码环境准备
tags: [C++]
category: 源码剖析
toc: true
description: 
---



## 源码编译

首先是拉代码，这里使用的是 `git clone --recurse-submodules`，这样可以一次性拉取所有的子模块。leveldb 的实现不依赖第三方库，不过压测用到了 benchmark，测试用例用到了 googletest，这两个库都是作为子模块引入的。

如果拉取代码遇到网络问题，比如下面这种，需要先绕过防火墙才行，可以参考[安全、快速、便宜访问 ChatGPT，最新最全实践教程！](https://selfboot.cn/2023/12/25/how-to-use-chatgpt/) 这篇文章中的方法。

```shell
Cloning into '/root/leveldb/third_party/googletest'...
fatal: unable to access 'https://github.com/google/googletest.git/': GnuTLS recv error (-110): The TLS connection was non-properly terminated.
fatal: clone of 'https://github.com/google/googletest.git' into submodule path '/root/leveldb/third_party/googletest' failed
Failed to clone 'third_party/googletest'. Retry scheduled
```

接下来就是编译整个源码，leveldb 用的 cmake 来构建，为了方便后面阅读代码，这里编译的时候加上了 `-DCMAKE_EXPORT_COMPILE_COMMANDS=1`，这样会生成一个 `compile_commands.json` 文件，这个文件是 clangd 等工具的配置文件，可以帮助 VSCode 等 IDE 更好的理解代码。有了这个文件，代码跳转、自动补全等功能就会更好用。另外，为了方便用 GDB 进行调试，这里加上了 `-DCMAKE_BUILD_TYPE=Debug` 生成带调试信息的库。

完整的命令可以参考下面：

```shell
git clone --recurse-submodules  git@github.com:google/leveldb.git

cd leveldb
mkdir -p build && cd build
cmake -DCMAKE_BUILD_TYPE=Debug -DCMAKE_EXPORT_COMPILE_COMMANDS=1 -DCMAKE_INSTALL_PREFIX=$(pwd) .. && cmake --build . --target install
```

## 跑