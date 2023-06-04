title: 轻量级桌面应用开发的捷径——nw.js
date: 2015-10-15 23:33:29
category: 程序设计
tags: [JavaScript, GUI]
toc: true
description: 这篇文章详细介绍了轻量级桌面应用开发的捷径——nw.js。我们讨论了跨平台应用的前景，比较了不同的开发路径，并最终选择了nw.js。文章中详细解释了nw.js的特点，如何使用它，以及一些成功的应用案例。无论你是开发新手，还是经验丰富的开发者，这篇文章都能帮你快速上手nw.js，轻松开发出跨平台的桌面应用。
---

每个程序员都希望用自己喜欢的语言，自己喜欢的平台、工具，写自己喜欢的程序。于是我们会看到有人在Win下用Visual Studio愉快地coding，也会看到有人在OS X下用Xcode来开发，或者是用Sublime Text不受平台限制地玩。

当然了，愿望往往是美好的，然而事与愿违的情况时有发生。如果你基本都是用OS X，却有人让你写一个带有简单界面的小程序，保证在他的Win系统上一定可以运行，那么你是不是有点抓狂。

![跨平台应用的前景][1]

<!--more-->

# 选择哪条路？

当然，我可以在Visual Studio（已经有[Mac OS X版](https://www.visualstudio.com/zh-cn/visual-studio-homepage-vs.aspx)）下用MFC或者其他框架来写，但是总感觉有点重量级，并且不能移植到其他平台（万一哪天让我写个OS X下的界面呢，想想都不寒而栗啊！）

所以我想找的就是一个可以跨平台的、轻量级的图形界面开发的库，于是想到了喜欢的Python，然后发现它下面的GUI开发框架还真不少：[wxPython](http://www.wxpython.org/), [tkInter](https://wiki.python.org/moin/TkInter), PyGtk, PyQt。

* wxPython: 首先官网相当简洁（丑陋），然后快速浏览了一下文档，发现有这块：[Cross-Platform Development Tips](http://docs.wxwidgets.org/stable/page_multiplatform.html)，告诉你跨平台要注意哪些东东，看来不是我心中想的那样只需要写一份代码，在不同平台编译一下就可以，于是放弃。
* TkInter: 也在其他地方看到有人推荐这个，但是感觉文档特别乱，网上一些教程也相当简陋，里面界面丑的掉渣，也放弃了。

后面两个我甚至都没耐心继续看下去了，因为我不经意看到了[nw.js](https://github.com/nwjs/nw.js)，他就像一座灯塔，冥冥之中照亮了前进的方向啊。

# nwjs——前进的方向！

Github上nw.js有两万多Star和接近3000的Fork，说明它已经相当成熟，不会是某个人随兴放的一个并不成熟的技术。并且在Github项目的最后面，显示Intel有赞助这个项目，看起来很牛的样子。而且关于nw.js的资料也特别齐全，首先来看看它的特点：

* 支持用HTML5, CSS3, JS和WebGL来写应用程序，包括桌面端和移动端；
* 完全支持[Node.js APIs](http://nodejs.org/api/)和所有的第三方模块；
* 性能也不会很差，对于轻量级的应用足够了；
* 对应用进行打包和发布十分简单，也就是说写一份代码很容易移植到不同的平台（包括主流的Linux, Mac OS X 和 Windows）；

然后作者怕你认为它很难打交道，进而“知难而退”，就在项目主页里用许多slides来介绍它。

* [Introduction to node-webkit (slides)](https://speakerdeck.com/zcbenz/node-webkit-app-runtime-based-on-chromium-and-node-dot-js)
* [WebApp to DesktopApp with node-webkit (slides)](http://oldgeeksguide.github.io/presentations/html5devconf2013/wtod.html)

下面这张slide解决了“nw.js能做什么？”的问题，简单来说nw.js就是使HTML, CSS, JavaScript写的原本在浏览器上运行的程序，也可以在桌面端运行。

![nw.js能做什么][2]

下面这张slide解决了“怎么用nw.js完成任务？”的问题，

![nw.js是如何做到的][3]

最后，开发者怕你怀疑nw.js的强大，又提供了[几个Demo](https://github.com/zcbenz/nw-sample-apps)和[许多成功的案例](https://github.com/nwjs/nw.js/wiki/List-of-apps-and-companies-using-nw.js)来打消我们的顾虑。

# nwjs——拿下助攻！

决定用nw.js之后，就开始补充相应的知识啦。首先自己没有怎么去学过JavaScript, HTML, CSS这类web方面的语言，不过想来也不会比C++难。学习的成本也应该比学习MFC, wxPython低很多，并且这些语言太基础、使用场景太多了，所以早晚都得了解一下，干脆借这个机会一边学一边做具体的东西。于是买了[《JavaScript DOM编程艺术(第2版)](https://book.douban.com/subject/6038371/)》这本书拿来入门。

讲了这么多，还没说我具体要做什么呢，其实要做的事情特别简单，就是统计一本书的页码中一共有多少个0，1，2，3，4，5，6，7，8，9。关于这个问题，详细看前面的那篇博客：[讲得明白，但写的明白吗？](http://zhaofei.tk/2015/10/13/pages_count/)。

我要实现的目标很简单，在输入正确的数字时，给出统计结果；输入错误的数字时，则给出错误提示，重置输入框和统计结果。如下：

![统计功能演示][6]

实现过程相当简单，特别是对于那些做过web开发的，详细过程就不在这里给出了，只提供一个简单的程序逻辑图吧。

![程序流程图][7]

源码十分简单，可以在[这里](https://gist.github.com/xuelangZF/ce8a570a8e7453c76fd7)找到，结构如下：

```
 tree
.
├── index.html
├── main.js
├── package.json
└── style.css

0 directories, 4 files
```

打包到各个平台也有[详细的文档](https://github.com/nwjs/nw.js/wiki/how-to-package-and-distribute-your-apps)。以Win为例，只需要三步即可：

1. 将所有工程文件，放在一个文件夹下，确保`package.json`在根目录，然后压缩为.zip格式，并将压缩文件的后缀由`.zip`改为`.nw`；
2. 在nw.js的环境目录下执行`copy /b nw.exe+you_nw_name.nw you_app_name.exe` （这一步之后，就可以在生成的目录中直接运行`you_app_name.exe`，它依赖同目录下的一些其他库）；
3. 用[Enigma Virtual Box](http://enigmaprotector.com/en/aboutvb.html)将`you_app_name.exe`和依赖的库打包到单个exe文件中，这样我们的应用在没有任何编程环境的win机器上都可以运行。

# nwjs——你值得拥有！

不得不提nw.js开发出的应用已经涵盖了许多领域：

1. [WhatsApp](https://web.whatsapp.com/) 经典的聊天应用，还有[Messenger](http://messengerfordesktop.com/)；
2. [Powder Player](https://github.com/jaruba/PowderPlayer) 种子下载，以及视频播放器；
3. [Boson Editor](https://github.com/isdampe/BosonEditorExperimental) 代码编辑器，甚至还有一款Markdown编辑器叫[Story-writer](http://soft.xiaoshujiang.com/)；
4. [Leanote Desktop App](https://github.com/leanote/desktop-app) 类似Evernote的笔记类应用程序；
5. [Mongo Management Studio](http://www.litixsoft.de/english/mms/) 数据库管理应用。

来欣赏一下一些应用的截图吧，不得不说nw.js开发出的应用一点不比原生的丑陋啊。

[**Mongo Management Studio**](http://www.litixsoft.de/english/mms/)
![Mongo][4]

[**Soundnode App**](http://www.soundnodeapp.com/)
![Soundnode][5]

看来nw.js赢得了很多青睐，那么还有什么能阻止我们拥抱nw.js呢？


[1]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20151015_Win_OSX.png
[2]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20151015_what_is_nw.png
[3]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20151015_how_package.png
[4]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20151015_apps_mongo.png
[5]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20151015_apps_soundnode.png
[6]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20151015_input.png
[7]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20151015_nwjs_process.png

