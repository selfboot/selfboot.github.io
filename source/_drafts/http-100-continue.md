---
title: 由 HTTP Header 引起的请求超时问题排查
tags:
  - C++
  - Go
  - 方法
  - ChatGPT
category: 程序设计
toc: true
description: 深入
---

在实际业务中遇到了一个很奇怪的问题，一个 C++ 服务 A 通过 HTTP 请求访问 Go 服务 B，少部分请求会超时。进一步分析发现，这里一个请求如果超时的话，重试也是 100% 超时，说明不是一个概率问题。对于超时的请求，观察 B 服务的处理日志，发现业务逻辑的耗时是正常的。

这里一开始通过排除法来分析，逐步替换怀疑有问题的模块，结果并没有发现哪里有问题。后来通过抓包，分析正常包与超时包的区别，合理猜测有问题的部分并进行验证，最终定位到原来是 `Expect: 100-continue` 这个请求 HTTP header 导致了这里的超时。

整个问题的排查，离不开 ChatGPT 的帮助，不得不说，用好 ChatGPT 确实能提高排查问题的效率。不过，也不能全听 ChatGPT 忽悠，不然会被带坑里去。

<!-- more -->

## ChatGPT 的馊主意？



## 排除法

业务平时都是 C++ 开发，这里的 HTTP Client 库用的 libcurl，一直也比较稳定，没有出什么问题，所以第一时间怀疑是 Go 服务 B 的问题。Go 服务 B 其实也比较简单，是用 gin 框架实现的 HTTP 协议代理，用来把业务请求解包后，再重新按照第三方的协议封包后转发到第三方。

### Go 服务替换

为了 Go 服务

[Expect 100-continue](https://everything.curl.dev/http/post/expect100)

> Unfortunately, lots of servers in the world do not properly support the Expect: header or do not handle it correctly, so curl will only wait 1000 milliseconds for that first response before it will continue anyway.

[100 Continue](https://http.dev/100)

[RFC 7231: Header Expect](https://datatracker.ietf.org/doc/html/rfc7231#section-5.1.1)

[RFC 7231](https://datatracker.ietf.org/doc/html/rfc7231#autoid-61)

其他开源库也有遇见过同样的问题：

[Response not sent when client sends "Expect: 100-continue" request header](https://github.com/reactor/reactor-netty/issues/293)

