title: 两篇文章帮你入门Django(下)
date: 2015-1-11
tags: [Python,教程,Django]
category: 程序设计
toc: true
description: Django入门教程的下篇，深入探讨Django的后台管理和自动化测试。这篇文章详细介绍了如何使用Django创建后台管理系统，以及如何编写测试单元来检查程序的正确性。适合有一定Python和Django基础的开发者阅读，提升你的Django开发技能。
---

在[两篇文章帮你入门Django(上)](http://selfboot.cn/2014/12/26/django_start/)一文中，我们已经做了一个简单的小网站，实现了保存用户数据到数据库，以及从后台数据库读取数据显示到网页上这两个功能。

看上去没有什么问题了，不过我们可以让它变得更加完美，比如说为它添加一个简单的后台，用来管理我们的Question数据库，或者是写点测试单元来看看我们的程序有没有什么Bug。

<!-- more -->

# 后台管理

首先需要添加后台管理员账号，只需要简单的 `createsuperuser` 命令，如下：

```bash
$ python manage.py createsuperuser
Username (leave blank to use 'feizhao'): happy
Email address:
Password:
Password (again):
Superuser created successfully.
```

然后就可以通过 [http://127.0.0.1:8000/admin/]( http://127.0.0.1:8000/admin/) 进入管理员登录页面。我们用刚才创建的管理员账号登录成功后就会看到`Groups`和`Users`两个可以编辑的内容，它们是Django内置的认证模块`django.contrib.auth`提供的数据库，进入Users就会看到刚刚创建的管理员用户happy了。

目前后台还看不到我们的Question数据库，因为还没告诉后台它的存在。我们可以在questions应用下的`admin.py`文件里面注册该数据库的存在，注册的语句非常简单，如下：

```python
from django.contrib import admin
from questions.models import Question

admin.site.register(Question)
```

这样我们刷新后台之后，就能看到Question数据库了，如下图：

![Question数据库][1]

进入Question数据库后，我们会看到每一条记录，不过这里显示的结果可能是这样子：

![数据库记录][2]

这是因为默认情况下，每条记录显示的是`str()`返回的内容，而我们没有在`class Question(models.Model)`中覆盖该方法。不过我们可以在这里指定数据库记录显示某个字段，方法也特别简单，修改admin.py如下：

```python
class QuestionAdmin(admin.ModelAdmin):
    list_display = ('context',)

admin.site.register(Question, QuestionAdmin)
```

这样每条记录显示的就是context内容了，我们进去某条记录后，会看到所有的字段，并且可以进行更新、删除、添加等操作。Django后台的可定制性还是非常高的，我们可以按照自己爱好打造属于自己的后台。

# 自动化测试

Django另一个比较不错的地方就是提供了完整的自动化测试机制，方便开发人员进行测试。仍然以我们前面的questions这个应用为例，我们会发现在问题描述框没有输入任何内容时点击提交，仍然会跳转到添加成功页面，也就是说我们添加了一个空的问题，这当然不是我们想要的，我们可以写一个程序来测试我们的添加问题的功能。

Django中，实现测试非常简单，我们可以在questions应用中新建`tests.py`文件，在里面写好测试逻辑，然后用django的测试系统完成测试。下面即为我们的测试程序questions/tests.py：

```python
from django.test import TestCase
from django.test import Client

class QuestionMethodTests(TestCase):
    def test_add(self):
        client = Client()
        response = client.post('/add_done/', {'content': ""})
        self.assertNotEqual(response.status_code, 200)
```

我们模拟了一个客户端client，将空字符串传给content字段，然后发起一个post请求到`/add_done/`页面(默认情况下测试时并不检查CSRF字段)，然后断言post请求不成功(也就是返回包的状态码不为200)。下面运行测试程序：

```bash
$ python manage.py test questions
Creating test database for alias 'default'...
F
======================================================================
FAIL: test_add (questions.tests.QuestionMethodTests)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/Users/feizhao/Documents/python_demo/mysite/questions/tests.py", line 10, in test_add
    self.assertNotEqual(response.status_code, 200)
AssertionError: 200 == 200

----------------------------------------------------------------------
Ran 1 test in 0.009s

FAILED (failures=1)
Destroying test database for alias 'default'...
```

测试没通过，说明确实插入了空白问题。注意测试时并不需要运行web服务，这样能节省HTTP服务的开销，提高测试的速度。现在对views中的add_done稍作改动，如下：

```python
def add_done(request):
    content = request.POST['content']
    if content != "":
        add_question = Question()
        add_question.context = content
        add_question.save()
        return render(
            request,
            "questions/add_done.html",
            {'question': content},
        )
    else:
        return redirect("/add/")
```

首先检查字符串是否为空，为空的话重定向页面到`/add/`，不为空则添加问题成功。再次运行测试程序，则通过测试，结果如下：


```bash
$ python manage.py test questions
Creating test database for alias 'default'...
.
----------------------------------------------------------------------
Ran 1 test in 0.007s

OK
Destroying test database for alias 'default'...
```

其实这个应用还有bug就是一个问题可能重复提交多次，这里不详细阐述。

# 命令行交互

有时候我们想验证下某条语句是否符合预期，或者是输出某个变量观察一下值，这时候直接在项目里实现可能会非常麻烦。这种情况可以使用python解释器的交互模式，为了避免手动导入django的配置环境，可以运行 `python manage.py shell`，然后就可以使用django的API，并且在当前项目目录进行交互，如下例：

```bash
	$ python manage.py shell
	Python 2.7.5 (default, Mar  9 2014, 22:15:05)
	[GCC 4.2.1 Compatible Apple LLVM 5.0 (clang-500.0.68)] on darwin
	Type "help", "copyright", "credits" or "license" for more information.
	(InteractiveConsole)
	>>> from questions.models import Question
	>>> null_question = Question()
	>>> null_question.save()
	>>> for question in Question.objects.all():
	...     print question.context
	...
	as
	as
	程序员为什么最帅
	程序为什么老出bug

	>>>
```

交互模式使用起来可能事半功倍，所以不要忘了哦。

# 深入学习

好了，前面就是django的一些重要的特点了，下面来看看有哪些资源可以帮我们更好地学习django。

[Django中国社区](http://django-china.cn/)是国内的Django开发社区，人气不是很旺，不过也能在里面找到有用的东西。比如@evilbinary在这里[一个博客，兼容wp，代码高亮功能支持](http://django-china.cn/topic/840/) 提供了一个用Django搭建的博客，并给出了源码，我们可以学习。还有一些不错的Django开源项目，比如这个小的BBS论坛[fairybbs](http://fairybbs.com/)，还有这个登录的应用[django-siteuser](https://github.com/yueyoum/django-siteuser)。

中文的教程目前有[djangobook 2.0](http://djangobook.py3k.cn/)，但是书中使用的Django版本太低，因此不推荐使用。英文的资料还是挺丰富，不过还是推荐读文档，虽然文档有时候特别坑人(被坑了好多次)。

此外，除了**Stackoverflow(这个太喜欢了，谁用谁知道，不用担心英语太烂，放代码和错误提示，实在不行用Google翻译加一点描述就行。总而言之，SO就是程序员的天堂啊)**, Segmentfault这些问答网站，很多Django用户在[邮件列表](http://www.djangoproject.com/r/django-users)(邮件列表是`groups.google.com`，所以你懂的)里提问题、回答问题，这里的氛围非常不错，各种问题都有人来帮你。比如这种中二的问题[Serving static files and media in Django 1.7.1](https://groups.google.com/forum/#!topic/django-users/xUmPe4xnuH8)也是有人十分认真的作答的。所以，不要害羞，有问题大胆问吧。

如果你决定好好玩Django了，那么先看一下[Django FAQ](https://docs.djangoproject.com/en/1.7/faq/)，可能会解决关于Django的一些疑问。

[1]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20150111_admin_question.png
[2]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20150111_question_object.png

