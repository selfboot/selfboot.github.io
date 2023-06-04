title: 为什么离不开 Stackoverflow
date: 2016-06-26 22:02:50
category: 工具介绍
tags: [方法, Python, C++]
toc: true
description: 这篇文章深入探讨了为什么程序员离不开Stackoverflow。我们详细介绍了Stackoverflow的价值，包括提问的智慧，不同的解决方案，工具的使用，思考的过程，以及可能的认知盲区。无论你是编程新手，还是经验丰富的开发者，这篇文章都能帮你更好地利用Stackoverflow，提升你的编程技能和解决问题的能力。
---

作为一名程序员，如果没有听过 Stackoverflow，那么你最好去面壁思过一下。程序员最需要阅读的一本编程书籍（其实编程书留下这本就够了！）：

![虚构的书][1]

那些还没有读过这本书的程序员，是时候买一本了。如果还在犹豫，那么先看下这篇文章，看看为什么离不开 stackoverflow。

<!--more -->

# 提问的智慧

> 当你拋出一个技术问题时，最终是否能得到有用的回答，往往取决于你所提问和追问的方式。 --Eric S. Raymond

有时候，清晰描述一个问题，特别是技术问题没有想象的那么简单。提问从来就是一门学问，可惜很多人没有意识到这一点，或者没有给予足够的重视。或者，有的提问者根本不是抱着提问的态度来请求大家的帮助。所以我们会发现各种让人无法解答或者无心解答的问题：

* [java正则表达式问题？](https://segmentfault.com/q/1010000005694368)
* [sla响应时间是指什么？](https://segmentfault.com/q/1010000005695451)
* [ATL类与一般的类继承有什么区别](https://segmentfault.com/q/1010000005694256)

为了避免上面的问题被关闭或者修改，放一张图片在这里，来体会下这种狗屎问题：

![不好的问题][2]

去 segmentfault 的未回答题目中随便就能找到一堆这样的问题，所以很多人显然并没有提问的智慧或者没有很好的态度。Raymond 和 Rick Moen 写了一份经典的文章 [How To Ask Questions The Smart Way](http://www.catb.org/~esr/faqs/smart-questions.html#translations)专门来描述如何提问，这篇文章被翻译成各国文字，留传很广，可以在[这里](https://github.com/ryanhanwu/How-To-Ask-Questions-The-Smart-Way/blob/master/README-zh_CN.md)找到中文版。Stackoverflow 和 Segmentfalut 也给出了关于提问的建议：

* [Help Center > Asking](https://stackoverflow.com/help/asking)
* [How to Ask](https://stackoverflow.com/questions/ask/advice)
* [How do I ask a good question?](https://stackoverflow.com/help/how-to-ask)
* [什么样的问题才是受欢迎的](https://segmentfault.com/faq#what-should-ask)

在 Stackoverflow 可以看到太多经典的问题，我们可以从这些问题中学习如何去提问，如何和答题者沟通。当你看习惯了stackoverflow 上面的问题，提问时就会不自觉去模仿，从而避免问出无脑问题。下面是提问时最需要注意的几个问题：

* 问搜索引擎没有满意答案（google 起码过四页）的问题
* 问那些自己无法独立解决，已经做过很多尝试的问题
* 尽量清楚地描述问题：良好的排版，代码，错误提示，图片等
* 让你的问题对别人有帮助
* 问题要有确定的答案，不要有太多的主观性

# 不同的方案

很多时候我们希望能够找到一个解决办法，但是在 stackoverflow 上，经常会有意外的收获。你可能会看到对一个问题不同的解决方案，甚至包括对这些解决方案的比较。

假设现在你想知道 python 中如何调用外部命令，比如 ls -l 来打印某个目录下面的文章。Google一下 `python call system command`，第一条就是stackoverflow 上面的一个相关问题：[Calling an external command in Python.](http://stackoverflow.com/questions/89228/calling-an-external-command-in-python) （google技术问题，基本都会显示 stackoverflow 相关问题）。

然后在这个问题下面，有人总结了调用外部命令的几种方法：

* os.system()
* os.popen()
* subprocess.popen()
* subprocess.call()
* subprocess.run()

并且还对每个方法做了介绍，你可以选择适合自己应用场景的方法。再比如这个问题 [How to check whether a file exists using Python?](http://stackoverflow.com/questions/82831/how-to-check-whether-a-file-exists-using-python)，介绍了 python 中检查文件是否存在的不同方法。

# 工具的使用

有许多强有力的工具可以帮我们更好地研究问题，你可能知道gdb调试工具，可能知道python的timeit时间监控模块，但是你不知道那些自己不知道的工具。很多时候，当第一次知道某个工具时，我们心中会产生相见恨晚的感觉。然而，心仪的趁手工具总是那么可遇不可求。

在 stackoverflow，每一个问题答案或者评论中都可能会有一些好的工具，你总有机会发现那些遗落在字里行间的优秀工具。

下面列出我发现的一些不错的工具：

* `truss/strace`：跟踪进程执行时的系统调用和所接收的信号，strace可以跟踪到一个进程产生的系统调用，包括参数，返回值，执行消耗的时间。（来自问题：[Why is reading lines from stdin much slower in C++ than Python?](https://stackoverflow.com/questions/9371238/why-is-reading-lines-from-stdin-much-slower-in-c-than-python)）
* [vprof](https://github.com/nvdv/vprof)：一个可视化工具，可以分析 Python 程序的特点，比如运行时间，内存使用等。（来自问题：[How can you profile a Python script?](https://stackoverflow.com/questions/582336/how-can-you-profile-a-python-script)）
* [Regex 101](http://www.regex101.com/)：一款在线的正则表达式辅助工具，可以帮助理解正则表达式的含义，方便调试正则表达式以及做一些简单的尝试。（来自问题：[Learning Regular Expressions](http://stackoverflow.com/questions/4736/learning-regular-expressions)）

下面为 Regex 101 的一个简单示例：

![Regex 101][3]

# 思考的过程

很多时候，遇到一个问题，我们根本无从下手，不知道朝哪个方向思考。但是通过 stackoverflow，我们可以轻易知道具体的解决方案，有时候甚至还能知道别人面对这个问题时候是怎么思考的。

假设你想利用装饰器来完成一个任务，即在下面say函数返回的字符串前后加上`<b><i>`，你想想这样定义 say。

```python
@makebold
@makeitalic
def say():
    return "Hello"
```

每次调用 say 返回 `<b><i>Hello</i></b>`。但是要如何实现 makebold 和 makeitalic 呢，这是一个[问题](https://stackoverflow.com/questions/739654/how-can-i-make-a-chain-of-function-decorators-in-python)。在 stackoverflow 上，有大牛会直接告诉你答案，并扔给你一个装饰器的文档链接。但是还有大牛会把自己的思考过程，把自己对装饰器的理解详细地告诉你，让你深入去理解装饰器机制。

针对上面的这个问题，有一个答案获得了 3000 多赞，一步步告诉大家如何解决问题。首先告诉我们python中函数有什么特点：

* 函数是对象
* 函数可以被赋给一个变量
* 函数可以被定义在另一个函数中
* 一个函数可以返回另一个函数
* 可以把函数作为参数传递

然后开始解释什么是装饰器：其实就是封装器，可以让我们在不修改原函数的基础上，在执行原函数的前后执行别的代码。接下来手工实现了一个简单的装饰器原型，紧接着引入 python 中的装饰器语法。最后还列出了一些装饰器的高级用法，包括给装饰器传递参数等。读完整个答案，一定能对装饰器有较深的理解，并且知道理解装饰器的思考过程。这样，沿着这条思考的路径，你自己就可以推导出装饰器的使用方法。

# 可能的盲区

没有问题要提问时也可以时常逛一逛 stackoverflow，浏览一些投票比较多的问题，看看别人的回答。在这个庞大的知识库中，你很可能会发现自己的一些认知盲区，发现一些自己从未关注过的内容。

我就发现了一些比较有意思的问题，比如：

* [Print in terminal with colors using Python?](http://stackoverflow.com/questions/287871/print-in-terminal-with-colors-using-python)
* [What is a metaclass in Python?](http://stackoverflow.com/questions/100003/what-is-a-metaclass-in-python)
* [What is your most productive shortcut with Vim?](http://stackoverflow.com/questions/1218390/what-is-your-most-productive-shortcut-with-vim)

我整理了一份 Python 的高质量问题清单，放在[这里](https://github.com/xuelangZF/CS_Offer/blob/master/More/Python_StackOverflow.md)以供时常翻阅。

# 相见恨晚

那么怎么才能找到 stackoverflow 呢，两个建议：

* 英语精确描述问题
* 用 Google 去搜索

只要你不是第一个遇见某个技术问题的人，你基本就会在 stackoverflow 找到相同或者类似的问题。早日遇见，早日喜欢上 stackoverflow，你会发现生活是如此惬意。

# 更多阅读

[玩转 Stack Overflow 之提问篇](http://blog.jobbole.com/101980/)
[7 Strace Examples to Debug the Execution of a Program in Linux](http://www.thegeekstuff.com/2011/11/strace-examples/)
[How can I make a chain of function decorators in Python?](https://stackoverflow.com/questions/739654/how-can-i-make-a-chain-of-function-decorators-in-python)



[1]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160626_stackoverflow_book.jpg
[2]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160626_shit_questions.png
[3]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160626_regex101.png

