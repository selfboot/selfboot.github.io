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

在实际业务中遇到了一个很奇怪的问题，一个 C++ 服务 A 通过 HTTP 请求访问 Go 服务 B，少部分请求会超时。进一步分析发现，这里一个请求如果超时的话，重试也是 100% 超时，说明对于特定请求内容是一个必现问题。对于超时的请求，观察 B 服务的处理日志，发现业务逻辑的耗时是正常的。

一开始通过排除法来分析，逐步替换怀疑有问题的模块，结果并没有发现哪里有问题。后来通过抓包，分析正常包与超时包的区别，合理猜测有问题的部分并进行验证，最终定位到原来是 `Expect: 100-continue` 这个请求 HTTP header 导致了这里的超时。

![WireShark 抓包 HTTP expect: 100-continue 的包](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230807_http-100-continue_summary.png)

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

Linux 下抓包比较简单，直接用 tcpdump 就行，不过一般需要 root 权限。下面命令过滤指定 ip 和端口的包，并保存为 `pcap` 格式，方面后面用 `Wireshark` 来分析。

```
sudo tcpdump -i any -s 0 -w output.pcap 'host 11.**.**.** and port 1***'
```

首先抓 go client 和 Go Server B 的包，

接着是 C++ client 和 Go Server B 的包，这里 C++ 的 client 超时时间设置的 10 秒。抓包结果如下，可以看到这里中间收到了一个 100 continue 的 HTTP response，然后等到 10 s，客户端关闭了 TCP 连接。

![WireShark 抓超时的包](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230807_http-100-continue_fail.png)


## Expect: 100-continue

[Expect 100-continue](https://everything.curl.dev/http/post/expect100)

> Unfortunately, lots of servers in the world do not properly support the Expect: header or do not handle it correctly, so curl will only wait 1000 milliseconds for that first response before it will continue anyway.

[100 Continue](https://http.dev/100)

[RFC 7231: Header Expect](https://datatracker.ietf.org/doc/html/rfc7231#section-5.1.1)

[RFC 7231](https://datatracker.ietf.org/doc/html/rfc7231#autoid-61)

其他开源库也有遇见过同样的问题：

[Response not sent when client sends "Expect: 100-continue" request header](https://github.com/reactor/reactor-netty/issues/293)

## 问题修复

