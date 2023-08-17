---
title: 笨笨的 ChatGPT：日常使用中发现的 AI 错误大盘点
tags: [ChatGPT, Prompt]
category: 人工智能
toc: true
description: 
date: 
---

GPT-4，这一人工智能的杰出代表，已经在许多方面超越了普通人类的能力。我的日常也原来越离不开 ChatGPT 了，它大大提高了日常的工作效率，也教会了一些之前很难获得的知识。然而，正如许多伟大的发明一样，ChatGPT 也并非完美无缺。它时而会犯错，给出一些错误的回答。

本文将记录**日常使用** ChatGPT 过程中发现的一些 AI 错误回答，就像记录孩子成长过程中的出丑时刻一样。等到有一天 AI “长大成人”，也能一起回顾这些“小时候”的出丑时刻。

![ChatGPT 的错误回答集锦](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230817_not_smart_chatgpt_robot.png)

<!-- more -->

## pytz 的北京时区

如果我想对数据库返回的时间，按照上海时区转换后，再渲染到邮件 html 中，要怎么做？

可以使用 Python 的 pytz 库来处理时区转换。以下是如何将 UTC 时间转换为上海时区的步骤：

```python
    # ...
    for item in report_data:
        item.createtime = item.createtime.astimezone(shanghai_tz)
        item.updatetime = item.updatetime.astimezone(shanghai_tz)
        item.publishtime = item.publishtime.astimezone(shanghai_tz) if item.publishtime else None
```

如果转成北京时区呢？

你可以定义北京时区，因为北京和上海都在同一时区。你可以使用 'Asia/Shanghai' 或 'Asia/Beijing' 来定义北京时区。以下是如何使用 'Asia/Beijing' 来定义北京时区的代码：

```python
    # ...
    for item in report_data:
        item.createtime = item.createtime.astimezone(beijing_tz)
        item.updatetime = item.updatetime.astimezone(beijing_tz)
        item.publishtime = item.publishtime.astimezone(beijing_tz) if item.publishtime else None
```

这时候就会报错，直接把这个错误贴给 ChatGPT，这下 ChatGPT 就意识到错误了。

> pytz.exceptions.UnknownTimeZoneError: 'Asia/Beijing'

虽然北京是中国的首都，但在时区数据库中，中国的时区通常以上海来表示。所以你应该使用 'Asia/Shanghai' 而不是 'Asia/Beijing'。
