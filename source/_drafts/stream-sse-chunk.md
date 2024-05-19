---
title: 实例演示实现流式输出的几种方法
tags:
  - Python
  - 方法
category: 项目时间
toc: true
date: 
mathjax: true
description:
---


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


## 轮询

<div class="data-container">
    <div id="pollingData" class="data-block"></div>
    <div class="button-container">
        <button onclick="fetchData()" class="action-button">开始</button>
        <button onclick="stopPolling()" class="action-button">结束</button>
    </div>
</div>

<!-- 
<div>
<div id="pollingData" style="height: 200px; overflow: auto; border: 1px solid #ccc;"></div>
<button onclick="fetchData()">开始</button>
</div> -->

## 分块传输

### 演示效果

<div class="data-container">
    <div id="chunkedData" class="data-block"></div>
    <div class="button-container">
        <button onclick="startChunked()" class="action-button">开始</button>
        <button onclick="stopChunked()" class="action-button">结束</button>
    </div>
</div>


## SSE 

<div class="data-container">
    <div id="sseData" class="data-block"></div>
    <div class="button-container">
        <button onclick="startSSE()" class="action-button">开始</button>
        <button onclick="stopSSE()" class="action-button">结束</button>
    </div>
</div>


## Web Socket

<div>
<script>
    let ws;
    function startWebSocket() {
        ws = new WebSocket('ws://localhost:8000/ws');
        ws.onmessage = function(event) {
            document.getElementById('websocketData').innerText += event.data;
        };
        ws.onopen = function(event) {
            // 假设用户发送固定的索引位置进行测试
            ws.send("0");
        };
    }
</script>
<div id="websocketData" style="height: 100px; overflow: auto; border: 1px solid #ccc;"></div>
<button onclick="startWebSocket()">开始</button>
</div>


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
</script>