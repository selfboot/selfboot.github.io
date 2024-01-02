---
title: 个人博客访问速度优化：CDN, 图片压缩, HTTP2
tags: [前端, 方法]
category: 项目实践
toc: true
description: 
---

个人博客也写了有一段时间了，之前是能访问到就好，对速度没啥追求。前段时间，自己访问的时候，都感觉到页面加载速度比较慢，比较影响体验。此外加载慢的话，还会**影响搜索引擎排名**。于是动手对博客进行了系列的优化，提升了页面的加载速度。中间遇到了不少坑，本文记录下来，希望对大家有所帮助。

![个人博客网页加载速度优化](https://slefboot-1251736664.file.myqcloud.com/20231016_hexo_blog_speed_index.png)

<!-- more -->

先说下个人博客的整体架构，博客是基于 [Hexo](https://hexo.io/index.html) 搭建的。托管在 GitHub 上，每次增加新的 markdown 文章后，就会触发 Github Action 自动构建，生成静态文件。这里静态页面没有直接用 Github Pages 托管，而是用了 [netlify](https://app.netlify.com/)，因为 netlify 提供了免费的 CDN 加速，国内和国外访问延迟都还可以，并且部署也很简单。

## CDN 加速

首先就是 CDN 加速，对于静态页面，这种方法最简单的、最有效的。博客里的 html 文件，直接用 netlify 自带的 CDN 加速，国内、外访问速度提升了很多。除了静态 html 文件，还有一些页面 css 和 js 资源，以及最耗带宽的图片资源。

### css 和 js 文件

这里 js 和 css 我也是和博客静态文件一样，依赖 netlify CDN 加速。只要把这些静态文件全部放在博客的主题 css 和 js 目录下，然后在博客模板中引用即可。

```html
link(rel='stylesheet', type='text/css', href=url_for(theme.css) + '/normalize.min.css') 
link(rel='stylesheet', type='text/css', href=url_for(theme.css) + '/pure-min.min.css') 
link(rel='stylesheet', type='text/css', href=url_for(theme.css) + '/grids-responsive-min.css') 
script(type='text/javascript', src=url_for(theme.js) + '/jquery.min.js')
```

这样的好处在于，解析我博客域名后，会把 html 文件和 js 这些一起从 CDN 加载。在 HTTP2 的情况下，这些文件可以并行加载，提升了加载速度。相比从其他 CDN 加载这些文件，少了 DNS 解析，理论上会更快些。

不过对于 `font-awesome`，因为它的 css 文件中引用了字体文件，直接放在主题的 css 目录下还需要很多字体文件，有点麻烦。这里就引用了 CDN 的资源，推荐用 [cloudflare](https://cdnjs.cloudflare.com)，网络活菩萨的 CDN，速度还是很快的。并且各种静态库版本也很全，可以直接在网站上搜索，然后引用。

```html
link(rel='stylesheet', href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css')
```

这里最开始放在 [bootcdn](https://www.bootcdn.cn/index.html) 的，用了一段时间后，发现图标加载不出来。看了下，应该是 cdn 上的**图标字体文件损坏**，但是一直也没修复，于是就弃用了。

### 图片 CDN


### CDN 防盗刷

博客图片放在 CDN 上之后，因为一个文章 [从外围引流贴看黑产的搜索引擎排名优化生意](http://localhost:4000/2023/12/28/black_hat_SEO/)，不知道得罪了什么人，于是被盗刷了图片的 CDN 流量，搞得我**腾讯云都欠费**了。这里先普及下，一般 CDN 是**按照流量计费**，腾讯云上境内 100GB 一般是 20 元。对于个人博客来说，流量一般很少的，这里的 CDN 费用基本可以忽略。但是如果被人盗刷流量，就会导致 CDN 费用暴涨。如果没有做一些防护，盗刷很简单，只用不断发请求来拉你的图片就行。

下图就是我 CDN 被盗刷的监控，在 2023 年 12 月 29，只用不到 3 个小时，就被刷了 200G 左右的流量，相当于近 40 元的费用。当然黑产估计还是手下留情了，不然很容易就刷的我破产了。

![CDN 被盗刷，短时间产生大量流量](https://slefboot-1251736664.file.myqcloud.com/20240102_hexo_blog_speed_cdn_traffic_theft.png)

当然，有一些常规的做法，可以来对抗 CDN 盗刷流量。腾讯云的 [攻击风险高额账单](https://cloud.tencent.com/document/product/228/51813) 文档里面介绍的不错，主要有三类方法：

1. 访问控制。这里有很多种，比如防盗链，主要防止别人的网站用到你的图片。IP 黑白名单配置，找到攻击者的 IP，全部加入黑名单，不过专业的黑产可能有很多 IP，封不过来。这时候再配一个 IP 频率限制，每个 IP 只给 10 QPS，这样能大幅度提升攻击者的对抗成本。
2. 流量管理。腾讯云 CDN 提供的一个兜底方案，比如 5 分钟内流量到 100 MB，或者每天流量到 10GB，就自动关 CDN，防止不小心产生高额账单。
3. 安全防护。需要付费购买，对于个人博客来说有点杀鸡用牛刀了，暂时没用到。

这里对抗黑产的基本原则就是，**在不影响正常用户体验的情况下，增加攻击者的成本。同时如果没有防住，尽量让损失可控**。下面腾讯云我博客图片 CDN 的部分安全防护。

![CDN 防盗刷简单配置](https://slefboot-1251736664.file.myqcloud.com/20240102_hexo_blog_speed_cdn_traffic_protection.png)

## 图片优化

### 图片格式优化

### 响应式图片

### 图片监控


## HTTP 2

去掉不支持 HTTP2 的一些请求。

![HTTP2 支持情况](https://slefboot-1251736664.file.myqcloud.com/20240102_hexo_blog_speed_http2.png)

## 参考资源

[RespImageLint - Linter for Responsive Images](https://ausi.github.io/respimagelint/)  
[Properly size images](https://developer.chrome.com/docs/lighthouse/performance/uses-responsive-images/)  