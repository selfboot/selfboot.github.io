---
title: 个人博客访问速度优化：CDN, HTTP2, 图片等
tags: [前端, 方法]
category: 项目实践
toc: true
description: 
---

个人博客也写了有一段时间了，之前是能访问到就好，对速度没啥追求。前段时间，自己访问的时候，都感觉到页面加载速度比较慢，比较影响体验。此外加载慢的话，还会**影响搜索引擎排名**。于是动手对博客进行了系列的优化，提升了页面的加载速度。本文记录下一些关键优化点，希望对大家有所帮助。

![个人博客网页加载速度优化](https://slefboot-1251736664.file.myqcloud.com/20231016_hexo_blog_speed_index.png)

<!-- more -->

先说下个人博客的整体架构，博客是基于 [Hexo](https://hexo.io/index.html) 搭建的。托管在 GitHub 上，每次增加新的 markdown 格式文章后，就会触发 Github Action 自动构建，生成静态文件。

## HTTP 2

## CDN 加速

### 页面资源 CDN

### 图片 CDN

## 图片优化

### 图片格式优化

### 响应式图片

### 图片监控


## 参考资源

[RespImageLint - Linter for Responsive Images](https://ausi.github.io/respimagelint/)  
[Properly size images](https://developer.chrome.com/docs/lighthouse/performance/uses-responsive-images/)  