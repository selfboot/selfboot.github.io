---
title: C++ 中使用 Protobuf 诡异的字段丢失问题排查
tags:
  - ChatGPT
  - C++
  - 方法
category: 程序设计
toc: true
description: 记录了在 C++ Protobuf 使用中遇到的一个字段丢失的诡异问题，通过排查分析发现是因为链接了不同版本的 Proto 文件导致。介绍了问题的复现、依赖分析、符号查看等定位思路。提醒在使用 Protobuf 时注意链接版本一致非常重要，否则可能导致难以预测的问题。
date: 2023-09-07 22:24:48
---

在使用 Protobuf 的时候遇到了一个**特别诡异**的问题，排查了一天，最后才发现问题所在。本篇文章记录下问题的排查、定位过程。

![Protobuf 字段 set 后丢失](https://slefboot-1251736664.file.myqcloud.com/20230906_protobuf_redefine_cover.png)

<!-- more -->
## 问题背景

我们的一个服务中有这样一个简单的逻辑，设置好 proto 协议中的字段，然后把 pb 转换成 json 后，发送一个 http 请求。在最近的一个变更中，在原来的 proto 里面增加了一个字段 user_type，然后给这个字段赋值。改动很简单，正常来说，新的 http 请求中 json 中应该在相应位置多一个 user_type 字段。但是发到测试环境后发现，新的请求 json 里没有新增字段，原来有的字段也丢失了不少！

这就有点见鬼了，项目中使用了几年的 protobuf，从来没遇见类似的问题呀。只是增加一个 optional 字段然后赋值，为啥老的字段也没了？

## 排查过程

这里首先排除一些可能的点：

1. 代码逻辑问题：检查了整个服务代码，确认了没有地方会去删除设置的字段；
2. proto 版本不一致：重新编译了设置字段以及 pb2json 部分的代码，确实都是用了最新的 proto 文件。

那会不会是服务里自己实现 pb2json 反射有问题？会在某些特殊场景，丢掉某些字段？于是不用这个函数，改成用 protobuf 自带的 DebugString 函数来打印 pb 的内容，发现还是有丢失字段。

有点不可思议，DebugString 函数是 protobuf 自带的，应该没问题才对。前面排查问题，需要加日志，改服务上线，比较麻烦。为了缩小代码排除其他干扰，**快速验证改动**，就单独写了一个工具，在工具里设置 proto 中的字段，然后打印出来，结果还是丢失了字段！

再思考下整个改动，这里因为 proto 增加了 user_type 字段，然后代码里给这个字段设置了一个值，接着就出问题了。那么这里只改动 proto，不给新加的 user_type 字段设值，会不会有问题呢？改了下工具，发现这样打印出来的字段也是有丢失！

**只是因为 proto 增加了一个字段，DebugString 打印出来的字段就会漏掉部分？**！这不科学啊，虽然我们的 protobuf 版本很老，但是用了这么久也没出现过这种问题。这里的 proto 和之前其他 proto 的差别在于有很多层嵌套 message，以前倒也没这么多层嵌套的，会不会和这个有关系呢？于是直接设置 user_type 所在的 message，不管其他嵌套 message，结果还是有问题！

到这就有点怀疑 protobuf 了，**是不是老版本有某些 bug**？我们用的是 2.6.1 版本，大概 10 年前版本了，难道这个特殊 proto 触发了它的某个神秘 bug？在网上搜了一圈 "profobuf c++ lack field" 之类的关键词，并没有看到相关的 bug 描述。

有点抓狂，**理智告诉我即便是低版本的 protobuf 也不会有这么低级的 Bug**，但是又实在找不出我的用法有啥问题会导致这么奇怪的表现。于是把问题抛给了一些小伙伴，毕竟自己各种尝试，实在找不到头绪了。

## 解决方法

果然，高手在身边啊，小伙伴去复现了后，立马提到一个关键点，在项目中有另一个 proto，和这个几乎一样。我也想起来，这个模块其实从其他模块拷过来的，进行了一些更改。但是用的 proto 协议还是一样的，只是这里的增加了一个新的字段。

直觉告诉我问题应该就是小伙伴发现的这里了，为了快速验证，在这个新的 proto 里换了一个 namespace，然后重新编译运行，一切恢复了正常！看来确实是因为这里链接二进制的时候，读错了 proto 文件，导致字段解析出现了问题，才丢失了部分字段值。

不过还有不少疑问需要解决：

1. **什么时候引入了另一个 proto？**
2. **两个 proto 有一样的字段和函数，为啥没有链接符号重定义错误，并且最终用了错误的 proto？**
3. **为啥链接了另一个 proto，就导致 DebugString 函数读取的字段不一样？**

带着这些疑问，继续往下深入。首先想着得有一个简单可以复现的代码，毕竟项目的代码比较庞大，编译慢，并且干扰也比较多，分析起来麻烦。另外，项目代码也涉及了很多业务信息，不方便公开。所以得有一个和当前项目完全无关，并且足够简单，只关注核心问题的代码。

## 最少复现代码

实际动手起来，发现复现这里的问题比想象中简单，只用下面少量代码即可。主要就两个 proto 文件和一个 main.cpp 文件。

首先是 `modelA/data.proto`，里面记录一个字段，对应我们项目中比较老的 proto：

```c++
syntax = "proto2";
package model;
message HWPushAndroid{
    optional string bi_tag = 1;
}
```

然后是 `modelB/data.proto`，里面的 proto package 和 message name 都和 `modelA/data.proto` 一样，但是里面多了两个字段，对应项目中比较新的 proto：

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

运行后就会发现一个奇怪的输出：`bi_tag: "example_tag"`；注意这里的输出和 protoc 的版本也有关系，这个是 `3.21.12` 版本输出的 DebugString，在一些老的版本比如 2.6.1，这里输出可能不同，甚至是丢掉某些字段值。

我们明明设置了三个字段，为啥输出只有一个呢？很简单，因为链接错了 `data.proto`; 链接的 prpto 里面只有 `bi_tag` 字段，所以只有这个字段的值被打印出来了。其实这里也看 protoc 的版本，在老版本输出可能是空的，甚至析构的时候会 core 掉。新版本的 protoc 做的比较好，能够兼容这种情况。

正常的编译、链接应该命令应该是 `g++ main.cpp -I./ -o main ./modelB/data.pb.cc -lprotobuf`，这样就能正常输出三个字段了。

## 补充思考

我们已经成功复现了这里的问题，接下来得回答前面几个问题了。

### 项目依赖关系

第一个问题是，什么时候引入了另一个 proto？我们的 C++ 项目用 [bazel](https://bazel.build/?hl=zh-cn) 来构建，我构建的 target **理论上** 不会依赖modelA 里面错误的 proto。但是实际上确实依赖了，可以用 query 来查看下依赖关系：

```shell
bazel query 'deps(//**/**:demo_tools)' --output graph > graph.in
dot -Tpng graph.in -o graph.png
```

上面会输出一个依赖关系图，发现构建 target 确实同时依赖了 `modelA` 和 `modelB` 中的 proto，原因是 tools 直接依赖一个 comm 库，comm 库又依赖了 `modelA`，modelB 则是被 tools 直接依赖。

接着就是第 2 个疑问：**既然同时依赖两个库，proto 里面又有相同的函数，为啥链接没有报符号重复定义，并且最终用了错误的 proto ？**

### 链接符号决议

在解答上面疑问之前，回到前面的复现代码，编译的时候同时引入 modelA 和 modelB 中的 `data.pb.cc`，看看会发生什么：

```shell
g++ main.cpp -I./ -o main ./modelB/data.pb.cc ./modelA/data.pb.cc -lprotobuf
```

结果如下图，报了符号重复定义的错误：

![同时依赖两个模块导致链接失败](https://slefboot-1251736664.file.myqcloud.com/20230905_protobuf_redefine.png)

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

![动态链接顺序不同，结果也不同](https://slefboot-1251736664.file.myqcloud.com/20230906_protobuf_redefine_linkorder.png)

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

接着来回答第三个问题：为啥链接了另一个 proto，就导致 DebugString 函数读取的字段不一样？

通过上面的实验，我们知道因为链接顺序不对，导致 protobuf 的 `DebugString` 读出来的字段不一样。那么具体是因为哪些符号决议错误，导致输出不对呢？我们可以用 `objdump` 命令来查看下二进制里面的符号，先来看下 DebugString 符号，具体命令如下：

```shell
$ objdump -tT  main | grep DebugString
0000000000000000       F *UND*	0000000000000000              _ZNK6google8protobuf7Message11DebugStringB5cxx11Ev
0000000000000000      DF *UND*	0000000000000000  Base        _ZNK6google8protobuf7Message11DebugStringB5cxx11Ev
```

不同链接顺序生成的二进制文件中，DebugString 函数都是被标记为 `UND`（未定义），这意味着这个函数在当前二进制文件中并没有定义，而是在运行时从某个动态库中加载。通过 ldd 找到二进制依赖的 protobuf 动态库地址，然后用 readelf 可以验证确实在 libprotobuf 这个动态库里面：

```
$ ldd mainA
	linux-vdso.so.1 (0x00007ffe53b86000)
	libprotobuf.so.32 => /lib/x86_64-linux-gnu/libprotobuf.so.32 (0x00007f6682359000)
	...

$ nm -D /lib/x86_64-linux-gnu/libprotobuf.so.32 | grep DebugString
...
```

`DebugString` 的实现在 [protobuf/src/google/protobuf/text_format.cc](https://github.com/protocolbuffers/protobuf/blob/main/src/google/protobuf/text_format.cc#L131) 中，用到了**反射机制**，比较复杂，暂时没搞明白，等有时间可以继续研究下，整理一个专门的文章。这里我们只是想知道为啥没输出 `target_user_type`，所以先试着过滤这个符号，看看不同顺序下的二进制有没有区别，如下图：

![动态链接顺序不同，结果也不同](https://slefboot-1251736664.file.myqcloud.com/20230906_protobuf_redefine_sysbol.png)

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

可以看到，DebugString 的输出还是和链接顺序有关系，但是不论在哪种顺序下，直接输出 target_user_type 都是可以的。这一次因为直接用到了 target_user_type() 函数，所有二进制中都有下面的符号：

```shell
$ c++filt _ZNK5model13HWPushAndroid16target_user_typeEv
model::HWPushAndroid::target_user_type() const
$ c++filt _ZNK5model13HWPushAndroid26_internal_target_user_typeEv
model::HWPushAndroid::_internal_target_user_type() const
```

至此文章的三个疑问也都解决了。我们在用 protobuf 的时候，一定要注意**链接的 proto 实现是否正确**，如果有多个 proto 的字段有重复，可以用 namespace 来区分出来，这样就不会出现本文的链接错误问题。

这个问题排查过程中，真的是有“见鬼”了的感觉，明明简单而又常用的用法，也会有这么超出预期的表现。经过各种排除法的调试，一点也没有定位到问题所在，真是有种遇到“鬼打墙”的无力感。好在有小伙伴的提点，才拨开迷雾，最终定位到问题。并通过复现，进一步深入理解这背后的原因。