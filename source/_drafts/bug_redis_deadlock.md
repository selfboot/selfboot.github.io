---
title: Redis7.2 源码解读：阻塞流导致的“死锁”的修复
date: 2023-06-12 22:02:01
category: 源码剖析
tags: [GPT4, Redis, Redis, Debug]
toc: true
description: 
---


# Redis streams 背景介绍

为了支持更强大和灵活的流处理能力，Redis 在 5.0 支持了[流数据类型](https://redis.io/docs/data-types/streams-tutorial/)， 包含 XADD, XREAD 和 XREADGROUP。

- `XADD` 命令允许用户向 Redis 流中添加新的消息。每个消息都有一个唯一的 ID 和一组字段-值对。这种数据结构非常适合表示时间序列数据，例如日志、传感器读数等。通过 XADD，用户可以将这些数据存储在 Redis 中，然后使用其他命令进行查询和处理。
- `XREAD` 命令用于从一个或多个流中读取数据。你可以指定从每个流的哪个位置开始读取，以及最多读取多少条消息。这个命令适合于简单的流处理场景，例如，你只需要从流中读取数据，而不需要跟踪读取的进度。
- `XREADGROUP` 命令是 Redis 消费者组功能的一部分。消费者组允许多个消费者共享对同一个流的访问，同时还能跟踪每个消费者的进度。这种功能对于构建可扩展的流处理系统非常有用。例如，你可以有多个消费者同时读取同一个流，每个消费者处理流中的一部分消息。通过 XREADGROUP，每个消费者都可以记住它已经读取到哪里，从而在下次读取时从正确的位置开始。

我们可以用 XREADGROUP 命令从一个特定的流中读取数据，如果这个流当前没有新的数据，那么发出 XREADGROUP 命令的客户端就会进入一种`阻塞等待`状态，直到流中有新的数据为止。同样的，我们可以用 XADD 命令向流中添加新的数据，当新的数据被添加到流中后，所有在这个流上"等待"的客户端就会`被唤醒`，然后开始处理新的数据。

这里的"等待"并不是我们通常理解的那种让整个服务器停下来的阻塞。实际上，只有发出 XREADGROUP 命令的那个客户端会进入"等待"状态，而 Redis 服务器还可以继续处理其他客户端的请求。这就意味着，即使有一些客户端在等待新的数据，Redis 服务器也能保持高效的运行。

更多内容可以参考 Redis 官方文档：[Redis Streams tutorial](https://redis.io/docs/data-types/streams-tutorial/)。

# Bug 复现

Bug 具体披露在 [Issue 12290: Deadlock with streams on redis 7.2](https://github.com/redis/redis/issues/12290) 上，里面给出了复现 Bug 的具体 Redis 版本和复现脚本。

复现脚本也很简单，一个订阅者，代码如下

```python
import time
from multiprocessing import Process
from redis import Redis

nb_subscribers = 3

def subscriber(user_id):
    r = Redis(unix_socket_path='cache.sock')
    try:
        r.xgroup_create(name='tasks_queue', groupname='test', mkstream=True)
    except Exception:
        print('group already exists')

    while True:
        new_stream = r.xreadgroup(
            groupname='test', consumername=f'testuser-{user_id}', streams={'tasks_queue': '>'},
            block=2000, count=1)
        if not new_stream:
            time.sleep(5)
            continue
        print(new_stream)


processes = []
for i in range(nb_subscribers):
    p = Process(target=subscriber, args=(i,))
    p.start()
    processes.append(p)

while processes:
    new_p = []
    for p in processes:
        if p.is_alive():
            new_p.append(p)
    processes = new_p
    time.sleep(5)

print('all processes dead')
```

一个生产者如下：

```python
import time
import uuid

from multiprocessing import Process

from redis import Redis

nb_feeders = 1

def feeder():

    r = Redis(unix_socket_path='cache.sock')

    while True:
        fields = {'task_uuid': str(uuid.uuid4())}
        r.xadd(name='tasks_queue', fields=fields, id='*', maxlen=5000)
        time.sleep(.1)

processes = []
for _ in range(nb_feeders):
    p = Process(target=feeder)
    p.start()
    processes.append(p)

while processes:
    new_p = []
    for p in processes:
        if p.is_alive():
            new_p.append(p)
    processes = new_p
    time.sleep(5)

print('all processes dead')
```



[Redis CPU profiling](https://redis.io/docs/management/optimization/cpu-profiling/)