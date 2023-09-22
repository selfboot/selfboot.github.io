---
title: ChatGPT 文字生成图片，DALL·E 3 带来全新能力！
tags:
  - ChatGPT
  - Prompt
category: 人工智能
toc: true
description: >-
  OpenAI 最新文生图模型DALL·E 3将与ChatGPT结合，实现直观的语言导向图像生成。DALL·E
  3可精确理解文本语义，无需复杂提示词就能创作出所想场景。两者配合，可进行图像微调及连贯对话。应用场景广泛，如儿童绘本、广告设计、教育培训等。
date: 2023-09-21 12:04:30
---


近年来，随着人工智能技术的快速发展，文本生成图片（Text-to-Image）技术也取得了重大突破。目前 `Midjourney` 和 `Stable-Diffusion` 是两款最受欢迎的文生图软件。

Midjourney 通过简单的文本描述就能生成具有独特艺术风格的图像，可用于创作海报、插画等。而 Stable Diffusion 则以其精细纹理和细节而闻名，更贴近照片般的效果。尽管这两者已可根据文字创作出惊艳的视觉效果，但仍存在**可控性有限、难以处理抽象概念**等问题。此外，这两款都需要使用者了解很多精巧的 Prompt 技巧，比如指定风格，特效等。

![Midjourney, Stable Diffusion, ChatGPT&DALL·E 3](https://slefboot-1251736664.file.myqcloud.com/20230921_chatgpt_dalle3_coming_vs.png)

<!-- more -->

最近，OpenAI 宣布将在 ChatGPT 中融合最新的文生图模型 [DALL·E 3](https://openai.com/dall-e-3)，预计 10 月份上线。不过放出了一个效果视频，从视频看，真的很值得期待。先来看一下官网放出的片段吧：

![超级厉害的向日葵刺猬 super-duper sunflower hedgehog](https://slefboot-1251736664.file.myqcloud.com/20230921_chatgpt_dalle3_coming_preview.gif)

## DALL·E 3 的文本理解

玩过 Midjourney 和 Stable Diffusion 的都知道，这两个需要很专业的 Prompt 技巧才能生成想要的图片。通过直白的文字描述，可能也会生成精美的图片，但不一定是你想要的“场景”。Midjourney 有专门的[提示教程](https://docs.midjourney.com/docs/explore-prompting)来教你生成想要的图片，

![Midjourney 的专业提示词](https://slefboot-1251736664.file.myqcloud.com/20230921_chatgpt_dalle3_coming_midjourney.png)

而 DALL·E 则直接打破这点，不需要专业的提示词，只用文字描述想要的场景即可。

> DALL·E 3 is now in research preview, and will be available to ChatGPT Plus and Enterprise customers in October, via the API and in Labs later this fall.
>  
> Modern text-to-image systems have a tendency to ignore words or descriptions, forcing users to learn prompt engineering. DALL·E 3 represents a leap forward in our ability to generate images that exactly adhere to the text you provide.

官方也专门提供了一个例子：

![DALL·E 3真正理解了文本](https://slefboot-1251736664.file.myqcloud.com/20230921_chatgpt_dalle3_coming_case.png)

可以看到描述中的很多关键细节，在图片中都有不错的体现。考虑到 OpenAI 在文本理解上的绝对实力，DALL·E 3 有这个绘图能力也是可以解释的通的。

## ChatGPT 中的文生图

在 ChatGPT 中，DALL·E 3 的能力得到了原生的融合。当您提出一个创意或想法时，ChatGPT 会自动为 DALL·E 3 生成精心定制的详细提示，从而精准地将您的创意转化为视觉图像。如果生成的图像在某些方面稍有不符，您只需用简短的几句话指示，ChatGPT 就能迅速进行微调，以满足您的具体需求。

演示视频中，先是生成了一个厉害的向日葵刺猬，然后想给它起一个名字 Larry ，这里其实没有很好的生成名字。不过接着提示：

> Can you show me Larry! 's house?

于是加了一个房子，并且邮箱上有一个名字了！

![DALL·E 3: Larry! 's house](https://slefboot-1251736664.file.myqcloud.com/20230921_chatgpt_dalle3_coming_house.png)

这种能力在其他的文生图 AI 里是没有的，之前就一直想对生成的图片接着做一些修改，但是效果都很差。不止可以修改图片，ChatGPT 还可以接着聊天，让 AI 给你提供一些图片相关的灵感。比如可以接着让 ChatGPT 解释为啥 Larry 如此可爱，会知道原来 Larry 有一颗善良的心，很喜欢助人为乐。接着让它继续画图，来表现 Larry 的助人为乐，提示词：

> Awwww.. can you show me Larry being "kind hearted"?

于是来了一个能表现 Larry 友好的图片了：

![DALL·E 3: Larry! 's kind hearted](https://slefboot-1251736664.file.myqcloud.com/20230921_chatgpt_dalle3_coming_kind.png)

根据放出来的视频，这里的生成速度也是很快的，几乎是秒生成。另外，Plus 用户可以直接使用，不用额外花钱。相比 Midjourney 的订阅费，OpenAI 的 20$ 一个月可真是太划算了。

其他文生图一般只有英文效果很好，这里得益于 ChatGPT 强大的语言能力，可以用任何语言来描述想生成图片的内容，真的是太方便了。 

## 可能的应用

ChatGPT 和 DALL·E 3 强强联合后，可以用在很多地方了。我能想象到的有：

1. 制作儿童绘本：上面的例子就是一个很好的绘本材料，这一组合技术提供了一个完美的平台，用于创作富有故事情节和连贯性的儿童绘本。不仅可以生成引人入胜的故事文本，还能自动配上精美和生动的插图，让每一个故事都跃然纸上。
2. 设计广告和营销材料：企业和广告代理商可以利用这一技术来快速生成吸引人的广告图像和营销材料。只需输入相关的广告文案或概念，系统就能生成与之匹配的高质量图像。
3. 教育和培训：教师和培训师可以用它来生成教学材料，如科学图表、历史事件的可视化等，以增加课堂的互动性和趣味性。
4. 虚拟现实和游戏开发：在虚拟现实和游戏开发中，这一技术可以用于生成环境元素或角色设计。开发者只需提供简单的描述，就能得到详细和逼真的图像。

随着这种多模态技术的不断发展，一些传统的职业，如美工和设计师，可能需要重新思考他们的角色和价值了。

最后，十分期待 10 月份(2023年)能在 ChatGPT 上用到 DALL·E 3！