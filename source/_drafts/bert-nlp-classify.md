---
title: 零基础用 Bert 训练并部署文本分类模型
tags: [ChatGPT, 教程]
category: 项目实践
toc: true
description: 
---

之前帮[小盛律师](https://selfboot.cn/links.html) 做过一个工具，**定期从网上筛选一些帖子，看看是不是法律咨询类的**。这里就需要对文本进行分类，判断指定帖子正文是不是涉及到法律问题。作为一个后台开发，没接触过自然语言处理，也就之前读书的时候，了解过一些机器学习的基本原理，但是也没有实际做过分类任务。好在现在有 ChatGPT，于是就用它的 API 来做分类。

![文本分类任务：判定帖子是否是法律咨询](https://slefboot-1251736664.file.myqcloud.com/20231130_bert_nlp_classify_index.png)

<!-- more -->

用 ChatGPT 跑了一段时间，发现用 ChatGPT 用来做分类有两个问题：
1. **成本贵**。目前用的是 GPT3.5 模型，如果帖子数量多的话，每天也需要几美元。所以现在做法是先用关键词过滤，然后再拿来用 GPT3.5 模型进行分类，这样会漏掉一些没有带关键词的相关帖子。
2. **误识别**。有些帖子不是法律咨询问题，但是也会被 GPT3.5 误判。这种幻觉问题，试过改进 Prompt，还是不能完全解决。可以看我在 [真实例子告诉你 ChatGPT 是多会胡编乱造！](https://selfboot.cn/2023/08/23/not-smart-chatgpt/#%E6%88%BF%E4%B8%9C%E4%B8%8D%E9%80%80%E6%8A%BC%E9%87%91%EF%BC%9F) 里面的例子。

于是想着自己训练一个模型，用来做文本分类。自然语言处理中最著名的就是 bert 了，这里我基于 `bert-base-chinese` 训练了一个分类模型，效果还不错。本文主要记录数据集准备、模型训练、模型部署的整个过程，在 ChatGPT 的帮助下，整个过程比想象中简单很多。

## 在线体验

开始之前，先给大家体验下这里的模型。在下面输入框写一段文本，点击模型实时预测按钮，就可以看到预测结果。由于**个人服务器配置太差**，这里单个预测大概耗时在 2s 左右，同一时间只能处理 1 个请求。如果耗时太久，可以等会再试。

<div>
    <form id="predictionForm">
        <label for="content">输入文本:</label><br>
        <textarea id="content" name="content" rows="4" cols="50"></textarea><br>
        <input type="submit" value="模型实时预测">
    </form>
    <p id="result"></p>
    <script>
        document.getElementById('predictionForm').addEventListener('submit', function(e) {
            e.preventDefault();
            var content = document.getElementById('content').value;
            var resultElement = document.getElementById('result');
            resultElement.style.color = 'black'; 
            resultElement.textContent = '预测中...';
            fetch('https://api.selfboot.cn/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: content })
            })
            .then(response => response.json())
            .then(data => {
                resultElement.textContent = '这' + (data.is_lawer ? '是' : '不是') + "法律咨询问题";
                resultElement.style.color = data.is_lawer ? 'green' : 'red';
            })
            .catch((error) => {
                console.error('Error:', error);
                resultElement.textContent = '模型预测出错，麻烦重试';
            });
        });
    </script>
    <style>
    #predictionForm textarea {
        width: 100%; /* 确保文本区域宽度是100% */
        box-sizing: border-box; /* 内边距和边框包含在宽度内 */
        resize: vertical; /* 只允许垂直拉伸 */
    }
    </style>
</div>

比如下面这些就是咨询类任务：

> 我的车在小区停车位上被撞肇事车跑了，在监控里找到了，他在此事故上应该负什么责任
> 2021年11月份在武安市智慧城跟个人包工头做工，最后拖欠工资不给，请问怎么可以要回?