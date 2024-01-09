---
title: 跟 OpenAI 学写 ChatGPT API 的 Python SDK 库
tags:
  - ChatGPT
  - Python
  - 方法
category: 项目实践
toc: true
description: >-
  剖析了 OpenAI 开源的 ChatGPT Python SDK 库源码，介绍了该库使用 Python 高级特性编写的设计，以及最近引入
  stainless 自动生成SDK代码的实践。简单解析了 OpenAPI 规范，讲解了如何基于接口定义自动化生成SDK，对编写高质量、易用的 API
  客户端代码有很好的参考。
date: 2024-01-09 17:02:21
---


ChatGPT 问世后，OpenAI 就开源了模型调用的 Python 库 [openai-python](https://github.com/openai/openai-python)。这个库功能十分齐全，封装了 OpenAI 对外公布的 API，使用起来也十分简单。

![OpenAI-python 库的封装](https://slefboot-1251736664.file.myqcloud.com/20230831_openai_python_source_summary.webp)

这个库的第一个版本，实现了 ChatGPT 各种 API 的参数封装 Python 抽象类和调用方法，通过 requests 和 aiohttp 库来发送同步或者异步 HTTP 请求。整体来说，对外接口良好，很容易就会使用。并且整体源码实现有很好的逻辑抽象，用了很多 Python 高级特性，代码写的很漂亮，值得学习。但是从本质上讲，这还是 "**API boy**" 的工作，更多是重复体力劳动，没有太多技术含量。

于是，OpenAI 在 2023 年 11 月，开始引入 [Stainless](https://www.stainlessapi.com/)，自此不用再手工编写 SDK 代码。每次只用提供 API 协议更新，然后就能自动生成代码，<span style='color: red'>摆脱了重复体力劳动</span>。具体是在 [Pull 677](https://github.com/openai/openai-python/pull/677) 中引入新的代码，并且作为正式的 V1 版本发布。

<!-- more -->

## 手动打造的 SDK

最开始的 Python SDK 可以称之为**手动打造的 SDK**，代码全部手工写好，和 API 耦合在一起。整体目录结构如下：

![openai-python 库的老的代码版本](https://slefboot-1251736664.file.myqcloud.com/20240108_openai_python_sdk_learn_old_ver.png)

这个版本的代码，整体结构还是比较清晰的，我用 [Pyreverse](https://pylint.readthedocs.io/en/latest/pyreverse.html) 和 [graphviz](https://graphviz.org/) 为 openapi-sdk 生成了类图，去掉一些不重要的类之后，整体的类依赖关系如下：

![openai python 库的核心类图](https://slefboot-1251736664.file.myqcloud.com/20230829_openai_python_source_classes_core.png)

其中有个基础的类 OpenAIObject，里面定义一些基本的字段，比如 api_key, api_version 等，平时用到的 ChatCompletion 类间接继承自这个类。另外还有 OpenAIError 和 APIRequestor 两个类，分别用于处理错误以及发送 HTTP 请求。OpenAI 的代码用到了不少高级的 Python 特性，这里以 overload 装饰器为例，下面来详细看看。当然，如果对 Pyhton 不感兴趣，可以跳过这部分，**直接看后面的自动化生成部分**。

### overload 装饰器

[openai-python/openai/api_requestor.py](https://github.com/openai/openai-python/blob/284c1799070c723c6a553337134148a7ab088dd8/openai/api_requestor.py#L221) 中的 APIRequestor 类有很多 overload 修饰的方法，这是 Python 3.5 新增的语法，属于 [typeing 包](https://docs.python.org/3/library/typing.html#typing.overload)。

```python
class APIRequestor:
    # ...
    @overload
    def request(
        self,
        method,
        url,
        params=...,
        headers=...,
        files=...,
        *,
        stream: Literal[True],
        request_id: Optional[str] = ...,
        request_timeout: Optional[Union[float, Tuple[float, float]]] = ...,
    ) -> Tuple[Iterator[OpenAIResponse], bool, str]:
        pass 
    # ...
```

在 Python 中，使用 `@overload` 装饰器定义的方法重载**仅用于类型检查和文档，它们实际上不会被执行**。这些重载主要是为了提供更准确的类型信息，以便在使用静态类型检查器（如 mypy）或 IDE（如 PyCharm）时能够得到更准确的提示和错误检查。

使用 @overload 可以更准确地描述一个函数或方法**在不同参数组合下的行为**。实际的实现是在没有 `@overload` 装饰器的 request 方法中。这个方法通常会使用条件语句（如 if、elif、else）或其他逻辑来根据不同的参数组合执行不同的操作。上面 overload 修饰的 4 个 request 方法，实际上是定义了4个不同的方法，分别接受不同的参数组合，返回不通的类型值。

上面代码请求参数解释：

- `files=...`：这里的 files=... 表示 files 参数是可选的，但类型没有明确指定。在 Python 的类型提示中，`...`（省略号）通常用作占位符，表示“这里应该有内容，但尚未指定”。
- `stream: Literal[True]`：这里的 stream: `Literal[True]` 表示 stream 参数必须是布尔值 True。Literal 类型用于指定一个变量只能是特定的字面值，这里就是 True。
- `request_id: Optional[str] = ...`：这里的 `Optional[str]` 表示 request_id 参数可以是 str 类型，也可以是 None。Optional 在类型提示中通常用于表示一个值可以是某种类型或 None。这里的 `= ...` 同样是一个占位符，表示默认值尚未指定。在实际的方法实现中，这通常会被一个实际的默认值替换。

举一个相对简单的例子，假设我们有一个函数 add，它可以接受两个整数或两个字符串，但不能接受一个整数和一个字符串，使用 @overload 的情况：

```python
from typing import Union, overload

@overload
def add(a: int, b: int) -> int:
    ...

@overload
def add(a: str, b: str) -> str:
    ...

def add(a: Union[int, str], b: Union[int, str]) -> Union[int, str]:
    if isinstance(a, int) and isinstance(b, int):
        return a + b
    elif isinstance(a, str) and isinstance(b, str):
        return a + b
    else:
        raise TypeError("Invalid types")
```

添加注解后的好处有：

- 类型检查：使用 `@overload` 后，如果尝试传入一个整数和一个字符串到 add 函数，静态类型检查器会立即报错，而不需要等到运行时。
- 代码可读性：通过查看 `@overload` 定义，其他开发者可以更容易地理解 add 函数接受哪些类型的参数，以及在不同情况下的返回类型。
- IDE 支持：在像 `PyCharm` 这样的 IDE 中，`@overload` 可以提供更准确的自动完成和参数提示。
- 文档：`@overload` 也可以作为文档，说明函数或方法的不同用法。

上面的 `add` 函数，如果你这样调用： print(add(1, "2"))，mypy 就能检查出错误，不用到运行时才发现：

```shell
override.py:22: error: No overload variant of "add" matches argument types "int", "str"  [call-overload]
override.py:22: note: Possible overload variants:
override.py:22: note:     def add(a: int, b: int) -> int
override.py:22: note:     def add(a: str, b: str) -> str
```

## 引入 stainless 重构库

上面是比较传统的根据 API 接口定义来生成 Client 代码的方式。其实很多程序员日常的工作类似这种，提供 API 的各种参数然后去调用，或者是提供对外的接口，这就是所谓的 API boy。

OpenAI 的程序员，显然不满足于做一个 API boy，从仓库的提交记录中可以看到，在 2023.11 在 V1 中做了比较大的改动，使用 stainless 来生成代码，并且随后就引入了 `stainless-bot` 机器人。

![开始引入 stainless-bot 机器人](https://slefboot-1251736664.file.myqcloud.com/20240108_openai_python_sdk_learn_stainless_bot.png)

[stainless](https://www.stainlessapi.com/) 是一个开源的 API SDK 生成工具，可以根据 API 协议定义，自动生成对应的代码。你只需要提供 API 接口文件，也就是 [OpenAPI Specification](https://www.openapis.org/) 文件，然后就会生成各种语言的 SDK 了。目前(2024.01)支持 TypeScript, Node, Python, Java, Go, Kotlin 等语言。

这里生成的**代码质量也是有保障的**，按照文档所说，会尽量让自动生成的代码和**专家级别的人写的代码**一样。生成的库还会支持丰富的**类型校验**，可以用于自动补全和 IDE 中光标悬停时的文档提示，另外还**支持带退避的自动重试**，以及身份验证等。每次 API 接口有新的变更，只有更新 API 协议定义文件，然后用 Github Action 推送给 stainless，就能自动生成新的代码，接着给你的仓库提供一个 Pull Request。

听起来很美好，只用改下协议，然后就有生成的代码了，整个过程不用人去写代码，也没有重复体力劳动了。我们来看看 OpenAI 的 SDK 最近提交记录，基本都是 stainless-bot 提交的代码了。

![stainless-bot 机器人成为代码的主要提交者](https://slefboot-1251736664.file.myqcloud.com/20240108_openai_python_sdk_learn_bot_commit.png)

这里其实还有点疑问，stainless-bot 的更新[feat(client): support reading the base url from an env variable](https://github.com/openai/openai-python/pull/829/files)，支持从环境变量读取 OPENAI_BASE_URL，但是在 **API spec 里面并没有看到相关说明**，不知道这里的更新 stainless-bot 是怎么产生的。

另外值得注意的是，这次重构是**破坏了兼容性**的，改变了库的调用方式，因此老版本的调用代码需要做出改变。OpenAI 也给出了一个迁移指导文档 [v1.0.0 Migration Guide](https://github.com/openai/openai-python/discussions/742)，还提供了自动化迁移脚本，可以一键迁移。

## OpenAPI Specification

根据 stainless 的说法，自动化生成代码的依据就是 OpenAPI 描述文件，具体协议可以参考文档 [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)。**OpenAPI 主要用于设计、构建、文档化和使用 RESTful Web 服务**。它提供了一种标准化的方法来描述 RESTful 接口，方便**开发者用 YAML 或 JSON 格式定义 API 的请求路径、参数、响应、安全性等**。有了描述文件，就可以**自动化生成人类可读的文档，创建自动化测试，包括生成客户端 SDK**等。

OpenAI ChatGPT 的 API 定义也是开源的，在 Github 仓库 [openai-openapi](https://github.com/openai/openai-openapi) 中，2.0 版本的 API 接口定义在[这里](https://github.com/openai/openai-openapi/blob/3d9e0aeb21ec75aa616aa4c17ea54c369e344cd0/openapi.yaml)可以看到。

这里以 `/chat/completions` 接口为例，来看看一个接口要定义哪些内容。首先是一些元信息：

```yaml
paths:
  # Note: When adding an endpoint, make sure you also add it in the `groups` section, in the end of this file,
  # under the appropriate group
  /chat/completions:
    post:
      operationId: createChatCompletion
      tags:
        - Chat
      summary: Creates a model response for the given chat conversation.
```

其中 post 说明这个接口支持 post 请求，operationId 是这个操作的唯一标识符，tags 将这个操作分类为 "Chat"，summary 提供了这个操作的简短描述。接下来是关键的对请求和响应的一些约束，整体有比较高的可读性了，比如 requestBody 定义了请求需要的数据，required: true 表示请求体是必需的，content 指定了请求体的内容类型，这里是 application/json。这里需要说明的是 **schema 引用**了一个定义在文档其他地方的模式（CreateChatCompletionRequest），用于描述请求体的结构。这样做的好处是，可以在多个地方引用同一个模式，避免重复写同样的内容。

```yaml
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateChatCompletionRequest"
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/CreateChatCompletionResponse"
```

CreateChatCompletionRequest 的定义在后面，如下图，也是比较复杂的。里面会对请求体里面每个参数的类型，是否必须，是否是 enum 内容等都做了详细的说明。请求的回复 responses 也是类似的，整个回包靠 CreateChatCompletionResponse 指定格式，这里不再赘述。

![OpenAI 的 CreateChatCompletionRequest 的定义](https://slefboot-1251736664.file.myqcloud.com/20240109_openai_python_sdk_learn_yaml_msg.png)

接下来是自定义扩展元数据 `x-oaiMeta` 部分，name, group, returns, path 提供了操作的额外信息，examples 提供了不同场景下的请求和响应示例，包括使用 cURL、Python 和 Node.js 的代码示例，以及相应的响应体示例。通过提供具体的使用示例，使得 API 文档更加易于理解和使用。

## 总结

目前 stainless 应该还是 beta 阶段，只有 OpenAI, Lithic 等个别几家公司使用，也没有对外的详细文档。并且从目前的收费标准来看，需要 250$/month，对于小开发者来说，还是有点贵的。不过如果后面足够成熟，还是可以考虑引入 stainless 来生成代码，这样就不用人工去写了，也不用太担心代码质量问题。

不得不说，OpenAI 不亏是 AI 的引领者，从这里 SDK 代码生成的自动化过程，也能感受到对写代码这件事情的不断优化。相信随着 AI 的不断成熟，写代码这件事情，AI 参与的会越来越多，帮忙生成越来越多代码。