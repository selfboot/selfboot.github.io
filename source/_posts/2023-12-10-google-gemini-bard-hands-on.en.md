---
title: Gemini Pro vs GPT-4, A Comprehensive Comparison Through Real-World Examples
tags:
  - Gemini
  - Google
  - ChatGPT
category: Artificial Intelligence
toc: true
description: This article provides an in-depth experience of Google's latest language model, Gemini Pro, by comparing it with ChatGPT. It comprehensively evaluates the gap between Gemini Pro and GPT-4 across multiple dimensions, including language understanding, text generation, and programming capabilities. The findings suggest that Gemini Pro's overall performance falls short of ChatGPT, with gaps in language comprehension, mathematics, programming abilities, and incomplete web search capabilities, indicating it still has some distance to go before replacing GPT-4.
date: 2023-12-10 21:48:19
lang: en
---

It's undeniable that 2023 has been a year of technological breakthroughs. The beginning of the year brought us the astounding ChatGPT, and as we approach the end, [Google Gemini](https://deepmind.google/technologies/gemini/#introduction) has sparked our imagination once again.

![Does Google Gemini's multimodal capability bring endless possibilities?](https://slefboot-1251736664.file.myqcloud.com/20231207_google_gemini_bard_hands_on_start.png)

According to Google's official introduction, Gemini is **the first model to surpass human experts in MMLU (Massive Multitask Language Understanding)**. Its capabilities in reasoning, mathematics, and coding also surpass those of GPT-4. Moreover, it's a multimodal model that can **simultaneously process text, images, sound, and video**, with evaluation scores higher than GPT-4V.

<!-- more -->

Judging from Google's promotional video (the video below requires access to Youtube), Gemini's performance is indeed impressive. A few days after its release, many people have voiced doubts about Gemini, as the released video was edited. To truly understand Gemini's real-world performance, we need to try it ourselves. Currently, Google has only made Gemini Pro available for public use. In this article, we'll use Bard to get a sense of what Gemini Pro is really like.

<div style="position: relative; width: 100%; padding-bottom: 56.25%;">
    <iframe src="https://www.youtube.com/embed/UIZAiXYceBI?si=KjDCRPIKnAYsby5J" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></iframe>
</div>

## Experience Conclusion

Gemini currently comes in three versions:

- Ultra: The most powerful and largest model, suitable for highly complex tasks. It outperforms GPT-4 in almost all metrics. The promotional video above features the Ultra model.
- Pro: The best model for scaling across various tasks. It's currently available for experience, and evaluation results show it's slightly inferior to GPT-4.
- Nano: A mobile task model suitable for mobile devices. Evaluation results show it performs worse than the previous two versions.

Currently, [Bard has integrated Gemini Pro](https://bard.google.com/updates). As of 2023.12.07, only text prompts have been made available, with other multimodal capabilities yet to be released. According to [Google's published report](https://storage.googleapis.com/deepmind-media/gemini/gemini_1_report.pdf), Gemini Pro's capabilities are slightly inferior to GPT-4. Next, we'll have a real experience with Gemini Pro on Bard to see how it truly performs. As of 12.10, only English can be used to experience Gemini Pro on Bard. For more details, refer to Google's help document [Where Bard with Gemini Pro is available](https://support.google.com/bard/answer/14294096).

![Experience Gemini Pro on Bard](https://slefboot-1251736664.file.myqcloud.com/20231207_google_gemini_bard_hands_on_bard.png)

I previously wrote an article [Practical Comparison between Large Language Models Claude2 and ChatGPT](https://selfboot.cn/2023/07/20/claude_gpt4_compare/). In this article, we'll continue to use similar testing methods to compare the performance of Gemini Pro and ChatGPT 4. Let's start with the conclusion, as shown in the table below:

| Feature | ChatGPT 4 | Bard(Gemini Pro) |
|-- | -- | -- |
| Usage Restrictions | Regional restrictions, IP risk control, payment risk control | Regional restrictions | 
| Cost | Paid | Free |
| Speed | Very slow, though the latest GPT4-turbo is much faster | Very fast |
| Internet Connectivity | All-Tools can connect to the internet | Somewhat confusing, incomplete internet connectivity |
| Language Ability | Very strong | Inferior to GPT4, Chinese ability not as strong as GPT4 |
| Mathematical Problems | Average | Inferior to GPT-4 |
| Programming Ability | Very strong | Inferior to GPT-4 |
| Bugs | Rarely encountered, sometimes occurs with long conversations | Easier to trigger, with noticeable anomalies in Q&A |

Personally, I feel that Gemini Pro's capabilities still have a considerable gap compared to ChatGPT, and it's even inferior to Claude2. In the short term, I won't be replacing ChatGPT with Gemini Pro. Gemini Ultra should be better, but there's currently no way to experience it. Who knows, GPT-5 might come out first, potentially leaving Gemini Ultra behind again.

## Language Ability

Next, let's use English prompts to see how Gemini Pro's language abilities really stack up.

### Reading Comprehension

First, let's look at reading comprehension ability. I've selected a few well-known English proverbs to see if Gemini Pro understands them correctly. The prompt is as follows:

> I have a few phrases, can you explain them to me one by one?
> 
> 1. A stitch in time saves nine.
> 2. The early bird catches the worm.
> 3. You can't judge a book by its cover.
> 4. When in Rome, do as the Romans do.
> 5. All that glitters is not gold.

Here are the responses from Gemini Pro and ChatGPT:

![Gemini Pro and ChatGPT's understanding of common phrases](https://slefboot-1251736664.file.myqcloud.com/20231210_google_gemini_bard_hands_on_explain.png)

Gemini Pro's explanations are more comprehensive, explaining both the literal meaning of the proverbs and their figurative meanings. Gemini Pro is also very fast, which is something ChatGPT can't match. These proverbs are quite common, and their meanings are quite definite. Next, I found some ambiguous sentences to see how the two models interpret them. The sentence "I saw the man with the telescope." can be understood in two ways, as follows:

1. It can be understood as "I used a telescope to see the man", where "telescope" is the tool I used to see the person.
2. It can also be understood as "I saw a man who had a telescope", meaning the man possessed or was holding a telescope.

Below are the explanations from Gemini Pro and ChatGPT:

![Gemini Pro and ChatGPT's understanding of ambiguous content](https://slefboot-1251736664.file.myqcloud.com/20231210_google_gemini_bard_hands_on_ambiguous.png)

Basically, they both start by saying the sentence is ambiguous, then give two interpretations, and explain that without context, it's impossible to determine which specific meaning is intended. Gemini Pro goes on to provide some follow-up questions that could be used to clarify the meaning of this sentence. I tried some other ambiguous content as well, and overall, ChatGPT's explanations tend to be more to the point, while Gemini Pro tends to be a bit wordier, sometimes prone to digression, and its understanding is slightly inferior.

| Sentence | Interpretation 1 | Interpretation 2 | Model Comparison |
| -- |-- |-- |-- |
| The chicken is ready to eat. | The chicken has been cooked and is ready to be eaten | The chicken is prepared to eat something | Both models perform similarly |
| Visiting relatives can be annoying. | Going to visit relatives can be annoying | Some visiting relatives can be annoying | ChatGPT wins decisively, Gemini Pro is wordy and its explanation is not very clear |
| He saw that gas can explode. | He knew that gas can explode | He saw that gas can (container) which can explode | ChatGPT wins decisively, Gemini Pro misunderstands |
| They're hunting dogs. | They are hunting for dogs | Those are dogs used for hunting | ChatGPT wins decisively, Gemini Pro misunderstands |

Overall, for simple content, Gemini Pro and ChatGPT perform similarly. When encountering ambiguous content, ChatGPT performs consistently well with good understanding, while Gemini Pro sometimes fails to understand and becomes very verbose in its responses.

### Text Generation

Next, let's look at text generation capabilities. We know that even for the currently most powerful GPT4, it can't write novels with consistent style, common-sense plot, and coherence. Here, we'll find some simple text generation tasks to see how Gemini Pro performs. The initial prompt is as follows:

> You're a biographer, help me write a piece of Musk's life.

The idea is to have AI play the role of a biographer and write about Elon Musk's life. Gemini Pro will ask follow-up questions, asking for more details, such as which part to focus on, while ChatGPT writes a very good introduction covering key points like birth, education, entrepreneurial and investment experiences, SpaceX and Mars dreams, Tesla, etc. Then I modified the prompt:

> Do you know Elon Musk, the CEO of Tesla? Help me write a description of Musk's life.

Here are the outputs from the two models:

![Gemini Pro and ChatGPT generate Musk's biography](https://slefboot-1251736664.file.myqcloud.com/20231210_google_gemini_bard_hands_on_write.png)

Personally, I feel that the text provided by ChatGPT is clearer and more focused. However, Gemini Pro has a quite powerful feature: at the bottom of the answer, there's a "Double-check response" option, which categorizes the answer into three scenarios:

1. No highlighting: There's not enough information to evaluate these answers, or they don't intend to convey factual information. Currently, Bard doesn't check content in tables and code.
2. Highlighted in green: Google search engine has found similar content and provides web page links. Note that Google doesn't necessarily use this content to generate the response.
3. Highlighted in yellow: The content found by Google search engine may be different from the answer, in which case links are provided. Another situation is when no relevant content is found.

For current generative AI, Double Check is still very necessary. Previously, when using ChatGPT, we had to manually search for confirmation. The current `Double-check response` provided by Google will be very helpful in many scenarios.

## Mathematical Problems

For current generative AI, mathematical problems are a challenge. Compared to humans, AI is still at an elementary school level in the field of mathematics. Let's test Gemini Pro with the classic chicken and rabbit problem. The prompt is as follows:

> Suppose you have a cage that contains chickens and rabbits. You can hear the animals but cannot see them. You know the following:
> 
> There are a total of 35 heads (since both chickens and rabbits each have one head).
> There are a total of 94 legs (chickens have 2 legs each, and rabbits have 4 legs each).
> The question is: How many chickens and how many rabbits are in the cage?

Both Gemini Pro and ChatGPT answered correctly, as shown in the image below:

![Gemini Pro and ChatGPT answer the chicken and rabbit problem](https://slefboot-1251736664.file.myqcloud.com/20231210_google_gemini_bard_hands_on_math_cage.png)

Since ChatGPT got All-Tools, it generally uses Python code in a virtual environment for parts involving calculations. Gemini Pro currently doesn't have a calculation environment, but it also gave the correct answer here.

## Programming Ability

As a programmer, what I use AI for most often is to help write code. Let's see how Gemini Pro's programming ability fares. I've previously tried using ChatGPT to solve LeetCode problems, including one article: [ChatGPT Solves LeetCode Problems: Bit Operations](https://selfboot.cn/2023/06/08/gpt4_leetcode_1318/). Let's use this problem to test Gemini Pro.

![Gemini Pro solves programming problems](https://slefboot-1251736664.file.myqcloud.com/20231210_google_gemini_bard_hands_on_code.png)

Bard gives 3 answers for each question simultaneously. The answer in Draft A is incorrect. I looked at Draft B, and the code is correct and includes comments. However, compared to ChatGPT's answer, it's more complex and harder to understand, and the explanation isn't as clear as ChatGPT's.

```cpp
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

I also tried some other code problems, such as:

- How do I convert UTC time to Beijing time zone in Python, show me the code.

In terms of code quality, ChatGPT's is much better and includes some explanations, giving a sense of intelligence. Gemini Pro's code is also acceptable, mostly okay, just slightly lower in quality.

### Tool Usage

Besides directly writing code, we often ask AI to help write some commands to solve problems. For example, I want to find the largest file in the current directory, but I'm not sure how to use sort. So I use the following prompt:

> du -ah --max-depth=1 /
> 
> Here's how to sort the display in reverse order of size

ChatGPT's response is intelligent, recognizing the -h output in du, and then explaining the correct usage of sort parameters. Gemini Pro's answer is somewhat inferior, not considering the -h parameter here.

![Gemini Pro and ChatGPT writing tool commands](https://slefboot-1251736664.file.myqcloud.com/20231210_google_gemini_bard_hands_on_shell.png)

And another question:

> $ du -ah --max-depth=1 /var/lib/docker | sort -hr
> 16G	/var/lib/docker/overlay2
> 16G	/var/lib/docker
> 69M	/var/lib/docker/containers
> 27M	/var/lib/docker/image
> 
> How do you clear up disk space?

ChatGPT's answer is well-organized, covering several aspects, each with detailed explanations:

```shell
Remove Unused Containers: ...
Remove Unused Images: ...
Remove Unused Networks: ...
Remove Unused Volumes: ...
System Clean-up: ...
```

While Gemini Pro's answer is a bit disorganized and verbose.

## Strange Bugs

During use, Bard sometimes gives strange answers, as if it has hit some pre- or post-checks. For example, in one conversation, I first asked if it could connect to the internet. It answered yes, saying it could access publicly available websites and databases, and use this information to generate text, translate languages, etc. But then when I asked it to:

> Visit this web page, https://selfboot.cn/2023/07/20/claude_gpt4_compare/, and summarize the article.

It replied: **I'm a text-based AI, and that is outside of my capabilities.** Then when I asked again if it could connect to the internet, it answered: **I'm a language model and don't have the capacity to help with that.** This strange behavior doesn't exist with ChatGPT's All-Tools, which can directly use Bing to access web pages, retrieve content, and then summarize it. The image on the left below is ChatGPT, and the image on the right is Gemini Pro Bard's response.

![Strange responses in Bard conversation](https://slefboot-1251736664.file.myqcloud.com/20231210_google_gemini_bard_hands_on_bug_compare.png)

## Gemini Still Needs Improvement

From the experience, Gemini Pro still has a lot of room for improvement, and its current capabilities are not enough to replace ChatGPT. However, it does have its own advantages:

1. Fast speed. If the quality improves later and it can maintain this speed, that would be very good.
2. Double Check. This capability gives me more confidence in the answers to a certain extent, and I also know the sources of some conclusions, which is convenient for further in-depth expansion.

Of course, many features of Gemini Pro have not yet been released, such as multimodal capabilities. We'll experience these features again when they're released. Hopefully, Google will continue to work hard to improve Gemini and put some pressure on OpenAI.