---
title: 深入分析让 ChatGPT 停机的 Redis Bug
tags:
  - GPT4
  - Python
  - Redis
category: 源码剖析
toc: true
description: 
---

2023.03.20 号，OpenAI 的 ChatGPT 服务曾经中断了一段时间，随后 OpenAI 发了一篇公告 [March 20 ChatGPT outage: Here’s what happened](https://openai.com/blog/march-20-chatgpt-outage) 把这里的来龙去脉讲了一下。OpenAI 在公告里说明了本次故障的影响范围、补救策略、部分技术细节以及改进措施，还是很值得学习的。

本次事故处理的具体时间节点在 [ChatGPT Web Interface Incident](https://status.openai.com/incidents/jq9232rcmktd) 也有公开，如下图：

![ChatGPT 故障整体修复时间节点](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230726_redis_python_bug_incident.png)

这个故障是由 Redis 的 Python 客户端 Bug 引发的，在 Github 上有关于这个 bug 的讨论。这个 bug 的修复过程并不顺利，有不少讨论和修复尝试，比如 [Issue 2624](https://github.com/redis/redis-py/issues/2624)，[Pull 2641](https://github.com/redis/redis-py/pull/2641)，[Issue 2665](https://github.com/redis/redis-py/issues/2665)，[Pull 2695](https://github.com/redis/redis-py/pull/2695)。看过这些后，似乎还是不能理解这里的修复，只好深入读读代码，看看这里的 bug 原因以及修复过程到底是怎么回事，顺便整理成这篇文章。

<!--more-->

## 故障公开

在开始分析 Python 的 bug 之前，想先聊一下 OpenAI 的故障看板。OpenAI 提供有一个[故障状态查询页面](https://status.openai.com/)，可以在上面看到目前各个服务的健康状态。这点在国外做的比较好，很多服务都有 status 看板，比如 [Github](https://www.githubstatus.com/)，[Google Cloud](https://status.cloud.google.com/)。

![OpenAI status 看板，故障公示](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230726_redis_python_bug_status.png)

当遇到 ChatGPT 不能用的时候，可以第一时间来这里看看当前服务状态。如果服务没问题，那一般就是自己的网络或者账户出了问题。一旦服务出问题，这里就能看到故障的进度。反观国内的很多服务，遇到问题是能遮掩就遮掩，就怕使用的人知道出故障。

本文的这个故障比较严重，OpenAI CEO [Sam Altman](https://twitter.com/sama) 也专门发了一个简短 [说明](https://twitter.com/sama/status/1638635717462200320)：

> we had a significant issue in ChatGPT due to a bug in an open source library, for which a fix has now been released and we have just finished validating.
> 
> a small percentage of users were able to see the titles of other users’ conversation history.
> 
> we feel awful about this.

### 故障详情

OpenAI 官方随后写了一篇文章：[March 20 ChatGPT outage: Here’s what happened](https://openai.com/blog/march-20-chatgpt-outage) 详细介绍了本次故障。最开始是发现某些用户可以查看其他用户聊天对话中的标题，另外如果两个用户在同一时间活跃，那么新会话的第一条消息也可能会被其他人看到。后面又发现在特定的 9 个小时内，大概有 1.2% 左右的活跃 ChatGPT Plus 用户的支付信息被其他人看到。这里的支付信息包括：名字、电子邮件地址、付款地址、信用卡类型和信用卡号的**最后四位数字**以及信用卡到期日期。

当然这里支付信息被泄露的人数其实极少，因为触发条件比较苛刻，只有下面两种情况：

1. 在 2023.03.30 早上 1 点到 10 点打开了 OpenAI 发送的订阅确认邮件，邮件里可能有其他人的信用卡类型和卡号的后四位(好在没有完整卡号)。
2. 在 2023.03.30 早上 1 点到 10 点在 ChatGPT 聊天页面点击“我的账户”，并且进入了“管理我的订阅”。这时候可能会看到其他 Plus 用户的名字和姓氏、电子邮件地址、付款地址、信用卡类型和信用卡号的最后四位数字（仅）以及信用卡到期日期。

整个事故的处理时间节点在 [ChatGPT Web Interface Incident](https://status.openai.com/incidents/jq9232rcmktd) 有公开。

### 故障原因

OpenAI 给出了这个故障发生的一些技术细节：

1. 使用 Redis 缓存了用户的信息，避免每次都查询数据库。
2. Redis 是集群模式部署，负载分在许多个 Redis 实例上。
3. 服务用 Python 开发，用到了异步I/O库 Asyncio，使用 redis-py 库来访问 Redis。
4. 服务用 redis-py 库维护了一个到 Redis 集群的连接池，会复用连接来处理请求。
5. 使用 Asyncio 异步处理 redis-py 的请求时，请求和响应可以看做两个队列，每个请求和响应在两个队列中是一一对应的。
6. 如果请求已经入队到 Redis server，但在响应出队之前被取消，那么这个连接中请求和响应的对应关系会错乱。后面的请求可能会读到前面毫不相关的请求响应。
7. 大多数情况下，因为读到的数据和请求预期不一致，会返回错误。
8. 某些巧合情况下，读到的错误数据刚和和请求预期的数据类型一致，虽然不是同一个用户的信息，但是也会被正常显示。
9. 在 2023.03.20 凌晨 1 点，进行服务变更后，redis 取消请求的调用量激增，导致出现了返回错误数据的情况(概率很低)；

这里的关键在第 5 和第 6 点，后面我们会深入看看 redis-py 中这个 bug 的复现以及修复过程。

### 故障处理

OpenAI 对这个故障的处理措施也值得学习。首先是强调保护用户的隐私和数据安全，承认这次确实没做到，然后诚挚道歉，并发邮件通知了所有受影响的用户(不知道有没有啥实质的补偿)。

技术层面上，在找到了具体的原因后，也加固了这里的防护。具体来说就是：

1. 测试修复是否生效；
2. 增加了数据的校验，保证请求和拿到的 Redis 缓存中的用户是同一个；
3. 分析日志，保证消息不会被没权限的人看到；
4. 通过多个数据源准确识别受影响的用户，然后进行通知；
5. 增加了一些日志，确保问题被彻底解决，如果再出现这个问题，也能立马发现；
6. 提高了 Redis 集群的鲁棒性，减少在极端负载情况下出现连接错误。

接下来我们将聚焦 redis-py 的这个 bug，来看看如何复现并修复。
## Bug 复现

[drago-balto](https://github.com/drago-balto) 3.17 号在 [redis-py](https://github.com/redis/redis-py) 提交 [Issue 2624](https://github.com/redis/redis-py/issues/2624) 报告了 redis-py client 的这个 bug，简单说就是 **Redis client 发出了一个异步请求，在收到并解析响应前，如果取消了这个异步请求，那么当前这个连接后续的命令就会出错**。

> If async Redis request is canceled at the right time, after the command was sent but before the response was received and parsed, the connection is left in an unsafe state for future commands.

要复现这里问题的话，先得有一个 redis server，可以在本地安装一个用默认配置启动就好。注意如果本地 redis 没有配置密码和 ssl 的话, redis 连接部分要改成注释的代码。然后用 `conda` 创建一个 python 的虚拟环境，安装 redis-py 的 4.5.1 版本 `pip install redis==4.5.1`。之后就可以用下面的脚本来复现 bug：

```python
import asyncio
from redis.asyncio import Redis
import sys


async def main():
    # local redis server without passwd and ssl support
    # myhost = sys.argv[1]
    # async with Redis(host=myhost, ssl=False, single_connection_client=True) as r:
    myhost, mypassword = sys.argv[1:]
    async with Redis(host=myhost, password=mypassword, ssl=True, single_connection_client=True) as r:

        await r.set('foo', 'foo')
        await r.set('bar', 'bar')

        t = asyncio.create_task(r.get('foo'))
        await asyncio.sleep(0.001)
        # may change to some other value
        # await asyncio.sleep(0.000001)
        t.cancel()
        try:
            await t
            print('try again, we did not cancel the task in time')
        except asyncio.CancelledError:
            print('managed to cancel the task, connection is left open with unread response')

        print('bar:', await r.get('bar'))
        print('ping:', await r.ping())
        print('foo:', await r.get('foo'))


if __name__ == '__main__':
    asyncio.run(main())
```

上面脚本用同一个 client 连接，先后执行了多个命令。其中异步执行 `r.get('foo')` 期间，调用 `cancel` 取消了这个查询，接着又执行了其他命令，通过观察后续命令的结果，就能知道这里有没有问题。注意这里在 `await t` 的时候，会尝试捕获异常 `asyncio.CancelledError`，如果捕获到这个异常，说明成功在 `r.get('foo')` 结束前取消了异步任务。如果没有异常，说明读 redis 任务已经完成，cancel 并没有成功取消异步任务。这里有个关键点就是 `asyncio.sleep(0.001)`，这里等待一段时间，就是为了让这个异步读请求被服务器接收并执行，但是在收到服务器的响应前被成功取消。

如果在Redis server 在云环境，延迟 > 5ms，那么这里 `sleep(0.001)` 就能复现问题。我的 Redis client 和 server 都在一台机，网络耗时可以忽略。通过不断实验，发现这里 `asyncio.sleep(0.000001)` 能稳定复现，下面是在我本地，sleep 不同时间的执行结果：

![Bug 的复现过程](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230726_redis_python_bug_reproduce.png)

可以看到在 `sleep(0.000001)` 情况下，这里后续的 Redis 命令结果全部不对，每个命令都是上一个命令的结果。回到 OpenAI 的故障描述，就能解释为啥一个人看到了其他人的数据。因为这中间有取消的 redis 异步请求任务，导致结果错乱，读串了。

## 源码剖析

## 

[Release](https://github.com/redis/redis-py/releases)

![Redis python 的修复记录](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230728_redis_python_bug_release.png)
