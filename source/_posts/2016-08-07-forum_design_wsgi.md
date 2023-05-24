title: 从零开始搭建论坛（二）：Web服务器网关接口
date: 2016-08-07 22:02:50
category: 项目实践
tags: [Flask, Python]
toc: true
---

在 [从零开始搭建论坛（一）：Web服务器与Web框架](http://selfboot.cn/2016/07/28/forum_design_framework/) 中我们弄清楚了Web 服务器、Web 应用程序、Web框架的概念。对于 Python 来说，越来越多的 Web 框架面世，在给我们更多选择机会的同时，也限制了我们对于 Web Server 的选择。同样是有着很多 Web 框架的Java，因为有着 servlet API 的存在，任何Java Web框架写的应用程序都可以运行在任意一个 Web Server 上。

Python 社区当然也需要这样一套 API，来适配Web服务器和应用程序，这套 API 就是 WSGI（Python Web Server Gateway Interface），在 [PEP 3333](https://www.python.org/dev/peps/pep-3333/) 里有详细的说明。简单来说，WSGI是连接Web服务器和Web应用程序的桥梁，一方面从Web server 拿到原始 HTTP 数据，处理成统一格式后交给 Web 应用程序，另一方面从应用程序／框架这边进行业务逻辑处理，生成响应内容后交给服务器。

Web服务器和框架通过 WSGI 来进行耦合的详细过程如下图所示：

![WSGI Server 适配][1]

<!-- more -->

具体解释如下：

* 应用程序（网络框架）提供一个命名为application的可调用对象（WSGI协议并没有指定如何实现这个对象）。
* 服务器每次从HTTP客户端接收请求之后，调用可调用对象application，调用时传递一个名叫environ的字典作为参数，以及一个名为start_response的可调用对象。
* 框架/应用生成HTTP状态码以及HTTP响应报头，然后将二者传递至start_response，等待服务器保存。此外，框架/应用还将返回响应的正文。
* 服务器将状态码、响应报头和响应正文组合成HTTP响应，并返回给客户端（这一步并不属于WSGI协议）。

下面分别从服务器端和应用程序端来看看 WSGI 是如何做适配的。

# 服务器端

我们知道客户端（通常是浏览器）发出的每个HTTP请求由请求行、消息报头、请求正文三部分组成，里面包含了本次请求的相关细节内容。比如：

* Method：指出在由Request-URI标识的资源上所执行的方法，包括GET，POST 等
* User-Agent：允许客户端将它的操作系统、浏览器和其它属性告诉服务器；

服务器从客户端接收HTTP请求之后，WSGI 接口必须要对这些请求字段进行统一化处理，方便传给应用服务器接口（其实就是给框架）。Web服务器具体传递哪些数据给应用程序，早在[CGI](https://en.wikipedia.org/wiki/Common_Gateway_Interface)（Common Gateway Interface，通用网关接口）里就有详细规定，这些数据被叫做 CGI 环境变量。WSGI 沿用了 CGI 环境变量的内容，要求 Web 服务器必须创建一个字典用来保存这些环境变量（一般将其命名为 `environ`）。除了 CGI 定义的变量，environ 还必须保存一些WSGI定义的变量，此外还可以保存一些客户端系统的环境变量，可以参考 [environ Variables](https://www.python.org/dev/peps/pep-3333/#environ-variables) 来看看具体有哪些变量。

接着 WSGI 接口必须将 environ 交给应用程序去处理，这里 WSGI 规定应用程序提供一个可调用对象 application，然后服务器去调用 application，获得返回值为HTTP响应正文。服务器在调用 application 的时候，需要提供两个变量，一个是前面提到的变量字典environ，另一个是可调用对象 start_response，它产生状态码和响应头，这样我们就得到了一个完整的HTTP响应。Web 服务器将响应返回给客户端，一次完整的`HTTP请求－响应`过程就完成了。

## wsgiref 分析

Python 中内置了一个实现了WSGI接口的 Web 服务器，在模块[wsgiref](https://docs.python.org/2.7/library/wsgiref.html)中，它是用纯Python编写的WSGI服务器的参考实现，我们一起来简单分析一下它的实现。首先假设我们用下面代码启动一个 Web 服务器：

```python
# Instantiate the server
httpd = make_server(
    'localhost',    # The host name
    8051,           # A port number where to wait for the request
    application     # The application object name, in this case a function
)

# Wait for a single request, serve it and quit
httpd.handle_request()
```

然后我们以Web服务器接收一个请求、生成 environ，然后调用 application 来处理请求这条主线来分析源码的调用过程，简化如下图所示：

![WSGI Server 调用流程][2]

这里主要有三个类，WSGIServer，WSGIRequestHandler，ServerHandle。WSGIServer 是Web服务器类，可以提供server_address（IP:Port）和 WSGIRequestHandler 类来进行初始化获得一个server对象。该对象监听响应的端口，收到HTTP请求后通过 finish_request 创建一个RequestHandler 类的实例，在该实例的初始化过程中会生成一个 Handle 类实例，然后调用其 run(application) 函数，在该函数里面再调用应用程序提供的 application对象来生成响应。

这三个类的继承关系如下图所示：

![WSGI 类继承关系图][3]

其中 TCPServer 使用 socket 来完成 TCP 通信，HTTPServer 则是用来做 HTTP 层面的处理。同样的，StreamRequestHandler 来处理 stream socket，BaseHTTPRequestHandler 则是用来处理 HTTP 层面的内容，这部分和 WSGI 接口关系不大，更多的是 Web 服务器的具体实现，可以忽略。

## 微服务器实例

如果上面的 wsgiref 过于复杂的话，下面一起来实现一个微小的 Web 服务器，便于我们理解 Web 服务器端 WSGI 接口的实现。代码摘自 [自己动手开发网络服务器（二）](http://codingpy.com/article/build-a-simple-web-server-part-two/)，放在 [gist](https://gist.github.com/xuelangZF/217b1b6ab34ec33c3ca155ce681f72ad) 上，主要结构如下：

```python
class WSGIServer(object):
    # 套接字参数
    address_family, socket_type = socket.AF_INET, socket.SOCK_STREAM
    request_queue_size = 1

    def __init__(self, server_address):
        # TCP 服务端初始化：创建套接字，绑定地址，监听端口
        # 获取服务器地址，端口

    def set_app(self, application):
        # 获取框架提供的 application
        self.application = application

    def serve_forever(self):
        # 处理 TCP 连接：获取请求内容，调用处理函数

    def handle_request(self):
        # 解析 HTTP 请求，获取 environ，处理请求内容，返回HTTP响应结果
        env = self.get_environ()
        result = self.application(env, self.start_response)
        self.finish_response(result)

    def parse_request(self, text):
        # 解析 HTTP 请求

    def get_environ(self):
        # 分析 environ 参数，这里只是示例，实际情况有很多参数。
        env['wsgi.url_scheme']   = 'http'
        ...
        env['REQUEST_METHOD']    =  self.request_method    # GET
        ...
        return env

    def start_response(self, status, response_headers, exc_info=None):
        # 添加响应头，状态码
        self.headers_set = [status, response_headers + server_headers]

    def finish_response(self, result):
        # 返回 HTTP 响应信息

SERVER_ADDRESS = (HOST, PORT) = '', 8888

# 创建一个服务器实例
def make_server(server_address, application):
    server = WSGIServer(server_address)
    server.set_app(application)
    return server
```

目前支持 WSGI 的成熟Web服务器有很多，[Gunicorn](http://gunicorn.org/)是相当不错的一个。它脱胎于ruby社区的Unicorn，成功移植到python上，成为一个WSGI HTTP Server。有以下优点：

* 容易配置
* 可以自动管理多个worker进程
* 选择不同的后台扩展接口（sync, gevent, tornado等）

# 应用程序端（框架）

和服务器端相比，应用程序端（也可以认为框架）要做的事情就简单很多，它只需要提供一个可调用对象（一般习惯将其命名为application），这个对象接收服务器端传递的两个参数 environ 和 start_response。这里的可调用对象不仅可以是函数，还可以是类（下面第二个示例）或者拥有 `__call__` 方法的实例，总之只要**可以接受前面说的两个参数，并且返回值可以被服务器进行迭代即可**。

Application 具体要做的就是根据 environ 里面提供的关于 HTTP 请求的信息，进行一定的业务处理，返回一个可迭代对象，服务器端通过迭代这个对象，来获得 HTTP 响应的正文。如果没有响应正文，那么可以返回None。

同时，application 还会调用服务器提供的 start_response，产生HTTP响应的状态码和响应头，原型如下：

```python
def start_response(self, status, headers,exc_info=None):
```

Application 需要提供 status：一个字符串，表示HTTP响应状态字符串，还有 response_headers: 一个列表，包含有如下形式的元组：(header_name, header_value)，用来表示HTTP响应的headers。同时 exc_info 是可选的，用于出错时，server需要返回给浏览器的信息。

到这里为止，我们就可以实现一个简单的 application 了，如下所示：

```python
def simple_app(environ, start_response):
    """Simplest possible application function"""
    HELLO_WORLD = "Hello world!\n"
    status = '200 OK'
    response_headers = [('Content-type', 'text/plain')]
    start_response(status, response_headers)
    return [HELLO_WORLD]
```

或者用类实现如下。

```python
class AppClass:
    """Produce the same output, but using a class"""

    def __init__(self, environ, start_response):
        self.environ = environ
        self.start = start_response

    def __iter__(self):
        ...
        HELLO_WORLD = "Hello world!\n"
        yield HELLO_WORLD
```

注意这里 `AppClass` 类本身就是 application，用 environ 和 start_response 调用（实例化）它返回一个实例对象，这个实例对象本身是可迭代的，符合 WSGI 对 application 的要求。

如果想使用 AppClass 类的对象作为 application，那么必须给类添加一个 `__call__` 方法，接受 environ 和 start_response 为参数，返回可迭代对象，如下所示：

```python
class AppClass:
    """Produce the same output, but using an object"""
    def __call__(self, environ, start_response):
        ...
```

这部分涉及到python的一些高级特性，比如 yield 和 magic method，可以参考我总结的[python语言要点](https://github.com/xuelangZF/CS_Offer/tree/master/Python)来理解。

## Flask 中的 WSGI

flask 是一个轻量级的Python Web框架，符合 WSGI 的规范要求。它的最初版本只有 600 多行，相对便于理解。下面我们来看下它最初版本中关于 WSGI 接口的部分。

```python
def wsgi_app(self, environ, start_response):
    """The actual WSGI application.

    This is not implemented in `__call__` so that middlewares can be applied:
        app.wsgi_app = MyMiddleware(app.wsgi_app)
    """
    with self.request_context(environ):
        rv = self.preprocess_request()
        if rv is None:
            rv = self.dispatch_request()
        response = self.make_response(rv)
        response = self.process_response(response)
        return response(environ, start_response)


def __call__(self, environ, start_response):
    """Shortcut for :attr:`wsgi_app`"""
    return self.wsgi_app(environ, start_response)
```

这里的 wsgi_app 实现了我们说的 application 功能，rv 是 对请求的封装，response 是框架用来处理业务逻辑的具体函数。这里对 flask 源码不做过多解释，感兴趣的可以去github下载，然后check 到最初版本去查看。

# 中间件

前面 flask 代码 wsgi_app 函数的注释中提到不直接在 `__call__` 中实现 application 部分，是为了可以使用`中间件`。 那么为什么要使用中间件，中间件又是什么呢？

回顾前面的 application/server 端接口，对于一个 HTTP 请求，server 端总是会调用一个 application 来进行处理，并返回 application 处理后的结果。这足够应付一般的场景了，不过并不完善，考虑下面的几种应用场景：

* 对于不同的请求（比如不同的 URL），server 需要调用不同的 application，那么如何选择调用哪个呢；
* 为了做负载均衡或者是远程处理，需要使用网络上其他主机上运行的 application 来做处理；
* 需要对 application 返回的内容做一定处理后才能作为 HTTP 响应；

上面这些场景有一个共同点就是，有一些必需的操作不管放在服务端还是应用（框架）端都不合适。对应用端来说，这些操作应该由服务器端来做，对服务器端来说，这些操作应该由应用端来做。为了处理这种情况，引入了`中间件`。

中间件就像是应用端和服务端的桥梁，来沟通两边。对服务器端来说，中间件表现的像是应用端，对应用端来说，它表现的像是服务器端。如下图所示：

![中间件][4]

## 中间件的实现

flask 框架在 Flask 类的初始化代码中就使用了中间件：

```python
self.wsgi_app = SharedDataMiddleware(self.wsgi_app, { self.static_path: target })
```

这里的作用和 python 中的装饰器一样，就是在执行 self.wsgi_app 前后执行 SharedDataMiddleware 中的一些内容。中间件做的事，很类似python中装饰器做的事情。SharedDataMiddleware 中间件是 [werkzeug](https://github.com/pallets/werkzeug/blob/2e9f5c0d0c1c36b612f6797c00f8c6ac3ba7b1db/werkzeug/wsgi.py) 库提供的，用来支持站点托管静态内容。此外，还有DispatcherMiddleware 中间件，用来支持根据不同的请求，调用不同的 application，这样就可以解决前面场景 1, 2 中的问题了。

下面来看看 DispatcherMiddleware 的实现：

```python
class DispatcherMiddleware(object):
    """Allows one to mount middlewares or applications in a WSGI application.
    This is useful if you want to combine multiple WSGI applications::
        app = DispatcherMiddleware(app, {
            '/app2':        app2,
            '/app3':        app3
        })
    """

    def __init__(self, app, mounts=None):
        self.app = app
        self.mounts = mounts or {}

    def __call__(self, environ, start_response):
        script = environ.get('PATH_INFO', '')
        path_info = ''
        while '/' in script:
            if script in self.mounts:
                app = self.mounts[script]
                break
            script, last_item = script.rsplit('/', 1)
            path_info = '/%s%s' % (last_item, path_info)
        else:
            app = self.mounts.get(script, self.app)
        original_script_name = environ.get('SCRIPT_NAME', '')
        environ['SCRIPT_NAME'] = original_script_name + script
        environ['PATH_INFO'] = path_info
        return app(environ, start_response)
```

初始化中间件时需要提供一个 mounts 字典，用来指定不同 URL 路径到 application 的映射关系。这样对于一个请求，中间件检查其路径，然后选择合适的 application 进行处理。

关于 WSGI 的原理部分基本结束，下一篇我会介绍下对 flask 框架的理解。

# 更多阅读

[WSGI Content](https://wsgi.readthedocs.io/en/latest/)
[WSGI Tutorial by Clodoaldo Neto](http://wsgi.tutorial.codepoint.net/intro)
[WSGI Explorations in Python](http://linuxgazette.net/115/orr.html)
[自己动手开发网络服务器（二）](http://codingpy.com/article/build-a-simple-web-server-part-two/)
[WSGI 是什么?](https://segmentfault.com/a/1190000003069785)
[自己写一个 wsgi 服务器运行 Django 、Tornado 等框架应用](https://segmentfault.com/a/1190000005640475)
[PEP 3333 -- Python Web Server Gateway Interface v1.0.1](https://www.python.org/dev/peps/pep-3333/)
[What is a “callable” in Python?](http://stackoverflow.com/questions/111234/what-is-a-callable-in-python)

[1]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160807_forum_design_WSGI_1.png
[2]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160807_forum_design_WSGI_2.png
[3]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160807_forum_design_WSGI_3.png
[4]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20160807_forum_design_WSGI_4.png


