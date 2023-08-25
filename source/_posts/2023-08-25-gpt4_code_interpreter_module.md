---
title: ChatGPT 代码解释器：离线安装不支持的 Python 包
tags: ChatGPT
category: 人工智能
toc: true
description: >-
  本文详细介绍了如何在 ChatGPT 代码解释器环境中安装不支持的 Python
  包，包括简单包的安装方法和处理复杂依赖的技巧，并给出具体的实例分享。利用本文的方法可以扩展 ChatGPT
  的代码执行能力，让它支持更多实用的数据处理和分析功能。
date: 2023-08-25 21:02:25
---


OpenAI 在代码解释器执行环境中预装了很多 Python 包，可以参考[ChatGPT 代码解释器：资源限制详解](https://selfboot.cn/2023/07/09/gpt4_code_interpreter_limit/)中的描述。这些库已经能满足大部分的数据分析和可视化需求，但是如果想用的包没有安装，就不能用了吗？

当然不是了！在 [真实例子告诉你 ChatGPT 是多会胡编乱造！](https://selfboot.cn/2023/08/23/not-smart-chatgpt/) 一文的`代码解释器库缺失` 部分我提到过可以手动安装代码解释器中不支持的 Python 包，比如 jieba 分词，这篇文章就详细聊下这里的安装方法。

![ChatGPT Code Interpreter 安装 Python 库](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230825_gpt4_code_interpreter_module_cover.png)

<!-- more -->
## 代码执行环境

为了能够在 ChatGPT 的代码执行环境离线安装 Python 库，我们得先了解下当前代码执行环境的能力。目前 OpenAI 尚未公布执行环境的技术实现细节，不过根据我之前的几篇文章：

- [ChatGPT 代码解释器：OpenAI 提供了多少 CPU](https://selfboot.cn/2023/07/17/gpt4_code_interpreter_cpu/)
- [ChatGPT 代码解释器：自然语言处理图片](https://selfboot.cn/2023/07/12/gpt4_code_interpreter_image/)
- [ChatGPT 代码解释器：数据分析与可视化](https://selfboot.cn/2023/07/10/gpt4_code_interpreter_data/)
- [ChatGPT 代码解释器：资源限制详解](https://selfboot.cn/2023/07/09/gpt4_code_interpreter_limit/)

我们发现这个执行环境中，有一个存储空间 `/mnt/data` 可以存储我们上传的文件以及程序生成的文件，此外这个沙箱执行环境的表现有点类似 Jupyter，前面导入的变量，在后面的代码中仍然可以访问。长时间不访问对话，重新进入的话，会丢失之前的执行上下文。

我们知道在 Jupyter 中就可以安装 Python 包， 当前 ChatGPT 的执行环境应该也可以安装，下面接着尝试。

## 简单包安装

在了解过代码解释器执行环境的特点后，尝试让 ChatGPT 本地安装一个比较简单的分词库 jieba。具体步骤还是很简单的，先去 [pypi](https://pypi.org/) 找到想使用的包，然后下载源码的打包文件。对于 jieba 分词来说，地址在 [这里](https://pypi.org/)。当然，如果包没有在 pypi 发布，也可以直接在 Github 下载。

然后在代码解释器中，上传下载的包文件，再告诉 ChatGPT 安装就行，如下图对话内容：

![ChatGPT Code Interpreter 安装 Python 库 jieba](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230825_gpt4_code_interpreter_jieba.png)

其实这里的安装主要是下面两行代码，可以看到我们上传的压缩包在 `/mnt/data/jieba-0.42.1.tar.gz` 路径，之后通过 `pip install` 安装。

```python
# Path to the provided jieba tar.gz file
jieba_path = "/mnt/data/jieba-0.42.1.tar.gz"

# Installing the jieba package from the provided file
!pip install {jieba_path}
```

这样就安装好了，后面在整个对话期间，都可以使用 jieba 分词了，是不是很方便！

## 解决复杂依赖

上面的 jieba 其实比较特殊，因为这个包**不依赖其他任何 Python 包**。但是我们平时日常使用的包，可能会用到很多依赖包，这时候导入的话，要连依赖包一起安装才行。对于那种有几十个依赖的包，如何方便的安装呢？

好在 pip 提供了 download 功能，可以把一个包和它的所有依赖下载为 `whl` 格式的文件，然后可以不联网使用这些 whl 文件来安装。具体命令很简单：

```shell
# download
mkdir my_package
cd my_package
pip download package_name

# install
cd path/to/my_package
pip install --no-index --find-links . package_name
```

了解到这个后，我们就可以方便地在 ChatGPT 的代码解释器中安装一些复杂的包了。具体步骤也很简单：

1. 找一台有网络访问权限的**和代码解释器一样发行版的机器**，创建一个 Python 虚拟环境，安装和代码解释器相同版本的 Python（目前是3.8）。怎么知道代码解释器的系统版本和 python 版本？看 [ChatGPT 代码解释器：资源限制详解](https://selfboot.cn/2023/07/09/gpt4_code_interpreter_limit/)
2. 在这台机器用 'pip download' 下载所有包的 whl 文件，并打包 `tar.gz` 包；
3. 把文件上传到代码解释器，然后让 ChatGPT 解压文件并安装；

通过这个方法，我们就可以安装复杂的 Python 包了。

## 实例分享

这里以我之前写的把印象笔记 html 笔记导入到 notion 笔记本的工具 [html2notion](https://github.com/selfboot/html2notion) 包为例。第一步找了一台 Linux 服务器，然后用 `conda create --name test python=3.8` 创建一个干净的虚拟环境，然后 `pip download html2notion` 拿到所有依赖包的 whl 文件打包压缩。

接着把文件上传，然后用如下提示词：

> 这个压缩包是一堆 Python 的安装包 whl 文件，帮我在当前环境安装里面的 html2notion 包，可以尝试用下面的命令来安装:
> cd path/to/my_package
> pip install --no-index --find-links . package_name

ChatGPT 接着会先切换到包的目录，然后使用提供的命令进行安装。具体执行的代码也很简单：

```python
# Extracting the newly uploaded tar.gz file again
latest_extract_path = '/mnt/data/latest_html2notion'
with tarfile.open('/mnt/data/html2notion.tar.gz'， 'r:gz') as file:
    file.extractall(path=latest_extract_path)

# Listing the extracted files to find the html2notion and dependency packages
latest_extracted_files = os.listdir(latest_extract_path)
latest_html2notion_path = os.path.join(latest_extract_path， 'html2notion') if 'html2notion' in latest_extracted_files else latest_extract_path

# Changing the directory to the location of the newly uploaded packages
os.chdir(latest_html2notion_path)

# Installing html2notion package using the given command
latest_install_result = pip_main(['install'， '--no-index'， '--find-links'， '.'， 'html2notion'])

# Confirming the installation
latest_installed_html2notion = pip_main(['list'])
latest_install_result， latest_installed_html2notion
```

至此成功安装了 html2notion 库，可以让 ChatGPT 验证下是否安装成功，整个过程如下图：

![ChatGPT Code Interpreter 安装 Python 复杂库](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230825_gpt4_code_interpreter_html2notion.png)

不过遗憾的是，这个库需要联网导入笔记，这里就算导入成功，也没法用。这个过程一定要注意，在和解释器相同的系统和 Python 版本上下载库文件，不然可能需要手动解决版本冲突或兼容性问题。我开始在 mac 上下载 whl 文件，导入的时候，发现缺少满足 html2notion 所需的 aiohttp 版本，原来这个库在 mac 和 linux 上还是不同的实现，如下：

```shell
aiohttp-3.8.5-cp38-cp38-macos×_11_0_arm64.whl
aiohttp-3.8.5-cp38-cp38-manylinux_2_17_x86_64.manylinux2014_x86_64.whl
```

通过本文的方法，可以安装大部分包到当前执行环境，我们可以让 ChatGPT 的代码解释器执行更加丰富和实用的功能，大大提升我们的工作效率。