---
title: Google Gemini Pro 深度体验，离 GPT4 还有多大差距？
tags:
  - Gemini
category: 人工智能
toc: true
description: 本文通过与ChatGPT对比，深度体验Google最新推出的语言模型Gemini Pro，从语言理解、文本生成、编程能力等多个维度全面评测 Gemini Pro 与 GPT-4 的差距。发现Gemini Pro整体表现不及ChatGPT，语言理解、数学、编程能力都有差距，联网查询也不完善，距离取代GPT-4还有一定距离。
date: 2023-12-10 21:48:19
---

不得不说，2023 年真是科技突破的一年，年初 ChatGPT 带来太多惊艳，年末 [Google Gemini](https://deepmind.google/technologies/gemini/#introduction) 又让人充满了无限遐想。

![Google Gemini 多模态带来无限可能？](https://slefboot-1251736664.file.myqcloud.com/20231207_google_gemini_bard_hands_on_start.png)

按照 Google 官方的介绍，Gemini 是**第一个在 MMLU（大规模多任务语言理解）方面超越人类专家**的模型，在推理，数学和代码上的能力也都超过了 GPT4。而且还是一个多模态的模型，可以同时**处理文本，图像，声音和视频**，评测分数也比 GPT-4V 更高。

<!-- more -->

从 Google 发布的宣传片(下面视频需要能访问 Youtube)来看，Gemini 的表现确实让人惊艳。发布几天后，很多人已经对 Gemini 有不少质疑的声音，因为发布的视频是编辑过的。Gemini 的真实效果如何，还是要自己亲自试一试才知道。目前 Google 对外只放开了 Gemini Pro 的使用，接下来本文来用 bard 感知下 Gemini Pro 到底怎么样吧。

<div style="position: relative; width: 100%; padding-bottom: 56.25%;">
    <iframe src="https://www.youtube.com/embed/UIZAiXYceBI?si=KjDCRPIKnAYsby5J" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></iframe>
</div>

## 体验结论

Gemini 目前分三个版本：

- Ultra: 功能最强大、规模最大的模型，适用于高度复杂的任务，各项指标几乎全面超过 GPT-4，上面视频中的宣传就是 Ultra 模型。
- Pro: 用于跨各种任务进行扩展的最佳模型，目前可以体验到，评测结果来看，比 GPT-4 稍微差一点。
- Nano: 移动端任务模型，适用于移动设备，评测结果来看，比前面两个版本效果会差。

目前 [Bard 上集成的是 Gemini Pro](https://bard.google.com/updates)，截止 2023.12.07，只开放了文本提示词，其他多模态能力暂未放开。从 [Google 发布的报告](https://storage.googleapis.com/deepmind-media/gemini/gemini_1_report.pdf)来看，Gemini Pro 的能力会比 GPT-4 稍微差一点，接下来就在 bard 上真实体验一把 Gemini Pro，看看能力到底如何。截止 12.10，Bard 上只有用英文才能体验 Gemini Pro，具体可以参考 Google 的帮助文档 [Where Bard with Gemini Pro is available](https://support.google.com/bard/answer/14294096)。

![Bard 上可以体验 Gemini Pro](https://slefboot-1251736664.file.myqcloud.com/20231207_google_gemini_bard_hands_on_bard.png)

之前我写过一篇 [大语言模型 Claude2 和 ChatGPT 实测对比](https://selfboot.cn/2023/07/20/claude_gpt4_compare/)，本文继续使用类似的测试方法，对比一下 Gemini Pro 和 ChatGPT 4 的表现。先来说结论吧，如下表：

| 功能 | ChatGPT 4 | Bard(Gemini Pro) |
|-- | -- | -- |
| 使用限制 | 地区限制，IP 风控，支付风控 | 地区限制 | 
| 费用 | 付费 | 免费 |
| 速度 | 很慢，不过最新的 GPT4-tubro 快了不少 | 速度很快 |
| 联网能力 | All-Tools 可以联网 | 比较迷，不完善的联网能力 ｜ 
| 语言能力 | 很强 | 比 GPT4 差，中文能力没 GPT4 强 |
| 数学问题 | 一般 | 比 GPT-4 差 |
| 编程能力 | 很强 | 比 GPT-4 差|
| Bug | 很少遇见，对话太长有时候会 | 比较容易触发，问答明显异常 | 

个人感觉，Gemini Pro 的能力和 ChatGPT 比还有比较大的差距，甚至还不如 Claude2，短时间我还不会用 Gemini Pro 替代 ChatGPT。Gemini Ultra 应该会好一些，不过暂时还没地方体验到，说不定到时候 GPT-5 先出来，Gemini Ultra 可能又落后了。

## 语言能力

接下来用英语提示词，来看看 Gemini Pro 的语言能力到底如何。

### 阅读理解

首先是阅读理解能力，我找了几个比较著名的英语谚语，来看看 Gemini Pro 的理解是否正确。提示词如下：

> I have a few phrases, can you explain them to me one by one?
> 
> 1. A stitch in time saves nine.
> 2. The early bird catches the worm.
> 3. You can't judge a book by its cover.
> 4. When in Rome, do as the Romans do.
> 5. All that glitters is not gold.

Gemini Pro 和 ChatGPT 的回答如下：

![Gemini Pro 和 ChatGPT 对普通句子的理解](https://slefboot-1251736664.file.myqcloud.com/20231210_google_gemini_bard_hands_on_explain.png)

Gemini Pro 的解释更全面些，对谚语本身的含义以及表达的意思都有解释。Gemini Pro 的速度也很快，这点是 ChatGPT 无法比的。这些谚语都是比较常见的，表达的含义也很确定。接下来我找了有歧义的句子，看两个模型分别是怎么理解的。句子 "I saw the man with the telescope." 有两种理解方式，如下：

1. 可以理解为“我用望远镜看到了那个人”，即“望远镜”是我用来看人的工具。
2. 也可以理解为“我看到了一个带望远镜的男人”，即那个男人拥有或持有望远镜。

下面是 Gemini Pro 和 ChatGPT 的解释：

![Gemini Pro 和 ChatGPT 对有歧义内容的理解](https://slefboot-1251736664.file.myqcloud.com/20231210_google_gemini_bard_hands_on_ambiguous.png)

基本上都是先说句子有歧义，然后分别给出两种解读，并说明没有上下文是没法确定具体哪种含义。Gemini Pro 后面还给了一些继续提问的方式，可以用这些问题来澄清这句话的含义。还试了一些其他有歧义的内容，整体来看 ChatGPT 解释会一针见血，Gemini Pro 废话稍微多，有时候容易发散，理解稍微差一些。

| 句子 |	理解 一 |	理解 二	| 模型比较 |
| -- |-- |-- |-- |
| The chicken is ready to eat. | 鸡已经烹饪好了，可以吃了 | 鸡已经准备好吃东西了 | 两个模型差不多 |
| Visiting relatives can be annoying. | 去拜访亲戚可能很烦人 | 一些来访的亲戚可能很烦人 | ChatGPT 完胜，Gemini Pro废话多，解释不是很清晰 |
| He saw that gas can explode. | 他知道气体可以爆炸 | 他看到了那个可以爆炸的气罐 | ChatGPT 完胜，Gemini Pro 理解错误 |
| They're hunting dogs. | 他们正在狩猎狗 | 那些是狩猎用的狗 | ChatGPT 完胜，Gemini Pro 理解错误|

总得来看，对于简单内容，Gemini Pro 和 ChatGPT 表现差不多，遇到有歧义的内容，ChatGPT 稳定发挥，理解的很好，Gemini Pro 有时候就理解不了，回答也很啰嗦了。
### 文本生成

接下来看看文本生成能力，我们知道目前最强大的 GPT4 来说，也不能写出风格统一，情节符合常识并且连贯的小说。这里我们找一些简单的文本生成任务，看看 Gemini Pro 的表现如何。这里一开始提示词如下：

> You're a biographer, help me write a piece of Musk's life.

想让 AI 扮演一个传记作家，然后写一下马斯克的生平。Gemini Pro 会追问，让我提供更多细节，比如着重写哪部分，而 ChatGPT 则从出生，教育，创业投资经历，Space X 和火星梦，特斯拉等重点内容，写了一个很不错的介绍。接着我改了下提示词：

> Do you know Elon Musk , the CEO of Tesla? Help me write a description of Musk's life.

下面是两个模型的输出:

![Gemini Pro 和 ChatGPT 生成马斯克的简介](https://slefboot-1251736664.file.myqcloud.com/20231210_google_gemini_bard_hands_on_write.png)

个人感觉 ChatGPT 给出的文本条例比较清晰，重点突出。不过 Gemini Pro 有个功能比较强大，在回答下面，有个 "Double-check response"，会对回答分为三个情形：

1. 没有突出显示：没有足够的信息来评估这些回答，或者它们无意传达事实信息。目前，Bard 不会检查表格和代码中的内容。
2. 突出显示为绿色：Goole 搜索引擎发现了类似的内容，同时提供了网页链接，要注意的是，Google 并不一定是用这里的内容生成回复；
3. 突出显示为黄色：Google 搜索引擎发现的内容可能与回答不同，这时候会提供链接。还有一种情况就是，并没有找到相关内容。

对于目前的生成式 AI 来说，Double Check 还是很有必要的。之前用 ChatGPT，都是人工再去搜索确认，目前 Google 提供的这个 `Double-check response`，对于很多场景，会有非常大帮助。

## 数学问题

对目前的生成式 AI 来说，数学问题是个难点，和人类比，AI 在数学领域还是一个小学生。我们拿经典的鸡兔同笼问题来考考 Gemini Pro。提示词如下:

> Suppose you have a cage that contains chickens and rabbits. You can hear the animals but cannot see them. You know the following:
> 
> There are a total of 35 heads (since both chickens and rabbits each have one head).
> There are a total of 94 legs (chickens have 2 legs each, and rabbits have 4 legs each).
> The question is: How many chickens and how many rabbits are in the cage?

Gemini Pro 和 ChatGPT 都回答了出来，如下图：

![Gemini Pro 和 ChatGPT 回答鸡兔同笼问题](https://slefboot-1251736664.file.myqcloud.com/20231210_google_gemini_bard_hands_on_math_cage.png)

ChatGPT 自从有了 All-Tools，这种涉及到计算的部分，一般都会用 Python 代码在虚拟环境运行。Gemini Pro 目前还没有计算环境，不过它这里也给出了正确的答案。

## 编程能力

其实作为程序员，平常用 AI 最多的就是让 AI 帮忙写代码，这里我们来看看 Gemini Pro 的编程能力如何。这里我之前尝试过用 ChatGPT 来解决 Leetcode 题目，其中有一篇：[ChatGPT 解 Leetcode 题目：位操作](https://selfboot.cn/2023/06/08/gpt4_leetcode_1318/)，接下来拿这个题目，来试试 Gemini Pro吧。

![Gemini Pro 解决编程题目](https://slefboot-1251736664.file.myqcloud.com/20231210_google_gemini_bard_hands_on_code.png)

Bard 每个题目会同时给出 3 个回答，这里 Draft A 的回答，代码写的不对。我看了下 Draft B，代码是没有问题的，也有注释。不过和 ChatGPT 的比，还是复杂难懂了些，并且解释也没有 ChatGPT 的清晰。

```c++
class Solution {
public:
  int minFlips(int a, int b, int c) {
    // Initialize the number of flips to 0.
    int flips = 0;
    // Loop until all bits are processed.
    while (a || b || c) {
      // Calculate the desired bit for the current position.
      int desiredBit = c & 1;
      // Check if both a and b have the desired bit.
      if (desiredBit && !((a & 1) || (b & 1))) {
        // Flip both a and b.
        a ^= 1;
        b ^= 1;
        flips++;
      } else if (!desiredBit) {
        // Flip a if it has the undesired bit.
        if (a & 1) {
          a ^= 1;
          flips++;
        }
        // Flip b if it has the undesired bit.
        if (b & 1) {
          b ^= 1;
          flips++;
        }
      }
      // Shift all three numbers one bit to the right.
      a >>= 1;
      b >>= 1;
      c >>= 1;
    }

    return flips;
  }
};
```

还试了一些其他的代码问题，比如：

- How do I convert UTC time to Beijing time zone in Python, show me the code.

代码质量上来说，ChatGPT 的会好很多，并且带有一些解释，给人感觉很智能。Gemini Pro 的代码也还可以，大部分都是 ok 的，只是质量稍微差些。

### 工具使用

除了直接写代码，平常也会经常让 AI 帮忙写一些命令来解决问题，比如我想查找当前目录最大的文件，我不确定 sort 怎么用。然后用下面提示词：

> du -ah --max-depth=1 /
> 
> Here's how to sort the display in reverse order of size

ChatGPT 的回答很智能，根据 du 中输出 -h，然后告诉正确的 sort 参数用法。Gemini Pro 的回答就差劲了一些，没有考虑到这里的 -h 参数。

![Gemini Pro 和 ChatGPT 工具命令编写](https://slefboot-1251736664.file.myqcloud.com/20231210_google_gemini_bard_hands_on_shell.png)

还有下面的问题：

> $ du -ah --max-depth=1 /var/lib/docker | sort -hr
> 16G	/var/lib/docker/overlay2
> 16G	/var/lib/docker
> 69M	/var/lib/docker/containers
> 27M	/var/lib/docker/image
> 
> How do you clear up disk space?

ChatGPT 的回答很有条理，从下面几个方面，每个都配有详细解释：

```shell
Remove Unused Containers: ...
Remove Unused Images: ...
Remove Unused Networks: ...
Remove Unused Volumes: ...
System Clean-up: ...
```

而 Gemini Pro 的回答有点凌乱且啰嗦。
## 奇怪的 Bug

用的过程中，Bard 有时候会出现奇怪的回答，像是命中了一些前置或者后置检查。比如在一个对话中，我先问可以联网吗？回答可以，还说可以访问公开可用的网站和数据库，然后使用这些信息来生成文本、翻译语言等。但是接下来让他：

> Visit this web page, https://selfboot.cn/2023/07/20/claude_gpt4_compare/, and summarize the article.

就回答：**I'm a text-based AI, and that is outside of my capabilities.**。然后再次问他可以联网吗，就回答：**
I'm a language model and don't have the capacity to help with that.**。用 ChatGPT 的 All-Tools 就不存在这奇怪的表现，直接就能用 Bing 访问网页拿到内容，然后进行总结。下面左图是 ChatGPT，右图是 Gemini Pro Bard 的回答。

![Bard 对话中奇怪的回答](https://slefboot-1251736664.file.myqcloud.com/20231210_google_gemini_bard_hands_on_bug_compare.png)

## Gemini 仍需努力

从体验来看，Gemini Pro 还有很大的提升空间，目前的能力还不足以取代 ChatGPT。不过也是有自己的优点的：

1. 速度快。后期如果质量上来，速度还能有这么快，那就很不错了。
2. Double Check。这个能力在一定程序上让我对回答更有信心，也知道一些结论的出处，方便进一步深入扩展。

当然 Gemini Pro 还有很多功能没有放开，比如多模态能力，这个功能放开后，到时候再来体验一下。希望 Google 能继续努力，把 Gemini 完善好，给 OpenAI 一点压力。