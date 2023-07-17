---
title: 大语言模型 Claude2 和 GPT4 实测对比
category: 人工智能
tags: [GPT4]
toc: true
description: 
---

GPT4 是 OpenAI 开发的大语言模型，可以生成文章、代码并执行各种任务。`Claude` 是Anthropic创建的，也是比较领先的大语言模型，核心成员也是前 OpenAI 员工。最近 Claude 2 正式发布，号称在编写代码、分析文本、数学推理等方面的能力都得到了加强，我们来使用下看看吧。

Claude2 的使用比较简单，直接访问 https://claude.ai 即可，不过要保证访问 `anthropic.com` 和 `claude.ai` 的 IP 地址是美国，相信这一点难不倒大家吧。如果觉得有点难，可以参考左耳朵耗子写的上[网指南](https://github.com/haoel/haoel.github.io)。

<!--more-->

## 总结摘要


## 数学问题

用于解决小学数学问题的 GSM8k

![claude 和 GPT4 的数学计算能力对比](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230715_claude_gpt4_compare_math.png)

## 代码能力



## 上下文长度

![claude 的超长上下文长度](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230715_claude_gpt4_compare_100k.png)


https://mp.weixin.qq.com/s/cpiUVIkfNGYY-EM8NJ27Gg?version=4.1.7.99264&platform=mac

## 幻觉对比

大语言模型本质上是一个概率预测，并不知道事实，因此会“胡编乱造”一些看起来很“合理”的内容。
