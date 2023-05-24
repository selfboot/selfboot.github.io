title: Postman 高级用法指南  
date: 2017-11-12 12:18:50
category: 工具介绍   
tags: [教程, 总结]  
toc: true  
---

Postman是一款强大的API接口测试工具，有许多不容易发现的好用的功能，下面简单介绍其中一部分功能。详细内容可以参考[文档](https://www.getpostman.com/docs/)，官方还有视频教程，非常方便入手。后续本博客会持续提供一些Postman使用的细节技巧，方便大家用Postman进行接口调试。

![Navigating Postman](https://s3.amazonaws.com/postman-static-getpostman-com/postman-docs/statusBar.png) 

<!--more-->

作为一个跨平台的API测试工具，Postman有Win/Mac/Linux客户端，还有浏览器扩展程序。不过官方建议使用客户端，主要有以下优点：

* 自带cookie支持：请求可以使用同一域名下的cookie；
* 内置代理支持：可以用来转发请求，分析请求流量；
* 自定义请求头：不必受限于Chrome中对于请求头的限制；
* 内置控制台：在控制台可以查看请求的详细信息

简单来说，postman 做的事情就是模拟浏览器发送请求，接受响应。使用Postman可以模拟任何浏览器发出的请求，可以自由地构造请求地址，请求方法，请求内容，Cookies等。Postman的响应内容包括完整的响应头，响应时间，响应大小，cookie等内容。

此外，postman还提供如下方便功能：

* [Debugging and logs](https://www.getpostman.com/docs/postman/sending_api_requests/debugging_and_logs)：可以在控制台对postman的请求进行调试，特别是如果有pre-request或者test script时，使用控制台可以方便debug。原生postman可以通过`CMD/CTRL + ALT + C`打开控制台。
* [Generate code snippets](https://www.getpostman.com/docs/postman/sending_api_requests/generate_code_snippets)：将当前请求导出为各种版本的请求代码，比如python，js，curl等，方便用命令行测试；
* [Proxy](https://www.getpostman.com/docs/postman/sending_api_requests/proxy)：如果本机不能直接访问服务端，可以在`Settings-Proxy-Using custom/system proxy`设置代理；
* [Capturing HTTP requests](https://www.getpostman.com/docs/postman/sending_api_requests/capturing_http_requests)：有时候用手机访问服务端时，我们可能需要借助fiddler来查看HTTP请求。postman也可以做相同的工作，只需要将postman作为代理转发HTTP请求即可。
* [Certificates](https://www.getpostman.com/docs/postman/sending_api_requests/certificates)： 如果服务端要验证客户端证书，可以在`Settings-Certificates-Add Certificate`配置证书；

# Environments and globals

我们在构造API请求时，经常会在多个地方使用相同的值，比如相同的请求域名，一些固定的参数值。这时候如果使用**变量**来保存相应的值，然后在需要使用该值的地方用变量来代替会带来不少好处，比如要改变这些值，只用在变量的定义地方作出改动即可。

![Quick Look for variables](https://s3.amazonaws.com/postman-static-getpostman-com/postman-docs/59165135.png)

Postman定义了4类变量，极大地方便了构造请求以及对结果进行测试：

* Global: 全局变量，postman中所有请求都可以访问或者修改；
* Environment: 构造请求时可以选择使用某个Environment，这样就可以访问或者修改该Environment下的所有变量；
* Local: 脚本中定义的变量，只对脚本的当前作用域有用；
* Data: 只有在使用 `Collection Runner` 的时候，可以通过导入 Data Files 来构造当前测试集中用到的数据。

就像程序中的变量一样，这里的变量也是有优先级，如果在Environment中有和Global重名的变量，会优先使用Environment中变量。上面4个变量的优先级由上到下依次减弱。 

在postman中使用变量有着很多意想不到的好处，比如：

1. Collection Runner中通过Data file来构造不同的测试数据，方便快速进行大量不同请求数据的测试；
2. 可以在不同请求中传递值，比如在一个请求中产生流水号，将其设置为某个变量的值，下一个请求即可使用该变量值。

# Scripts

Postman 内置了Node.js的运行时环境，可以执行JS脚本。这样就带来了很多激动人心的好处，比如构建动态请求参数，编写强大的测试用例等。Postman中的Scripts分为2类：

* [pre-request script](https://www.getpostman.com/docs/postman/scripts/pre_request_scripts): 在发送请求之前执行的脚本，一般用来构建请求参数；
* [test script](https://www.getpostman.com/docs/postman/scripts/test_scripts): 在获取相应之后执行的脚本，一般用来做测试。不过需要注意，测试脚本运行在Sandbox环境，内置了许多JS库支持，方便进行测试。

![Request Execution Flow](https://s3.amazonaws.com/postman-static-getpostman-com/postman-docs/59184189.png)

Postman的[Sandbox](https://www.getpostman.com/docs/postman/scripts/postman_sandbox)环境十分强大，比如：

1. 通过提供 `postman.setNextRequest("request_name")` 实现，可以很方便地在 Collection 中控制请求的执行路径；
2. 提供了一系列[内置接口](https://www.getpostman.com/docs/postman/scripts/postman_sandbox_api_reference)，方便对环境变量，请求或者相应内容进行访问；
3. 提供了 CryptoJS 库，可以方便地进行加解密操作；
4. 提供了 tv4 库，可以对 Json Scheme进行测试；JSON Schema 定义了如何基于 JSON 格式描述 JSON 数据结构的规范，进而提供数据校验、文档生成和接口数据交互控制等一系列能力。

# Collections runs

Collections 是一系列请求的集合，postman通过collection来支持构建请求工作流，自动化测试，请求的导入导出，持续集成等功能。Collection 支持以下功能：

* [Sharing collections](https://www.getpostman.com/docs/postman/collections/sharing_collections)：可以将Collection中的请求导出分享给其他人；
* [Data formats](https://www.getpostman.com/docs/postman/collections/data_formats)：Postman可以导出环境变量，甚至可以将请求和环境变量等一起打包为一个Json，方便迁移所有的请求数据。

Collection的一大用处就是一次执行其中所有的请求，这就是所谓的 [collection run](https://www.getpostman.com/docs/postman/collection_runs/starting_a_collection_run)。

![collection runner](https://s3.amazonaws.com/postman-static-getpostman-com/postman-docs/58793861.png)

在执行collection run时，有很多配置选项，主要如下：

* [Using environments in collection runs](https://www.getpostman.com/docs/postman/collection_runs/using_environments_in_collection_runs): 可以指定一个 Environment，这样collection中的请求可以使用其中的变量；
* [Working with data files](https://www.getpostman.com/docs/postman/collection_runs/working_with_data_files): 可以导入一个Data File，里面存放测试中用到的Data变量。可以存放很多不同的Data变量，这样迭代跑多次Collection时，每次使用不同的数据；
* [Running multiple iterations](https://www.getpostman.com/docs/postman/collection_runs/running_multiple_iterations): 可以配置迭代的运行Collection中的请求，对接口的稳定性进行测试。此外配合Data files，也可以对接口的正确性进行测试；
* [Building workflows](https://www.getpostman.com/docs/postman/collection_runs/building_workflows)：默认情况下会顺序执行Collection中的请求，不过可以通过`setNextRequest()`来更改请求的执行流程。
* [Debugging a collection run](https://www.getpostman.com/docs/postman/collection_runs/debugging_a_collection_run): Collection中的请求执行后，会有可视化的执行结果展示，可以方便进行调试，此外，也可以通过控制台来进行调试。
* [Sharing a collection run](https://www.getpostman.com/docs/postman/collection_runs/sharing_a_collection_run): 整个Collection Run也是可以导出，可以在其他平台进行运行；
* [Command line integration with Newman](https://www.getpostman.com/docs/postman/collection_runs/command_line_integration_with_newman): 导出Collection Run后，可以在命令行使用 newman 运行。
* [Integration with Travis CI](https://www.getpostman.com/docs/postman/collection_runs/integration_with_travis): 可以将 newman 和 Travis CI集成，配置好持续性集成，指定自动运行测试用例的时机。

# 其他功能

**1. 文件上传**

图形界面端，Collection 中的请求不支持POST文件上传，不过在导出Collection后，可以在json文件中配置文件路径，然后使用 newman 进行文件上传。详细可以参考Postman官方博客：[Using Newman to run collections with file-post requests](http://blog.getpostman.com/2014/11/15/using-newman-to-run-collections-with-file-post-requests/)

不过文件上传时必须指定文件路径，不能用变量代替，也不能通过Data Files来设置不同的文件，不是很方便。所以我给官方提了 [Issue](https://github.com/postmanlabs/postman-app-support/issues/3779)，目前该功能已经纳入 Feature，有望在后续版本中实现该功能。这里就不得不赞一下Postman的社区支持了，基本上有任何问题，只要在官方Issue上提出，基本很快就会有Postman的工作人员提供支持。

（备注：本文所有图片均来自Postman Doc）

