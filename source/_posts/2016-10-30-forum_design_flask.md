title: 从零开始搭建论坛（三）：Flask框架简单介绍
date: 2016-10-30 22:02:50
category: 项目实践
tags: [Flask, Python]
toc: true
description: 探索如何使用Flask设计论坛的全过程。这篇文章详细介绍了从零开始搭建论坛的步骤，包括数据库设计、用户管理、帖子发布等关键功能的实现。适合对Flask和Web开发感兴趣的读者。
---

前面两篇文章中我们已经了解 Web(HTTP)服务器，Web应用程序，Web框架，WSGI这些 Python Web 开发中的概念。我们知道，Web框架通过将不同Web应用程序中的共性部分给抽象出来，提供一系列通用的接口，从而避免开发者做重复性工作，让其将精力放在业务相关的实现。

接下来一起来看一个具体的 Web 框架，这里选择 Flask，因为它是一个年轻充满活力的微框架，有着众多的拥护者，文档齐全，社区活跃度高。我们的[论坛项目](https://github.com/xuelangZF/NaHan) 就使用了该框架。

![][1]

<!--more-->

# Flask 框架

为了理解 Flask 框架是如何抽象出Web开发中的共同部分，我们先来看看Web应用程序的一般流程。对于Web应用来说，当客户端想要获取**动态资源**时，就会发起一个HTTP请求（比如用浏览器访问一个 URL），Web应用程序会在后台进行相应的业务处理，（从数据库或者进行一些计算操作等）取出用户需要的数据，生成相应的HTTP响应（当然，如果访问静态资源，则直接返回资源即可，不需要进行业务处理）。整个处理过程如下图所示：

![][2]

实际应用中，**不同的请求可能会调用相同的处理逻辑**。这里有着相同业务处理逻辑的 HTTP 请求可以用一类 URL 来标识。比如论坛站点中，对于所有的获取Topic内容的请求而言，可以用 `topic/<topic_id>/` 这类URL来表示，这里的 topic_id 用以区分不同的topic。接着在后台定义一个 `get_topic(topic_id)` 的函数，用来获取topic相应的数据，此外还需要建立URL和函数之间的一一对应关系。这就是Web开发中所谓的**路由分发**，如下图所示：

![][3]

Flask底层使用[werkzeug](https://github.com/pallets/werkzeug)来做路由分发，代码写起来十分简单，如下：

```python
@app.route('/topic/<int:topic_id>/')
def get_topic(topic_id):
    # Do some cal or read from database
    # Get the data we need.
```

通过业务逻辑函数拿到数据后，接下来需要根据这些数据生成HTTP响应（对于Web应用来说，HTTP响应一般是一个HTML文件）。Web开发中的一般做法是提供一个HTML模板文件，然后将数据传入模板，经过渲染后得到最终需要的HTML响应文件。

一种比较常见的场景是，**请求虽然不同，但响应中数据的展示方式是相同的**。仍以论坛为例，对不同topic而言，其具体topic content虽然不同，但页面展示的方式是一样的，都有标题拦，内容栏等。也就是说，对于 topic 来说，我们只需提供一个HTML模板，然后传入不同topic数据，即得到不同的HTTP响应。这就是所谓的**模板渲染**，如下图所示：

![][4]

Flask 使用 [Jinja2](https://github.com/pallets/jinja) 模板渲染引擎来做模板渲染，代码如下：

```python
@app.route('/topic/<int:topic_id>/')
def get_topic(topic_id):
    # Do some cal or read from database
    # Get the data we need.
    return render_template('path/to/template.html', data_needed)
```

总结一下，Flask处理一个请求的流程就是，首先根据 URL 决定由那个函数来处理，然后在函数中进行操作，取得所需的数据。再将数据传给相应的模板文件中，由Jinja2 负责渲染得到 HTTP 响应内容，然后由Flask返回响应内容。

# Flask 入门

关于 Flask 框架的学习，不建议直接读[官网文档](http://flask.pocoo.org/docs/0.11/)，虽然这是一手的权威资料，但并不适合初学者入手。这里推荐几个学习资料，可以帮助新手很快的入门：

汇智网[flask框架](http://www.hubwiz.com/course/562427361bc20c980538e26f/)教程：一个非常适合入门的精简教程，主要分为七部分：

* 快速入门
* 路由：URL 规则与视图函数
* 请求、应答与会话
* 上下文对象：Flask 核心机制
* 模版：分离数据与视图
* 访问数据库：SQLAlchemy简介
* 蓝图：Flask应用组件化

教程简练地总结了 Flask 最核心的内容，并且还提供了一个简单的在线练习环境，方便一边学习理论一边动手实践。

此外，麦子学院也有一个 [Flask入门](http://www.maiziedu.com/course/313/) 视频教程，一共8小时的视频教程，涵盖flask web 开发的方方面面，包括环境的搭建，flask 语法介绍，项目结构的组织，flask 全球化，单元测试等内容。视频作者有 17 年软件开发经验，曾任微软深圳技术经理及多家海外机构担任技术顾问，够牛！视频讲的也确实不错。

如果上面两个不能满足你，那么还可以看 [Flask Web开发：基于Python的Web应用开发实战](https://book.douban.com/subject/26274202/) 这本有着 8.6 评分的书，相信没看完就跃跃欲试想写点什么了。这么优秀的框架，Github 上当然也有 [awesome-flask](https://github.com/humiaozuzu/awesome-flask)了，想深入学习flask的话，这里不失为一个好的资源帖。

本篇大概谈了下 Flask 的路由分发和模版渲染，下篇我们会继续讲Flask使用中的一些问题。

# 更多阅读

[What is the purpose of Flask's context stacks?](http://stackoverflow.com/questions/20036520/what-is-the-purpose-of-flasks-context-stacks)
[Flask 的 Context 机制](https://blog.tonyseek.com/post/the-context-mechanism-of-flask/)
[Flask、Django、Pyramid三个框架的对比](http://python.jobbole.com/81396/)

[1]: https://slefboot-1251736664.file.myqcloud.com/20161030_forum_design_flask_1.png
[2]: https://slefboot-1251736664.file.myqcloud.com/20161030_forum_design_flask_2.png
[3]: https://slefboot-1251736664.file.myqcloud.com/20161030_forum_design_flask_3.png
[4]: https://slefboot-1251736664.file.myqcloud.com/20161030_forum_design_flask_4.png


