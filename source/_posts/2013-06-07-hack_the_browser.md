title: 恶搞360浏览器 
tags: [Python] 
category: 程序设计
description: 了解如何使用HTML、CSS和JavaScript来控制浏览器，创建动态效果和交互性体验。通过掌握浏览器的工作原理和常见的开发技巧，你将能够定制和优化你的网页，提供独特和吸引人的用户体验。不论你是初学者还是有经验的开发者，这个页面都将为你提供宝贵的知识和技巧，让你能够更好地驾驭浏览器的潜力。
---

订阅文章中看到这篇：[巧用 CSS 文件，愚人节极客式恶搞](http://blog.jobbole.com/37214/)，觉得很有意思，于是准备写个小脚本恶搞下浏览器。

上面的效果是css3的动画(animation)特性，支持该特性的浏览器都可以实现上面的特效。然后发现好多人在用360浏览器，而360 6.0也支持css 3.0动画特性，于是想编写程序修改360的Custom.css文件(360 6.0的Custom.css位置：安装目录\360se6\User Data\Default\User StyleSheets\Custom.css)，不过首先要找到360浏览器的安装目录，试了两种方法。

<!-- more --> 

1、搜索磁盘，找到360se6的目录，然后验证其下面是否有User Data目录，验证通过则可以认为获得其安装目录，但是搜索慢的不能忍受。

```python
def find_path(rootdir, des_path):
   list_dirs = os.walk(rootdir)
   for root, dirs, files in list_dirs:
       for path in dirs:
           if path == des_path:
               now_path = os.path.join(root, path)
           listnew = os.listdir(now_path)
           if ('User Data' in listnew):
               return now_path
```

2、查看注册表信息：根据HKEY_CURRENT_USER\Software\360\360se6\Update\ClientState\{02E720BD-2B50-4404-947C-65DBE64F6970}中UninstallString的值，获得安装目录。

```python
key = _winreg.OpenKey(_winreg.HKEY_CURRENT_USER,
                     r"Software\360\360se6\Update\ClientState\{02E720BD-2B50-4404-947C-65DBE64F6970}")
value, type = _winreg.QueryValueEx(key, "UninstallString")
split = value.find('Application')
install_path = value[:split - 1]
```

不过segmentfault上 @AlexBlair 提出
>  360的口味应该会在用户的桌面、开始菜单上留下他的快捷方式。WINDOWS的快捷方式都是文本形式记录的，可以按照需要采用命令行的FIND去枚举。

不过也没有试，各位感兴趣的话可以试试。 剩下的就很简单了，找到`Custom.css`文件之后，覆盖即可。win下用`py2exe`打包了一下，愚人节那天给了朋友，反响还不错。

不过什么时候能把类似这种无害程序注入到朋友电脑上，后台操控使其忽然运行该多好呢，路漫漫其修远兮啊！

详细代码在[github](https://gist.github.com/xuelangZF/5283306)，也支持chrome浏览器的恶搞。

# 更多阅读  
[巧用 CSS 文件，愚人节极客式恶搞](http://blog.jobbole.com/37214/")   
[py2exe配置文件的两种写法](http://www.chuhades.com/post/19590b_4cc525)


