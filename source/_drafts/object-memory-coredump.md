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

复盘下来，发现这类 coredump 问题确实比较罕见，排查起来也不是很容易。只有项目代码比较复杂，**编译依赖管理不是很合理的时候**，才可能出现。另外，在复盘过程中，对这里的 coredump 以及 **C++ 对象内存分布**也有了更多理解。于是整理一篇文章，如有错误，欢迎指正。

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
g++ -fPIC -shared libdata.cpp data.pb.cc -o libdata.so -lprotobuf -g
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

**然后重新用 protoc 编译 proto 文件**。接着写我们的主程序，就叫 `main.cpp`，只是简单调用前面 `libdata.so` 库中的函数，内容如下：

```cpp
// main.cpp
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
g++ main.cpp -o main -L. -lprotobuf -Wl,-rpath,. -ldata -g
```

这里需要注意的是，我们的 `libdata.so` 库文件在当前目录，所以需要用 `-Wl,-rpath,.` 指定下动态库的搜索路径。然后运行程序，就必现了 coredump，如下图：

![成功复现 coredump](https://slefboot-1251736664.file.myqcloud.com/20240131_object_memory_coredump_reproduced.png)

## 深入分析

大多时候，能稳定复现 coredump，基本就很容易找到 coredump 的原因了。这里复现的代码很简单，用 `-g` 编译带上调试信息，然后就可以用 gdb 跟踪排查。因为在 `set_message` 这里会 core 掉，所以我们在这里打个断点，先查看下 req 对象的内存布局，然后执行到 core，查看堆栈即可。整体的结果如下图：

![gdb 查看 coredump 内存布局](https://slefboot-1251736664.file.myqcloud.com/20240202_object_memory_coredump_gdb_message.png)

先用 GDB 打印 req 的内容，**比较奇怪的是这里只有 message 字段，并没有看到 users 字段**。然后执行到 `req.set_message("test");` 这里，从 coredump 的堆栈来看，set_message 这里调用 this 和 value 地址都没问题。但是底层 `ArenaStringPtr::Set` 的时候，this 的地址是 `0x7fffffffe3a8`，这个感觉应该是 message 字段的地址。从前面输出来看，应该是 `0x555555559100` 才对(这里不太确定，后面会验证这点)。

```
#2  0x00005555555564e6 in google::protobuf::internal::ArenaStringPtr::Set (this=0x7fffffffe3a8,
    default_value=0x555555559100 <google::protobuf::internal::fixed_address_empty_string[abi:cxx11]>, value="test",
    arena=0x0) at /usr/include/google/protobuf/arenastring.h:81
#3  0x0000555555556948 in example::Data::set_message (this=0x7fffffffe380, value=0x5555555570f0 "test")
    at data.pb.h:288
#4  0x0000555555556312 in main () at main.cpp:12
```

coredump 的直接原因就是 message 字段的内存读错了。那么什么原因导致内存地址错了呢？这里就要回顾下我们的编译、运行过程了。我们知道在 C++ 中，**对象的内存布局是由其类的定义决定的**，这通常在头文件（.h）中给出。当编译一个 C++ 程序时，编译器根据类的定义（包括成员变量的类型、数量、顺序等）来确定每个对象的大小和内存布局。具体到我们这里 Protobuf 生成的 C++ 类，类的定义通常包含在 .pb.h 文件中，而 `.pb.cc` 文件则包含这些类的方法的实现，包含字段访问器（如 set_message 和 message）和其他成员函数的实现。这些实现负责**实际的数据操作，如分配内存、修改字段值、生成对象的字符串表示**等。

### 对象内存分布

我们上面的编译过程，主程序 `main.cpp` 使用了新版本的 `data.pb.h`，因此 main 中的 Data 对象**按照新的内存布局**进行编译。这里对象的内存布局包括成员变量的排列、对象的总大小以及可能的填充（为了满足对齐要求），所以 **main 中的 Data 对象是包含了 users 字段的**。怎么验证这一点呢？很简单，我们可以在 main 中打印下 Data 对象的大小，如下先注释掉会导致 coredump 的 set_message 以及读取 message 的代码：

```cpp
// main.cpp
#include "data.pb.h"
#include <iostream>

using example::Data;

extern void processData(Data&);

int main() {
    Data req;
    std::cout << "main: " << sizeof(req) << std::endl;
    // req.set_message("test");
    processData(req);  // 调用库函数
    // std::cout << req.message() << std::endl;
    std::cout << "main: " << sizeof(req) << std::endl;
    return 0;
}
```

然后重新编译链接，运行程序，输出如下：

```
main: 56
In lib, data size: 32
In lib, data  msg: Hello from lib
In lib, req size: 32
In lib, req  msg:
main: 56
```

可以看到 main 中 data 的大小是 56，而 lib 中的 data 大小是 32。这里的大小差异就是因为 main 中的 Data 对象包含了 users 字段，而 lib 中的 Data 对象没有。那么问题来了，前面 **gdb 打印 main.cpp 中的 req 对象的内存布局是不包含 users 字段的**，这又是为什么呢？

我们知道，GDB 之所以能输出对象成员、局部变量等信息，是用到了二进制文件中的符号表信息，gcc 编译的时候带上`-g`就会有这些调试信息。对于 pb 对象来说，这些调试信息是在 `.pb.cc` 文件中的。而我们的链接过程中，

### 运行期对象实现



但是动态库 `libdata.so` 在更新 proto 之后并没有重新生成，仍然使用基于旧版 data.proto 生成的 Data 类。

当 main 程序调用 `req.set_message("test");` 时，实际上是在一个内存布局不一致的 Data 对象上进行操作。这就导致了内存读写错误，从而触发了 coredump。


未触发内存布局不一致：由于 main 程序不再尝试修改或访问 req 对象的内容，因此不会触及由于内存布局不一致而可能导致的非法内存访问。在这种情况下，尽管 req 对象的内存布局可能与 libdata.so 中的期望不匹配，但由于没有实际操作这些不一致的内存区域，因此程序能够正常运行而不触发错误。

## 对象内存布局

《深度探索 C++ 对象模型》 