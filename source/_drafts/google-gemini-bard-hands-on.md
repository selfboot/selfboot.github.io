---
title: Google Gemini Pro 上手体验
tags:
  - Gemini
category: 人工智能
toc: true
description:
date: 
---

不得不说，2023 年真是科技突破的一年，年初 ChatGPT 带来太多惊艳，年末 [Google Gemini](https://deepmind.google/technologies/gemini/#introduction) 又让人充满了无限遐想。

![Google Gemini 多模态带来无限可能？](https://slefboot-1251736664.file.myqcloud.com/20231207_google_gemini_bard_hands_on_start.png)

按照 Google 官方的介绍，Gemini 是**第一个在 MMLU（大规模多任务语言理解）方面超越人类专家**的模型，在推理，数学和代码上的能力也都超过了 GPT4。而且还是一个多模态的模型，可以同时**处理文本，图像，声音和视频**，评测分数也比 GPT-4V 更高。

<!-- more -->

从 Google 发布的宣传片(下面视频需要能访问 Youtube)来看，Gemini 的表现确实让人惊艳，不过真实效果如何，还是要自己亲自试一试才知道。

<div style="position: relative; width: 100%; padding-bottom: 56.25%;">
    <iframe src="https://www.youtube.com/embed/UIZAiXYceBI?si=KjDCRPIKnAYsby5J" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></iframe>
</div>

## Gemini Pro 体验结论

Gemini 目前分三个版本：

- Ultra: 功能最强大、规模最大的模型，适用于高度复杂的任务，各项指标几乎全面超过 GPT-4。
- Pro: 用于跨各种任务进行扩展的最佳模型，目前可以体验到，评测结果来看，比 GPT-4 稍微差一点。
- Nano: 移动端任务模型，适用于移动设备，评测结果来看，比前面两个版本效果会差。

目前 [Bard 上集成的是 Gemini Pro](https://bard.google.com/updates)，截止 2023.12.07，只开放了文本提示词，其他多模态能力暂未放开。从 [Google 发布的报告](https://storage.googleapis.com/deepmind-media/gemini/gemini_1_report.pdf)来看，Gemini Pro 的能力会比 GPT-4 稍微差一点，接下来就在 bard 上真实体验一把 Gemini Pro，看看能力到底如何。

![Bard 上可以体验 Gemini Pro](https://slefboot-1251736664.file.myqcloud.com/20231207_google_gemini_bard_hands_on_bard.png)

之前我写过一篇 [大语言模型 Claude2 和 ChatGPT 实测对比](https://selfboot.cn/2023/07/20/claude_gpt4_compare/)，本文继续使用类似的测试方法，对比一下 Gemini Pro 和 ChatGPT 4 的表现。先来说结论吧，如下表：

| 功能 | ChatGPT 4 | Bard(Gemini Pro) |
|-- | -- | -- |
| 使用限制 | 地区限制，IP 风控，支付风控 | 地区限制 | 
| 费用 | 付费 | 免费 |
| 幻觉 | 很少出现 | todo| 
| 速度 | 很慢，不过最新的 GPT4-tubro 快了不少 | 速度很快 |
| 联网能力 | All-Tools 可以联网 | 无法联网 ｜ 
| 语言能力 | 很强 | 比 GPT4 差|
| 数学问题 | 一般 | 比 GPT-4 差 |
| 编程能力 | 4 很强 | 比 GPT-4 差|
| Bug | 很少遇见，对话太长有时候会 | 很容易触发，问答明显异常 | 

个人感觉，Gemini Pro 的能力和 ChatGPT 比还有比较大的差距，甚至还不如 Claude2，短时间我还不会用 Gemini Pro 替代 ChatGPT。Gemini Ultra 应该会好一些，不过暂时还没地方体验到，说不定到时候 GPT-5 先出来，Gemini Ultra 可能又落后了。

## 语言能力

### 阅读理解


### 文本生成

### 

## 数学问题

## 编程能力

## 幻觉

## 奇怪的 Bug ？

用的过程中，Bard 有时候会出现奇怪的回答，像是命中了一些前置或者后置检查。比如在一个对话中，我先问可以联网吗？回答可以，还说可以访问公开可用的网站和数据库，然后使用这些信息来生成文本、翻译语言等。但是接下来让他：

> 访问这个网页，https://selfboot.cn/2023/07/20/claude_gpt4_compare/ ，并总结文章内容。

就回答：**我的设计用途只是处理和生成文本，所以没法在这方面帮到你**。然后再次问他可以联网吗，就回答：**我没法提供这方面的帮助，因为我只是一个语言模型**。用 ChatGPT 的 All-Tools 就不存在这奇怪的表现，直接就能用 Bing 访问网页拿到内容，然后进行总结。下面左图是 ChatGPT，右图是 Gemini Pro Bard 的回答。

![Bard 对话中奇怪的回答](https://slefboot-1251736664.file.myqcloud.com/20231207_google_gemini_bard_hands_on_bug_compare.png)