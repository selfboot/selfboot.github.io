---
title: 安全、快速、便宜访问 ChatGPT，最新最全实践教程！
tags:
  - 方法
  - ChatGPT
category: 计算机网络
toc: true
description: 本文详细介绍如果通过网络代理，访问 OpenAI 的 ChatGPT，每一步都有详细的图文教程，并带有原理介绍，结果验证方法，让你零基础也能跟着学会。
date: 2023-12-25 20:59:06
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

启动成功后，还是要验证下的，可以用 curl 命令向 `ipinfo.io` 发起一个 http GET 请求，然后查看在直接访问和使用 Warp 代理情况下，对方看到的 IP 地址是否符合预期。从下图可以看到，在使用了 Warp 的代理后，对方看到的 IP 地址是 Cloudflare 的，而不是我们自己服务器 IP。

![Cloudflare Warp Socks5 代理验证](https://slefboot-1251736664.file.myqcloud.com/20231221_how_to_use_chatgpt_warp_proxy.png)

注意这里 Warp 对操作系统和版本有要求，尽量按照我前面说的选 Debian 11，这个实验过没问题，其他系统版本下可能会有异常。

### 证书配置

离成功不远了！因为我们要配置 HTTPs 代理，所以需要一个证书。这里可以用免费的证书颁发机构 [Let's Encrypt](https://letsencrypt.org/)，这里有详细的 [Get Started](https://letsencrypt.org/getting-started/) 文档，如果下面命令不成功，可以来这里参考官方文档。

注意用 root 权限运行下面两个命令：

```bash
sudo apt-get install certbot
sudo certbot certonly --standalone --domains tk.mylitdemo.fun
```

第一个命令用来安装 certbot，第二个命令用来生成证书，注意把域名 `tk.mylitdemo.fun` 改成自己前面绑定到 IP 的。这里必须先把域名绑定到服务器公网 IP 后，才能在服务器上生成证书。执行完后，如果看到下面提示，说明安装成功了：

> Congratulations! Your certificate and chain have been saved at: /etc/letsencrypt/live/tk.mylitdemo.fun/fullchain.pem Your key file has been saved at: /etc/letsencrypt/live/tk.mylitdemo.fun/privkey.pem Your certificate will expire on 2024-02-03. To obtain a new or tweaked version of this certificate in the future, simply run certbot again. To non-interactively renew all of your certificates, run "certbot renew"

可以在提示中说的目录中看到这些证书文件，后面也会用到这个证书文件。这里自动生成的证书是 3 个月有效期的，如果想要长期使用，可以使用 crontab 添加一个定时任务。`crontab -e` 命令，添加下面内容即可：

```bash
0 0 1 * * /usr/bin/certbot renew --force-renewal --quiet --renew-hook "sh /home/.gost.sh" >> /var/log/certbot-renew.log 2>&1
```

这样每个月 1 号，就会重新申请证书，然后重启代理服务。注意这里的 `sh /home/.gost.sh` 可能要根据自己的启动命令路径来改。

### HTTPS 代理

前面做了那么多准备工作，就是为了这一步开启 HTTPS 代理了。前面安装 docker，域名解析配置， warp 配置，证书申请都成功后，就可以开始这里的代理设置了。找个常用目录，编辑 `.gost.sh` 文件(名字不重要)，添加下面内容：

```bash
#!/bin/bash

docker stop gost-warp && docker rm gost-warp
# 下面的 4 个参数需要改成你的
DOMAIN="tk.mylitdemo.fun" # 前面配置的域名
USER="demo"               # 代理用户名
PASS="youguess"           # 密码
PORT=443                  # 代理端口，一般选 443 就行

BIND_IP=0.0.0.0
CERT_DIR=/etc/letsencrypt
CERT=${CERT_DIR}/live/${DOMAIN}/fullchain.pem
KEY=${CERT_DIR}/live/${DOMAIN}/privkey.pem
sudo docker run -d --name gost-warp \
    -v ${CERT_DIR}:${CERT_DIR}:ro \
    --net=host ginuerzh/gost \
    -L "http2://${USER}:${PASS}@${BIND_IP}:443?cert=${CERT}&key=${KEY}&probe_resist=code:404&knock=www.google.com" \
    -F "socks://localhost:40000"
docker update --restart=unless-stopped gost-warp
```

接着用 shell 运行这个脚本，如果整成输出一串 hash 和 gost-warp，基本上就是启动成功了。可以用 `docker ps` 命令查看下，看到 gost-warp 的状态是 up，说明启动成功了。

```shell
docker ps -a
CONTAINER ID   IMAGE           COMMAND                   CREATED          STATUS                    PORTS     NAMES
e91d22d3dc9b   ginuerzh/gost   "/bin/gost -L http2:…"   18 seconds ago   Up 17 seconds                       gost-warp
```

接着可以在自己本地电脑验证下。打开命令终端，用 curl 命令使用你的代理，来访问 ipinfo.io，看返回地址是否是 Warp 的 IP。如果是，说明代理成功了。

```bash
curl  "ipinfo.io" --proxy "https://tk.mylitdemo.fu" --proxy-user 'demo:youguess'
```

这里这里的代理域名地址，用户名和密码都是前面 `.gost.sh` 里面你设置的。结果如下图，不用代理的话就是你本地 IP，

![验证代理是否成功](https://slefboot-1251736664.file.myqcloud.com/20231225_how_to_use_chatgpt_https_proxy.png)

## 本地配置

上面步骤成功后，相当于你有了一个中转点，接下来还需要在本地电脑上进行配置，让访问网络的流量经过这个中转点才行。这里目前有很多客户端，比如电脑端的 clash，iPhone 上的 shadowrocket 等软件，工具的原理基本如下图：

![本地电脑流量分发](https://slefboot-1251736664.file.myqcloud.com/20231225_how_to_use_chatgpt_local.png)

安装这些工具，并进行配置后，当本地发生网络访问的时候，工具可以根据不同的站点地址，选择不同的访问路径。如上图 1，2，3 这几种情况：

1. 一些内部 oa 站点，不经过代理软件，按照原来的方式访问公司的代理。
2. 访问 youku.con，经过代理后，不访问代理服务器，直接访问这些可以直达的站点。
3. 访问 chat.openai.com，经过代理后，再把请求转发云服务器，最后通过 warp 出口 IP 访问。

### 流量分发

目前的代理客户端，基本都支持不同的站点，选择直接访问，还是通过某个代理访问。以 Clash 为例，在配置文件中，可以指定通过某个代理访问某个域名。比如对于 OpenAI 的相关域名，指定用 GPT4 这个**代理组**来访问。

```yaml
    - 'DOMAIN-SUFFIX,openai.com,GPT4'
    - 'DOMAIN-SUFFIX,sentry.io,GPT4'
    - 'DOMAIN-SUFFIX,stripe.com,GPT4'
    - 'DOMAIN-SUFFIX,bing.com,GPT4'
    - 'DOMAIN-SUFFIX,oaistatic.com,GPT4'
    - 'DOMAIN-SUFFIX,oaiusercontent.com,GPT4'
    - 'DOMAIN,api.openai.com,GPT4'
    - 'DOMAIN-SUFFIX,events.statsigapi.net,GPT4'
    - 'DOMAIN,llama2.ai,GPT4'
    - 'DOMAIN,www.tiktok.com,GPT4'
    - 'DOMAIN,www.tiktokv.com,GPT4'
    - 'DOMAIN,www.byteoversea.com,GPT4'
    - 'DOMAIN,www.tik-tokapi.com,GPT4'
```

这里代理组是在配置文件中定义的，比如你有多个代理服务器，就可以放到一个组里面。每次手动指定某一个代理，或者自动选择速度快的代理，如果某个代理失败，也可以自动切换到另一个。总的来说，代理组允许自动切换，自动选择，还是挺方便的。如下图，有三个代理组，每个代理组有多台代理服务期，不同代理组可以选择不同的代理服务器。

![Clash 代理组配置](https://slefboot-1251736664.file.myqcloud.com/20231225_how_to_use_chatgpt_clash.png)

从头写配置文件有点繁琐，可以在[这份配置文件](https://gist.github.com/selfboot/4ec21100f5286b4f25dab74733c4ed5f)的基础上，添加自己的代理服务器信息，即可保存为自己的配置文件。然后把配置文件放到 Clash 的配置文件夹中，可以在 Clash 状态栏，通过`配置`-`打开配置文件夹` 找到配置文件夹目录。之后，在`配置`中选择自己的配置名，重载配置文件，就能生效了。接着通过 Clash 的状态栏，勾选**设置为系统代理**，就能正常访问 ChatGPT 了。

### 解决冲突

有时候在某些内网中，有些 oa 站点需要用电脑中其他代理软件来访问才行。这时候，可以在 Clash 中配置好这些特殊站点，让它不经过 Clash 代理，还是按照原来的访问方式。可以在`更多设置`中的最下面添加要跳过的域名，如下图：

![Clash 更多配置](https://slefboot-1251736664.file.myqcloud.com/20231225_how_to_use_chatgpt_clash_more.png)

### 故障排查

经过上面配置后，如果还是不能正常访问 ChatGPT，可以通过下面几个步骤来排查。首先查看代理服务器能否正常连接，可以先用 前面的 curl 来确保代理连接的上，然后在 Clash 中用延迟测速，看速度是否正常。一般 500ms 以内的延迟，都是可以接受的。如果速度正常，并且勾选了设置为系统代理，正常就不会有问题的。

这时候如果浏览器访问 chat.openai.com 还是不行，可以检查浏览器的网络请求有没有经过代理服务的端口。这里 Clash 默认会启动 7890 的本地端口来转发流量，用 chrome 的开发者工具，可以看到是否经过本地的 7890 端口转发。

![Chrome 开发者工具查看网络请求](https://slefboot-1251736664.file.myqcloud.com/20231225_how_to_use_chatgpt_clash_7890.png)

如果没有的话，可能是浏览器插件配置了某些代理导致失败，可以卸载掉浏览器的插件，比如 `Proxy SwitchyOmega`。

如果能看到 7890 代理，但是还是不能访问服务，就要用开发者工具，查看请求返回了什么报错。比如某天 OpenAI 可能启动了一个新的域名，然后也对 IP 来源做了限制。这时候本地配置文件中，没有对这个域名设置规则，那么就会被 OpenAI 拦截，导致无法访问。这种解决也比较简单，定位到域名后，直接添加新的代理规则，然后重载配置文件即可。

### Claude 分流

[Claude](https://claude.ai/chats) 还比较特殊，最近发现不能访问，提示区域不对：

![Claude 区域限制](https://slefboot-1251736664.file.myqcloud.com/20231228_how_to_use_chatgpt_claude_bypass.png)

但我明明已经切换了美国 ip，也加了 warp。于是在服务器尝试直接连接 Claude，发现是正常的，但是用 Cloudflare 中转链路后，这里就返回 307 重定向到一个错误地址了。看来 Claude 和 OpenAI 风控 IP 的策略不同，Claude 不支持 Cloudflare 的 IP。要解决的话也比较简单，直接在上面的 gost.sh 配置文件中，中转配置那一行，加上过滤掉 Claude 的规则即可。

```bash
-F "socks://localhost:40000?bypass=172.10.0.0/16,127.0.0.1,localhost,claude.ai,anthropic.com"
```

不得不说，gost 功能完善，文档也是相当可以，这里的 bypass 参数，具体可以参考[分流](https://gost.run/concepts/bypass/)。

## 免责声明

**本博客内容仅供教育和研究目的，旨在讨论一种绕过 OpenAI 网络限制的方法。在此所述的任何技术和信息都不应用于非法活动或恶意目的。作者和发布者对任何人因使用或误用本博客文章中的信息而造成的任何直接或间接损失，概不负责。读者应该在合法和道德的范围内使用这些信息，并始终遵守所有适用的法律和道德规定。**