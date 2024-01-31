---
title: Bazel 缺失依赖导致的 C++ 进程 coredump 问题分析
tags:
  - C++
  - Debug
category: 程序设计
toc: true
description: 
date: 
---

最近在项目中遇到了一个奇怪的 coredump 问题，排查过程并不顺利。经过不断分析，找到了一个复现 coredump 的步骤，经过合理猜测和谨慎验证，最终才定位到原因。

![C++ coredump bazel依赖缺失](https://slefboot-1251736664.file.myqcloud.com/20231123_object_memory_coredump_cover.png)

回过头来再看这个问题，发现其实是一个比较常见的**二进制兼容**问题。只是项目代码依赖比较复杂，对 bazel 编译过程的理解也不是很到位，所以定位比较曲折。另外，在复盘过程中，对这里的 coredump 以及 **C++ 对象内存分布**也有了更多理解。于是整理一篇文章，如有错误，欢迎指正。

<!-- more -->

## 问题描述

先说下后台基本服务架构，最外面是 cgi 层处理 nginx 转发的 http 请求，然后具体业务在中间的逻辑层处理。逻辑层是微服务框架，不同服务之间通过 RPC 调用，用的类似 [grpc](https://grpc.io/)。

某次变更，在服务 A 的 `service.proto` 文件中，对某个 rpc 请求参数增加了一个字段(比如下面的 age)：

```proto
service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply) {}
}
message HelloRequest {
  string name = 1;
  string age = 2;   // 增加了参数
}
message HelloReply {
  string message = 1;
}
```

然后增加了这个字段的相关逻辑，随后编译上线了该模块。我们知道在微服务架构中，经常**有多个服务共用同一个 proto 对象**。如果要修改 proto 的话，一般都是**增加字段**，这样对调用方和被调用方都是兼容的。这里服务 A 上线后，用新的 proto，其他用到这个 proto 的服务在重新编译前都会用老的版本，这样不会有问题。其实严格来说这样也是可能有问题的，之前踩过坑，主要是 Merge 的兼容问题，可以参考我之前的文章 [Protobuf 序列化消息引起的存储失败问题分析](https://selfboot.cn/2023/09/09/protobuf_field_merge/)。

正常来说，如果其他服务想更新 proto，只需要重新编译就能用到新的 proto，肯定不会有问题。不过这次就出问题了，**服务 A 的 proto 增加字段上线后，其他通过 client 调用 A 的服务，只要重新编译上线，就会 coredump**。

## 复现步骤

这里看了现网的 core 文件，没有发现特别有用的信息。就想着先看看能不能稳定复现一下，毕竟对于 core 的问题，如果能稳定复现，问题基本就解决一大半了。好在通过一番尝试，找到了一个可以稳定复现的步骤。

### 老版本 proto

创建一个开始版本的 proto 文件，这里就叫 data.proto，并用 protoc 编译为 pb.h 和 pb.cc，其中 proto 文件内容如下：

```proto
syntax = "proto3";
package example;
message Data {
    string message = 1;
}
```
  
编译命令也很简单，`protoc --cpp_out=. data.proto` 即可。此外，libdata.cpp 文件有一个 processData 的函数，使用了上面的 proto 对象。这个cpp文件被编译进了一个公共库 `libdata.so`：

```cpp
// libdata.cpp
#include "data.pb.h"
#include <iostream>

using example::Data;

void processData(Data &req) {
    Data data;
    data.set_message("Hello from lib");
    std::cout<< "In lib, data size: " << sizeof(data)<<std::endl;
    std::cout<< "In lib, data  msg: " << data.message()<<std::endl;

    std::cout<< "In lib, req size: " << sizeof(req)<<std::endl;
    std::cout<< "In lib, req  msg: " << req.message()<<std::endl;
    return;
}
```

编译为动态库的命令如下：

```bash
g++ -fPIC -shared libdata.cpp data.pb.cc -o libdata.so -lprotobuf
```

这样我们就有了 `libdata.so` 动态库文件了。

### 更新 proto

接下来我们修改下 data.proto 文件，增加一个 repeated 字段，如下：

```proto
syntax = "proto3";
package example;
message Data {
    string message = 1;
    repeated int32 users = 2;
}
```

**然后重新用 protoc 编译 proto 文件**。接着写我们的主程序，就叫 main.cpp ，也很简单，只是简单调用前面 `libdata.so` 库中的函数，内容如下：

```cpp
#include "data.pb.h"
#include <iostream>

using example::Data;

extern void processData(Data&);

int main() {
    Data req;
    std::cout << "main: " << sizeof(req) << std::endl;
    req.set_message("test");
    processData(req);  // 调用库函数
    std::cout << req.message() << std::endl;
    std::cout << "main: " << sizeof(req) << std::endl;
    return 0;
}
```

然后编译链接我们的主程序，命令如下：

```bash
g++ main.cpp -o main -L. -lprotobuf -Wl,-rpath,. -ldata
```

这里需要注意的是，我们的 `libdata.so` 库文件在当前目录，所以需要用 `-Wl,-rpath,.` 指定下动态库的搜索路径。然后运行程序，就必现了 coredump，如下图：

![成功复现 coredump](https://slefboot-1251736664.file.myqcloud.com/20240131_object_memory_coredump_reproduced.png)

## 深入验证

大多时候，能成功稳定复现 coredump，基本就很容易找到 coredump 的原因了。

在 C++ 中，对象的内存布局是由其类的定义决定的，这通常在头文件（.h）中给出。当您编译一个 C++ 程序时，编译器根据类的定义（包括成员变量的类型、数量、顺序以及任何内部填充）来确定每个对象的大小和内存布局。

对于 Protobuf 生成的 C++ 类，类的定义通常包含在 .pb.h 文件中，而 .pb.cc 文件则包含这些类的方法的实现。

主程序 main：使用新版本的 data.pb.h，因此 main 中的 Data 对象按照新的内存布局进行编译和构造。

动态库 libdata.so：如果它是用旧版本的 data.pb.h 和 data.pb.cc 编译的，它将按照旧的内存布局来理解和操作 Data 对象。


当更新 data.proto，添加了新的复杂类型 repeated 字段，protoc 重新编译会在生成的 Data 类中添加新的成员变量。这**改变了 Data 类的内存布局**，可能包括增加新的成员变量、更改内存对齐、或者添加用于内部管理的额外字段。这意味着 Data 类的实例（对象）的大小和内部成员的排列方式在新版本中与旧版本不同，而 main.cpp 里面用到的 Data 已经是新版本的 Data 类。

动态库 libdata.so 在更新 proto 之后并没有重新生成，仍然使用基于旧版 data.proto 生成的 Data 类。在这个版本中，Data 类的内存布局不包括新版本中添加的字段和可能的内部变化。

### 不会 core

未触发内存布局不一致：由于 main 程序不再尝试修改或访问 req 对象的内容，因此不会触及由于内存布局不一致而可能导致的非法内存访问。在这种情况下，尽管 req 对象的内存布局可能与 libdata.so 中的期望不匹配，但由于没有实际操作这些不一致的内存区域，因此程序能够正常运行而不触发错误。

## 对象内存布局

《深度探索 C++ 对象模型》 