title: 从零开始搭建论坛（一）：Web服务器与Web框架
date: 2016-07-28 22:02:50
category: 项目实践
tags: [Flask, Python]
toc: true
---

之前用 Django 做过一个小的站点，感觉Django太过笨重，于是就准备换一个比较轻量级的 Web 框架来玩玩。Web.py 作者已经挂掉，项目好久没有更新，所以不准备用它。而 Flask 也是一个成熟的轻量级 Web 框架，在 github 上有众多的 Star 和 Fork，文档和扩展也很丰富，值得学习。

学习一个框架最好的方式就是用框架做一个项目，在实战中理解掌握框架。这里我用 Flask 框架，使用 Mysql 数据库做了一个[论坛系统](https://github.com/xuelangZF/NaHan)。麻雀虽小，五脏俱全，论坛效果图如下：

![论坛系统截图][1]

<!--more-->

下面是论坛的基本功能：

* 完整的用户模块（注册、登录，更改、找回密码、信息修改、站内消息通知）；
* 丰富的论坛模块（创建、回复话题，站内搜索，markdown支持，@user 提醒）；
* 强大的后台管理，支持屏蔽用户、话题、评论，支持各种条件搜索话题、评论；

本博客将会用一系列文章，记录论坛系统搭建的过程，希望对刚入门Web开发的同学有所帮助。

我们经常听说 Django, Flask 这些 python 语言的`Web 框架`，那么框架到底是什么，Web框架和Web服务器（Nginx, Apache等）有什么区别？离开框架还能用 Python 搭建Web站点吗？要解决这些疑问，我们有必要来理解下 Web 服务器的工作原理，以及 Web 框架的本质。

# Web 服务器

当我们在浏览器输入URL后，浏览器会先请求[DNS服务器，获得请求站点的 IP 地址](http://selfboot.cn/2015/11/05/dns_theory/)。然后发送一个HTTP Request（请求）给拥有该 IP 的主机，接着就会接收到服务器给我们的 HTTP Response（响应），浏览器经过渲染后，以一种较好的效果呈现给我们。这个过程中，正是Web服务器在幕后默默做贡献。

简单来说，Web服务器是在运行在物理服务器上的一个程序，它永久地等待客户端（主要是浏览器，比如Chrome，Firefox等）发送请求。当收到请求之后，它会生成相应的响应并将其返回至客户端。Web服务器通过HTTP协议与客户端通信，因此也被称为HTTP服务器。

![Web 服务器][2]

Web服务器的工作原理并不复杂，一般可分成如下4个步骤：`建立连接、请求过程、应答过程以及关闭连接`。

1. 建立连接：客户机通过TCP/IP协议建立到服务器的TCP连接。
2. 请求过程：客户端向服务器发送HTTP协议请求包，请求服务器里的资源文档。
3. 应答过程：服务器向客户机发送HTTP协议应答包，如果请求的资源包含有动态语言的内容，那么服务器会调用动态语言的解释引擎负责处理“动态内容”，并将处理得到的数据返回给客户端。由客户端解释HTML文档，在客户端屏幕上渲染图形结果。
4. 关闭连接：客户机与服务器断开。

下面我们实现一个简单的 Web 服务器。运行[示例程序](https://gist.github.com/xuelangZF/19cd52525b64ed3973f480902447a9ea)后，会监听本地端口 8000，在浏览器访问 http://localhost:8000 就能看到响应内容。而我们的程序也能够打印出客户端发来的请求内容，如下图：

![简单Web服务器][3]

这里Request 和 Response 都需要遵守 HTTP 协议，关于 HTTP 协议的详细内容，可以读读《HTTP 权威指南》，或者看我整理的[HTTP 部分内容](https://github.com/xuelangZF/CS_Offer/blob/master/Network/HTTP.md)。

虽然说web服务器的主要工作是根据request返回response，但是实际中的 Web 服务器远远比上面示例的复杂的多，因为要考虑的因素实在是太多了，比如：

* 缓存机制：讲一些经常被访问的页面缓存起来，提高响应速度；
* 安全：防止黑客的各种攻击，比如 SYN Flood 攻击；
* 并发处理：如何响应不同客户端同时发起的请求；
* 日志：记录访问日至，方便做一些分析。

目前在UNIX和LINUX平台下使用最广泛的免费 Web 服务器有Apache和 Nginx 。

# Web 应用程序

Web 服务器接受 Http Request，返回 Response，很多时候 Response 并不是静态文件，因此需要有一个应用程序根据 Request 生成相应的 Response。这里的应用程序主要用来处理相关业务逻辑，读取或者更新数据库，根据不同 Request 返回相应的 Response。注意这里并不是 Web 服务器本身来做这件事，它只负责 Http 协议层面和一些诸如并发处理，安全，日志等相关的事情。

应用程序可以用各种语言编写（Java, PHP, Python, Ruby等），这个应用程序会从Web服务器接收客户端的请求，处理完成后，再返回响应给Web服务器，最后由Web服务器返回给客户端。整个架构如下：

![Web应用程序][4]

以 Python 为例，使用Python开发Web，最原始和直接的办法是使用[CGI标准](https://en.wikipedia.org/wiki/Common_Gateway_Interface)，在1998年这种方式很流行。首先确保 Web 服务器支持CGI及已经配置了CGI的处理程序，然后设置好CGI目录，在目录里面添加相应的 python 文件，每一个 python 文件处理相应输入，生成一个 html 文件即可，如下例：

```python
# !/usr/bin/python
# -*- coding: UTF-8 -*-

print "Content-type:text/html"
print  # 空行，告诉服务器结束头部
print '<html>'
print '<head>'
print '<meta charset="utf-8">'
print '</head>'
print '<body>'
print '<h2>Hello Word! 我是一个CGI程序</h2>'
print '</body>'
print '</html>'
```

这样在浏览器访问该文件就可以得到一个简单的 Hello World 网页内容。直接通过 CGI 写 Web 应用程序看起来很简单，每一个文件处理输入，生成html。但是实际开发中，可能会遇到许多不方便的地方。比如：

* 每个独立的CGI脚本可能会重复写数据库连接，关闭的代码；
* 后端开发者会看到一堆 Content-Type 等和自己无关的 html 页面元素；

# Web 框架

早期开发站点确做了许多重复性劳动，后来为了减少重复，避免写出庞杂，混乱的代码，人们将 Web 开发的关键性过程提取出来，开发出了各种 Web 框架。有了框架，就可以专注于编写清晰、易维护的代码，无需关心数据库连接之类的重复性工作。

其中一种比较经典的Web框架采用了 [MVC](https://en.wikipedia.org/wiki/Model%E2%80%93view%E2%80%93controller) 架构，如下图所示：

![MVC 架构][5]

用户输入 URL，客户端发送请求，`控制器（Controller）`首先会拿到请求，然后用`模型（Models）`从数据库取出所有需要的数据，进行必要的处理，将处理后的结果发送给 `视图（View）`，视图利用获取到的数据，进行渲染生成 Html Response返回给客户端。

以 python web 框架 flask 为例，框架本身并不限定我们用哪种架构来组织我们的应用，不过 flask 可以很好地支持以 MVC 方式组织应用。

控制器：flask 可以用装饰器来添加路由项，如下：

```python
@app.route('/')
def main_page():
    pass
```

模型：主要用来取出需要的数据，如下面函数中操作：

```python
@app.route('/')
def main_page():
    """Searches the database for entries, then displays them."""
    db = get_db()
    cur = db.execute('select * from entries order by id desc')
    entries = cur.fetchall()
    return render_template('index.html', entries=entries)
```

视图：flask 利用 jinja2 来渲染页面，下面的模版文件指定了页面的样式：

```python
{% for entry in entries %}
<li>
  <h2>{{ entry.title }}</h2>
  <div>{{ entry.text|safe }}</div>
</li>
{% else %}
<li><em>No entries yet. Add some!</em></li>
{% endfor %}
```

# Web 服务器网关接口

我们知道Python有着许多的 Web 框架，而同时又有着许多的 Web 服务器（Apache, Nginx, Gunicorn等），框架和Web服务器之间需要进行通信，如果在设计时它们之间不可以相互匹配的，那么选择了一个框架就会限制对 Web 服务器的选择，这显然是不合理的。

那么，怎样确保可以在不修改Web服务器代码或网络框架代码的前提下，使用自己选择的服务器，并且匹配多个不同的网络框架呢？答案是接口，设计一套双方都遵守的接口就可以了。对python来说，就是`WSGI`（Web Server Gateway Interface，Web服务器网关接口）。其他编程语言也拥有类似的接口：例如Java的Servlet API和Ruby的Rack。

Python WSGI的出现，让开发者可以将 Web 框架与 Web 服务器的选择分隔开来，不再相互限制。现在，你可以真正地将不同的 Web 服务器与Web框架进行混合搭配，选择满足自己需求的组合。例如，可以使用 Gunicorn 或Nginx/uWSGI来运行Django、Flask或web.py应用。

![WSGI 适配][6]

[下一篇](http://selfboot.cn/2016/08/07/forum_design_wsgi/)我们将会仔细分析 WSGI 接口标准，然后一起来写一个简单的 WSGI Web 服务器。

# 更多阅读

[自己动手开发网络服务器（一）](http://codingpy.com/article/build-a-simple-web-server-part-one/)
[自己动手开发网络服务器（二）](http://codingpy.com/article/build-a-simple-web-server-part-two/)
[自己动手开发网络服务器（三）](http://codingpy.com/article/build-a-simple-web-server-part-three/)
[Web服务器网关接口实现原理分析](https://www.hitoy.org/principle-of-wsgi.html)
[Python最佳实践指南：Web 应用](http://pythonguidecn.readthedocs.io/zh/latest/scenarios/web.html)
[浅谈Python web框架](http://feilong.me/2011/01/talk-about-python-web-framework)
[Python CGI编程](http://www.runoob.com/python/python-cgi.html)
[Django vs Flask vs Pyramid: Choosing a Python Web Framework](https://www.airpair.com/python/posts/django-flask-pyramid)
[PEP 333 -- Python Web Server Gateway Interface v1.0](https://www.python.org/dev/peps/pep-0333/)
[WSGI简介](https://segmentfault.com/a/1190000003069785)
[Model-View-Controller (MVC) Explained -- With Legos](https://realpython.com/blog/python/the-model-view-controller-mvc-paradigm-summarized-with-legos/)

[1]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160728_forum_design_framework_1.png
[2]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160728_forum_design_framework_2.png
[3]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160728_forum_design_framework_3.png
[4]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160728_forum_design_framework_4.png
[5]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160728_forum_design_framework_5.png
[6]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160728_forum_design_framework_6.jpeg

