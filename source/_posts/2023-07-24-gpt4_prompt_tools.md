---
title: GPT4 提问技巧五：借助外部工具
tags:
  - GPT4
  - Prompt
category: 人工智能
toc: true
description: 深入探索 GPT-4 提问技巧系列的第五篇文章，
date: 2023-07-24 13:12:48
---


本文是 GPT4 提问技巧系列的第五篇（严格来说，这一篇不算是 GPT-4 的提问题技巧了，不过为了延续这一个系列的名字，这里也就继续用这个标题了），全部系列文章：

1. [GPT4 提问技巧一：写清晰的说明](https://selfboot.cn/2023/06/10/gpt4_prompt_clear/)；
2. [GPT4 提问技巧二：提供参考文本](https://selfboot.cn/2023/06/12/gpt4_prompt_reference/)；
3. [GPT4 提问技巧三：复杂任务拆分](https://selfboot.cn/2023/06/15/gpt4_prompt_subtasks/)；
4. [GPT4 提问技巧四：给模型思考时间](https://selfboot.cn/2023/06/29/gpt4_prompt_think/)；
5. [GPT4 提问技巧五：借助外部工具]()；

GPT4 作为一个大语言生成模型，虽然很强大，但是有一些局限性。比如信息缺乏时效性，无法访问互联网或者外部数据库，缺乏深度专业知识特别是数学计算能力，处理复杂数据的能力有限等。在上面这些领域现在已经有专业软件工具，可以弥补 GPT4 能力上的不足。我们可以将 GPT4 和外部工具结合起来，从而更大限度的发挥 GPT4 模型的能力。

下面是一些可以在 GPT4 中使用外部工具的场景：

- 获取实时信息：外部工具可以访问实时数据和信息。例如，可以使用 Web 爬虫或 API 来检索最新的新闻和统计数据。
- 处理复杂数据：外部工具可以帮助我们处理和分析复杂数据。例如，可以使用数据可视化工具来创建图表和图像，以更直观地展示信息。
- 提高准确性：外部工具可以验证 GPT 生成的信息的准确性，并在必要时进行更正。

<!--more-->

## 代码执行：Code interpreter

作为一个大语言生成模型，GPT4 并不擅长各种数学计算。比如下面的问题(来自官方 GPT 最佳指南中的[示例问题](https://platform.openai.com/docs/guides/gpt-best-practices/strategy-use-external-tools))：

> 查找以下多项式的所有实值根：3x^5 - 5x^4 - 3x^3 - 7x - 10

直接问 GPT4 的话，通常没法给出答案，如下图所示：

![GPT4 局限：不能直接接数学问题](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230707_gpt4_prompt_tool_cal_normal.png)

不过可以让 GPT4 生成具体的程序代码，然后执行代码来完成计算。这里提示词可以稍微改下，加上下面内容即可：

> 对于提到的计算任务，你需要编写 Python 代码，并将其放到 ``` 中。

把代码 copy 出来用 Python 执行的结果是 `2.3697093205509585`，和在 [wolframalpha](https://www.wolframalpha.com/input/?i=3x%5E5+-+5x%5E4+-+3x%5E3+-+7x+-+10) 上计算的结果一致。GPT4 给的回复如下：

![GPT4 局限：不能直接接数学问题](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230707_gpt4_prompt_tool_cal_code.png)

有时候一些看起来很简单的计算任务，GPT4 同样搞不定。比如在之前的这篇文章 [加班了多少天？GPT4 被绕晕了](https://selfboot.cn/2023/05/29/gpt4_cal_date/)，GPT 并不能直接给出加班天数。但是可以编写一个正确的程序，来计算出总的加班天数。

正是因为 GPT4 配合代码执行，能大幅提高 GPT4 的能力。所以 OpenAI 自己也提供了 Code Interpreter(代码解析器)，生成的代码可以直接在 ChatGPT 的沙箱解析器执行，我专门写过几篇文章来介绍代码解析器的用法。

- [GPT4 代码解释器：资源限制详解](https://selfboot.cn/2023/07/09/gpt4_code_interpreter_limit/)
- [代码解释器：OpenAI 提供了多少 CPU](https://selfboot.cn/2023/07/17/gpt4_code_interpreter_cpu/)
- [代码解释器：自然语言处理图片](https://selfboot.cn/2023/07/12/gpt4_code_interpreter_image/)
- [代码解释器：数据分析与可视化](https://selfboot.cn/2023/07/10/gpt4_code_interpreter_data/)

## 函数支持：function calling

除了提供了代码执行环境，OpenAI 在 2023.06.13 号的文章：[Function calling and other API updates](https://openai.com/blog/function-calling-and-other-api-updates) 中宣布支持 `Function calling`。在 Function calling 问世以前，如果想通过自然语言来调用函数，需要先用自然语言让模型解析出调用的函数以及参数，这个过程既复杂又容易出错。

让我们以一个天气查询的例子来说明。假设我们有一个函数 `get_weather(location: string, date: string)`，它可以查询指定日期和地点的天气。在 Function calling 问世以前，如果我们想让 GPT 模型帮我们调用这个函数，我们可能会写下这样的 Prompt：

> 我有一个函数 get_weather(location: string, date: string) 来拿指定地点的天气信息，对于下面的提问，你要提取里面的关键信息 location 和 date，并以 json 输出。
> 提问内容是： 明天广州的天气如何？

可能得到下面的结果，然后解析这里的返回，再去调用我们自己的函数拿到结果。这中间模型可能会返回非json的内容，或者返回的日期也不对，需要去处理这些异常情况。

![Function calling之前的做法](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230723_gpt4_prompt_tools_function_before.png)

有了 Function calling，我们可以直接问“明天广州的天气如何？”，同时把函数传递给模型。然后 GPT-4 会智能地输出一个包含调用该函数所需参数的 JSON 对象，后面可以直接根据这个 JSON 对象来调用函数了。注意这里的模型是 OpenAI 专门微调过的，**输出会更加稳定和准确**。还是以上面的请求天气为例，可以直接像下面这样发起请求。

```bash
$ curl https://api.openai.com/v1/chat/completions -u :$OPENAI_API_KEY -H 'Content-Type: application/json' -d '{
  "model": "gpt-3.5-turbo-0613",
  "messages": [
    {"role": "user", "content": "明天广州的天气如何？"}
  ],
  "functions": [
    {
      "name": "get_weather",
      "description": "获取某个地方指定日期的天气情况",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "具体地点，比如广州"
          },
          "date": {
            "type": "string",
            "description": "具体的日期，比如 20230723"
          }
        },
        "required": ["location", "date"]
      }
    }
  ]
}'
```

拿到的结果如下：

```bash
{
  "id": "chatcmpl-7fgc0u3zVaGqiPSTDUChIjtzvSd1k",
  "object": "chat.completion",
  "created": 1690169604,
  "model": "gpt-3.5-turbo-0613",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": null,
        "function_call": {
          "name": "get_weather",
          "arguments": "{\n\"location\": \"广州\",\n\"date\": \"20230721\"\n}"
        }
      },
      "finish_reason": "function_call"
    }
  ],
  "usage": {
    "prompt_tokens": 97,
    "completion_tokens": 23,
    "total_tokens": 120
  }
}
```

可以看到 GPT 成功的从自然语言中拿到了结构化的函数请求参数。后续我们可以解析这里的参数，发起请求，把函数返回的结果再返回给 GPT 进行下一步处理。这里可以提供多个函数列表，模型会自动选择最适合的一个。如果函数调用中出现了幻觉输出，通常可以通过系统消息来缓解。比如发现模型正在使用未提供给它的函数生成函数调用，可以尝试使用系统消息：“**仅使用为您提供的函数。**”

## 外部集成：LangChain

有了 Code Interpreter，在 ChatGPT 官方应用里可以方便地执行代码，有了 function calling，开发起各种应用的时候也能方便的和现有系统中的各种 API 对接。但是，使用 OpenAI 的 API 来开发的时候，还是要处理不少问题，这其中有很多是共性问题，比如各种结构化数据的解析，处理大模型的异常输出，串联模型的输入输出等。为了解决这些共性需求，LangChain 应运而生，LangChain 是一个开源项目，它提供了一系列工具和框架，帮助开发者更好地使用和集成 OpenAI 的大型语言模型。

LangChain 提供了一系列标准且可扩展的接口和外部集成模块，[这些模块](https://python.langchain.com/docs/modules/)按照复杂程度从低到高列出如下：

- Model I/O (模型I/O)：负责加载语言模型，并实现与语言模型的交互，包括发送提问和获取响应。
- Data connection (数据连接)：用于连接外部数据源，如数据库和API，可以从中获取应用需要的结构化数据。
- Chains (调用链)：定义了构建语言模型链的组件和执行流程，可自定义链中的模块组合与顺序，比如顺序执行一系列操作。
- Agents (代理)：实现了智能代理的策略，根据当前状态动态选择和切换链中最合适的模块工具。
- Memory (内存管理)：用于构建知识库，在链的运行过程中存储并检索关键信息，实现状态维护。
- Callbacks (回调)：可以注册回调函数，记录日志和处理链中的流式数据，实现执行过程的可观测性。
- Evaluation (评估)：提供了评估链性能的方法，可以分析结果并基于测试集测试链的性能。

官方文档对每个模块都有详细的说明，比如 [Data connection](https://python.langchain.com/docs/modules/data_connection/) 部分，抽象了 5 个步骤，包括加载不同来源的文档，进行分割以及删减，文档向量化 embeding，存储向量数据，以及查询。如下图(图片来自官方文档)所示：

![LangChain data connection](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230724_gpt4_prompt_tools_data.png)

除了官方文档，还有不少视频来讲解如何使用 LangChain，比如吴恩达的免费课程 [LangChain for LLM Application Development](https://learn.deeplearning.ai/langchain/lesson/1/introduction)，里面讲的还是挺不错的，可以用来快速了解 LangChain 的玩法。

我们知道 LangChain 是一个编程库，目前支持 Python 和 JavaScript，为了能进一步降低这里的开发门槛，有人提供了一个 UI [langflow](https://github.com/logspace-ai/langflow)，能够通过拖拽完成简单的任务，如下图示例：

![LangChain langflow 示意图](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230724_gpt4_prompt_tools_langflow.png)

在可预见的未来，我们可以期待 GPT-4 等大型语言模型将与现有工具进行更深度的融合，以充分释放其潜力并推动各类应用的创新与发展。