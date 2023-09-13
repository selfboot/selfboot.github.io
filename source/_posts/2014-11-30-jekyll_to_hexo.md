title: 更换博客系统——从jekyll到hexo
date: 2014-11-30
tags: [教程, 前端]
category: 工具介绍
description: 探索从Jekyll到Hexo的迁移过程，了解两者的区别和优势。这篇文章详细介绍了迁移的步骤，包括如何安装Hexo，如何迁移博客文章，以及如何自定义主题。如果你正在考虑更换博客平台，这篇文章将为你提供宝贵的参考信息。 
---

之前用jekyll搭建博客，费了九牛二虎之力（自己没有学过前端的东西，完全就是改别人的样式，不知道的地方再问google老师）才做了一个不是那么丑的博客界面。过程中遇到了各样问题，包括如何让站点支持RSS订阅，如何添加评论系统等。

后面使用起来大致也不算麻烦，在_posts里面创建指定格式的文件，然后写文章，然后在本地运行`jekyll server`看下效果，没问题的话就用git提交到github。

<!--more-->

虽然好多次看到自己那笨拙的博客界面都有想给她化妆的欲望，不过还是压抑了自己的冲动，毕竟对于不懂前端的我来说，只能越描越黑了。于是，看着别人那漂亮的界面，只有羡慕的份儿。

然后，不小心就遇见了[hexo](http://hexo.io/)。开始只是对她的主题感兴趣，随便看了几个主题，发现比我那弱爆了的界面好太多。接下来又大致看了她的文档，感觉使用起来很简单，只用几条命令就行。

```bash
hexo init <folder>
hexo new "name"
hexo generate
hexo server
hexo deploy
```

于是就准备试试看。

# Hexo简单部署

hexo出自台湾大学生[SkyArrow](https://twitter.com/tommy351)之手，是一个基于Node.js的静态博客框架，编译上百篇文字只需要几秒。在已经有 Octopress 和 jekyll的情况下，SkyArrow为什么要自己造轮子呢，可以他的这篇文章：[Hexo颯爽登場！](http://zespia.tw/blog/2012/10/11/hexo-debut/)

官网强调了hexo的四大特点：

* 极速生成静态页面
* 支持Markdown
* 一键部署博客
* 丰富的插件支持

下面就开始部署hexo，看看她到底有多牛吧。hexo依赖`Node.js`和`Git`，所以这两个必须已经安装，然后用下面命令安装hexo：

```
npm install hexo -g
```

Mac用户安装hexo时还要确保安装了command line tools。然后用`hexo init`命令初始化博客目录，初始化完成之后，目录结构如下：

```
~  tree -L 1 demo
demo
├── _config.yml
├── package.json
├── scaffolds
├── source
└── themes

3 directories, 2 files
```

hexo的配置文件是`_config.yml`，可配置内容相当多，可以在官方文档[Configuration](http://hexo.io/docs/configuration.html) 里查看详细解释。

我将新建文章的名字格式改为和jekyll的类似，便于按照时间排序：

> new_post_name: :year-:month-:day-:title.md

Disqus的名字必须要正确，不然是无法拿到你的评论的，可以登录disqus查看你的名称。

# 修改主题

hexo默认主题不是特别好看，不过[Themes](https://github.com/hexojs/hexo/wiki/Themes)里面列出了相当多不错的主题，~~这里我选择了[alberta](https://github.com/ken8203/hexo-theme-alberta)~~，然后对其进行了进一步的[简化](https://github.com/xuelangZF/hexo-theme-alberta)。

主题的安装、使用简单的不能再简单了，这里不再啰嗦，主要写一下我对主题的删减、修改部分吧：

1. 删去开始部分的图片（加载起来浪费时间）
2. 删掉页面底部的版权说明（这玩意儿没人看吧）
3. 删掉很炫的fancybox（这么炫，我不敢用）
4. 去掉分享文章的链接（又不是鸡汤文，没人会分享的）
5. 部署国内CDN（jquery和google字体...丧心病狂！）
6. 修改了blockquote，code，table的样式。

修改后的效果如图：

![博客效果图][2]

你可以在[这里](https://github.com/xuelangZF/hexo-theme-alberta)fork哦。前面说过我不是很会前端的Css、JavaScript，但是仍然能对Theme进行删减，说明Theme这块可读性是多么的好，所以你可以放心去定制自己的Theme吧。

顺便提一下，[360的CDN](http://libs.useso.com/)不错，算是做了一件好事啊！

# 强大的插件

之前用jekyll博客系统时，为了实现订阅功能，用google找到一段“神奇”的代码，可以生成feed.xml页面。但是要添加订阅，必须输入blog.com/feed.xml，只输入主页地址blog.com是不行的。然后困扰了许久，才找到[RSS Auto-discovery](http://www.rssboard.org/rss-autodiscovery)这篇文章，成功解决问题。

我只是想实现订阅功能而已，jekyll却逼着我了解了许多RSS协议的内容，好吧，谁让自己不是全栈工程师呢。而hexo对我这种新手都很友好，我要实现订阅，只需要使用[hexo-generator-feed](https://github.com/hexojs/hexo-generator-feed)插件即可，我才懒得去了解你怎么实现订阅呢。

插件的安装卸载一条命令就能搞定，详细的插件列表可以看[Plugins](https://github.com/hexojs/hexo/wiki/Plugins)。

不过在这里被坑了一次，文档中并没有说`EJS, Stylus和Markdown renderer`被移出核心模块，所以按照文档方法安装hexo后，根本不能够生成静态文件，后来看到[Issue 620](https://github.com/hexojs/hexo/pull/620)才知道怎么回事。

所以提醒一下，你需要手动安装EJS, Stylus和Markdown renderer：

```
$ npm install hexo-renderer-ejs --save
$ npm install hexo-renderer-stylus --save
$ npm install hexo-renderer-marked --save
```

对了，还有[Tag Plugins](http://hexo.io/docs/tag-plugins.html)，可以允许你在博客里面引用其他站点的内容。比如要引用jsFiddle中的代码片段，只需要{% raw %}
{% jsfiddle shorttag [tabs] [skin] [width] [height] %}{% endraw %}，或者是用{% raw %}{% gist gist_id [filename] %} {% endraw %}引入gist中的内容。

# 开始优雅地写博客吧

可以用`hexo new "blog_name"`来新建一篇文章，文章藏在`source/_posts`里面。我们可以在`scaffolds`里面设置生成新博客的模板，比如文章(layout: post)的模板`post.md`可以改为如下内容：

> title: {{ title }}
> date: {{ date }}
> tags:
> category:
> \---

这里文章有两种layout，如下：

Layout|	Destination
---|---
post(Default) | source/_posts
page	|source

post用来放文章，page可以用来放一些比如“关于我”，“友情链接”，“404页面”之类的页面。GitHub Pages [自定义404页面](http://help.github.com/articles/custom-404-pages)非常容易，直接在根目录下创建自己的404.html就可以。但是自定义404页面仅对绑定顶级域名的项目才起作用，GitHub默认分配的二级域名是不起作用的，使用hexo server在本机调试也是不起作用的。

目前有如下几个公益404接入地址，我选择了腾讯的。404页面，每个人可以做的更多。

* [腾讯公益404](http://www.qq.com/404)
* [404公益_益云(公益互联网)社会创新中心](http://yibo.iyiyun.com/Index/web404)
* [失蹤兒童少年資料管理中心404](http://404page.missingkids.org.tw/)

只需要在source目录添加`404.html`文件即可，文件内容为：

```
layout: false
---
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<title>宝贝，公益404带你们回家</title>
</head>
<body>
	<script type="text/javascript" src="http://www.qq.com/404/search_children.js" charset="utf-8"></script>
</body>
</html>
```

一定要设置`layout:false`(还有三个短横线)，不然会被hexo解析。写完之后，可以用`hexo generate`生成静态文件，然后用`hexo server`运行本地服务器，查看效果。如果发现有问题，在md文件改了之后，刷新页面就可以看到更改的效果了（是不是比jekyll强大啊）。

更多用hexo写文章的内容可以看官方文档：[Create a New Post](http://hexo.io/docs/writing.html)。hexo中还提供了其他的命令，可以看[Commands](http://hexo.io/docs/commands.html)。

自己之前写了十几篇文章，只需要将开头部分稍作改动即可直接迁移到hexo中，文章数目比较少，所以就手动更改文章头了。

# 迁移Disqus评论

hexo生成的的文章url中时间格式为`/2013/11/22/`，而之前博客的url中时间为`2013-11-22`，导致之前文章的评论就消失了。（链接格式可以指定的，所以最好是和以前的保持一致）

好在Disqus允许我们迁移博客评论，具体方法可以看[Help: Migration Tools](https://help.disqus.com/customer/portal/articles/286778-migration-tools)。原理其实很简单，Disqus评论默认将文章url作为标识符，每个url对应该文章的评论，迁移时我们只需要建立起新旧文章地址的对应关系即可。

# 绑定域名

改了博客界面之后，顺便注册了一个域名，绑定github博客中。你可以在[free domains域名免费注册](http://www.dot.tk/en/index.html?lang=en)里选择自己喜欢的域名，然后申请（免费）。申请成功之后，添加两条域名解析A记录，如下图：

![域名解析A记录][1]

然后可以用`dig`命令(当然也可以用nslookup)验证域名记录是否生效：

```bash
$ dig selfboot.cn +nostats +nocomments +nocmd

; <<>> DiG 9.8.3-P1 <<>> selfboot.cn +nostats +nocomments +nocmd
;; global options: +cmd
;selfboot.cn.			IN	A
selfboot.cn.		14439	IN	A	192.30.252.153
selfboot.cn.		14439	IN	A	192.30.252.154
```

然后在自己的博客仓库根目录新建名为`CANME`的文件，里面内容为你的域名地址。如果没有绑定成功，可以看github的帮助文档：[My custom domain isn't working](https://help.github.com/articles/my-custom-domain-isn-t-working/)。


---
2016-08-24 更新

已经弃用 alberta，换用 [maupassant-hexo](https://github.com/tufu9441/maupassant-hexo)。

安装以及使用 Hexo 时，最好参考官方最新文档，因为不同版本区别挺大，以官方文档为准不会错。

---

# 更多阅读

[hexo你的博客](http://ibruce.info/2013/11/22/hexo-your-blog/)
[Tips for configuring an A record with your DNS provider](https://help.github.com/articles/tips-for-configuring-an-a-record-with-your-dns-provider/)
[HEXO 指定404页面](http://www.foreverpx.cn/2014/09/23/hexo404/)

[1]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20141130_jekyll_to_hexo_domain.png
[2]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20141130_jekyll_to_hexo_theme.png

