---
title: GPT 插件使用 AI 生成精美视频
date: 2023-06-07 22:12:33
category: 人工智能
tags: [GPT4, Plugin]  
toc: true
description: 这篇文章介绍了如何使用 GPT 插件和 Heygen AI 视频生成器，只需输入文字和图片，就能生成精美的视频。文章还详细比较了其他视频生成工具，如 Lumen5、InVideo、Animaker 和 Renderforest，以及它们的价格计划。无论你是想制作产品演示、教育视频还是个人故事，这些工具都能帮你轻松完成。随着技术的发展，这些工具的成本预期会降低，使更多的人能够使用它们。
---

想象一下，你只需要输入一段文字和一张图片，就能立即生成一段精美的视频。这听起来像科幻电影里的技术，但现在，这已经成为现实。

[Heygen](https://app.heygen.com/home) 是一个强大的 AI 视频生成器，它可以根据你的文字和图片生成视频。无论你是想制作一个产品演示，一个教育视频，还是一个个人故事，Heygen 都能帮你轻松完成。使用 Heygen，你不再需要学习复杂的视频编辑软件，也不需要花费大量的时间和金钱来制作视频。你只需要输入你的文字和图片，Heygen 就会为你做剩下的工作。

![heygen 生成视频示例](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230607_gpt4_heygen_video.png)

<!--more-->

heygen 官网的价格，每生成 2 分钟最便宜也是要 $2。不过好在提供了一个 ChatGPT 的插件，可以免费生成视频。

# heygen 插件

插件用起来还是很简单的，直接给一段话，让他生成指定角色的视频就行。比如下面的 prompt：

> 请创建一个 AI 口播视频，角色是亚洲皮肤的一个年轻女性，内容如下：
> 故事的力量：触动心灵，启迪智慧
> 在人类历史的长河中，故事是永恒的存在。它们跨越时空的鸿沟，连接过去、现在和未来，揭示出人性的深层次含义。故事是我们的教师，是我们的导师，是我们的朋友。故事有力量，可以帮我们更好地表达和沟通，可以触动心灵，启迪智慧。

目前插件有不少限制，每段视频不能太长，所以这里 GPT 直接分段生成了几个视频，并给出了每个视频的链接。

![heygen 生成视频示例](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230607_gpt4_heygen_video_2.png)

此外，插件还只能生成固定背景的视频，不能指定特定的角色或背景。其中第一段的[视频链接](https://app.heygen.com/share/a74a4731cea14631bd05469d92c07649?sid=openai-plugin)在这，大家可以感受下这个效果。

heygen 官方生成的视频，支持更高的自定义程度，包括背景等，还有字幕，这里有一个简单的视频。

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
  <iframe style="position: absolute; top:0; left: 0; width: 100%; height: 100%;" src="https://app.heygen.com/embeds/ede2ffb6805f4b7da2bde80f5440e315" title="HeyGen video player" frameborder="0" allow="encrypted-media; fullscreen;" allowfullscreen></iframe>
</div>

# 其他生成器

除了 heygen 还有一些其他的 `AI视频生成器` 可以将图片和文本生成视频，比如下面这些：

- [Lumen5](https://www.lumen5.com/): 这是一个可以将博客文章、脚本、新闻和其他形式的文本转化为视频的工具。你可以上传自己的图片，或者使用他们的库中的图片。
- [InVideo](https://invideo.io/): 这是一个在线视频制作工具，可以将文本转化为视频，它有一个大量的模板库，你可以选择一个模板，然后添加你的文本和图片。
- [Animaker](https://www.animaker.com/): 这是一个在线动画制作工具，可以将文本转化为动画视频，你可以上传自己的图片，或者使用他们的库中的图片。
- [Renderforest](https://www.renderforest.com/): 这是一个在线视频制作工具，可以将文本转化为视频，它有一个大量的模板库，你可以选择一个模板，然后添加你的文本和图片。

AI 生成视频的工具通常需要大量的计算资源和复杂的算法，这就导致了它们的成本相对较高。Lumen5，InVideo，Animaker 和 Renderforest 的价格计划对比：

| 视频生成软件 | 免费计划 | 低价计划 | 中价计划 | 高价计划 |
| --- | --- | --- | --- | --- |
| [Lumen5](https://www.lumen5.com/pricing/) | 限制较多，包括水印、480p视频质量、无法下载视频 | $29/月，720p视频质量，无水印，可下载视频 | $79/月，1080p视频质量，无水印，可下载视频，优先渲染 | $199/月，1080p视频质量，无水印，可下载视频，优先渲染，24/7优先支持 |
| [InVideo](https://invideo.io/pricing) | 限制较多，包括水印、720p视频质量、60个视频/月 | $20/月，1080p视频质量，无水印，无限制视频 | $60/月，1080p视频质量，无水印，无限制视频，优先支持 | - |
| [Animaker](https://www.animaker.com/pricing) | 限制较多，包括水印、HD视频质量、5个导出/月 | $19/月，FHD视频质量，无水印，10个导出/月 | $39/月，2K视频质量，无水印，30个导出/月 | 自定义价格，4K视频质量，无水印，无限制导出 |
| [Renderforest](https://www.renderforest.com/pricing) | 限制较多，包括水印、720p视频质量、500MB存储空间 | $14.99/月，720p视频质量，无水印，10GB存储空间 | $39.99/月，1080p视频质量，无水印，30GB存储空间 | $49.99/月，4K视频质量，无水印，50GB存储空间 |

当然，随着技术的发展，我们可以预期这些工具的成本会随着时间的推移而降低，使更多的人能够使用它们。