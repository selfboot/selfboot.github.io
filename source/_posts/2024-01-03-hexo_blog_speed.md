---
title: 个人博客访问速度优化：CDN, 图片压缩, HTTP2
tags:
  - 前端
  - 方法
category: 项目实践
toc: true
description: 本文详细介绍了个人博客访问速度优化的技术手段，包括CDN加速、WebP格式转换、响应式图片、HTTP/2协议等，并给出具体的代码实现和避坑指南。这些方法能明显提升页面加载速度，改善用户体验。文章还分析了效果评估指标，为搭建高性能博客提供了参考。
date: 2024-01-03 22:30:52
---

个人博客也写了有一段时间了，之前是能访问到就好，对速度没啥追求。前段时间，自己访问的时候，都感觉到页面加载速度比较慢，比较影响体验。此外加载慢的话，还会**影响搜索引擎排名**。于是动手对博客进行了系列的优化，提升了页面的加载速度。中间遇到了不少坑，本文记录下来，希望对大家有所帮助。

![个人博客网页加载速度优化](https://slefboot-1251736664.file.myqcloud.com/20240102_hexo_blog_speed_insights.png)

<!-- more -->

先说下个人博客的整体架构，博客是基于 [Hexo](https://hexo.io/index.html) 搭建的。托管在 GitHub 上，每次增加新的 markdown 文章后，就会触发 Github Action 自动构建，生成静态文件。这里静态页面没有直接用 Github Pages 托管，而是用了 [netlify](https://app.netlify.com/)，因为 netlify 提供了免费的 CDN 加速，国内和国外访问延迟都还可以，并且部署也很简单。

## CDN 加速

首先就是 CDN 加速，对于静态页面，这种方法最简单的、最有效的。博客里的 html 文件，直接用 netlify 自带的 CDN 加速，国内、外访问速度提升了很多。除了静态 html 文件，还有一些页面 css 和 js 资源，以及最耗带宽的图片资源。

### CSS 和 JS 文件

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

其实最影响页面加载速度的就是图片，优化的关键点就是图片。这里图片本来是存储在腾讯云 COS 上的，访问也是直接用 COS 链接。图片的优化有几个方面，这里先来看看 CDN 加速，至于图片压缩和自适应，下面展开。

以腾讯云 CDN 为例，要给 COS 存储开启 CDN 还是比较简单的，2022年5月9日前，支持默认 CDN 加速域名，只需要简单开启就行。不过现在的话，只能用自定义域名，如果做国内加速，**域名还需要备案**。配置起来很简单，基本设置好加速的域名，以及源站地址就行。

![腾讯云 CDN 加速 COS 存储](https://slefboot-1251736664.file.myqcloud.com/20240102_hexo_blog_speed_cdn_image.png)

这里配置好 CDN 后，就可以通过腾讯云的**实时监控**，看到实时请求数据。包括带宽，请求量，流量命中率，请求数，请求结果状态码等信息。此外，通过**数据分析**，还能看到访问 Top 1000 URL，独立 IP 访问数，Top 100 Referer，**访问用户区域分布**等信息。

CDN 还有**日志服务**，可以提供每个小时的访问日志下载，里面有请求时间、客户端IP、访问域名、文件路径、字节数大小、省份、运营商、HTTP返回码、Referer、 request-time（毫秒）、UA、Range、HTTP Method、HTTP协议标识、缓存Hit/Miss等信息，可以用来做一些分析。

平常用的比较多的还有刷新预热，比如博客中的一个图片，已经缓存到了 CDN。但是我又改了下图，在 COS 中上传后，可以在这里刷新缓存，这样 CDN 缓存里的就是最新版本的图片了。

除了腾讯云的 CDN，还有各大云厂商的 CDN，国内的加速都需要域名备案，比较麻烦些。这里可以尝试 Cloudflare 的 R2 存储配合 CDN 加速，免费额度应该也够个人博客用了。

### CDN 防盗刷

博客图片放在 CDN 上之后，因为一个文章 [从外围引流贴看黑产的搜索引擎排名优化生意](http://localhost:4000/2023/12/28/black_hat_SEO/)，不知道得罪了什么人，于是被盗刷了图片的 CDN 流量，搞得我**腾讯云都欠费**了。这里先普及下，一般 CDN 是**按照流量计费**，腾讯云上境内 100GB 一般是 20 元。对于个人博客来说，流量一般很少的，这里的 CDN 费用基本可以忽略。但是如果被人盗刷流量，就会导致 CDN 费用暴涨。如果没有做一些防护，盗刷很简单，只用不断发请求来拉你的图片就行。

下图就是我 CDN 被盗刷的监控，在 2023 年 12 月 29，只用不到 3 个小时，就被刷了 200G 左右的流量，相当于近 40 元的费用。当然黑产估计还是手下留情了，不然很容易就刷的我破产了。

![CDN 被盗刷，短时间产生大量流量](https://slefboot-1251736664.file.myqcloud.com/20240102_hexo_blog_speed_cdn_traffic_theft.png)

当然，有一些常规的做法，可以来对抗 CDN 盗刷流量。腾讯云的 [攻击风险高额账单](https://cloud.tencent.com/document/product/228/51813) 文档里面介绍的不错，主要有三类方法：

1. **访问控制**。这里有很多种，比如防盗链，主要防止别人的网站用到你的图片。IP 黑白名单配置，找到攻击者的 IP，全部加入黑名单，不过专业的黑产可能有很多 IP，封不过来。这时候再配一个 IP 频率限制，每个 IP 只给 10 QPS，这样能大幅度提升攻击者的对抗成本。
2. **流量管理**。腾讯云 CDN 提供的一个兜底方案，比如 5 分钟内流量到 100 MB，或者每天流量到 10GB，就自动关 CDN，防止不小心产生高额账单。
3. **安全防护**。需要付费购买，对于个人博客来说有点杀鸡用牛刀了，暂时没用到。

这里对抗黑产的基本原则就是，**在不影响正常用户体验的情况下，增加攻击者的成本。同时如果没有防住，尽量让损失可控**。下面腾讯云我博客图片 CDN 的部分安全防护。

![CDN 防盗刷简单配置](https://slefboot-1251736664.file.myqcloud.com/20240102_hexo_blog_speed_cdn_traffic_protection.png)

## 图片优化

在上了 CDN 后，用 [PageSpeed Insights](https://pagespeed.web.dev/) 测了下，发现图片加载比较耗时，优化方法主要有两个：

1. **优化图片格式**，用 WebP 格式。博客的图片之前都是 png 的，虽然上传 COS 前自动压缩了，但是还是比较大。WebP 是一个非常出色的现代图片格式，与 PNG 相比，WebP **无损图片**的尺寸缩小了 26%。
2. **自适应图片**。就是根据屏幕大小，加载不同尺寸的图片，比如手机屏幕加载小图，电脑屏幕加载大图。这样可以减少加载的流量，提升加载速度。

### 图片格式优化

这里最直观的方法就是，把博客所有存量的图片**全部转换为 WebP 格式**，重新上传 COS 后，替换博客文章里的图片链接。不过在看腾讯云的文档时，发现 COS 有**图片处理**功能，可以在图片链接后面，加上参数，来完成对图像的格式转换。比如我的图片地址是 `https://slefboot-1251736664.file.myqcloud.com/20240102_hexo_blog_speed_http2.png`，只用在链接后面加上 `/webp`，就拿到了一个小的多的 WebP 图片。

整体配置也很简单，打开 COS bucket 的**数据处理，图片处理**，然后在**图片处理样式**里增加样式即可，上面的格式转换例子，样式描述就是 `imageMogr2/format/webp/interlace/1`。腾讯云用的万象图片处理，支持了不少处理，包括图片缩放，裁剪，旋转，格式转换，水印，高斯模糊等等。这里只用到了格式转换，其他的可以自己看下文档。

下图是我用到的几个转换，其中 webp 就是原图转换为 WebP 格式，然后 webp400 就是转换为宽度为 400 像素的图，用来在比较小的设备上显示。

![腾讯云 COS 图片处理](https://slefboot-1251736664.file.myqcloud.com/20240102_hexo_blog_speed_image_webp.png)

写博客过程中，图片链接还是正常的 png 链接就行，然后 hexo 构建静态文件使，用 JS 脚本来批量把文章里的图片链接加上样式。这里也踩了一个坑，生成的 webp 中，有部分图片链接返回 404，但是 COS 上文件是存在的。后来找了客服，辗转了好几次，才最终定位到问题，万象在解析 URL 的时候，decode 链接里的 + 号。然后客服通过他们自己的后台，给我的桶关闭了这个 decode 选项。

![腾讯云 COS 图片处理 Bug](https://slefboot-1251736664.file.myqcloud.com/20240102_hexo_blog_speed_cdn_image_bug.png)

### 自适应图片

在前面格式转换这里，提到我建了多个样式，对应不同大小的 WebP 图片。接下来要做的就是，根据设备像素大小，来决定具体加载哪个尺寸的图片。在处理前，先推荐一个工具，[RespImageLint](https://ausi.github.io/respimagelint/)，可以检查页面中的图片尺寸是否合理。

把这个工具加到浏览器标签后，访问博客中的文章页面，然后点击 `Lint Images` 标签，工具就会模拟各种尺寸的设备来访问页面，然后看浏览器请求的图片是否合理。最后会生成一个报告，列出每个图片的检查结果。如下图：

![RespImageLint 检查自适应图片](https://slefboot-1251736664.file.myqcloud.com/20240102_hexo_blog_speed_link_images.png)

当然这个是我用了自适应图片后的检查结果了，如果没有做自适应，就会有很多警告。这里自适应基本思路就是用万象为每张图片提供多个版本大小，然后通过媒体查询、视口尺寸属性等指定在不同像素设备下使用的图片版本。具体到我博客里，在 hexo 渲染 HTML 的时候，用 js 脚本来替换图片链接，增加 srcset，sizes 属性。

- 设置 srcset 属性。srcset 属性用于指定图片的不同尺寸来源，允许浏览器根据设备屏幕的大小和分辨率选择合适的图片版本。
- 设置 sizes 属性。sizes 属性定义了图片在不同视口（viewport）宽度下应该使用的布局宽度，允许浏览器更准确地选择 srcset 中的合适图片。
- 更新图片属性，更新 img 标签的 src、width 和 height 属性，确保图片的适当渲染和比例。

具体就是在 hexo 项目的根目录下创建 scripts 目录，然后创建 `img.js` 文件，内容如下：

```js
const cheerio = require("cheerio");
const path = require("path");
const imageSize = require("image-size");
const url = require("url");
const fs = require("fs");

hexo.extend.filter.register("after_render:html", function (str, data) {
  const $ = cheerio.load(str);

  $("img").each(function () {
    const img = $(this);
    const src = img.attr("src");

    if (
      src &&
      (src.endsWith(".png") ||
        src.endsWith(".jpeg") ||
        src.endsWith(".jpg") ||
        src.endsWith(".gif") || 
        src.endsWith(".webp"))
    ) {
      const parsedUrl = url.parse(src);
      const imgPathPart = parsedUrl.path;
      const imgPath = path.join(__dirname, "../images", imgPathPart);

      // 检查文件是否存在
      if (fs.existsSync(imgPath)) {
        const dimensions = imageSize(imgPath);
        const width = dimensions.width;

        const small = src + "/webp400";
        const middle = src + "/webp800";
        const large = src + "/webp1600";
        const origin = src + "/webp";
        let srcset = `${origin} ${width}w`;
        if (width > 400) srcset += `, ${small} 400w`;
        if (width > 800) srcset += `, ${middle} 800w`;
        if (width > 1600) srcset += `, ${large} 1600w`;
        img.attr("srcset", srcset);
        let sizes;
        if (width <= 400) {
          sizes = `${width}px`;
        } else {
          sizes="(min-width: 1150px) 723px, (min-width: 48em) calc((100vw - 120px) * 3 / 4 - 50px), (min-width: 35.5em) calc((100vw - 75px), calc(100vw - 40px)"
        }
        img.attr("sizes", sizes);
        img.attr("src", origin);
        const height = dimensions.height;
        img.attr("width", width);
        img.attr("height", height);
      }
    }
  });

  return $.html();
});
```

然后 hexo 渲染的时候就会调用这个脚本来对图片属性进行处理，渲染后的结果如下：

![自适应图片渲染后的结果](https://slefboot-1251736664.file.myqcloud.com/20240103_hexo_blog_speed_image_render.png)

接着可以在浏览器的开发者工具中，**选择不同尺寸的屏幕大小**，然后看请求 Network 选项卡中，浏览器具体选择的是哪个图片版本。如下图，在小尺寸下选择的 400 的图片，中尺寸就是 800 的图片。

![自适应图片渲染后在不同设备下的尺寸](https://slefboot-1251736664.file.myqcloud.com/20240103_hexo_blog_speed_image_render_choice.png)

## HTTP 2

最后一个优化就是，让博客中的请求尽量用 HTTP2 协议。HTTP2 做了很多优化，相比 HTTP1.1 有较大提升，可以很有效的提高网页加载速度。比如可以使用单个 TCP 连接来一次发送多个数据流，使得任何资源都不会会阻碍其他资源。博客静态资源托管在了 Netlify，默认支持 http2，但是里面图片和一些 js 脚本，有的并不支持 http2。在浏览器的控制台工具中，通过 network 选项卡，可以看到每个资源的 http2 支持情况。

![博客中各个资源的 HTTP2 支持情况](https://slefboot-1251736664.file.myqcloud.com/20240102_hexo_blog_speed_http2.png)

接下来就是把 http 1.1 的请求，升级为 http2。最主要的其实是图片，因为图片其实是流量大头。这里图片放到 CDN 后，就可以开启 HTTP2 了，以腾讯云为例，如下：

![腾讯云 CDN HTTP2 配置](https://slefboot-1251736664.file.myqcloud.com/20240102_hexo_blog_speed_http2_image.png)

解决图片后，剩下的只有 **Disqus 评论系统**和**百度的统计脚本**还是用的 http1.1 了。看了下 Disqus 的官网，没发现怎么开启 http2，不过考虑到这里评论系统是动态加载，不影响页面加载速度，就先不管了。百度的[统计脚本](https://tongji.baidu.com/web/help/article?id=174&type=0) 也不支持 http2，不过考虑到流量没有多少来自百度，百度的统计也比较垃圾，这里就直接去掉百度统计了。目前接了 [Google Analytics](https://analytics.google.com/analytics/web/) 和 Cloudflare 的 [Web analytics](https://www.cloudflare.com/zh-cn/web-analytics/)，这两个都支持 http2，并且也足够用了。

## 效果评估

网页加载速度评估我这里主要用的是 [PageSpeed Insights](https://pagespeed.web.dev/)，和 Google 的 Lighthouse，一般评估网页的几个关键指标：

- FCP，First Contentful Paint，**首次内容渲染** FCP 衡量的是用户到网页后，**浏览器呈现第一段 DOM 内容所用的时间**。网页上的图片、非白色元素和 SVG 都会被视为 DOM 内容。一般 1.8s 以内都是可以接受的，Google 也会认为是 Good。
- LCP，Largest Contentful Paint，**最大内容渲染时间**用于测量视口中最大的内容元素何时渲染到屏幕上。这粗略地估算出网页主要内容何时对用户可见。
- FID，First Input Delay，衡量的是从用户首次与网页互动（比如点击链接）到浏览器能够实际开始处理事件处理脚本以响应该互动的时间。

下图是各个指标的效果分布：

![网页加载指标评估效果](https://slefboot-1251736664.file.myqcloud.com/20240103_hexo_blog_speed_web_vitals.png)

还有一些其他指标，这里就先不展开聊了。Google 的 Lighthouse 给出的优化建议会比较详细一些，比如：

- 压缩 CSS 和 JS 的大小；
- 移除用不到的 CSS 样式等；
- 最大限度的减少主线程延迟

不过这些优化对整体效果提升效果不是很明显，并且需要花费比较大的时间，博客里就没有做这些优化。本博客优化完之后，性能的评分基本在 95 分以上了。不过这里的指标基于你当前地区，比如图片加载速度，国内 CDN 速度就很快，这里评估肯定也不错。

如果用了 Cloudflare 的 Web analytics，能看到实际访问博客的用户的各项指标，如下图：

![Cloudflare Web analytics 博客访问性能实时监测](https://slefboot-1251736664.file.myqcloud.com/20240103_hexo_blog_speed_real_vitals.png)

这里 LCP 有 5% 的 Poor，主要是因为博客中的图片，有些地区网络加载图片比较慢，这里也给出了明细，如下：

```
#layout>div.pure-u-1.pure-u-md-3-4>div.content_container>div.post>div.post-content>p>a.fancybox>img
slefboot-1251736664.file.myqcloud.com/20230727_chatgpt_hacking_jailbreaking_cover.webp/webp
5,485ms
#layout>div.pure-u-1.pure-u-md-3-4>div.content_container>div.post>div.post-content>p>a.fancybox>img
slefboot-1251736664.file.myqcloud.com/20231228_black_hat_SEO_search.png/webp1600
8,311ms
```

说明 CDN 加速也不是 100% 就能解决所有地区的访问，可能换个比较好的 CDN 会有提升吧，不过作为个人博客，也没有继续折腾了。

## 参考文档
[Web Vitals](https://web.dev/articles/vitals)
[Eliminate render-blocking resources](https://developer.chrome.com/docs/lighthouse/performance/render-blocking-resources?hl=en)
[An image format for the Web](https://developers.google.com/speed/webp)  
[RespImageLint - Linter for Responsive Images](https://ausi.github.io/respimagelint/)  
[Properly size images](https://developer.chrome.com/docs/lighthouse/performance/uses-responsive-images/)  
[Lighthouse performance scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring?hl=en)