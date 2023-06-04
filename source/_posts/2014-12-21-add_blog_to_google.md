title: 博客推广——提交搜索引擎
date: 2014-12-21
tags: [教程]
category: 工具介绍
toc: true
description: 这篇文章详细介绍了如何将你的博客提交给搜索引擎，以提高其在线可见性。文章详细解释了如何向Google和百度等搜索引擎提交你的网站，以及如何验证你的网站所有权。此外，文章还介绍了如何使用站点地图来帮助搜索引擎更好地抓取你的网站。如果你正在寻找提高你的博客在线可见性的方法，那么这篇文章是你的理想选择。
---

在[更换博客系统——从jekyll到hexo](http://zhaofei.tk/2014/11/30/jekyll_to_hexo/)中，我们已经搭建好了自己的博客，绑定了属于自己的域名，并且成功托管在Github上，这样其他人就可以通过域名看到我们的博客。看起来没什么问题了，接下来只需要我们坚持写原创文章，就应该能吸引到很多小伙伴来拜读了。

不幸的是，我们的博客很可能会被遗忘在角落里、无人问津，只因为我们没有向Google等搜索引擎宣告博客的诞生。如果连搜索引擎都不知道我们博客的诞生，还有谁能知道它的存在呢？毕竟搜索引擎是向大众展示我们博客的最重要且几乎唯一的途径。

<!-- more -->

下面给大家展示下我的博客之前是如何被Google抛弃的(为了尽量精确地匹配博客，用了inurl语法，图片是之前保存的)

![搜索引擎未收录][1]

# 提交搜索引擎

每个搜索引擎都提供了`添加网站`的入口，比如：

* [Google搜索引擎提交入口](https://www.google.com/webmasters/tools/home?hl=zh-CN)
* [百度搜索引擎入口](http://www.baidu.com/search/url_submit.htm)

下文以Google为例(**百度提交之后也搜不到，不知道怎么回事**)，在前面的入口链接中点击添加网站，输入自己博客的域名即可。之后，可以选择验证博客是属于我们的(也就是登录的Google账户)，验证后才能看到该博客站点的特定信息或者使用Google的一些站长工具。

验证网站的方法特别简单，Google提供了详细的说明，推荐的方法是HTML文件上传，下面引用Google的说明：

> 1、 下载此 HTML 验证文件。 [google0b4c8a25b65d7c2a.html]
> 2、 将该文件上传到 http://yoursite/
> 3、 通过在浏览器中访问 http://yoursite/google0b4c8a25b65d7c2a.html， 确认上传成功。
> 4、 点击下面的“验证”。
>
> 为保持已进行过验证的状态，即使成功通过了验证也请不要删除该 HTML 文件。

我们的博客系统使用了hexo，部署在Github上，因此下载Google的验证文件之后，需要在文件开头添加`layout: false`来取消hexo对其进行的转换，如下：

```bash
$ ls source/
404.html    _posts    google0b4c8a25b65d7c2a.html
CNAME    aboutme.md
$ cat source/google0b4c8a25b65d7c2a.html
layout: false
---
google-site-verification: google0b4c8a25b65d7c2a.html
```

提交博客之后，需要等待一段时间才能在Google上搜到你的博客，因为Google需要时间来处理我们的请求、抓取相应网页并将其编入索引。此外，由于Google采用复杂的算法来更新已编入索引的资料，因此无法保证我们博客的所有更改都会被编入索引。

我的博客已经提交了几周了，所以现在可以搜索到了，你可以试试：

![被Google收录][2]

# 站点地图

验证博客所有权之后，就可以使用一些网站站长工具，比如设置站点地图，那么什么是站点地图呢？引用Google的解释如下：

> 站点地图是一种文件，您可以通过该文件列出您网站上的网页，从而将您网站内容的组织架构告知Google和其他搜索引擎。Googlebot等搜索引擎网页抓取工具会读取此文件，以便更加智能地抓取您的网站。

虽然使用站点地图并不能保证Google会抓取站点地图中列出的所有网页或将所有网页编入索引，但是大多数情况下，网站站长会因提交站点地图而受益，决不会为此受到处罚。

对于使用Hexo写博客的小伙伴来说，可以使用 [hexo-generator-sitemap](https://github.com/hexojs/hexo-generator-sitemap) 插件来生成Sitemap。插件的使用很简单，只需要下载即可：

```
$ npm install hexo-generator-sitemap --save
```

之后，当我们使用 `hexo generate` 时，会自动生成 `sitemap.xml` 文件。

向[Google站长工具](https://www.google.com/webmasters/tools)提交sitemap也是很简单的过程，登录Google账号，选择站点，之后在`抓取`——`站点地图`中就能看到`添加/测试站点地图`，如下图：

![站点地图][3]

站长工具中还有其他一些不错的工具，比如`搜索流量`——`指向您网站的链接`里可以看到我们博客的外链情况，如下图

![外链][4]

从外链中可以看到好多 segmentfault 和 jobbole 的外链，这是因为我几乎将每篇博客都同时投放在 segmenfault 和 jobbole 上，方便推广。

# 更多阅读

[了解站点地图](https://support.google.com/webmasters/answer/156184?hl=zh-Hans)
[如何向google提交sitemap（详细）](http://fionat.github.io/blog/2013/10/23/sitemap/)


[1]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20141221_google_no_result.png
[2]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20141221_google_result.png
[3]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20141221_sitemap.png
[4]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20141221_webmaster.png


