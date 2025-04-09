---
title: LLM 中的 Tokenizer 分词原理和实践
tags: [LLM]
category: 人工智能
toc: true
description: 
---



<!-- more -->

## 什么是 tokenization


词（word）：自然语言中的词，比如"triangle"。
子词（subword）：子词，比如"tri"、"angle"。
词元（token）：根据不同的tokenize encode而来。
字符（character）: 自然语言字符串中的每个字符。


虽然这是将文本拆分成较小块的最直观方法，但这种标记化方法可能会导致大量文本语料库出现问题。在这种情况下，空格和标点符号标记化通常会生成非常大的词汇表（使用的所有唯一单词和标记的集合）。例如， Transformer XL使用空格和标点符号标记化，词汇表大小为 267,735！

如此大的词汇量迫使模型必须有一个巨大的嵌入矩阵作为输入和输出层，这会导致内存和时间复杂度的增加。一般来说，Transformers 模型的词汇量很少超过 50,000，尤其是如果它们只针对单一语言进行预训练的话。

Transformers 模型使用一种介于单词级和字符级标记化之间的混合方法，称为子词 标记化。

子词标记化算法依赖于以下原则：频繁使用的单词不应拆分成较小的子词，但罕见单词应分解成有意义的子词。例如， "annoyingly"可能被视为罕见词，可以分解为"annoying"和"ly" 。

标记化可以帮助模型处理不同的语言、词汇和格式，并降低计算和内存成本。标记化还可以通过影响标记的含义和上下文来影响生成文本的质量和多样性。标记化可以使用不同的方法完成，例如基于规则、统计或神经，具体取决于文本的复杂性和多变性。

一个有用的经验法则是，一个标记通常对应于常见英语文本的 ~4 个字符。这大约相当于一个单词的 ¾ （因此 100 个标记 ~= 75 个单词）。

## 参考文献

[The Technical User's Introduction to LLM Tokenization](https://christophergs.com/blog/understanding-llm-tokenization)  
[Understanding “tokens” and tokenization in large language models](https://blog.devgenius.io/understanding-tokens-and-tokenization-in-large-language-models-1058cd24b944)  
