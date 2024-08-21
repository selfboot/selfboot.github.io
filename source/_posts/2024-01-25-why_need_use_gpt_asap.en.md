---
title: Why You Should Start Using AI as Soon as Possible
tags:
  - LLM
category: Artificial Intelligence
toc: true
description: This article emphasizes the necessity and value of early adoption of large language models like ChatGPT. ChatGPT is not just a toy; it greatly improves programming efficiency and can save a lot of time in manual code writing. It shares insights on ChatGPT usage from industry experts like the creator of Redis, introduces application cases of ChatGPT in education, and strongly recommends everyone to start using it as soon as possible.
date: 2024-01-25 20:51:29
---

Many years from now, when people recall 2023, they might only remember it as the year ChatGPT and various large language models were born - the first year of artificial intelligence!

![You must start using ChatGPT and other large language models as soon as possible](https://slefboot-1251736664.file.myqcloud.com/20240123_why_need_use_gpt_asap_cover.png)

<!-- more -->

Some might think ChatGPT is just a toy, but from personal experience and overall usage trends, it has become a very useful tool. Its influence hasn't diminished since its release, as you can see in my previous article [ChatGPT Penetration Analysis: Search Trends, Demand Mapping, and User Characteristics](https://selfboot.cn/2023/10/26/chatgpt_impact/). I've been using GPT since its release and have written several articles about its use, which you can find under the [ChatGPT tag](https://selfboot.cn/tags/chatgpt/).

More and more experts are sharing their insights on using it. For example, Redis creator [antirez](https://twitter.com/antirez) wrote [LLMs and Programming in the first days of 2024](http://antirez.com/news/140) at the beginning of 2024, and an NVIDIA researcher wrote [How I use ChatGPT daily (scientist/coder perspective)](https://bartwronski.com/2024/01/22/how-i-use-chatgpt-daily-scientist-coder-perspective/). In addition, ChatGPT has several applications in education, such as [Teaching CS50 with AI](https://cs.harvard.edu/malan/publications/V1fp0567-liu.pdf).

## Usage Insights

The article written by the Redis creator mentioned earlier has a translated version [LLMs and Programming in the First Days of 2024 [Translation]](https://baoyu.io/translations/llm/llms-and-programming-in-the-first-days-of-2024), which aligns closely with my current experience using GPT.

antirez uses the phrase "Stupid but All-Knowing" to describe generative AI. We all know that current AI is far from being general artificial intelligence, can only perform basic reasoning, and may include hallucinations. However, it has knowledge in many fields, is very learned, especially in computer programming. **Large language models have learned far more code than most humans, so they have strong coding abilities**, and can even write some programs they haven't seen before.

For most programmers, **programming is basically repeating the same content, not requiring high logical reasoning skills, and can be described as "code grinding"**. Some programmers with 10 years of experience may not be much different from fresh graduates. Current large language models can be said to complete most of the coding work of ordinary programmers.

In antirez's view, the goal of using ChatGPT is **not just to improve coding efficiency**, but also to save a lot of time in areas that previously required a lot of effort. For example, there's no longer a need to spend a lot of time **looking up certain professional and uninteresting documents**, learning overly complex APIs, or **manually writing** some temporary scaffold code. I deeply resonate with this; sometimes when I need to use an unfamiliar library, I just need to clearly describe the problem, and ChatGPT can provide the correct code. If GPT's knowledge base isn't up-to-date enough, I can give it the latest official documentation, and it can learn from it and provide the correct code.

However, antirez also mentions that large language models are somewhat similar to Wikipedia and various high-quality courses on YouTube, only helping those who have the willingness and ability to learn, a bit like "**the Buddha helps those who help themselves**". For those already using GPT, antirez particularly emphasizes **asking questions correctly** at the end of the article, which is a skill that needs to be improved through continuous practice.

> **Asking large language models questions correctly is a crucial skill**. The less you practice this skill, the weaker your ability to improve your work using AI. Moreover, clearly describing problems is equally important whether communicating with large language models or humans. Poor communication is a serious obstacle, and many programmers, although capable in their professional fields, are terrible at communication. Now, even Google has become less useful, so it's a good idea to use large language models as a way of compressing documents. As for me, I will continue to use them extensively. I never liked delving into the details of some obscure communication protocol or understanding complex library methods written by people who want to show off their technical skills. These are like "useless knowledge" to me. With large language models, I can avoid these troubles and feel their help every day.

Additionally, in the comments at the end of the article, antirez wrote that he wrote this article in Italian because he is more familiar with Italian and it flows more smoothly. After writing, he used GPT4 to translate it into English, which reads fluently and requires very little modification. Since translation is mentioned, I recommend [GPTs: Tech Article Translation](https://chat.openai.com/g/g-uBhKUJJTl-ke-ji-wen-zhang-fan-yi) by Baoyu, which does a great job with translation. My translated article: [How We Launched a Supply Chain Attack on PyTorch (Translation)](https://selfboot.cn/2024/01/18/supply_chain_attack_on_pytorch/) was translated using this GPTs and slightly polished.

A researcher from NVIDIA also wrote an article: [How I use ChatGPT daily (scientist/coder perspective) [Translation]](https://baoyu.io/translations/ai/how-i-use-chatgpt-daily-scientist-coder-perspective), with similar views. He uses ChatGPT to write `ffmpeg/ImageMagick` command lines, write small scripts, create regular expressions, make LaTeX charts and tables, and so on. These tasks, before the advent of ChatGPT, required a lot of time for individuals and were also very boring. Now, you can completely get rid of these boring things and spend time on more meaningful matters.

## AI Teacher for Everyone

Apart from work scenarios, ChatGPT has also played a significant role in the field of education. Soon after generative AI came out, students were already using it to "help" write essays and papers, and for a time, many universities even **banned the use of ChatGPT**. But more and more evidence suggests that **AI has the potential to improve the learning feedback process, promote critical thinking, and enhance problem-solving skills**. Harvard has long hoped to achieve a **1:1 teacher-to-student ratio** through software, so that each student could have a teaching-oriented expert assistant. It's important to note that AI plays the role of a teacher here, meaning it **needs to be able to guide students to explore solutions rather than directly giving answers**.

To achieve the above goal, Harvard actively explores the application of generative AI in education. In Harvard's CS50 course, GPT-4 is used as a teaching assistant to help students solve problems. This toolkit includes:

- "**Explain Highlighted Code**", for convenient explanation of selected code. Students can get instant code interpretation at any time, making face-to-face tutoring time more efficient. Students can focus more on discussing high-level design issues rather than getting stuck on basic question answering;
- **An enhanced version of the code style assessment tool style50**. An interactive learning tool that provides guidance like a human teacher, helping students understand and practice code syntax optimization more clearly.
- **CS50 Rubber Duck**, a chatbot that can **answer course-related questions across multiple platforms**. It interacts directly with GPT-4 in a controlled manner, utilizing GPT-4's context understanding capabilities to provide a truly interactive teaching and learning experience for students, strictly adhering to CS50's teaching principles.

Then, to evaluate the effectiveness of AI in educational scenarios, a survey was conducted on student feedback on using AI. Overall, student feedback was very positive, with high praise for the **helpfulness, effectiveness, and reliability of AI tools in solving difficult problems**:

> "It's simply incredible, like having a personal tutor... I especially appreciate the objectivity of the AI bot when answering questions, not underestimating even the simplest questions. It shows extraordinary patience."
> 
> "The AI tools have been a great help to me. They explained some concepts I wasn't clear about and taught me new knowledge needed to solve specific problems. The AI tools not only gave me enough hints to try on my own but also helped me analyze errors and potential problems."

The full Chinese version of the paper can be found in Baoyu's [Teaching Harvard CS50 Course with AI — Application of Generative Artificial Intelligence in Computer Science Education [Translation]](https://baoyu.io/translations/ai/teaching-cs50-with-ai). Whether you're already working or still a student, ChatGPT can bring significant help.

## Scarce Resources of GPT4

After the previous persuasion, you decide to use ChatGPT. But you find that the network access fails, then you find my previous article [Safe, Fast, and Cheap Access to ChatGPT, The Latest and Most Comprehensive Practical Tutorial!](https://selfboot.cn/2023/12/25/how-to-use-chatgpt/), and after some effort, you finally solve the network problem, then subscribe to Plus for $20 per month. But one day, while chatting excitedly with GPT4, you encounter the following prompt:

![Bizarre usage limit reached](https://slefboot-1251736664.file.myqcloud.com/20240123_why_need_use_gpt_asap_freq_limit.png)

Then congratulations, you've been rate-limited. Although OpenAI says there's a limit of 50 messages per 3 hours, from actual experience, this doesn't seem to be the case, and there's no public specific strategy for rate limiting here. There are also many complaints on OpenAI's forum [You've reached the current usage cap for GPT-4, please try again after 2:04 PM](https://community.openai.com/t/youve-reached-the-current-usage-cap-for-gpt-4-please-try-again-after-2-04-pm/494628), but the official response has not been specific so far. After encountering this prompt, you can only wait until the time indicated in the prompt.

If you really need more message volume, you can upgrade to Team Members, which costs $25 per person per month.

![Upgrade to team members to increase quota](https://slefboot-1251736664.file.myqcloud.com/20240123_why_need_use_gpt_asap_team_members.png)

Finally, will you be that "destined person" who will use ChatGPT early?