---
title: 结合实例理解流式输出的几种实现方法
tags:
  - Python
  - 方法
category: 项目时间
toc: true
date: 
mathjax: true
description:
---

如果有用过 ChatGPT 等大语言模型，可能就会发现在聊天对话中，AI 的输出文本是一批批“蹦出来”的，这就是所谓的**流式输出**。在浏览器上，是怎么实现这种效果呢？

本篇文章会介绍4种方法来实现流式输出效果，每种方法都会结合实际例子来演示。具体选择哪种方法，取决于你的需求和场景。

1. **客户端轮询**：客户端定时（如每几秒）发送请求到后端服务，获取新的数据。
2. **分块传输**：HTTP/1.1 支持，服务器一次可以只发送部分响应内容，客户端接收到部分数据后就可以开始处理。
3. **Server-Sent Events**：服务器向浏览器推送信息，浏览器创建一个到服务器的单向连接，服务器通过这个连接可以发送多个消息。
4. **Web Socket**：建立一个持久的、全双工的连接，允许服务器和客户端之间进行实时、双向的通信。

<!-- more -->

## 简单轮询

首先是最简单的轮询方法，客户端每隔一段时间向服务器发送请求，获取新的数据。实现轮询的时候，客户端和服务器需要用 HTTP 请求参数和回包**约定数据更新或者结束**的方式。比如简单的用一个请求字段 cnt 来约定这是第几次请求，返回中用 400 错误码来约定本次轮询结束。

本文示例种的服务，是用 Python 的 FastAPI 框架写的，轮询的服务实现示例代码如下：

```python
async def polling(cnt: int = 1):
    if cnt >= len(message) or cnt < 0:  # 检查cnt是否有效
        raise HTTPException(status_code=400, detail="Invalid index")
    data = {"message": message[cnt]}
    return JSONResponse(content=data)
```

<div id="anchorPolling"></div>

[这里](#anchorPolling)是轮询的交互式展示：

<div class="data-container">
    <div id="pollingData" class="data-block"></div>
    <div class="button-container">
        <button onclick="fetchData()" class="action-button">开始</button>
        <button onclick="stopPolling()" class="action-button">结束</button>
    </div>
</div>

点击开始后，即可看到数据不断更新，直到结束。如果打开控制台，就能看到浏览器每隔100ms发起一个 HTTP 请求，同时用参数 cnt 表示这是第几次请求。

![控制台查看轮询的请求过程](https://slefboot-1251736664.file.myqcloud.com/20240519_stream_sse_chunk_polling.png)

这种方式的优点就是比较容易理解，实现起来比较简单。但是缺点也很明显，就是**频繁的 HTTP 请求**，会增加服务器的负担，同时也会增加网络传输的开销。如果是 `HTTP/1.1` 的话，每次请求都需要建立 TCP 连接，开销会更大。另外轮询的时间间隔也不太好控制，如果时间间隔太短，可能数据还没更新，白白浪费多次请求。如果时间间隔太长，用户体验又不好。

## 分块传输编码

上面轮询机制的缺点显而易见，主要是因为需要很多 HTTP 连接来更新数据。其实在 HTTP/1.1 中，还有一种更好的方式，就是利用**分块传输编码**。分块传输编码实现流式输出更加高效，客户端只用请求一次，服务器**以多个“块”的形式响应，直到所有数据都发送完毕**。分块传输适用于响应体很大或由于内容是实时生成的而无法预知大小的情况，常见于大文件下载、视频流或实时数据流的传输。目前如果想在微信小程序中实现流式输出，可以用分块编码。

分块传输编码的协议稍微复杂一点，在响应头中用 `Transfer-Encoding: chunked` 表明响应将以分块的形式发送。每个块开始前，服务器发送一行包含当前块大小的数据，后跟一个回车换行（CRLF），紧接着是实际的块数据，再后面是一个CRLF。传输结束时，服务器发送一个大小为0的块，表示没有更多的数据块，通常后跟一个 CRLF。

在 Python 中用 FastAPI 实现分块编码协议也比较简单，下面是一个简单的示例，隔 100ms 输出内容然后分块编码传输：

```python
@stream_app.get("/chunked")
async def chunked_transfer():
    async def generate_large_data():
        for i in message:
            yield f"{i}"
            await asyncio.sleep(0.1)
    return StreamingResponse(generate_large_data(), media_type="text/plain")
```

<div id="anchorChunked"></div>

[这里](#anchorChunked)是分块传输编码的交互式展示：

<div class="data-container">
    <div id="chunkedData" class="data-block"></div>
    <div class="button-container">
        <button onclick="startChunked()" class="action-button">开始</button>
        <button onclick="stopChunked()" class="action-button">结束</button>
    </div>
</div>

点击开始后，同样可以看到数据不断更新，直到所有内容打印出来。如果打开控制台，看到浏览器只发送了一个 HTTP 请求，这个请求的响应中 Header 中有 `Transfer-Encoding: chunked`，响应数据大小随着时间不断更新。下面是动态图：

![分块传输编码的动态图](https://slefboot-1251736664.file.myqcloud.com/20240519_stream_sse_chunk_chunked.gif?noresize=true)

值得注意的是，分块传输编码只在 HTTP/1.1 中支持。在 HTTP/2 中，分块传输编码的概念已经不存在了，这主要是因为 HTTP/2 的工作方式有很大的不同。HTTP/2 引入了多路复用（multiplexing）、二进制帧（binary framing）和流控制（stream prioritization）等新的机制来提高效率和性能。

## Server-Sent Events

OpenAI 在聊天工具 ChatGPT 中没有使用上面两种方式，而是用了 `Server-Sent Events（SSE）`来实现流式输出。SSE 允许服务器主动向浏览器或其他客户端推送事件。SSE的设计主要是为了简化从服务器到客户端的单向实时数据流，尤其适用于需要快速、持续更新数据的Web应用，如实时新闻更新、股票行情、或社交媒体实时消息等。

SSE 基于 HTTP 协议，使用标准的HTTP请求来开始连接。首先客户端发起标准的 HTTP GET 请求开始一个SSE连接。请求的头部通常包含`Accept: text/event-stream`，这告诉服务器客户端希望开启一个SSE连接。服务器响应这个请求，并**保持连接打开**，响应的 Content-Type 被设置为`text/event-stream`。随后，服务器可以发送**形式为纯文本的事件流**。每个事件以一个可选的事件名和必须的数据字段组成。事件以`data:`开始，后跟具体的消息数据，事件之间以两个换行符`\n\n`分隔。整个过程中 HTTP 连接保持打开状态，服务器可以随时发送新事件，客户端在接收到每个事件后处理数据。SSE连接一旦建立，服务器可以持续不断地发送数据更新到客户端，直到连接被关闭。

在 Python 中用 FastAPI 实现 SSE 比较简单，下面是一个简单的示例，隔 100ms 向客户端返回内容，等所有内容输出完，服务器结束本次连接。

```python
@stream_app.get("/events")
async def get_events():
    async def event_stream():
        for i in message:
            yield f"data: {i}\n\n"  # 注意数据格式
            await asyncio.sleep(0.1)
        
        yield f"data: END\n\n" 
    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

<div id="anchorSSE"></div>

[这里](#anchorSSE)是 SSE 的交互式展示：

<div class="data-container">
    <div id="sseData" class="data-block"></div>
    <div class="button-container">
        <button onclick="startSSE()" class="action-button">开始</button>
        <button onclick="stopSSE()" class="action-button">结束</button>
    </div>
</div>

点击开始后，可以看到数据不断更新，直到所有内容打印出来。如果打开控制台，看到浏览器只发送了一个 HTTP 请求，这个请求的响应中 Header 中有 `Content-Type: text/event-stream`，响应数据大小随着时间不断更新。下面是整个过程动态图：

![Server-Sent Events 的动态图](https://slefboot-1251736664.file.myqcloud.com/20240519_stream_sse_chunk_sse.gif?noresize=true)

大多数现代浏览器都支持SSE，不像分块编码只能在 HTTP/1.1 使用，SSE 也能在 HTTP/2 下使用。不过 SSE 有一个缺点，就是**只能从服务器到客户端单向传输**，客户端不能向服务器发送数据。如果需要双向通信，就需要使用 Web Socket。

## Web Socket

前面的三种方法都是基于 HTTP 协议的，主要是为了解决服务器向客户端推送数据的问题。而 Web Socket 是一种独立的协议，它是一种**全双工通信**协议，允许客户端和服务器之间**进行实时、双向的通信**，从而有效地支持复杂的交互式应用，例如在线游戏、交易平台和协作工具。

WebSocket 也是基于 TCP 协议实现，具体的协议由 IETF 的 [RFC 6455](https://datatracker.ietf.org/doc/html/rfc6455) 定义。首先是握手阶段，WebSocket 连接首先通过 HTTP 协议发起，需要客户端发送一个特殊的 HTTP 请求，包含 `Upgrade: websocket ` 和 `Connection: Upgrade` 头部，请求服务器切换到 WebSocket 协议。如果服务器支持 WebSocket，它会返回一个HTTP响应码 `101 Switching Protocols`，表示同意切换到 WebSocket。

一旦握手成功，连接就升级到 WebSocket，双方就可以开始通过帧来发送数据。WebSocket协议定义了多种帧类型，用于传输数据、关闭连接、ping/pong等。WebSocket协议**支持文本和二进制消息**，允许消息在一个帧内发送完或者分片发送。

在 Python 中用 FastAPI 实现 Web Socket 服务端如下：

```python
@stream_app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    for i in message:
        await websocket.send_text(f"{i}")
        await asyncio.sleep(0.1) 
    await websocket.close()
```

<div id="anchorWS"></div>

[这里](#anchorWS)是 Web Socket 的交互式展示：

<div class="data-container">
    <div id="wsData" class="data-block"></div>
    <div class="button-container">
        <button onclick="startWebSocket()" class="action-button">开始</button>
        <button onclick="stopWebSocket()" class="action-button">结束</button>
    </div>
</div>

这里开始后，在控制台可以看到 WebSocket 中传输的数据。Chrome 的开发者工具，有个 message 状态栏，可以看到整个全双工通信过程中的数据内容。下面是整个过程动态图：

![Web Socket 的动态图](https://slefboot-1251736664.file.myqcloud.com/20240519_stream_sse_chunk_websocket.gif?noresize=true)


<style>
.data-container {
    margin-bottom: 20px;
}

.data-block {
    min-height: 100px;
    overflow: auto;
    border: 1px solid #ccc;
    padding: 5px;
    white-space: pre-wrap;
    word-wrap: break-word;
    width: 100%;
}

.button-container {
    display: flex;
    justify-content: end; /* 按钮靠右对齐 */
    margin-top: 10px;
}

.action-button {
    margin-left: 10px; /* 按钮之间的水平间隔 */
    padding: 5px 10px;
}

.action-button:disabled {
    opacity: 0.5; /* 禁用按钮时的样式 */
    cursor: not-allowed; /* 鼠标样式表明按钮不可点击 */
}
</style>

<script>
let count = 0;
let pollingTimer; // 用于取消轮询的定时器

function fetchData() {
    document.getElementById('pollingData').innerHTML = '';
    count = 0;
    fetchPolling(); // 开始轮询
}

function fetchPolling() {
    fetch('http://localhost:8000/stream/polling?cnt=' + count)
        .then(response => {
            if (!response.ok && response.status === 400) {
                throw new Error('Server returned 400 error');
            }
            return response.json();
        })
        .then(data => {
            document.getElementById('pollingData').innerText += data.message;
            count++;
            pollingTimer = setTimeout(fetchPolling, 100);  // 安排下一次请求
        })
        .catch(error => {
            console.error('Polling stopped: ', error);
        });
}

function stopPolling() {
    clearTimeout(pollingTimer); // 取消定时器，停止轮询
    document.getElementById('pollingData').innerHTML = ''; // 清空数据区
}

let reader; // 用于Chunked传输的reader
function startChunked() {
    document.getElementById('chunkedData').innerHTML = '';
    fetch('http://localhost:8000/stream/chunked')
        .then(response => {
            reader = response.body.getReader();
            readChunked();
        })
        .catch(console.error);
}

function readChunked() {
    reader.read().then(({done, value}) => {
        if (!done) {
            const text = new TextDecoder().decode(value);
            document.getElementById('chunkedData').innerText += text;
            readChunked();
        }
    });
}

function stopChunked() {
    if (reader) {
        reader.cancel(); // 取消读取操作，终止流
    }
    document.getElementById('chunkedData').innerHTML = '';
}

let eventSource; // 用于SSE的EventSource对象
function startSSE() {
    document.getElementById('sseData').innerHTML = '';
    eventSource = new EventSource('http://localhost:8000/stream/events');
    eventSource.onmessage = function(event) {
        if (event.data === "END") {
            eventSource.close();
        } else if (event.data === "") {
            document.getElementById('sseData').innerHTML += '<br>';
        } else {
            document.getElementById('sseData').innerHTML += event.data;
        }
    };
    eventSource.onerror = function(event) {
        console.error("SSE failed:", event);
    };
}

function stopSSE() {
    if (eventSource) {
        eventSource.close(); // 关闭SSE连接
    }
    document.getElementById('sseData').innerHTML = '';
}

let websocket;
function startWebSocket() {
    document.getElementById('wsData').innerHTML = '';
    websocket = new WebSocket('ws://127.0.0.1:8000/stream/ws');

    websocket.onopen = function() {
        console.log('WebSocket connection opened');
    };

    websocket.onmessage = function(event) {
        document.getElementById('wsData').innerHTML += event.data;
    };

    websocket.onerror = function(event) {
        console.error('WebSocket error observed:', event);
    };

    websocket.onclose = function(event) {
        console.log('WebSocket connection closed');
    };
}

function stopWebSocket() {
    if (websocket) {
        websocket.send('stop'); // 发送停止信号
        websocket.close(); // 关闭连接
    }
    document.getElementById('wsData').innerHTML = '';
}

</script>