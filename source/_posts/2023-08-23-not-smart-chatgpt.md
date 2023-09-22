---
title: 真实例子告诉你 ChatGPT 是多会胡编乱造！
tags:
  - ChatGPT
  - Prompt
category: 人工智能
toc: true
description: 文章归纳了 ChatGPT 在日常使用中的各类错误回答，如时区设置、法律案例、代码实现、图像识别等都曾出现过失误，虽然它看似智能，但仍存在局限。这些实例提示我们注意验证AI输出，而不是盲目依赖。合理使用ChatGPT，认识其优劣，才能发挥其价值。我们不应因其偶尔的失误否定AI，而应客观理性地对待当前AI水平。
date: 2023-08-23 08:03:32
updated: 2023-09-22 22:00:01
---

GPT-4，这一人工智能的杰出代表，已经在许多方面超越了普通人类。我的日常也原来越离不开 ChatGPT 了，它大大提高了日常的工作效率。然而，在使用中发现 ChatGPT 还是有时会犯一些“幼稚”的错误，就像一个正在成长的孩子偶尔会出现的调皮行为。

本文记录**日常使用** ChatGPT 过程中发现的一些错误回答，就像记录孩子成长过程中的出丑时刻一样。等到有一天 AI “长大成人”，也能一起回顾这些“小时候”的出丑时刻。

![ChatGPT 的错误回答集锦](https://slefboot-1251736664.file.myqcloud.com/20230817_not_smart_chatgpt_robot.png)

<!-- more -->

本文的记录均基于 OpenAI 的 GPT 模型，如果没做特殊说明，都是最新的 GPT4 模型。本文会在个人博客**持续更新**，记录日常使用中发现的各种好玩儿的回答。

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

"isneedlawer": true/false， # 用户是否需要律师的帮忙
"customreplycontent": ""， # 针对问题给出的一个法律建议，如果无法律建议，则为空字符串，
"cityzone": ""， # 问题涉及的地点，精确到城市即可，比如广州市。如何没有地点信息，则为空字符串，
"abstract": "" # 问题的简单概述，不超过 200 字，要包含用户主要传达的信息"

输出一定要是 json，如果做不到，那么请输出一个空的 json。
用户咨询的内容如下:
{seperator}{question}{seperator}
```

其中 `seperator` 是分隔符，`question` 则是从其他地方读到的咨询内容。如果咨询内容不为空，则一切符合预期，但是一旦咨询内容为空，ChatGPT 就会返回一个很奇怪的结果，如下图：

![ChatGPT 幻觉：房东不退押金](https://slefboot-1251736664.file.myqcloud.com/20230821_not_smart_chatgpt.png)

难道广州的房东经常不退租客押金，被 ChatGPT 都从网上学到了？有点让人啼笑皆非了。不止在 ChatGPT3.5 下会有这个问题，最新的 GPT4 模型，也是会有同样的问题。

## 不能激活的插件

OpenAI 的 ChatGPT 是离线训练的模型，里面会缺少一些比较新的知识。[Langchain](https://python.langchain.com/docs/get_started/introduction.html) 是一个最近刚出来的 LLM 开发框架，ChatGPT 没有其相关知识。为了能够让它回答 langchain 的问题，我开了 Webpolit 插件，并且提供给他文档地址，然后提问如下：

> 参考 https://python.langchain.com/docs/get_started/quickstart 这里 langchain 的文档，帮我给指定中文文本分类，提取下面信息，并输出 json。
> 
> cityzone：提取文本里有提到的位置信息
> customreplycontent：生成一段回复

然后 GPT4 就自信的说，根据文档和需求，可以用下面的脚本来完成任务。

```python
from langchain import Langchain

# 创建 Langchain 实例
lc = Langchain()

# 定义分析文本的函数
@lc.register
def analyze_text(text: str) -> dict:
    cityzone = 提取位置信息(text)
    customreplycontent = 生成一段回复(text)
    return {
        "cityzone": cityzone，
        "customreplycontent": customreplycontent
    }

# 定义提取位置信息的函数
@lc.register
def 提取位置信息(text: str) -> str:
    # 这里添加你的逻辑来提取位置信息
    return "上海"

# ...
```

这个大聪明怎么忽然这么笨啦？`提取位置信息(text)` 这都能拿出来作为 python 代码，也太敷衍了。就这还大言不惭，让我通过安装 Langchain 库并运行上述代码来测试这个脚本。没办法，只好提醒他用插件重新读文档来实现，终于变聪明了。

![用插件学习后的 ChatGPT](https://slefboot-1251736664.file.myqcloud.com/20230821_not_smart_chatgpt_webpolit.png)

## 图像识别错误

有一个图片，我用红色标记了其中一部分，然后想把这部分替换为其他图片。自己不熟悉 opencv 的代码，也不太懂图片处理，想着让 ChatGPT 的 [Code Interpreter](https://selfboot.cn/2023/07/12/gpt4_code_interpreter_image/) 帮我写个简单的代码来处理一下。于是给它传了图片，然后提问：

> 如何用 python 识别这个图片里红色方框的坐标位置，并且把里面的内容替换为其他内容

ChatGPT 给出了自己的步骤，看起来是很合理：

1. 读取图像。
2. 识别红色方框的坐标位置。
3. 截取该区域并替换为所需内容。
4. 将替换的内容粘贴回原始图像。

然后就是第一步，识别红色方框的坐标位置。信誓旦旦说成功识别了红色方框的坐标位置，它位于图像的 (562，474) 位置，并具有 142 的宽度和 172 的高度。还好心好意地用**蓝色方框**在图片上标记了出来，如下图：

![图像识别错误的 ChatGPT](https://slefboot-1251736664.file.myqcloud.com/20230822_not_smart_chatgpt_cv.png)

把图像中的脸部识别成了红色方框部分，看了下代码，应该是颜色的阈值没设置对导致的。后面把任务拆分了下，让它只识别红色方框位置，同时把方框的红色搞得稍微粗了些，ChatGPT 就能正常识别了。

## 画不出来的链表图

之前读《Redis 设计与实现》这本书的时候，看到作者说配图全部是用 [Graphviz](http://graphviz.org/) 生成的，还给出了所有配图的源码 [redisbook1e-gallery](https://github.com/huangz1990/redisbook1e-gallery)。当时就觉得用源码生成图片也太酷了，还打开 Graphviz 的官网看了下，奈何文档看起来太多了，上手需要点时间，就搁置了。

最近刚好想用 Graphviz 画一个简单的图，想着让 ChatGPT 生成源码，岂不快哉？动动嘴图片就出来了，这多好。于是就提问如下：

> 你是一个 Graphviz 绘图的专家，帮我用 markdown 输出下面描述中的图片的制作代码，要求绘的图简单清晰，结构工整。
> 
> 图片描述：有一个int 的链表，里面从头往尾部元素值分别是 1 ，2，3，... ，100，其中有一个箭头指向头部，箭头上有文字 head，有一个带有标题 tail 的箭头指向链表尾部。

ChatGPT 果然会！给出了一个不错的源码，还好心好意提醒我可以将此代码粘贴到一个 Graphviz 编辑器（例如 [WebGraphviz](http://www.webgraphviz.com/)）中，然后生成链表的图像。

```shell
digraph LinkedList {
    rankdir=LR;
    node [shape=record];
    
    // 定义头部和尾部标签
    head [label="head"， shape=plaintext];
    tail [label="tail"， shape=plaintext];
    
    // 定义链表节点
    node1 [label="{ 1 | <p1> }"];
    node2 [label="{ 2 | <p2> }"];
    node3 [label="{ 3 | <p3> }"];
    ellipsis [label="..."， shape=plaintext];
    node100 [label="{ 100 | }"];
    
    // 定义箭头和连接
    head -> node1 [dir=back， constraint=false];
    node1:p1 -> node2;
    node2:p2 -> node3;
    node3:p3 -> ellipsis;
    ellipsis -> node100;
    tail -> node100 [dir=back， constraint=false];
    
    // 定义排列
    { rank=same; head tail }
}
```

于是我就拿源码贴过去，发现语法都有错误，生成的图片也不对。head 和 tail 画不对，还多了个 svg 出来，如下图了：

![画不出一个简单链表 digraph 的 ChatGPT](https://slefboot-1251736664.file.myqcloud.com/20230822_not_smart_chatgpt_graphviz.png)

然后试着换了各种更加清晰的提示词，ChatGPT 总是给不出正确的源码，给的许多源码也都有语法错误。难道数据集中没有很多Graphviz 绘图的语料，导致 ChatGPT 没有学会？

## 代码解释器库缺失

ChatGPT 的 [Code Interpreter](https://selfboot.cn/2023/07/10/gpt4_code_interpreter_data/) 还是很好用的，不用自己写代码就能用来分析数据，并进行可视化。有次使用过程中，需要对数据中的**中文内容进行分词**，想到了 [jieba 分词](https://github.com/fxsjy/jieba)，但是怕 ChatGPT 的代码解释器环境没有安装这个包，于是就问了下 ChatGPT：

> 你可以用一些中文分词库，比如 jieba 吗？

ChatGPT 就自信回答当然可以使用 jieba 分词库来更准确地分析中文文本，还说这个库能够更好地识别中文词汇和短语。然后就开始刷刷刷写代码了：

```python
import jieba

# Using jieba to tokenize the consultation texts
jieba_words = jieba.cut(consultation_texts)

# Counting the frequency of each word using jieba tokenization
jieba_word_counts = Counter(jieba_words)

# Finding and returning the top 50 most common words using jieba tokenization
top_50_jieba_words = [word for word, _ in jieba_word_counts.most_common(50) if word.strip() and word not in '.,;:!?。，；：！？']

# Returning the top 50 words with jieba
top_50_jieba_words
```

然后 ChatGPT 就开始运行代码，果不其然，发现没有安装 jieba 这个库 `No module named 'jieba'`。然后终于意识到当前环境中没有安装 jieba 分词库，所以无法直接使用。

![Code interpreter 加载 jieba 库失败](https://slefboot-1251736664.file.myqcloud.com/20230825_not_smart_chatgpt_jieba.png)

这个例子其实 AI 的表现也是可以理解的，毕竟这种错误人也经常犯，经常是代码跑一般才发现没有安装某个库。不过 AI 还是可以表现的更好些，可以在跑失败的时候，告诉我怎么**手动在当前环境安装这个库**。毕竟，你都知道我想用这个库，而你也有方法安装这个库，那为啥不告诉我呢？看来还是不够聪明呀～

## Clickhouse 函数

背景是这样的，我想用 Clickhouse 写一个查询语句，将一个按照位存储的 field 字段，转换成数组出来。每一位(从低位到高位)分别对应:

| 位 | 解释 |
| -- |--  |
| 0 | CN | 
| 1| EN |
| 2 | HK |
|3 | JA |

对于数字 13 (1101)，我想转换为 `[CN, HK, JA]`，提示词如下：

> clickhsoue 里，我查找到了一个 field 字段，是个二进制按位记录的 flag 位，如果转换为一个数组？
>  
> & 1 = 1 , CN
> & 2 = 1 , EN

然后让我这样操作：

```sql
arrayJoin(arrayFilter(x -> x != '', [if(field & 1, 'CN', ''), if(field & 2, 'EN', '')])) AS CombinedFlags
```

我就开心的拿去测了下，发现不对，最简化一个测试 sql: `select 5&1`，发现也报错了，于是直接提示：

> select 5&1
> Error running query: Code: 62, e.displayText() = DB::Exception: Syntax error: failed at position 335 ('&') (line 5, col 9): &1 FORMAT JSON. Unrecognized token: '&' (version 21.8.12.1)

然后 ChatGPT 就认错了，说疏忽了 ClickHouse 的 SQL 语法细节。在 ClickHouse 中，你需要使用 `bitAnd` 函数来进行按位与运算。例如，要检查数字 5 的第 1 位是否为 1，可以这样写：

```sql
SELECT bitAnd(5, 1) AS Result
```

我就又拿来试，发现还是不对。想了下，这里不是求与，应该是测试某一位是否是 1，然后把是 1 的全部拼接起来。**不再靠 ChatGPT 了，直接去查官方文档**，发现了函数 bitTest，这个可以测试某一位是否是 1。最后写了下面的 SQL(可以用 13 替换 field 来测试):

```sql
select arrayFilter(x -> x != '', [if(bitTest(field, 0)=1, 'CN', ''), 
    if(bitTest(field, 1)=1, 'EN', ''),
    if(bitTest(field, 2)=1, 'HK', ''),
    if(bitTest(field, 3)=1, 'JA', '')]) AS combine
```

---
通过这些日常真实案例，我们可以看到当前 ChatGPT 在回答一些问题时，仍会胡编乱造一些**看起来很正确**的答案。但是我们不应因此否定 ChatGPT 的价值，更不应该弃之不用。**认识到其局限并合理使用**，才是我们应有的态度。