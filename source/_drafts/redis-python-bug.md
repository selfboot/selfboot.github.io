---
title: 深入分析让 ChatGPT 停机的 Redis 客户端 Bug
tags:
  - GPT4
  - Python
  - Redis
category: 源码剖析
toc: true
description: 
---

2023.03.20 号，OpenAI 的 ChatGPT 服务曾经中断了一段时间，随后 OpenAI 发了一篇公告 [March 20 ChatGPT outage: Here’s what happened](https://openai.com/blog/march-20-chatgpt-outage) 把这里的来龙去脉讲了一下。OpenAI 在公告里说明了本次故障的影响范围、补救策略、部分技术细节以及改进措施，整个故障的处理过程值得学习。

## 故障公示

OpenAI 在上线 ChatGPT 之后，就提供了一个[故障状态公开页面](https://status.openai.com/)，可以在上面看到目前服务状态。这点在国外做的比较好，很多服务都有 status 看板，比如 [Github](https://www.githubstatus.com/)，[Google Cloud](https://status.cloud.google.com/)。

![OpenAI status 看板，故障公示](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230725_redis_python_bug_status.png)

这个故障发生后，OpenAI CEO [Sam Altman](https://twitter.com/sama) 也发表了简短 [声明](https://twitter.com/sama/status/1638635717462200320) 如下：

> we had a significant issue in ChatGPT due to a bug in an open source library, for which a fix has now been released and we have just finished validating.
> 
> a small percentage of users were able to see the titles of other users’ conversation history.
> 
> we feel awful about this.

### 故障详情

[March 20 ChatGPT outage: Here’s what happened](https://openai.com/blog/march-20-chatgpt-outage) 中 OpenAI 官方给出了故障的具体详情。最开始是发现某些用户可以查看其他用户聊天对话中的标题，另外如果两个用户在同一时间活跃，那么新会话的第一条消息也可能会被其他人看到。后面又发现在故障持续的 9 个小时内，大概有 1.2% 左右的活跃 ChatGPT Plus 用户的支付信息被其他人看到。这里的支付信息包括：名字、电子邮件地址、付款地址、信用卡类型和信用卡号的**最后四位数字**以及信用卡到期日期。

### 补救策略


## Redis Bug 复现

## Redis Bug 分析

## Redis Bug 修复

