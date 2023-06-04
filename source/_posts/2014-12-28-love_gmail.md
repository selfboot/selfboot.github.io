title: Gmail不死，Gmail永生
date: 2014-12-28
tags: [Google, DNS]
category: 工具介绍
description: 这篇文章详细介绍了为什么你应该选择Gmail作为你的电子邮件服务。从Gmail的强大功能，如搜索、过滤和标签，到其无与伦比的安全性和隐私保护，再到其与其他Google服务的无缝集成，这篇文章都有详细的解释。如果你正在考虑使用新的电子邮件服务，或者想了解更多关于Gmail的信息，那么这篇文章是你的理想选择
---

> 2013年7月，我们深爱着的Google Reader走了，一去不复返。现在，我们形影不离的Gmail也要神秘失踪了吗？

不知不觉Mail客户端中Gmail邮箱已经快一个月没有收到邮件了，往日那些烦人的邮件此刻也都销声匿迹了，连CSDN的邮件都没有了，直觉告诉我有点不正常。终于，在邮箱图标右边发现了一个小小的感叹号，原来连接有点问题，重连应该就可以了。我满怀信心的重新连接，可出现在我眼前的是从没见到过的错误提示。

<!-- more -->

于是我诊断连接，可靠忠实的诊断程序提示我登录不到SMTP、IMAP服务器，可能是密码错误！

![诊断连接][1]

难道是密码过期了，于是重新输入密码，可依然没有连接成功，该死的感叹号`屹立不倒`，只嘲讽般给我这样一条信息：`服务器或网络出现问题`。

![重新连接][2]

# Gmail 已死 ？

难道Gmail就这样死去了！我们还是来看看Google的[实时统计](https://www.google.com/transparencyreport/traffic/explorer/?r=CN&l=GMAIL&csd=1418939138793&ced=1419753600000)吧：

![Gmail 流量统计][3]

估计名声在外的`巨人`又一次伸出了邪恶之手，此时此刻，我只想说“放开Gmail，它只是个送邮件的！”那么这次恶魔是如何封锁Gmail的呢？咱们先从邮件的发送、接收说起！先来看下面的图片(来自Wikipedia)：

![Email 发送接收][4]

话说Alice在自己的邮件客户端写好了邮件，指定了接收人Bob，然后开心地点了发送键，接下来我们分步来看邮件的发送与接收过程吧。

1.  本地邮件客户端[mail user agent (MUA)](https://en.wikipedia.org/wiki/E-mail_client)利用[Simple Mail Transfer Protocol](https://en.wikipedia.org/wiki/Simple_Mail_Transfer_Protocol)(SMTP)协议将邮件发送到由[internet service provider](https://en.wikipedia.org/wiki/Internet_service_provider)(ISP)运营的 [mail submission agent](https://en.wikipedia.org/wiki/Mail_submission_agent)(MSA)，也就是上图的 `smtp.a.org`；
2. MSA 根据 SMTP 协议解析出邮件的目的地址，这里是`bob@b.org`，接下来MSA查询b.org的域名记录。(邮件地址的格式一般是 `localpart@exampledomain`， localpart是接收方(或发送方)的用户名，exampledomain是邮件服务商的域名)；
3. DNS服务器返回给 MSA 查询结果：`mx.b.org`，它是Bob的ISP运营的[message transfer agent](https://en.wikipedia.org/wiki/Message_transfer_agent) (MTA)的地址。
4. smtp.a.org将邮件发送给mx.b.org，也许还会发送给其他的MTA，直到邮件最终到达[message delivery agent](https://en.wikipedia.org/wiki/Message_delivery_agent)(MDA).
5. MDA提醒Bob的邮件客户端收到一封邮件，然后客户端根据邮件接收协议 [Post Office Protocol (POP3)](https://en.wikipedia.org/wiki/Post_Office_Protocol)或者[ Internet Message Access Protocol](https://en.wikipedia.org/wiki/Internet_Message_Access_Protocol)(IMAP)获取邮件内容。

好了，现在我们已经大致知道邮件是如何发送、接收的了，那么`巨人`是如何封锁掉Gmail的？难道是DNS劫持或者是DNS污染？我们先查看一下Gmail邮件发送服务器smtp.gmail.com的域名记录，如下：

```bash
$ nslookup smtp.gmail.com
Server:		192.168.1.1
Address:	192.168.1.1#53

Non-authoritative answer:
smtp.gmail.com	canonical name = gmail-smtp-msa.l.google.com.
Name:	gmail-smtp-msa.l.google.com
Address: 74.125.203.108
Name:	gmail-smtp-msa.l.google.com
Address: 74.125.203.109
```

地址没问题，看来不是DNS的问题了，那么应该就是直接封了Gmail的SMTP、POP3、IMAP服务器的IP了，证据如下(以POP3为例)：

```bash
$ ping pop.gmail.com
PING gmail-pop.l.google.com (74.125.31.109): 56 data bytes
Request timeout for icmp_seq 0
Request timeout for icmp_seq 1
Request timeout for icmp_seq 2
^C
--- gmail-pop.l.google.com ping statistics ---
4 packets transmitted, 0 packets received, 100.0% packet loss
```

于是我们上面的发送接收示意图变成了这个样子：

![意外中断][5]

至此，国内版的邮件客户端已然不能发送、接收Gmail邮件了。

# Gmail 不死，Gmail 永生

不过我笑了，默默点击右上角那个类似`隧道`的图标，选择“连接美国”、还是“连接日本”好呢？我犹豫了一下，最终选择了美国，谁让Gmail在美国呢。

于是，Gmail默默回来了，就像它从没消失过一样，只是它绕了点路而已，如下：

![Save Gmail][6]

看，Gmail还活着，它代表的“隐私，安全”仍旧活着，它们又怎么会死去？！Gmail万岁！

[1]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20141229_mail_diagnosis.png
[2]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20141229_mail_disconnect.png
[3]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20141229_gmail_traffic.png
[4]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20141229_email_protocol.png
[5]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20141229_email_protocol_china.png
[6]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20141229_email_protocol_vpn.png


