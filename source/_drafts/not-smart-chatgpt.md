---
title: 笨笨的 ChatGPT：日常使用中发现的 AI 错误大盘点
tags: [ChatGPT, Prompt]
category: 人工智能
toc: true
description: 本文记录了笔者在日常使用 ChatGPT 过程中发现的各种错误回答。从pytz库的时区设置错误，到ChatGPT自编的房东不退押金案例，每一个案例都揭示了当前AI仍存在的理解误区。我们要做的就是，认识到 AI 的局限，并更好地利用 AI。
date: 
---

GPT-4，这一人工智能的杰出代表，已经在许多方面超越了普通人类的能力。我的日常也原来越离不开 ChatGPT 了，它大大提高了日常的工作效率，也教会了一些之前很难获得的知识。然而，正如许多伟大的发明一样，ChatGPT 也并非完美无缺。它时而会犯错，给出一些错误的回答。

本文将记录**日常使用** ChatGPT 过程中发现的一些 AI 错误回答，就像记录孩子成长过程中的出丑时刻一样。等到有一天 AI “长大成人”，也能一起回顾这些“小时候”的出丑时刻。

![ChatGPT 的错误回答集锦](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230817_not_smart_chatgpt_robot.png)

<!-- more -->

本文的记录均基于 OpenAI 的 GPT 模型，如果没做特殊说明，都是最新的 GPT4 模型。本文会在个人博客持续更新，记录日常使用中发现的各种好玩儿的答案。

## pytz 的北京时区

背景是这样的，在 `postgres` 中存储了几个 `timestamp with time zone` 类型的时间戳，存储的时候，都是按照 utc 时区存储。在读的时候，想转换成北京时区，然后渲染到邮件中去。开始问的时候，不小心问成了转成上海时区，提示词如下：

> 如果我想对数据库返回的时间，按照上海时区转换后，再渲染到邮件 html 中，要怎么做？

ChatGPT 表现的很不错，直接告诉可以使用 Python 的 `pytz` 库来处理时区转换。以下是如何将 UTC 时间转换为上海时区的步骤：

```python
    # ...
    for item in report_data:
        item.createtime = item.createtime.astimezone(shanghai_tz)
        item.updatetime = item.updatetime.astimezone(shanghai_tz)
        item.publishtime = item.publishtime.astimezone(shanghai_tz) if item.publishtime else None
```

其实我还是想转北京时区，于是多嘴问了一句：

> 如何转成北京时区呢？

 ChatGPT 回答可以定义北京时区，因为北京和上海都在同一时区。可以使用 `'Asia/Shanghai'` 或 `'Asia/Beijing'` 来定义北京时区。以下是**如何使用 'Asia/Beijing' 来定义北京时区的代码**：

```python
    # ...
    for item in report_data:
        item.createtime = item.createtime.astimezone(beijing_tz)
        item.updatetime = item.updatetime.astimezone(beijing_tz)
        item.publishtime = item.publishtime.astimezone(beijing_tz) if item.publishtime else None
```

我也按照 ChatGPT 的建议，乖乖改了时区。结果遇到了报错，只好把这个错误贴给 ChatGPT，这下 ChatGPT 就意识到错误了。

> pytz.exceptions.UnknownTimeZoneError: 'Asia/Beijing'

虽然北京是中国的首都，但在时区数据库中，**中国的时区通常以上海来表示**。所以你应该使用 'Asia/Shanghai' 而不是 'Asia/Beijing'。再次验证了使用 ChatGPT 的黄金哲学：**一定要验证 AI 的回答**。

## 房东不退押金？

我知道 ChatGPT 会有幻觉，不过没想到**这个幻觉竟然能必现**。事情是这样的，有好多咨询问题，我想帮[小盛律师](https://selfboot.cn/links)做一个简单的分类筛选，找出里面有用的信息。于是写了一个脚本，用 ChatGPT 来执行一些分类和摘要总结的任务，结果发现对于某些内容为空的记录，ChatGPT 给我一个很奇怪的分类和汇总。

我的提示词是这样的：

```shell
你是一个中国的专业律师，熟悉民法典和其他现行中国法律。
现在你的任务是对用户咨询的问题进行归类、总结，并尝试回答。
你需要输出一个 json，包括下面字段:

"isneedlawer": true/false, # 用户是否需要律师的帮忙
"customreplycontent": "", # 针对问题给出的一个法律建议，如果无法律建议，则为空字符串,
"cityzone": "", # 问题涉及的地点，精确到城市即可，比如广州市。如何没有地点信息，则为空字符串,
"abstract": "" # 问题的简单概述，不超过 200 字，要包含用户主要传达的信息"

输出一定要是 json，如果做不到，那么请输出一个空的 json。
用户咨询的内容如下:
{seperator}{question}{seperator}
```

其中 `seperator` 是分隔符，`question` 则是从其他地方读到的咨询内容。如果咨询内容不为空，则一切符合预期，但是一旦咨询内容为空，ChatGPT 就会返回一个很奇怪的结果，如下图：

![ChatGPT 幻觉：房东不退押金](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230821_not_smart_chatgpt.png)

难道广州的房东经常不退租客押金，被 ChatGPT 都从网上学到了？有点让人啼笑皆非了。不止在 ChatGPT3.5 下会有这个问题，最新的 GPT4 模型，也是会有同样的问题。

