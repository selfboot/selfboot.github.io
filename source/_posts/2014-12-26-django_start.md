title: 两篇文章帮你入门Django(上)
date: 2014-12-26
tags: [Python,教程,Django]
category: 程序设计
toc: true
description: 这篇文章是一份详尽的Django入门指南，它将带你了解Django的工作流程，以及如何开始你的第一个Django项目。文章详细解释了为什么我们需要一个web框架，以及Django如何帮助我们更有效地开发web应用。无论你是刚开始接触web开发，还是已经有一些经验并想要学习新的工具，这篇文章都将为你提供宝贵的信息。
---

相信用过python的人都听过Django的大名，知道它是一个web框架，用来支持动态网站、网络应用程序以及网络服务的开发。那么为什么我们需要一个web框架，而不是直接用python来写web应用呢？其实简单来说，就是为了偷懒。

如果不用框架的话，你可能需要连接数据库、查询数据库、关闭数据库，在python代码文件里掺杂html标签、css样式等。并且每次开始一个web应用，你都要从头开始写起，重复许多枯燥无味的代码。

而web框架提供了通用web开发模式的高度抽象，使我们可以专注于编写清晰、易维护的代码。Django作为python下的web框架，从诞生到现在有着数以万计的用户和贡献者，有着丰富的文档，活跃的社区，是web开发很好的选择。

<!--more-->

本文结合 Django 官方文档 `First steps` 中的6个小教程，帮你了解Django。一共分上、下两篇文章，上篇主要来分析Django处理Http Request的机制，[下篇][6]来介绍下Django提供的后台管理，以及单元测试等强大的功能。

# Django 工作流程

在开始具体的代码之旅前，先来宏观地看下Django是如何处理Http Resquest的，如下图：

![Django工作流程][1]

假设你已经在浏览器输入了 [http://127.0.0.1:8000/polls/](http://127.0.0.1:8000/polls/)，接下来浏览器会把请求交给Django处理。根据上图，我们知道Django需要根据url来决定交给谁来处理请求，那么Django是如何完成这项工作呢？很简单，Django要求程序员提供urls.py文件，并且在该类文件中指定请求链接与处理函数之间的一一对应关系。

这里请求链接是以正则表达式的方式指定，并且不用指定域名，比如说要精确匹配上面的例子, 只需要指定正则表达式为 `^polls/$` 即可。要匹配 [http://127.0.0.1:8000/polls/12/](127.0.0.1:8000/polls/12/)(这里polls后面只要是数字即可)，那么只需要 `^polls/\d+/$` 即可。回到上面的例子，Django中只需要在urls.py添加以下语句即可。

```python
urlpatterns = patterns(
    '',
    url(r'^polls/$', views.index),
)
```

这样当请求链接为[http://127.0.0.1:8000/polls/](http://127.0.0.1:8000/polls/)时，就会用`views.py`中的函数`index()`来处理请求。现在Django知道由index来处理请求了，那么index需要做哪些工作呢？

它需要加载返回内容的模板，这里比如说是`index.html`。

```python
def index(request):
    template = loader.get_template('polls/index.html')
```

模板文件就是返回页面的一个骨架，我们可以在模板中指定需要的静态文件，也可以在模板中使用一些参数和简单的逻辑语句，这样就可以将其变为用户最终看到的丰满的页面了。

要使用静态文件，比如说css、javascript等，只需要用 {% raw %}`{% load staticfiles %}`{% endraw %}来声明一下，然后直接引用即可，比如说：

```
<link rel="stylesheet" type="text/css" href="{% raw %}{% static 'polls/style.css' %}{% endraw %}" />
```

参数和逻辑语句也很简单，比如说以下语句：

```
{% raw %}{% for question in latest_question_list %}{% endraw %}
        <li>{{ question.question_text }}</a></li>
{% raw %}{% endfor %}{% endraw %}
```

用for循环遍历latest_question_list，逐个输出内容question_text。这里我们用到了参数latest_question_list，它的值其实是在views.py中计算出来给模板文件的，我们这里假设是从数据库中取出最新的5个question，如下：

```
latest_question_list = Question.objects.order_by('-pub_date')[:5]
```

这里用到了数据库，其实Django给我们封装了数据库的读写操作，我们不需要用SQL语句去查询、更新数据库等，我们要做的是用python的方式定义数据库结构(在model.py里面定义数据库)，然后用python的方式去读写内容。至于连接数据库、关闭数据库这些工作交给Django去替你完成吧。上面例子中，Question数据库结构的定义如下：

```python
class Question(models.Model):
    question_text = models.CharField(max_length=200)
    pub_date = models.DateTimeField('date published')

    def __str__(self):
        return self.question_text
```

好了，现在有了模板文件这个骨架，又有参数、逻辑语句、静态文件等血肉，一个丰满的页面就诞生了，来看一下完整的index函数吧：

```python
def index(request):
    latest_question_list = Question.objects.order_by('-pub_date')[:5]
    template = loader.get_template('polls/index.html')
    context = RequestContext(request, {
        'latest_question_list': latest_question_list,
    })
    return HttpResponse(template.render(context))
```

# 第一个Django项目

前面为了使大家了解Django处理HTTP Request的过程，我们简化了一些内容，下面我们将尽量还原Django真实的面貌。在开始具体的技术细节前，我们先来搞清楚Django中projects和apps的区别。App是专注于做某件事的web应用，比如说一个用户认证系统，或者是公开投票系统；而project则是一个web站点，可能包括许多app和一些配置。**一个project可以包含许多app，一个app可以用于许多project中**。

使用Django时一般会先创建一个project，比如说是mysite，如下：

```bash
$ django-admin.py startproject mysite
$ tree -L 2 mysite
mysite
├── manage.py
└── mysite
    ├── __init__.py
    ├── settings.py
    ├── urls.py
    └── wsgi.py

1 directory, 5 files
```

然后我们可以在 `mysite/settings.py` 中进行项目的一些配置，比如配置时区，数据库连接的相关信息，或者是应用的添加、删除等。这里需要特别注意的是数据库设置，Django支持sqlite、mysql、oracle等数据库，使用前必须安装、启动相应的数据库，并建立相应的账户。这里为了简单，我们使用python内置的sqlite，settings里面的数据库配置不需要更改即可。

项目创建成功之后，可以运行

```bash
$ python manage.py migrate
```

生成相应的数据库表(migrate是Django 1.7引入的命令，较早的版本可以用其他的命令代替)。为什么新建的空项目里就会有数据库表呢？这是因为默认情况下，项目配置文件`settings.py`里面已经配置有Django自带的应用，如下：

```python
INSTALLED_APPS = (
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
)
```

这些应用需要和数据库交互。(通常情况下默认的应用很有用，不过你可以根据需求删减)

到这里为止，我们的Django项目已经可以运行了，用下面简单的命令开启Django自带的`开发环境web服务`：

```bash
$ python manage.py runserver
```

接下来，试试在浏览器打开 [http://127.0.0.1:8000/]( http://127.0.0.1:8000/ )，看看Django的 `It worked!` 页面吧。

![Django 欢迎页面][2]

现在我们的项目初具雏形，并且运行良好，这是个好的开端，不过我们可以让它变的更加实用，就让她完成以下任务吧：

* 在一个问答系统中添加问题；
* 显示所有已经添加的问题。

听起来很简单，不是吗？不过这个任务已经涉及到向后台写数据，从后台读取数据，作为一个例子而言，足够用了。就让我们新建一个名为questions的app来完成这项任务吧：

```bash
$ python manage.py startapp questions
```

首先我们得设计好数据库字段，用来存储问题。上面的任务设计起来很简单，只需要建立一个名为Question的表格，然后里面有context字段。Django提供了models来方便我们设计数据库，因此我们的`questions/models.py`看起来可能是这样的：

```python
from django.db import models

class Question(models.Model):
    context = models.CharField(max_length=200)
```

现在将questions应用添加进项目的配置文件`mysite/settings`中：

```python
INSTALLED_APPS = (
    'django.contrib.admin',
    ...,
    'questions',
)
```

然后通过以下命令来生成Question数据库表格：

```bash
$ python manage.py makemigrations questions
$ python manage.py migrate
```

接下来设计三个URL地址`add/, add_done/, index/`(这里的地址并不包含域名) 分别用来展示填写问题页面，添加成功后页面，显示所有问题页面。然后在`mysite/urls.py`中指定相应的处理函数，如下：

```python
from django.conf.urls import patterns, include, url
from questions import views

urlpatterns = patterns(
    '',
    url(r'^add/$', views.add),
    url(r'^index/$', views.index),
    url(r'^add_done/$', views.add_done),
)
```

当然了，我们需要在`questions/views.py`中实现 index, add 和 add_done：

* index: 获取当前所有问题，传给模板文件，返回Response；
* add: 直接返回添加问题表单页面即可；
* add_done: 获取POST得到的问题，将其添加到数据库，返回Response；

代码如下：

```python
def index(request):
    question_list = Question.objects.all()

    return render(
        request,
        "questions/index.html",
        {'question_list': question_list},
    )

def add_done(request):
    add_question = Question()
    content = request.POST['content']
    add_question.context = content
    add_question.save()
    return render(
        request,
        "questions/add_done.html",
        {'question': content},
    )

def add(request):
    return render(request, "questions/add.html")
```

这里render函数加载模板，并且以字典的形式传递参数，返回Response页面。模板文件内容不在这里给出，运行结果截图如下：

![添加问题][3]
![添加成功][4]
![列出问题][5]

如果你读到这里，那么应该会知道Django处理Http Request的过程，并且能动手写一个简单的Django小项目了。不过Django作为一个优秀的Web框架，还提供了诸如后台管理，单元测试等强大的功能，我们会在[下一篇][6]文章来共同学习。

[1]: https://slefboot-1251736664.file.myqcloud.com/20141226_Django_process.png
[2]: https://slefboot-1251736664.file.myqcloud.com/20141226_project_welcome.png
[3]: https://slefboot-1251736664.file.myqcloud.com/20141226_add.png
[4]: https://slefboot-1251736664.file.myqcloud.com/20141226_add_done.png
[5]: https://slefboot-1251736664.file.myqcloud.com/20141226_index.png
[6]: http://selfboot.cn/2015/01/11/django_start(2)/


