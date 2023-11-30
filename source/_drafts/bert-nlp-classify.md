---
title: 零基础用 Bert 开发文本分类模型
tags: [ChatGPT, 教程]
category: 项目实践
toc: true
description: 
---

之前帮[小盛律师](https://selfboot.cn/links.html) 做过一个工具，定期从网上筛选一些帖子，看看是不是法律咨询类的。这里就需要对文本进行分类，判断指定帖子正文是不是涉及到法律问题。作为一个后台开发，没接触过自然语言处理，也就之前读书的时候，了解过一些机器学习的基本原理。好在现在有 ChatGPT，就用它的 API 来进行分类。

![文本分类任务：判定帖子是否是法律咨询](https://slefboot-1251736664.file.myqcloud.com/20231130_bert_nlp_classify_index.png)

<!-- more -->

跑了一段时间，发现用 ChatGPT 的大语言模型有两个问题：
1. **成本贵**。目前用的是 GPT3.5 模型，如果帖子数量多的话，每天也需要几美元。所以现在做法是先用关键词过滤，然后再拿来用 GPT3.5 模型进行分类，这样会漏掉一些没有带关键词的相关帖子。
2. **误识别**。有些帖子不是法律咨询问题，但是也会被 GPT3.5 误判。这种幻觉问题，试过改进 Prompt，还是不能完全解决。

## 在线体验

模型部署在一台个人的服务器上，可以用下面输入框来体验。输入一段文本，点击提交，就可以看到预测结果。

<div>
    <h2>法律咨询分类器</h2>
    <form id="predictionForm">
        <label for="content">输入文本:</label><br>
        <textarea id="content" name="content" rows="4" cols="50"></textarea><br>
        <input type="submit" value="提交">
    </form>
    <p id="result"></p>
    <script>
        document.getElementById('predictionForm').addEventListener('submit', function(e) {
            e.preventDefault();
            var content = document.getElementById('content').value;
            fetch('http://localhost:5000/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: content })
            })
            .then(response => response.json())
            .then(data => {
                document.getElementById('result').textContent = '法律咨询: ' + (data.lawer ? '是' : '否') + ', 概率: ' + data.probability;
            })
            .catch((error) => {
                console.error('Error:', error);
                document.getElementById('result').textContent = '发生错误';
            });
        });
    </script>
</div>

比如下面这些就是咨询类任务：

> 我的车在小区停车位上被撞肇事车跑了，在监控里找到了，他在此事故上应该负什么责任
> 2021年11月份在武安市智慧城跟个人包工头做工，最后拖欠工资不给，请问怎么可以要回?