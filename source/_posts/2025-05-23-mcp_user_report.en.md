---
title: "In-depth Experience with 3 MCP Servers via Cursor: Impressive but Not Yet Practical?"
tags: [LLM]
category: Artificial Intelligence
toc: true
description: "This article details the background and origins of MCP, its relationship with OpenAI Function Calling, and how to configure and use MCP Servers in Cursor. It explores practical scenarios like web automation, GitHub repository analysis, and chart generation. While MCP shows impressive capabilities in GitHub code analysis, web manipulation still has limitations. The article also highlights MCP's core constraint: its reliance on the LLM's function calling ability, which is affected by token limits. Although MCP offers a standardized solution for AI tool invocation, its practical value is currently limited, positioning it more as an experimental technology with hopes for significant improvements as model capabilities advance."
date: 2025-05-23 11:39:14
---

When Large Language Models (LLMs) first emerged, they primarily generated responses based on pre-trained data. These early models had two main drawbacks:

1.  They lacked knowledge of recent events. For instance, a model trained in March 2024 wouldn't know about events in May 2024.
2.  They couldn't utilize external tools. "Tools" here can be understood as function calls. For example, if I had a tool function to publish an article, I couldn't use natural language to make the LLM call this function.

To address these issues, OpenAI was the first to introduce `function calling` capabilities in their models, as detailed in their blog post: [Function calling and other API updates](https://openai.com/index/function-calling-and-other-api-updates/).

## Background: Understanding Function Calling

At this point, we can inform the model about the tools we have, what parameters each tool requires, what it can do, and what its output will be. When the model receives a specific task, it helps us select the appropriate tool and parse the parameters. We can then execute the corresponding tool and get the result. This process can be iterated, allowing the AI to decide the next steps based on the tool's output.

I found an animated GIF online that illustrates the workflow after function calling was introduced:

![Understanding the function calling process](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_functioncalling.webp)

<!-- more -->

Of course, the LLM here only selects the appropriate tool from the list we provide and parses the parameters. It cannot directly call the tools; we need to **program the tool-calling part ourselves**. You can refer to OpenAI's [Function calling documentation](https://platform.openai.com/docs/guides/function-calling?api-mode=responses).

## Why Introduce MCP?

Function calling alone can already do many things, leading to several interesting projects like [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT), arguably the earliest Agent.

However, there's a problem: different vendors implement function calling differently, requiring developers to adapt their code for each platform. Developers also need to write code to parse the output of function calling and invoke the corresponding tools. This involves a lot of engineering work, such as handling retries, timeouts, and result parsing.

In the computer science field, **there's nothing that can't be solved by adding an intermediate layer**. After more than a year, with improvements in model capabilities and the enrichment of various external tools, [Anthropic launched the MCP protocol on November 25, 2024](https://www.anthropic.com/news/model-context-protocol). It introduced the MCP Client and MCP Server as an intermediate layer to address the communication issues between LLM applications and external data sources and tools.

Of course, there have been other solutions to empower models to call external tools, such as OpenAI's [ChatGPT Store](https://openai.com/index/introducing-the-gpt-store/) and the once-popular [GPTs](https://chatgpt.com/gpts), though they seem to be rarely used now.

Currently, MCP is quite popular. Here's a diagram to help you understand:

![Understanding what MCP is](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_whatismcp.webp)

This article mainly focuses on practical experience, so we'll keep the background introduction brief. If you're interested in MCP development, you can refer to the [official documentation](https://modelcontextprotocol.io/introduction), which is quite detailed.

## How to Use Cursor MCP

Before we start, I'll briefly introduce how to use MCP with Cursor. Integrating MCP with Cursor is quite convenient. For most MCP Servers that don't require API keys, a simple configuration is usually enough. MCP is evolving rapidly, so it's recommended to check [Cursor's official documentation](https://docs.cursor.com/context/model-context-protocol) for the latest information. Many online articles that teach you how to configure them are actually outdated.

Here, I'll explain the overall configuration concept to help you understand the documentation. Cursor acts as the AI application here, with a built-in MCP Client, so you don't need to worry about the Client part. You just need to tell it which MCP Servers you have, and Cursor will automatically call the tools and use their results during chat sessions.

![MCP Overall Understanding Diagram](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_understand.webp)

Let's use the diagram above for better understanding. Currently, most AI applications use JSON files to configure MCP Servers, like Claude Desktop. Cursor is no exception; it supports global configuration (`~/cursor/mcp.json`) and project-specific configuration (`.cursor/mcp.json`).

Cursor currently supports two types of MCP Servers: local MCP CLI Stdio Server and remote MCP SSE Server. For SSE, you can refer to my previous article [Understanding Several Stream Output Implementation Methods with Examples](https://selfboot.cn/en/2024/05/19/stream_sse_chunk/). The local CLI method essentially starts a server process on the local machine, and Cursor interacts with this local process via standard input/output.

The local server supports Python, Node services, and Docker containers. However, the prerequisite is that **the corresponding language environment is already installed on the local machine, and the startup commands can be executed**. I've provided an example for these three methods:

```bash
npx @browsermcp/mcp@latest
uvx mcp-server-browser-use@latest
docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server
```

Sometimes, MCP Servers require additional configurations, such as GitHub API keys. In such cases, you'll need to configure them manually. Remember to set your keys as environment variables and **never upload your keys to a code repository**.

For a specific MCP Server, you can refer to its documentation for configuration instructions; it shouldn't be too difficult. Once the JSON is configured, Cursor will automatically recognize it. You can enable the MCP Server, and if you see a green mark and the listed tools after a while, it means the configuration was successful.

![Cursor MCP Server Configuration Successful](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_configsucc.webp)

Now, let's get to the main event: experiencing the practical effects of MCP.

## MCP Experience 1: Web Automation

I've often thought about using AI to automate web tasks, such as automatically searching a specific site, browsing content on a designated topic, posting replies, or exporting meaningful content. So, I tried Microsoft's headless Playwright MCP Server and gave it a relatively complex task:

> Help me open Taobao, search for Apple iPhones, find the latest model, list the top few stores with the highest sales volume, and export the sales volume and price for each store.

It did open Taobao as expected and found the search box, entering "Apple iPhone," as shown:

![MCP Experience 1: Web Automation](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_taobaocase.webp)

However, a login pop-up appeared, and Claude 3.7 got stuck here for a long time without resolving it. After running for a while, the final output was:

> I noticed we encountered a login pop-up, which might be because the Taobao website requires users to log in to view detailed search results. This is a common security measure on Taobao, especially for non-logged-in users accessing via automated tools.
> Let me try to cancel the login pop-up by clicking the close button:
> We see that after clicking the close button, the Taobao website still requires login to view search results. Taobao has strict security restrictions for non-logged-in users, especially when accessed by automated tools.
> Since logging in is required to view detailed iPhone information, I can try other ways to obtain information about Apple iPhones. For example, I can use web search to find publicly available data on the latest iPhone models, their sales, and prices:

Ultimately, it started searching the web, which was far from my original intention. Handling login states is indeed tricky. I found another [MCP Server](https://browsermcp.io/) that supports running in the local browser, allowing AI to operate after logging in. This tool works by installing a browser extension, and the MCP Server controls the local browser.

After using it, the login state is no longer an issue, but some websites have anti-scraping features that protect page elements. This MCP Server cannot perfectly control them yet, for example, it fails to click buttons, and scrolling is very laggy.

Actually, LLMs still face considerable difficulties in browser control. A recently popular project, [Browser Use](https://browser-use.com/), attempts to control browsers using not only HTML elements but also visual elements. The overall prospect seems better, and I'll try a deep dive into it once I have tokens.

## MCP Experience 2: GitHub Repository Analysis

Next, let's try the [GitHub MCP Server](https://github.com/github/github-mcp-server) from Cursor's official examples. It supports searching repositories, code, issues, creating PRs, etc. I thought of a scenario where, upon encountering a popular project, AI could first summarize currently hot PRs or Issues, and then see if there are opportunities to contribute. Of course, if the AI could find valuable Issues, then analyze the code, provide solutions, and automatically submit the code, that would be even more valuable.

But first, let's break down the problem and start with a low-difficulty information gathering task:

> In the LevelDB project, what are the highly discussed pull requests that haven't been merged yet?

Using Claude 3.7 here, it surprisingly got into a bit of an infinite loop, repeatedly calling the `list_pull_requests` tool with almost identical parameters:

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

It checked over 10 times without automatically terminating. Since PR checking was unsuccessful, I switched to checking Issues. This time, it worked well, using the `list_issues` tool. It checked 3 pages, with parameters similar to this:

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

Finally, it provided some conclusions, as shown:

![GitHub MCP Issue Information Analysis](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_leveldbcase.webp)

I checked a few, and there were no major problems. I was quite satisfied with this. For a large project, being able to quickly find highly discussed Issues and then analyze them can indeed be helpful. However, I suspect it didn't find all of them; there were only 3 pages, but in reality, there are over 200 Issues.

Then, I continued to focus on one [PR #917](https://github.com/google/leveldb/pull/917) and asked it to analyze it for me. Coincidentally, Claude launched the Sonnet 4 model today, so I used this new model for the analysis. I have to say, for such well-defined small problems, AI analysis is very powerful.

First, it collected the comments on this PR, the code changes in the PR, and also pulled two other Issues mentioned in this PR. **After synthesizing all this information, it provided a detailed analysis**. The analysis was very impressive: it started with a problem description, background, and manifestations, followed by the proposed solution, community discussion points about this solution (such as performance impact and author responses). Finally, it also gave the current status of the PR: submitted in June 2021 and still not merged. This analysis was amazing; it seems I can use this for open-source project issues in the future.

Here's a screenshot:

![GitHub MCP PR Information Analysis](https://slefboot-1251736664.file.myqcloud.com/20250523_mcp_user_report_githubissue.webp)

Of course, after looking at the GitHub MCP Server documentation, I found that it not only provides the ability to read repositories and Issues but also to modify repositories. This includes submitting PRs, creating Issues, creating comments, creating labels, and creating new branches. I haven't had a chance to deeply explore these features that modify repositories yet; I'll try them when I get the chance.

## MCP Experience 3: Chart Generation

Sometimes, I frequently need to generate good-looking reports from data. Previously, AI even wrote a tool to [generate dynamic bar charts](https://gallery.selfboot.cn/en/tools/chartrace). Now with MCP, I can try letting AI generate charts. There are many cool chart generation libraries, like ECharts. I checked and found no official chart library, but I found an [mcp-server-chart](https://github.com/antvis/mcp-server-chart?tab=readme-ov-file) that supports generating ECharts charts.

Here's a [dynamic racing bar chart of population changes in Chinese provinces over the last 10 years](https://gallery.selfboot.cn/en/tools/chartrace/dynamic/china_population). I exported some data and then tried generating a chart with the MCP Server.

I directly gave it a file and prompted:

> @china_population.csv Using this Chinese population change data, generate a bar chart of the population of each province in 2022 and 2023.

I used the Claude 4 Sonnet model here, and it successfully called the `generate_column_chart` tool of `mcp-server-chart` to generate the chart. However, this tool returns an image URL, which needs to be copied from the output and opened to view. Actually, Cursor supports outputting images as Base64 encoding, so they can be loaded in the chat. The image URL returned by the tool is [here](https://mdn.alipayobjects.com/one_clip/afts/img/w099SKFp0AMAAAAAAAAAAAAAoEACAQFr/original), and the effect is as follows:

![MCP Generated Bar Chart](https://slefboot-1251736664.file.myqcloud.com/20250523_mcp_user_report_echart.webp)

Then I discovered that this tool supports other types of charts, such as line charts, scatter plots, pie charts, etc. There was one chart whose type I didn't know, but it looked quite good, so I took a screenshot and gave it to Claude, prompting:

> Referring to this image, generate a chart of the population of each province in 2023.

It first analyzed that it was a treemap, then helped me generate the result and explained it. It explained that the largest rectangular block represents Guangdong Province, occupying the largest area, reflecting its status as the most populous province. The generated chart [URL is here](https://mdn.alipayobjects.com/one_clip/afts/img/6CQ6TKSrI_sAAAAAAAAAAAAAoEACAQFr/original), and I'll display it here as well:

![MCP Generated Population Treemap](https://slefboot-1251736664.file.myqcloud.com/20250523_mcp_user_report_echart_treemap.webp)

The effect is quite good. Currently, this tool has one Tool per chart type, and the supported chart types are still limited.

## MCP Usage Limitations

Current MCP still has some limitations. First, we need to be clear that **the MCP protocol only adds an intermediate layer of Server and Client; it still relies on the LLM's function calling capability**. And function calling is subject to the LLM's context length limit; tool descriptions, parameters, etc., all consume tokens.

When the number of tools is too large or their descriptions are too complex, it might lead to insufficient tokens. Furthermore, even if there are enough tokens, providing too many tool descriptions can degrade the model's performance. [OpenAI's documentation](https://platform.openai.com/docs/guides/function-calling?api-mode=responses#token-usage) also mentions:

> Under the hood, functions are injected into the system message in a syntax the model has been trained on. This means functions count against the model's context limit and are billed as input tokens. If you run into token limits, we suggest limiting the number of functions or the length of the descriptions you provide for function parameters.

Since MCP is based on function calling capabilities, it shares the same limitations. If an MCP server provides too many tools, or if the tool descriptions are too complex, it will affect the actual performance.

For example, Cursor recommends that enabled MCP Servers provide a maximum of 40 tools. Too many tools can lead to poor model performance, and some models do not support more than 40 tools.

![Cursor MCP Tool Limitation](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_cursor_limit.webp)

## The Practical Value of MCP?

Alright, now that we've introduced the background, usage methods, and limitations of MCP, let's finally discuss its practical value. There are many MCP Servers on the market. Cursor has an [MCP Server list page](https://cursor.directory/mcp); you can look for them there if needed.

![MCP Server List](https://slefboot-1251736664.file.myqcloud.com/20250522_mcp_user_report_cursor_allmcps.webp)

After a quick look, I feel that some MCP Servers might be worth trying out more in the future.

- [firecrawl-mcp-server](https://github.com/mendableai/firecrawl-mcp-server): This tool can search web pages and export their content. It also supports searching, in-depth research, and batch crawling. I feel it could be used to gather reference materials when writing articles in the future. The need for web crawling will persist, and there are many similar MCP Servers that can be explored later.
- [MiniMax-MCP](https://github.com/MiniMax-AI/MiniMax-MCP): Recently, MiniMax's speech synthesis topped the charts, and my experience with it was indeed very good. It offers dozens of voice timbres, each very distinctive and sounding almost human. This MCP Server supports calling MiniMax's synthesis API, which can be used to generate some voice content, even just for novelty.
- [mcp-clickhouse](https://github.com/ClickHouse/mcp-clickhouse): If these DB operation-type MCP Servers are powerful enough, they would be great. You could query data just by chatting, which is sufficient for ordinary users. Combined with chart-generating MCP Servers, you could truly visualize data with a single sentence. It's not just ClickHouse; Mysql, Sqlite, and Redis also have MCP Servers that can be tried later.

Among the few I've tried, some do have nice highlight features, but none have made me feel they offer particularly great value. After the initial novelty, they were shelved. Only the GitHub MCP Server made me think I might use it in the future.

However, before this article was even finished, the Claude Sonnet 4 model was released, touted as the world's most powerful programming model. Its reasoning ability has also significantly improved. I'll need to use it for a while longer to get a real feel for it. Perhaps as model capabilities improve and various MCP Servers continue to be optimized, they will one day become indispensable tools for everyone.

Do any of you have good use cases for MCP Servers? Feel free to leave comments and discuss.