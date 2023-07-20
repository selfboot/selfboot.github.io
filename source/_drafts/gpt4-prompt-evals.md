---
title: GPT4 提问技巧六：基准评测
category: 人工智能
tags: [GPT4, Prompt]
toc: true
description: 深入探索 GPT-4 提问技巧系列的第六篇文章，
---

本文是 GPT4 提问技巧系列的第六篇，全部系列文章：

1. [GPT4 提问技巧一：写清晰的说明](https://selfboot.cn/2023/06/10/gpt4_prompt_clear/)；
2. [GPT4 提问技巧二：提供参考文本](https://selfboot.cn/2023/06/12/gpt4_prompt_reference/)；
3. [GPT4 提问技巧三：复杂任务拆分](https://selfboot.cn/2023/06/15/gpt4_prompt_subtasks/)；
4. [GPT4 提问技巧四：给模型思考时间](https://selfboot.cn/2023/06/29/gpt4_prompt_think/)；
5. [GPT4 提问技巧五：借助外部工具]()；

[大家都在吐槽GPT-4变「笨」了，可能是架构重新设计惹的祸](https://mp.weixin.qq.com/s/S_fuP4mQBFqMzNYtNr4ysQ)

[研究实锤GPT-4真变笨了：3个月内数学能力雪崩式下降，代码能力也变差](https://mp.weixin.qq.com/s/rzM-2cZ0B_WrSH-Vk2vCfg)

## 简单匹配评测

`evals/registry/data/chinese_chu_ci/samples.jsonl` 中是《楚辞》相关的匹配评测集，其中一条记录如下格式，给定了 Prompt 和期待的回答：

```json
{
    "input":[
        {
            "role":"user",
            "content":"下面这段内容出自哪篇楚辞？请仅回复楚辞名。 例如：《离骚》\n---\n民生各有所乐兮，余独好修以为常。"
        }
    ],
    "ideal":[
        "《离骚》"
    ]
}
```

### GPT 3.5 评测

![GPT 3.5 楚辞评测](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230719_gpt4_prompt_evals_chuci3.png)

部分详细日志如下：

```shell
$ cat /tmp/evallogs/230719082945UIWESVM5_gpt-3.5-turbo_chinese_chu_ci.jsonl
{
    "run_id":"230719082945UIWESVM5",
    "event_id":3,
    "sample_id":"chinese_chu_ci.dev.9",
    "type":"match",
    "data":{
        "correct":false,
        "expected":"《卜居》",
        "picked":null,
        "sampled":"《九歌》",
        "options":[
            "《卜居》"
        ]
    },
    "created_by":"",
    "created_at":"2023-07-19 08:29:50.014636+00:00"
}
```

### GPT4 评测
![GPT4 楚辞评测](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230719_gpt4_prompt_evals_chuci4.png)

部分详细日志如下：

```shell
$ cat /tmp/evallogs/230719083815WL3TWHO2_gpt-4_chinese_chu_ci.jsonl
{
    "run_id":"230719083815WL3TWHO2",
    "event_id":23,
    "sample_id":"chinese_chu_ci.dev.0",
    "type":"match",
    "data":{
        "correct":true,
        "expected":"《离骚》",
        "picked":"《离骚》",
        "sampled":"《离骚》",
        "options":[
            "《离骚》"
        ]
    },
    "created_by":"",
    "created_at":"2023-07-19 08:38:20.270555+00:00"
}
```