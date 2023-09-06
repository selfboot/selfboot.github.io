---
title: C++ Protobuf 中字段丢失问题排查
tags:
  - ChatGPT
  - C++
  - 方法
category: 程序设计
toc: true
description: 
---

在使用 Protobuf 的时候遇到了一个**特别诡异**的问题，排查了一天，最后才发现问题所在。本篇文章记录下问题的排查、定位过程。

## 问题背景

## 排查过程

### 日志

### 缩小范围

### 各种尝试

### 解决方法

## 最少复现代码

项目代码太庞杂，也涉及了很多业务信息，不方便直接拿来复现问题。其实想复现这里的问题，也比较简单，只用下面少量代码即可。主要就两个 proto 文件和一个 main.cpp 文件。

首先是 `modelA/data.proto`，里面记录一个字段：

```c++
syntax = "proto2";
package model;
message HWPushAndroid{
    optional string bi_tag = 1;
}
```

然后是 `modelB/data.proto`，里面的 proto package 和 message name 都和 `modelA/data.proto` 一样，但是里面的字段不一样：

```c++
syntax = "proto2";
package model;
message HWPushAndroid{
    optional int32 collapse_key = 1 [default = -1];
    optional string bi_tag = 2;
    optional int32 target_user_type = 3;
}
```

接着我们在 `main.cpp` 中使用 `modelB/data.proto` 中的字段，先给每个字段赋值，然后打印出来：

```c++
#include <iostream>
#include "modelB/data.pb.h"  // 假设我们想使用 modelB 的版本

int main() {
    model::HWPushAndroid androidMessage;
    androidMessage.set_collapse_key(100);    // 这个字段只在 modelB 的版本中存在
    androidMessage.set_bi_tag("example_tag");
    androidMessage.set_target_user_type(1);  // 这个字段只在 modelB 的版本中存在
    std::cout << androidMessage.DebugString() << std::endl;
    return 0;
}
```

先用 protoc 编译 proto 文件，如下：

```shell
protoc --cpp_out=. modelA/data.proto
protoc --cpp_out=. modelB/data.proto
```

接着编译、链接 main 如下：

```c++
g++ main.cpp -I./ -o main ./modelA/data.pb.cc -lprotobuf
```

运行后就会发现一个奇怪的输出：`bi_tag: "example_tag"`；注意这里的输出和 protoc 的版本也有关系，这个是 `3.21.12` 版本输出的 DebugString，在一些老的版本比如 2.6.1，这里输出可能不同。

我们明明设置了三个字段，为啥输出只有一个呢？很简单，因为链接错了 `data.proto`; 链接的 prpto 里面只有 `bi_tag` 字段，所以只有这个字段的值被打印出来了。其实这里也看 protoc 的版本，在老版本输出可能是空的，甚至析构的时候会 core 掉。新版本的 protoc 做的比较好，能够兼容这种情况。

正常的编译、链接应该命令应该是 `g++ main.cpp -I./ -o main ./modelB/data.pb.cc -lprotobuf`，这样就能正常输出三个字段了。

## 补充思考

我们已经成功复现了这里的问题，但是还有几个问题需要进一步思考。

### 项目依赖关系

我们的 C++ 项目用 [bazel](https://bazel.build/?hl=zh-cn) 来构建，我构建的 target **理论上**不会依赖modelA 里面错误的 proto。但是实际上确实依赖了，可以用 query 来查看下依赖关系：

```shell
bazel query 'deps(//**/**:demo_tools)' --output graph > graph.in
dot -Tpng graph.in -o graph.png
```

发现这里确实同时依赖了 `modelA` 和 `modelB` 中的 proto，原因是 tools 直接依赖一个 comm 库，comm 库又依赖了 `modelA`，而且 tools 自己直接依赖了 modelB。

接着还有一个疑问：**既然同时依赖两个库，proto 里面又有相同的函数，为啥链接没有报符号重复定义，还选择了一个错的 modelA 里面的符号？**

### 链接符号决议

在解答上面疑问之前，回到前面的复现代码，编译的时候同时引入 modelA 和 modelB 中的 `data.pb.cc`，看看会发生什么：

```shell
g++ main.cpp -I./ -o main ./modelB/data.pb.cc ./modelA/data.pb.cc -lprotobuf
```

结果如下图，报了符号重复定义的错误：

![同时依赖两个模块导致链接失败](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230905_protobuf_redefine.png)

这是因为**链接器在目标文件中找到了两个相同的强符号定义，没法选择具体用哪个，于是直接报链接错误**。但是实际项目中，这两个 proto 在不同模块，先编译成库之后再链接的。链接分动态库和静态库，这里先看 C++ 动态库的情况，把这两个 proto 编译成动态库，然后用动态链接。具体命令如下：

```shell
g++ -c -fPIC modelA/data.pb.cc -o modelA/data.pb.o -I.
g++ -c -fPIC modelB/data.pb.cc -o modelB/data.pb.o -I.
g++ -shared -o libmodelA.so modelA/data.pb.o
g++ -shared -o libmodelB.so modelB/data.pb.o
g++ main.cpp -I./ -o main -L./ -lmodelA -lmodelB -lprotobuf -Wl,-rpath,./
g++ main.cpp -I./ -o main -L./ -lmodelB -lmodelA -lprotobuf -Wl,-rpath,./
```

链接的时候，modelA 和 modelB 有两种链接顺序，二进制运行的结果也有两种：

![动态链接顺序不同，结果也不同](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230906_protobuf_redefine_linkorder.png)

静态链接又是什么表现呢？静态链接的命令如下：

```shell
g++ -c modelA/data.pb.cc -o modelA/data.pb.o -I.
g++ -c modelB/data.pb.cc -o modelB/data.pb.o -I.
ar rcs libmodelA.a modelA/data.pb.o
ar rcs libmodelB.a modelB/data.pb.o
g++ main.cpp -I./ -o main -L./  -lmodelA -lmodelB -lprotobuf
g++ main.cpp -I./ -o main -L./  -lmodelB -lmodelA -lprotobuf
```

发现和动态链接一样，链接顺序不同，结果也不同。从实验的结果来看，链接的时候，**不管是动态链接还是静态链接，实际用的都是靠前面的库的符号定义**。这种行为是由于链接器的设计决定的，不特定于静态或动态链接。不过，要注意这并不是所有链接器都会这样做，这是特定于 GNU 链接器（通常用于 Linux）的行为，其他链接器可能有不同的行为或选项。

在经典大作[《深入理解计算机系统》](https://hansimov.gitbook.io/csapp/)一书中，7.6.3 **链接器如何使用静态库来解析引用**对这里有详细的解释。

### 链接了哪些符号

通过上面的实验，我们知道因为链接顺序不对，导致 protobuf 的 `DebugString` 读出来的字段不一样。那么具体是因为哪些符号决议错误，导致输出不对呢？我们可以用 `objdump` 命令来查看下二进制里面的符号，先来看下 DebugString 符号，具体命令如下：

```shell
$ objdump -tT  main | grep DebugString
0000000000000000       F *UND*	0000000000000000              _ZNK6google8protobuf7Message11DebugStringB5cxx11Ev
0000000000000000      DF *UND*	0000000000000000  Base        _ZNK6google8protobuf7Message11DebugStringB5cxx11Ev
```

不同链接顺序生成的二进制文件中，DebugString 函数都是被标记为 `UND`（未定义），这意味着这个函数在当前二进制文件中并没有定义，而是在运行时从某个动态库中加载。通过 ldd 找到二进制依赖的 protobuf 动态库地址，然后用 readelf 可以验证确实在这个动态库里面：

```
$ ldd mainA
	linux-vdso.so.1 (0x00007ffe53b86000)
	libprotobuf.so.32 => /lib/x86_64-linux-gnu/libprotobuf.so.32 (0x00007f6682359000)
	...

$ nm -D /lib/x86_64-linux-gnu/libprotobuf.so.32 | grep DebugString
...
```

`DebugString` 的实现在 [protobuf/src/google/protobuf/text_format.cc](https://github.com/protocolbuffers/protobuf/blob/main/src/google/protobuf/text_format.cc#L131) 中，用到了**反射机制**，比较复杂，暂时没搞明白，等有时间可以继续研究下，整理一个专门的文章。这里我们只是想知道为啥没输出 `target_user_type`，所以可以在二进制文件中过滤这个符号，看看具体的区别，如下图：

![动态链接顺序不同，结果也不同](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230906_protobuf_redefine_sysbol.png)

可以看到两种链接顺序下，都有 modelB 里面的符号 `set_target_user_type`，对应了两个函数：

```shell
$ c++filt _ZN5model13HWPushAndroid20set_target_user_typeEi
model::HWPushAndroid::set_target_user_type(int)
$ c++filt _ZN5model13HWPushAndroid30_internal_set_target_user_typeEi
model::HWPushAndroid::_internal_set_target_user_type(int)
```

这个是符合预期的，因为 main 里面调用了这个函数来设置，modelA 里面没有这个字段，不论什么顺序，都会链接到 modelB 的符号实现。但是 modelA 在前面的情况下，缺少了下面的符号：

```shell
$ c++filt _ZN5model13HWPushAndroid9_Internal24set_has_target_user_typeEPN6google8protobuf8internal7HasBitsILm1EEE
model::HWPushAndroid::_Internal::set_has_target_user_type(google::protobuf::internal::HasBits<1ul>*)
$ c++filt _ZNK5model13HWPushAndroid26_internal_target_user_typeEv
model::HWPushAndroid::_internal_target_user_type() const
```

对于 protobuf 来说，在生成的消息类型中，关联有这个类型的所有字段、嵌套类型等元信息。这样运行时就可以进行非常丰富的反射操作，包括但不限于查找字段、动态创建消息、动态设置和获取字段值等。而这里先链接 modelA 里面的 pb，导致 proto 里面的消息类型没有关联到字段 target_user_type，就没有用到函数 `_internal_target_user_type()` 和 `set_has_target_user_type`，所以二进制中没有这 2 个符号。

再进一步，如果我在 main.cpp 直接访问这里的 target_user_type 字段，会发生什么呢？如下代码：

```c++
...
std::cout << androidMessage.target_user_type() << std::endl;
std::cout << androidMessage.DebugString() << std::endl;
```

可以看到，DebugString 的输出还是和链接顺序有关系，但是 target_user_type 的输出不论在哪种顺序下，都是正确的。这一次因为用到了target_user_type，所有二进制中都有下面的符号：

```shell
$ c++filt _ZNK5model13HWPushAndroid16target_user_typeEv
model::HWPushAndroid::target_user_type() const
$ c++filt _ZNK5model13HWPushAndroid26_internal_target_user_typeEv
model::HWPushAndroid::_internal_target_user_type() const
```