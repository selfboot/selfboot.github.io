---
title: 由 HTTP Header 引起的请求超时问题排查
tags:
  - C++
  - Go
  - 方法
category: 程序设计
toc: true
description: 记录了排查 C++ 客户端请求 Go 服务端时出现的 HTTP 请求超时问题的全过程。通过对比抓包分析发现与 Expect 100-continue 请求头相关，并深入剖析了该头部的实现机制。最后定位到 Mesh 层未正确处理该头部导致问题，并给出了代码层面解决方案。
date: 2023-08-08 22:09:00
---

在实际业务中遇到了一个很奇怪的问题，服务 A 通过 HTTP 请求访问 Go 语言的服务 B，少部分请求会超时。进一步分析发现，如果一个请求超时，其重试也一定会超时，说明针对特定请求内容，超时是必然发生的问题。通过检查服务 B 的处理日志发现，对于超时的请求，其业务逻辑处理的耗时正常。

一开始通过排除法来分析，逐步替换怀疑有问题的模块，结果并没有定位到问题。后来通过抓包，分析正常包与超时包的区别，合理猜测有问题的部分并进行验证，最终定位到原来是 `Expect: 100-continue` 这个请求 HTTP header 导致了这里的超时。整个排查和修复过程，踩了不少坑，记录下来可以给大家参考。

![WireShark 抓包 HTTP expect: 100-continue 的包](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230807_http_100_continue_summary.png)

<!-- more -->

## 排除法

业务平时都是 C++ 开发，这里的 HTTP Client 库用的 [libcurl](https://curl.se/libcurl/)，一直也比较稳定，没有出什么问题，所以第一时间怀疑是 Go 服务 B 的问题。Go 服务其实也比较简单，是用 [gin 框架](https://github.com/gin-gonic/gin)实现的 HTTP 协议代理，用来把业务请求解包后，再重新按照第三方的协议封包后转发到第三方。通过加日志等方法排除了业务逻辑部分代码的问题，初步怀疑是我们用 gin 的姿势不对。为了快速验证，我就用 gin 简单写了一个 go 的 server，用业务的 client 来请求 mock 的 server。

### 替换 go server

用 gin 来写一个简单的 HTTP server 还是比较简单的，这里为了**尽量模拟**业务场景，会读请求包中的内容，然后回复一段比较长的随机内容。完整代码在 [gist: mock_server.go](https://gist.github.com/selfboot/7d45051f39785adc6f46a92eb585af43)，核心部分代码如下：

```go
func MeshCall(meshPath string, c *gin.Context) {
        start := time.Now()

        uinStr := c.Query("uin")
        uin, err := strconv.ParseUint(uinStr, 10, 64)
        if err != nil {
                c.Status(http.StatusBadRequest)
                return
        }

        body, _ := ioutil.ReadAll(c.Request.Body)
        log.Println("Request Body: ", string(body))

        c.Status(http.StatusOK)
        c.Writer.Header().Add("code", strconv.FormatInt(int64(uin), 10))

        // Generate a 1MB random string
        randomStr := StringWithCharset(1024*1024, charset)
        c.Writer.Write([]byte(randomStr))

        log.Printf("Request processed in %s\n", time.Since(start))
}
```

上面 mock 的 server 代码，包含了业务服务 B 里面的核心逻辑，比如用 `ReadAll` 来拿请求数据，用 `c.Writer` 来写回包内容。在 8089 启动服务后，不论是直接用命令行 curl 工具，还是用 C++ 的 client 去调用，都能正常得到 HTTP 回复。看来业务上 go 服务里 gin 的用法是没有问题，基本可以排除是 gin 自身的问题。替换 server 没发现问题，接下来替换下 client 看看？

### 替换 go client

C++ 的 client 逻辑很简单，将一个图片设到 protobuf 的字段中，序列化后用 libcurl 发起 HTTP 请求，然后就等着回包。在 ChatGPT 的帮助下，很快就用 go 写了一个 client，一样的请求逻辑。完整代码在 [gist: mock_client.go](https://gist.github.com/selfboot/a88f2c4cc8f7bd5ef99097be34b988f6)，这里省略了 proto 部分，其中核心代码如下：

```go
{
    req, err: = http.NewRequestWithContext(context.Background(), http.MethodPost, "http://localhost:8089", bytes.NewBuffer(serializedImageDataTwice))
    if err != nil {
        log.Fatalf("failed to create request: %v", err)
    }
    req.Header.Set("Content-Type", "application/x-protobuf")

    client: = & http.Client {}
    resp, err: = client.Do(req)
    if err != nil {
        log.Fatalf("failed to send request: %v", err)
    }
    defer resp.Body.Close()

    log.Printf("response header: %v", resp.Header)
    log.Printf("response body: %v", resp.Body)
}
```

用这个 go client 请求前面 mock 的 go server，能正常解析回包。接着**去请求有问题的业务服务 B，发现不再超时了，能正常读到回包**。这下子有点懵了，梳理下前面的实验结果：

| 主调方 | 被调方 | 结果|
| -- | -- | --|
| C++ Client A | Go Server B | 特定请求必现超时
| C++ Client A | Go Mock Server | 一切正常
| Go Client | Go Server B | 一切正常
| Go Client | Go Mock Server | 一切正常

**只有 `C++ Client A` 和 `Go Server B` 在一起，特定请求才会超时**。已经没啥好思路来排查，只能尝试抓包，看看正常情况下和超时情况下 TCP/HTTP 包有啥区别。

## Tcpdump 抓包分析

Linux 下抓包比较简单，直接用 tcpdump 就行，不过一般需要 root 权限。下面命令过滤指定 ip 和端口的包，并保存为 `pcap` 格式，方便后面用 `Wireshark` 来分析。

```
sudo tcpdump -i any -s 0 -w output.pcap 'host 11.**.**.** and port 1***'
```

首先抓 go client(IP 最后是143) 和 Go Server B(IP最后是239) 的包，整个请求响应是完全符合预期的，可以看到 0.35 s 左右请求 TCP 发送完毕，然后在 1.8s 左右开始接收回包。HTTP 请求耗时 1.5s 左右，回包内容也是完全正确的。

![WireShark 抓正常回复的包](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230808_http_100_continue_go_client_succ.png)

接着是 C++ client 和 Go Server B 的包，这里 C++ 的 client 超时时间设置的 10 秒。可以看到这里中间收到了一个 100 continue 的 HTTP response，然后等到 10 s，客户端关闭了 TCP 连接。

![WireShark 抓超时的包](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230807_http_100_continue_fail.png)

`100 continue` 是从哪里冒出来的？为啥 Go client 请求服务没有，而 C++ client请求会有呢？

### Header 对比

回复不同一般是因为请求不同，对比这两个请求的 header 部分，发现 `Content-Type` 不同，不过这个一般没啥作用，顶多影响 server 解析，不会导致超时。除此之外，C++ 的请求 header 还多了一个 `Expect: 100-continue`，和上面回包中的 continue 也对得上。看来很大概率是这个 header 的问题了。

```
# Go client 的 header 部分
POST /*** HTTP/1.1
Host: **.239:***
User-Agent: Go-http-client/1.1
Content-Length: 1189188
Content-Type: application/x-protobuf
Accept-Encoding: gzip


# C++ client 的 header 部分
POST /*** HTTP/1.1
Host: **.239:***
Accept: */*
Content-Type: application/octet-stream
Content-Length: 1189193
Expect: 100-continue
```

为了快速验证，**在 go client 中添加了这个 header**，然后发起请求，结果也超时了。看来确实是因为这个 header 导致的，那么这个 header 到底是做什么的呢？为啥会导致请求超时呢？

## Expect: 100-continue

为了解答上面的疑问，需要对 HTTP header 有进一步的了解。HTTP 协议中当客户端要发送一个包含大量数据的请求时（通常是 POST 或 PUT 请求），如果服务器无法处理这个请求（例如因为请求的数据格式不正确或者没有权限），那么客户端会浪费大量的资源来发送这些数据。为了解决这个问题，HTTP/1.1引入了 `Expect: 100-continue` 头部，允许客户端在**发送请求体**前询问服务器是否愿意接收请求。如果服务器不能处理请求，客户端就可以不发送大量数据，从而节省资源。

这里具体的实现原理是把一个完整的 HTTP 请求分成两个阶段来发送。第一个阶段只发送 HTTP 请求的头部，第二个阶段在收到服务器确认后才发送 HTTP 请求的主体。从 HTTP 的角度看，仍然是一个单一的 HTTP 请求，只是改变了请求的发送方式。

这里一般靠网络库和底层的 TCP 协议来实现，当使用了"Expect: 100-continue"头部，网络库(比如 libcurl)会先只发送 Expect 部分的 TCP 数据，然后等待服务器的 100 Continue 响应。收到 TCP 回复后，网络库会接着发送请求主体的 TCP  数据包。如果服务器没有返回 100 Continue 响应，网络库可能会选择等待一段时间，然后发送请求主体，或者关闭连接。

### libcurl 实现

具体到 libcurl 网络库中，[Expect 100-continue](https://everything.curl.dev/http/post/expect100) 有一个详细的说明。**当使用 Post 或者 Put 方法，请求体超过一定大小(一般是 1024 字节)时，libcurl 自动添加"Expect: 100-continue"请求头**。对于上面的抓包中，请求的 body 中有一个比较大的图片，所以 C++ libcurl 的 client 请求中就多了这个 header。

现在只剩下一个问题了，**带有这个 header 为啥会导致请求超时呢**？libcurl 的文档中有提到下面一段：

> Unfortunately, lots of servers in the world do not properly support the Expect: header or do not handle it correctly, so curl will only wait 1000 milliseconds for that first response before it will continue anyway.

可以看到，很多服务并没有很好支持 `Expect: 100-continue` 头部，不过 libcurl 也考虑了这种情况，在等待 1s 超时时间后，会继续发 body。从前面的抓包中也能验证这一点：

![WireShark Expect: 100-continue 等待 1s](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230808_http_100_continue_wait1000.png)

这里 libcurl client(IP最后是 253) 发送 header 后，没有收到服务端回复，所以等待了 1s 左右，开始继续发请求 body。正常情况下，服务器等收到完整响应后，再进行处理然后回包，最多也就浪费了 1s 的等待时间。不过这里我们的 server 表现比较奇特，在收到完整包后，先是回复了 100-continue，然后就没有任何反应了。导致 client 一直在等，直到 10s 超时。这又是什么原因导致的呢？

## 超时原因及修复

先来回顾下前面做的实验中，已经知道 C++ Client A 请求 Go Mock Server 的时候，带了 Expect:100-continue 头部，gin 框架的 HTTP server 也是可以正常回复的。整个请求和响应如下图：

![WireShark Expect: 100-continue 正常的处理流程](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230808_http_100_continue_continue_succ.png)

可以看到 gin 服务在接收到 header 后，直接回复了 100-continue，然后 client 继续传 body，gin 服务收完后，也是正常给了200 的回包。同样是 gin 的服务，**为啥请求我们业务的 Go 服务 B 就会超时呢**？

仔细梳理了下，发现这两者还是有不同之处的。这里实验 mock 的 gin 服务是在本机上开的一个端口，请求直接到这个端口处理。但是业务的 **Go 服务由 mesh 接管所有的流量并进行转发**，如果 mesh 层没有处理好 100-continue，确实会有问题（这里后续可以分析下 mesh 的实现看看是哪里出问题）。

### 问题修复

Mesh 层的代码由专人维护，在提交 Issue 后难以确定何时能修复，而业务上又迫切需要解决该问题。于是就只好改 libcurl 的调用方法，在请求的时候去掉这个请求头。问了下 ChatGPT，用 libcurl 发送网络请求时，如何去掉这个 header，得到下面的方法。

![C++ libcurl 请求去掉 Expect: 100-continue header](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230808_http_100_continue_del.png)

于是就开心的去改了业务发请求部分的代码，在发起网络请求前设置 header，改动如下：

```c++
{
    // ....
    // Disable "Expect: 100-continue" header
    curl_slist *headers = NULL;
    headers = curl_slist_append(headers, "Expect:");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

    defer {
        curl_slist_free_all(headers);  // remember to free the headers
    };
    // ...
}
```

改完后验证了下，到服务 B 的 HTTP 请求确实能收到正常回包了。然后上线的时候，发现调其他三方的网络请求出现了参数错误的告警。回滚后，失败也没了，看来和这个 HTTP 请求的改动有关系了。仔细看了下这里的 libcurl `CURLOPT_HTTPHEADER` 部分的设置，发现业务上也会设置，这里的**改动会把之前设置的整个 header 覆盖清空**。

ChatGPT 告诉我可以清空这个 Expect 的 header，甚至还告诉我要注意内存泄露，但是 ChatGPT 也没法考虑周全，没考虑到这种方法会直接覆盖我原来的 header。ChatGPT 确实能为我们提供非常有用的建议和解决方案，但是它的答案是基于用户给定的上下文。它并不知道整个系统的细节，也不能预知全部的业务场景。所以，在接受和应用它的建议时，需要非常谨慎，确保将其建议与实际的业务场景相结合。