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

接着还有一个疑问：**既然同时依赖两个库，proto 里面又有相同的函数，为啥链接没有报符号重复定义，还选择了一个错的modelA 里面的符号？**

### 链接符号决议

在解答上面疑问之前，我们回到前面的复现代码，尝试同时链接 modelA 和 modelB，看看会发生什么：

```shell
g++ main.cpp -I./ -o main ./modelB/data.pb.cc ./modelA/data.pb.cc -lprotobuf
```

结果如下图，报了符号重复定义的错误：

![同时依赖两个模块导致链接失败](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230905_protobuf_redefine.png)

## 类似的问题

