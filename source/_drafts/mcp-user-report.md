---
title: 使用 Cursor 深度体验了 5 个 MCP Server，惊艳但并不实用
tags: [LLM]
category: 人工智能
toc: true
description: 
---

大语言模型刚出来的时候，只是通过预训练的模型来生成回答内容。这个时候的模型有两个主要的缺点：

1. 有些数据它不知道，比如 2024 年 3 月训练的模型，就不知道 2024 年 5 月的事情；
2. 没法使用外部工具。这里的工具我们可以等效理解为函数调用，比如我有个发表文章的工具函数，我没法用自然语言让大模型来帮我调用这个函数。

为了解决这两个问题，OpenAI 最先在模型中支持了 `function calling` 功能，他们在这篇博客: [Function calling and other API updates](https://openai.com/index/function-calling-and-other-api-updates/) 有介绍。

## 背景：理解 Function Calling

这时候，我们就可以告诉模型，我有这么几个工具，每个工具需要什么参数，然后能做什么事情，输出什么内容。这样我们就可以告诉模型，我需要做什么事情，模型会帮我们选择合适的工具，并解析出参数。之后我们可以执行相应的工具，拿到结果。并可以接着循环这个过程，让 AI 根据工具结果继续决定往下做什么事情。

我在网上找了个动图，可以来理解下：

![理解 function calling过程](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_functioncalling.webp)

当然这里大模型只是根据我们给的工具列表，选择合适的工具，并解析出参数。它不能直接去调用工具，我们需要**编程实现工具调用部分**，可以参考 OpenAI 的 [Function calling 文档](https://platform.openai.com/docs/guides/function-calling?api-mode=responses)。

## 为什么又引入了 MCP

只有 function calling 已经能做很多事了，派生了不少有意思的项目，比如 [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT)，可以说是最早的 Agent 智能体了。

但是有个问题，就是不同厂商 function calling 实现各不相同，开发者需要为每个平台单独适配。另外开发者还需要编写代码来解析 function calling 的输出，并调用相应的工具。这里面有不少工程的工作，比如失败重试、超时处理、结果解析等。

计算机领域，**没有什么是不能通过加个中间层来解决的**。[Anthropic 在2024年11月25日推出了 MCP 协议](https://www.anthropic.com/news/model-context-protocol)，引入了 MCP Client 和 MCP Server 这个中间层，来解决解决 LLM 应用与外部数据源和工具之间通信的问题。

这里有个图，可以帮助你理解 MCP 协议：

![理解什么是 MCP](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_whatismcp.webp)

咱们这篇文章主要是介绍实用体验，所以关于背景的交代就到这里。如果对 MCP 的开发感兴趣，可以看[官方文档](https://modelcontextprotocol.io/introduction)，介绍的还是十分详细的。

## Cursor MCP 使用方法

Cursor 接入 MCP 还是挺方便的，对于大部分不需要密钥的 MCP Server，基本一个配置就能接入。现在 MCP 发展还挺快，所以建议大家直接去看 [Cursor 的官方文档](https://docs.cursor.com/context/model-context-protocol)，获取最新信息。网上不少教你如何配置的文章，其实都过时了。

这里我给大家介绍下配置的整体思想，方便你理解文档。Cursor 在这里相当于 AI 应用，它内置了 MCP Client，所以你不用管 Client 部分了。你只需要告诉他你有哪些 MCP Server，然后在会话聊天中 Cursor 会自动调用工具并使用它的结果。

![MCP 整体理解图](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_understand.webp)

先祭出上面这张图，方便你理解。目前大部分 AI 应用都是用 json 文件来配置 MCP Server 的，比如 Claude Desktop。Cursor 也是如此，它支持全局配置(`~/cursor/mcp.json`)，也可以在项目中(`.cursor/mcp.json`) 配置。

目前 Cursor 支持本地 MCP CLI Stdio Server 和远程 MCP SSE Server 两种方式，关于 SSE 可以参考我之前的文章[结合实例理解流式输出的几种实现方法](https://selfboot.cn/2024/05/19/stream_sse_chunk/)。本地的 CLI 方式，其实就是在本地机器启动一个 Server 进程，然后 Cursor 通过标准输入输出来和这个本地进程交互。

这里本地的 Server 支持 Python，Node 服务，也支持 Docker 容器。不过前提是**本地机器已经安装了对应的语言环境，能跑起来相应的启动命令**。这 3 种方式，我都给了一个例子：

```bash
npx @browsermcp/mcp@latest
uvx mcp-server-browser-use@latest
docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server
```

有时候 MCP Server 里面还需要一些配置，比如 Github 的 API 密钥，这时候就需要你手动配置了。建议可以把密钥配置到环境变量中，**千万不要把密钥上传到代码仓库**哦。

具体到某个 MCP Server，你可以参考它的文档，看如何配置，应该没什么难度。配置好 json 后，Cursor 会自动识别，你可以打开这个 MCP Server，过一会看到绿色标记和列出来的工具，就说明配置成功了。

![Cursor 配置 MCP Server 成功](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_configsucc.webp)

接下来终于到重头戏了，咱们来体验下 MCP 的实际效果。

## MCP 体验一：网页自动操作

之前就经常想着让 AI 来自动化执行一些网页任务。比如自动去某个站点搜索、浏览指定主题的内容，进行回复，或者导出一些有意义的内容。于是试了下微软的无头 playwright MCP Server，给了它一个比较复杂的任务:

> 帮我打开淘宝，搜索苹果手机，找到最新款的苹果手机，给出店铺销量最高的几家，并导出每家店铺的销量和价格。

确实如期打开了淘宝，并真的找到了搜索框，输入了苹果手机，如图:

![MCP 体验一：网页自动操作](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_taobaocase.webp)

但是后面弹了一个登录框，Claude 3.7 在这里卡了很久，也没解决。跑了一阵子，最后的输出是这样的：

> 我注意到我们看到了一个登录弹窗，这可能是因为淘宝网站要求用户登录才能查看详细搜索结果。这是淘宝网站的常见安全措施，特别是对于非登录用户通过自动化工具访问时。
> 让我尝试取消登录弹窗，点击关闭按钮：
> 我们看到点击关闭按钮后，淘宝网站依然要求登录才能查看搜索结果。淘宝网站对非登录用户有严格的安全限制，特别是使用自动化工具访问时。
>由于需要登录才能查看详细的苹果手机信息，我可以尝试使用其他方式获取有关苹果手机的信息。例如，我可以使用网络搜索查找有关最新款苹果手机及其销量和价格信息的公开数据：

最后开始联网搜索，和我本意差的有点远。这里登录态确实不好处理，我找了另一个 [MCP Server](https://browsermcp.io/)，它支持在本地浏览器中运行，这样可以登录后再让 AI 来操作。这个工具的原理是，在本地浏览器安装一个插件，然后 MCP Server 来控制本地浏览器。

使用下来，目前登录态是没问题了，但有些网站有部分防爬的功能，页面元素做了些保护，这个 MCP Server 还没法完美的操控，比如没法成功点击按钮，另外滚动起来也是很卡顿。

其实目前 LLM 操控浏览器还是有不少难度的，最近一个比较火的 [Browser Use](https://browser-use.com/) 项目，它除了用 HTML 元素，还尝试用视觉元素来操控浏览器。整体前景会好一些，等我有 Token 了再来深度体验下这个。

## MCP 体验二：Github 仓库信息分析

再来试试 Cursor 官方例子中的 [Github MCP Server](https://github.com/github/github-mcp-server)，它支持搜索仓库、代码、issue，创建 PR 等。我想到一个场景就是，遇到一个火的项目，可以先让 AI 总结下目前比较火的 PR 或者 Issue，然后看看有没有可以贡献的地方。当然了，如果 AI 找到有价值的 Issue，然后再分析代码，给出解决方案，那这个价值就更大了。

当然，咱先拆分问题，来个低难度的信息收集：

> LevelDB 这个项目中，有哪些讨论比较多，还没合并的 pull request 啊

这里用的 Claude3.7，竟然有点死循环了，一直在 Call list_pull_requests 这个工具，参数也基本一样：

```json
{
  "owner": "google",
  "repo": "leveldb",
  "state": "open",
  "sort": "updated",
  "direction": "desc",
  "perPage": 30
}
```

查了 10 多遍，也没自动终止。PR 查不成功，我换了下查 Issue，这次还可以，用 list_issues 工具，查了 3 页，参数类似下面:

```json
{
  "owner": "google",
  "repo": "leveldb",
  "state": "open",
  "sort": "comments",
  "direction": "desc",
  "perPage": 10,
  "page": 3
}
```

最后也给出了一些结论，如图：

![Github MCP Issue 信息分析](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_leveldbcase.webp)

检查了几个，没什么大问题，这个我还是挺满意的。遇到一个大的项目，能够快速找到大家讨论多的 Issue，然后分析下，确实能帮上忙。不过我怀疑这里没找完，只有 3 页，其实一共 200 多个 Issue 呢。

## MCP 体验三：具体 App 应用


## MCP 使用限制

首先咱们要明确一点，MCP 协议只是加了个 Server 和 Client 的中间层，它还是要依赖 LLM 的 function calling 能力。而 function calling 会受到 LLM 的上下文长度限制，工具的描述信息，参数等都会占用 Token。

当工具数量太多或者描述复杂的时候，可能会导致 Token 不够用。另外，就算 Token 够用，如果提供的工具描述过多，也会导致模型效果下降。[OpenAI 的文档](https://platform.openai.com/docs/guides/function-calling?api-mode=responses#token-usage)也有提到：

> Under the hood, functions are injected into the system message in a syntax the model has been trained on. This means functions count against the model's context limit and are billed as input tokens. If you run into token limits, we suggest limiting the number of functions or the length of the descriptions you provide for function parameters.

MCP 基于 function calling 能力，所以也有同样的限制。MCP server 如果提供了过多的工具，或者工具描述太复杂，都会影响到实际效果。

比如拿 Cursor 来说，它推荐打开的 MCP Servers 最多提供 40 个工具，太多工具的话，模型效果不好。并且有的模型也不支持超过 40 个工具。

![Cursor MCP 工具限制](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_cursor_limit.webp)

## MCP 的实用价值？

好了，咱们介绍完 MCP 背景以及使用方法以及限制了，最后来聊下 MCP 的实用价值。目前市面上有太多 MCP Server 了，Cursor 有个 [MCP Server 列表页](https://cursor.directory/mcp)，有需求的话可以在这找找看。

![MCP Server 列表](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_cursor_allmcps.webp)

我看了半天，没发现什么让我怦然心动的 MCP Server，前面试过的几款，确实有些不错的亮点功能，但还不能让我觉得有特别大的价值。尝鲜之后，也就就束之高阁了。

不知道各位有什么好的 MCP Server 使用场景吗？欢迎留言讨论。