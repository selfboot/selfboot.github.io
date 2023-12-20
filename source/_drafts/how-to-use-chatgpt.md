---
title: 安全、快速、便宜访问 ChatGPT，最新最全实践教程！
tags:
  - 方法
  - ChatGPT
category: 计算机网络
toc: true
description: 
date: 
---

OpenAI 的 ChatGPT 对于个人工作和生活来说，是一个非常有用的工具。但是，由于众所周知的原因，OpenAI 的服务器在中国大陆地区是无法访问的。本文将介绍如何安全、快速、便宜地访问 ChatGPT，每一步都有详细的图文教程，并带有原理介绍，结果验证方法，让你零基础也能跟着学会。

![OpenAI ChatGPT 中国区网络问题](https://slefboot-1251736664.file.myqcloud.com/20231219_how_to_use_chatgpt.png)

<!-- more -->

## OpenAI 风控拦截

在开始介绍如何使用 ChatGPT 之前，先来看看 OpenAI 的风控拦截策略。OpenAI 目前风控还是比较严格的，对于 IP 所属地区以及账户的风险特征，都有很严格的风控策略。

### IP 拦截

OpenAI 目前不允许中国地区访问，来自**中国大陆和香港地区的 IP** 都是无法直接访问 ChatGPT。如果是海外的 IP，也有可能已经被 OpenAI 的风控拦截，比如各大云服务器的海外 IP。目前已知被拦截的云厂商就有腾讯云、阿里云、AWS、Google cloud、DigitalOcean 等。直接用这些云厂商的海外机房出口 IP 去访问 ChatGPT，都会被拦截。

对于 IP 问题，最好的方法是用一个 [OpenAI 支持国家和地区](https://help.openai.com/en/articles/7947663-chatgpt-supported-countries)的纯净 IP，然后最好是独自用，这样不会触发频率限制。如果很多人用，因为 OpenAI 对单个 IP 的访问频率有限制，可能会导致返回 429 错误。这时候打开站点可能会像下图一样，加载不出来历史记录，并且会话也没法用。

![OpenAI 网络频率限制](https://slefboot-1251736664.file.myqcloud.com/20231219_how_to_use_chatgpt_429.png)

这时候其实打开浏览器的开发者工具，就能看到一些关键 HTTPS 的请求返回了 429 错误码，这就是 IP 频率限制导致的。

### 账户风控

除了对 IP 有拦截，OpenAI 还有一套内部的非公开的策略，来对账户进行安全检测。如果你的账户触发了他们的风控规则，那么就会被永久封号。一般如果你的账户登录不上去，查看下邮件，如果有收到 OpenAI 的类似邮件，说明账户就被封了。

![OpenAI ChatGPT 账户封禁邮件](https://slefboot-1251736664.file.myqcloud.com/20231219_how_to_use_chatgpt_acc_ban.png)

从之前社区收集的情况来看，一般下面账户很容易被封禁：

1. 通过淘宝或者咸鱼等平台**购买的账户**，这些都是用程序大批量注册，然后卖给用户的，特征比较容易被检测到。
2. 同一个账户频繁更换是用的 IP，也比较容易被封。
3. 购买 Plus 的时候，让第三方代购，这样也很有风险，因为对方可能是盗刷信用卡来支付的。

不过这里其实比较诡异，没有什么明确的规则，有时候买的账户也能一直用。一般来说**自己注册，并且 IP 比较稳定的账户，很少听到有被封的**。要订阅 Plus 的话，自己去苹果订阅，这样安全系数更高些，不容易被取消 Plus。

这里要应对 OpenAI 的风控，最关键的是**一个合法稳定的 IP 和一个支付渠道**。好在这两点目前都有很好的解决方案，下面就来介绍。IP 问题相对难一些，需要有一点点技术背景，下面重点来看看。本文介绍的是基于自己购买的服务器来解决 IP 问题，不用买别人的线路，这样**更安全，隐私性更好**。

## 服务器配置

其实这里陈皓老师写过[一篇文章](https://github.com/haoel/haoel.github.io)，特别推荐所有人好好看看！里面对于各种方法都有描述，包括线路选择，各种配置等，讲的很专业。本文的方法也是基于这篇文章来的，会更加详细，更适合新手一些。

首先自己得有个云服务器，可以用腾讯云，阿里云，Google Cloud 等，国内的相对便宜，但用的人也多，会有概率遇到 429。Google 云贵很多，支付也得外币信用卡，好处是速度快，用的人不多，没遇见过 429 问题。本文以腾讯云为例，选择**轻量应用服务器**最便宜的配置即可，选择亚太地区(首尔，日本，雅加达都可以)，入门级最便宜配置即可满足需求，一年大概 420 左右。如果有双十一优惠，这里价钱会非常便宜。

![腾讯云轻量应用服务器选择](https://slefboot-1251736664.file.myqcloud.com/20231219_how_to_use_chatgpt_cloud_svr.png)

接下来需要对服务器进行简单初始化，然后安装一些软件即可配置好一个 HTTPS 代理了。

### 服务器初始化

首先是在服务器安装 Docker，后续可以用 docker 运行我们的代理程序，**简化部署的复杂度**。这里的安装步骤可以参考官方文档 [Install Docker Engine on Debian](https://docs.docker.com/engine/install/debian/)，主要分为以下几步：

1. 设置 docker 的 apt repository；
2. 安装 docker 包；
3. 检查是否安装成功。

没有计算机基础也不用怕，只用照着文档里面的执行命令即可。到最后验证这一步，看到类似输出就说明安装成功了。

> Hello from Docker！
> 
> This message shows that your installation appears to be working correctly.

### 域名解析

因为我们最终是搭建成一个 https 代理，所以这里需要**有个域名解析到这台服务器**。关于域名相关知识，可以参考我之前的文章：

1. [从理论到实践，全方位认识DNS（理论篇）](https://selfboot.cn/2015/11/05/dns_theory/)
2. [从理论到实践，全方位认识DNS（实践篇）](https://selfboot.cn/2015/11/14/dns_practice/)

如果自己没有域名，需要先买一个，可以在腾讯云上面购买。因为我们的服务器在国外，所以域名不用备案，买了直接就能用的。这里可以选择一个不常见的域名，再配合小众后缀，然后就很便宜了。比如我随便找了一个域名`mylitdemo`，然后配合 `.fun` 后缀，10 年才 175 块钱，非常便宜（越是简短、好记的域名越贵，可以选一些无意义，很长的便宜域名）。

![腾讯云域名购买](https://slefboot-1251736664.file.myqcloud.com/20231220_how_to_use_chatgpt_domain_buy.png)

然后需要在腾讯云的 DNSPod 里面添加一条**域名解析 A 记录**，到购买的服务器的公网 IP 上。这里我们不一定要二级域名，可以用三级子域名，比如 `us.mylitdemo.fun` 来解析到服务器的公网 IP。然后如果有多台服务器，可以为每台分配一个子域名，如下图中的 us 和 api 两个子域名：

![腾讯云 DNSPod 添加域名解析](https://slefboot-1251736664.file.myqcloud.com/20231220_how_to_use_chatgpt_domain_set.png)

配置好之后，可以在本机用 ping 命令测试下域名解析是否正常：

![Ping 域名解析测试](https://slefboot-1251736664.file.myqcloud.com/20231220_how_to_use_chatgpt_domain_ping.png)

这里域名改成自己的，然后如果返回 ip 地址是购买海外服务器的公网地址，就说明域名配置正确了。

### 出口 IP 选择

前面在讲 OpenAI 的 IP 风控的时候提到过，目前云厂商的海外 IP 都是被 OpenAI 风控拦截的。所以我们需要在访问的时候，经过一层中转，目前比较好的免费方案有 [Cloudflare 的 Warp](https://1.1.1.1/)，基本原理如下：

![Cloudflare WARP 原理简单示意](https://slefboot-1251736664.file.myqcloud.com/20231220_how_to_use_chatgpt_warp.png)

上面是普通情况，海外服务器直接请求 ChatGPT 会被拦截，但是我们可以经过 Cloudflare 的 Warp 中转，这样 OpenAI 看到的 IP 就是 Cloudflare 自己的，并不是我们的服务器 IP，算骗过了 OpenAI。这里 Cloudflare 是国外很大一家 CDN 服务商，OpenAI 的 IP 拦截其实也用了 Cloudflare 自家的能力，所以这里对 Cloudflare 来源的请求都是放过的。

按照 Cloudflare 自己的 [Warp client](https://developers.cloudflare.com/warp-client/get-started/linux/) 文档进行操作比较麻烦，好在有人已经封装好了一个很好用的 shell 命令，可以傻瓜配置。具体命令如下

```bash
bash <(curl -fsSL git.io/warp.sh) menu
```

在服务器执行上面命令后，输入 2，然后就会自动安装配置 Warp 客户端和 socks5 代理。后面可以继续运行这个命令，就能看到当前 Warp 的状态，如下图说明 Socks5 代理已经启动了。

![Cloudflare Warp Socks5 代理启动](https://slefboot-1251736664.file.myqcloud.com/20231220_how_to_use_chatgpt_warp_set.png)


### 证书配置


### HTTPS 代理


## 本地配置

### 流量分发

### 故障排查

### 解决冲突

## 支付方案

## 免责声明

