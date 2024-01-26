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
  
编译命令也很简单，`protoc --cpp_out=. data.proto` 即可。此外，有一个 processData 的函数，使用了上面的 proto 对象。这个函数被单独编译成了一个公共库 libdata.so：

```cpp
#include <string>
namespace example {
class Data {
public:
    Data() {}
    ~Data() {}
    std::string message;
};
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

**重新用 protoc 编译 proto 文件**。接着写我们的主程序，就叫 main.cpp ，也很简单，只是简单调用前面 `libdata.so` 库中的函数，内容如下：

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

![成功复现 coredump](https://slefboot-1251736664.file.myqcloud.com/20240119_object_memory_coredump_reproduced.png)


## 猜测与验证


## ABI 二进制兼容

二进制兼容性（Binary Compatibility）指的是在升级库文件(如动态链接库)时，已编译的应用程序无需重新编译即可继续运行。这种兼容性的核心在于应用程序二进制接口（Application Binary Interface，简称ABI），这是程序或程序库之间进行交互的接口，**涵盖数据类型、系统调用、调用约定**等。

在C/C++领域，二进制兼容性主要关注在**升级库文件时，可执行文件是否受影响**。一个典型的例子是Unix/C语言中的open()函数，它的参数在历史上由于二进制兼容性的考虑而没有进行过大的更改。在C++中，ABI的差异主要体现在函数名字修饰（Name Mangling）、虚函数表布局（Virtual Table Layout）、异常处理等方面。

[C++ 工程实践(4)：二进制兼容性](https://www.cppblog.com/Solstice/archive/2011/03/09/141401.html)
