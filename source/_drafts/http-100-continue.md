---
title: 由 HTTP Header 引起的请求超时问题排查
tags:
  - C++
  - Go
  - 方法
category: 程序设计
toc: true
description: 深入
---

在实际业务中遇到了一个很奇怪的问题，一个 C++ 服务 A 通过 HTTP 请求访问 Go 服务 B，少部分请求会超时。但是在


[Expect 100-continue](https://everything.curl.dev/http/post/expect100)

> Unfortunately, lots of servers in the world do not properly support the Expect: header or do not handle it correctly, so curl will only wait 1000 milliseconds for that first response before it will continue anyway.

[100 Continue](https://http.dev/100)

[RFC 7231: Header Expect](https://datatracker.ietf.org/doc/html/rfc7231#section-5.1.1)

[RFC 7231](https://datatracker.ietf.org/doc/html/rfc7231#autoid-61)

其他开源库也有遇见过同样的问题：

[Response not sent when client sends "Expect: 100-continue" request header](https://github.com/reactor/reactor-netty/issues/293)

