---
title: Mac 图片自动压缩上传 COS
date: 2023-06-02 19:36:08
updated: 2023-07-28 22:00:00
category: 工具介绍
tags: [ChatGPT, 教程]  
toc: true 
description: 本篇文章详细讲解如何在 macOS 中通过 AppleScript 实现监控文件夹并自动进行图片压缩及文件重命名，最后上传到腾讯云 COS 的过程。涉及技术包括 AppleScript、pngquant 图片压缩工具以及腾讯云 COS 的命令行工具 coscmd。本教程适合对自动化文件处理感兴趣的 macOS 用户参考。
---

把个人博客放在了 netilfy 托管，它给了一个优化建议，可以压缩图片节省带宽。但是每次截图后都要再压缩下图片有点麻烦，于是想着应该可以**偷偷懒**。目标很明确，截图后图片传到我的 git 仓库 images 目录后，能给我自动压缩，并且上传 COS，这样我就只用在 markdown 文件里面拼链接就好了。

打开 Web Browsing 功能的  GPT4，让他帮忙实现吧。

![GPT 自动化工具](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230602_auto_compress_upload_gpt.png)

# 监听文件并压缩

**Human:**  
在 mac 上，我有一个目录，想在目录里面添加文件的时候，自动对图片进行压缩，替换原来的文件。要怎么实现呢？

**ChatGPT:** 
你可以通过使用 Automator（自动操作程序）来实现这个功能。Automator 是 Mac OS X 提供的一种强大工具，能帮助你自动执行各种任务。

以下是设置步骤：

1. 打开 Automator（位于“应用程序”文件夹中）。
2. 点击“新建文稿”，然后选择“文件夹操作”。
3. 在弹出的窗口中，选择你要监视的文件夹。
4. 在左侧面板中，找到并双击“缩放图片”。
5. 在弹出的对话框中，设置你希望的图片大小。
6. 另外，你可能需要添加一个“复制 Finder 项目”操作，将原始图片复制到另一个地方，以防万一。你可以在左侧面板中找到并双击它。
7. 最后，保存你的 Automator 工作流程。

这样，每当你向该文件夹添加图片时，Automator 都会自动将其缩放到你指定的大小，然后替换原来的图片。请注意，这个方法会覆盖原始图片，因此如果你不想丢失原始图片，最好先做好备份。

---
**Human:**  
这里我想用 https://imageoptim.com/command-line.html 中提到的ImageOptim 来压缩图片，要怎么做呢

**ChatGPT:**  
在使用 ImageOptim 命令行工具前，你需要先确保它已经安装在你的 Mac 上。你可以通过以下命令安装它：

```shell
npm install -g imageoptim-cli
```

然后，你可以在 Automator（自动操作程序）中使用 Shell 脚本来调用 ImageOptim。以下是具体步骤：

1. 打开 Automator（位于“应用程序”文件夹中）。
2. 点击“新建文稿”，然后选择“文件夹操作”。
3. 在弹出的窗口中，选择你要监视的文件夹。
4. 在左侧面板中，找到并双击“运行 Shell 脚本”。
5. 在弹出的对话框中，输入以下命令：
    ```zsh
    for f in "$@"
    do
        /usr/local/bin/imageoptim "$f"
    done
    ```
6. 最后，保存你的 Automator 工作流程。

这样，每当你向该文件夹添加图片时，Automator 就会自动调用 ImageOptim 命令行工具对其进行压缩，并替换原来的文件。

请注意，这个方法会覆盖原始图片，因此如果你不想丢失原始图片，最好先做好备份。

也请注意，这个脚本假设你的 ImageOptim 命令行工具是通过 npm 安装的，且安装位置在 `/usr/local/bin/`。如果你的安装位置不同，你需要修改脚本中的路径。

---
**Human:**  
我按照上面方法保存Automator之后，往步骤 3 里面的文件夹加了一个图片，但是并没有被压缩，是怎么回事呢？

**ChatGPT:** 
这可能有几个原因，我们可以进行以下排查：

1. 确认你的 Automator 文件夹操作是否正确保存，并且指定的是正确的文件夹。
2. 确认在 Automator 工作流程中添加的 "运行 Shell 脚本" 操作里的命令是否正确。特别要注意 ImageOptim 命令行工具的路径是否正确。
3. 查看是否有权限问题。你可能需要给 Automator 工作流程足够的权限来修改文件夹中的图片。
4. 最后，确保 ImageOptim CLI 工具已经正确安装，并可以在 Terminal（终端）中直接运行。

如果以上步骤都无法解决问题，你可以尝试在 Automator 的 "运行 Shell 脚本" 操作中添加一些调试代码，例如在命令中添加 echo "$f" 来查看正在处理的文件路径，或者在命令最后添加 2> /path/to/error.log 来将可能的错误输出到一个日志文件。

> 这里真的超出预期了，直接教你打日志来排查问题，有点专业工程师的感觉。

---
**Human:**  
我加了 `2> /path/to/error.log`，但是没有任何日志输出

**ChatGPT:**  
如果没有任何日志输出，这可能表明你的 Automator 工作流程没有被正确触发，或者 "运行 Shell 脚本" 操作没有被正确执行。

我建议你首先检查你的 Automator 工作流程是否被正确保存，并且关联到了正确的文件夹。你可以尝试重新创建一个新的文件夹操作，以确保所有的设置都是正确的。

然后，你可以在 "运行 Shell 脚本" 操作中添加一些简单的调试代码，例如 `echo "Hello, world!" > /path/to/debug.log`。然后再添加一个新的图片到文件夹中，看看是否有任何输出。

如果这个简单的测试也不能工作，那么问题可能出在 Automator 或者你的系统设置上。你可以检查你的系统设置，确保 Automator 有足够的权限来监视文件夹和修改文件。你也可以尝试在 Automator 中创建一个新的文件夹操作，看看是否有其他的操作能够被正确触发。

如果这个简单的测试可以工作，那么问题可能出在 ImageOptim CLI 工具或者你的 Shell 脚本上。你可以在 Terminal（终端）中手动运行相同的 ImageOptim 命令，看看是否有任何错误。

---
**Human:**  
我的  shell  如下

```zsh
echo "Hello, world!" >> ~/Desktop/error.log
for f in "$@"
do
    /Users/daemonzhao/.nvm/versions/node/v20.2.0/bin/imageoptim "$f"
done

2>> ~/Desktop/error.log
```

这里 error.log 只输出了 `Hello, world!` ，`$@` 应该是空值。

> 这里后面又有几轮聊天，GPT4 开始并没有给出一个正确的答案。不过我们可以信任 GPT、然后验证 GPT 的内容。

# 换 Apple Script

---
**Human:**  
Automator的 Folder Actions，如何成功拿到新添加的文件路径。上面你给出的方法拿不到，所以没法执行 shell 脚本

**ChatGPT:**  
对不起刚刚的解答可能有些误导。在 Automator 的 "**运行 Shell 脚本**" 操作中，"$@" 是代表所有的参数，而在 Folder Actions 中，这些参数就是新添加到文件夹的文件路径。

不过，如果你的脚本中 "$@" 是空的，那么可能是因为 Automator 并没有正确地将文件路径作为参数传递给 Shell 脚本。

为了解决这个问题，你可以尝试使用 AppleScript 而不是 Shell 脚本来获取文件路径。你可以在 Automator 中添加一个 "运行 AppleScript" 操作，然后使用以下的代码：

```applescript
on run {input, parameters}
    tell application "Finder"
        set filePath to the POSIX path of (input as alias)
        do shell script "/path/to/your/command " & filePath
    end tell
end run
```

这个 AppleScript 脚本会将新添加到文件夹的文件路径作为 input 参数传递给 run 函数，然后使用 Finder 来获取文件的 POSIX 路径，最后执行你的 Shell 命令。

注意你需要将 /path/to/your/command 替换为你想要执行的 Shell 命令，比如 ImageOptim CLI 的路径。你也可以在 do shell script 命令中添加其他的参数，比如文件路径。

这是一个实例，你可以根据你的需要进行修改。希望这个方法能够解决你的问题！

> 最开始让用  shell script，一直拿不到增加的文件，这次换了 apple script，一下子就拿成功了。

---
**Human:**  
不能将“current application”转换为“alias”类型。

**ChatGPT:**  
对不起，我犯了个错误。在 AppleScript 中，input 参数是一个列表，表示所有传递给脚本的文件。如果你想要处理每个文件，你需要使用一个循环。这是一个修改后的脚本：

```applescript
on run {input, parameters}
    repeat with i in input
        set filePath to POSIX path of i
        do shell script "/path/to/your/command " & quoted form of filePath
    end repeat
end run
```

这个脚本会遍历所有传递给脚本的文件，获取每个文件的 POSIX 路径，然后执行你的 Shell 命令。注意 quoted form of filePath 是用来确保文件路径在传递给 Shell 命令时被正确引用，这对于含有空格或其他特殊字符的文件路径是必要的。

你需要将 `/path/to/your/command` 替换为你想要执行的 Shell 命令，比如 ImageOptim CLI 的路径。你也可以在 do shell script 命令中添加其他的参数，比如文件路径。

> 这次终于成功了，但是压缩速度有点慢。

# 更换压缩工具

---
**Human:**  
除了 ImageOptim ，mac  上还有其他免费的工具可以压缩图片吗？要求有较快的速度和较高的无损压缩比。

**ChatGPT:**  
在 Mac 上除了 ImageOptim，你还有以下一些免费的图片压缩工具可以选择：

1. Preview：这是 Mac 自带的一个应用程序，可以用来压缩图片。你可以选择单个或多个图片来进行压缩，方法是打开 Preview，然后点击顶部菜单栏的“文件” > “导出”。然后你可以选择图片的格式，并通过调整质量滑块来压缩图片[​1](https://www.idownloadblog.com/2022/01/04/how-to-compress-image-mac/)​。
2. Mac 的 Photos 应用：你也可以使用 Mac 的 Photos 应用来压缩图片。你可以在 Photos 应用中选择一张或多张照片，然后按 Command + Shift + E 或从顶部菜单栏点击“文件” > “导出” > “导出照片”来压缩图片[​1](https://www.idownloadblog.com/2022/01/04/how-to-compress-image-mac/)​。
3. 图片压缩应用：Mac App Store 有许多可以压缩图片的应用。比如你可以在 App Store 中搜索“压缩图片”，就可以找到一些相关的应用https://www.idownloadblog.com/2022/01/04/how-to-compress-image-mac/​1​。
4. 在线图片压缩网站：你也可以选择使用在线的图片压缩服务，比如 iLoveIMG.com 和 ShortPixel.com。这些在线服务可以方便快捷地压缩图片，但你需要注意的是，你上传的图片会被存储在这些网站的服务器上，所以对于包含个人或敏感信息的图片，建议使用离线的压缩方法[​1​](https://www.idownloadblog.com/2022/01/04/how-to-compress-image-mac/)。

> 这里用了 browsing 功能，GPT 自己去网上搜索。

---
**Human:**  
我想找的是能在 mac 本地命令行运行的压缩图片工具，你有啥建议的

**ChatGPT:**  
在 Mac 上，有一些命令行工具可以用来压缩图片：

1. jpegoptim：这是一个用来优化和压缩 JPEG 图片的命令行工具。你可以使用 Homebrew 来安装它，命令是 brew install jpegoptim。压缩一个 JPEG 图片的命令是 jpegoptim --size=100k your_image.jpg，这会将 your_image.jpg 压缩到 100KB 或更小的大小。
2. optipng：这是一个 PNG 图片优化工具，可以通过命令行使用。安装命令是 brew install optipng。使用 OptiPNG 压缩图片的命令是 optipng -o7 your_image.png，这会使用最高级别的优化选项来压缩 your_image.png。
3. pngquant：这是另一个用于 PNG 图片的命令行工具，可以创建具有少量颜色的优质 PNG 图片，从而大大减小文件大小。安装命令是 brew install pngquant。压缩 PNG 图片的命令是 `pngquant your_image.png`，这会创建一个新的，压缩后的 PNG 图片。

所有这些工具都需要通过命令行来使用，并且可以在脚本中使用，以便于批量处理图片。但是请注意，每个工具都有其自己的一套参数和选项，你可能需要阅读各自的文档来更好地理解如何使用它们。

---
**Human:**  
我想用 pngquant，我用 `brew install pngquant` 安装后，如何更改 上面  apple script  的脚本呢

**ChatGPT:**   
你可以将 AppleScript 脚本修改为如下形式，以使用 pngquant 工具：

```applescript
on adding folder items to this_folder after receiving added_items
    try
        tell application "Terminal"
            repeat with i from 1 to number of items in added_items
                set this_item to item i of added_items
                do shell script "/usr/local/bin/pngquant --force --ext .png " & quoted form of POSIX path of this_item
            end repeat
        end tell
    end try
end adding folder items to
```

这段脚本在新的文件添加到文件夹时，会使用 `pngquant` 来压缩这些文件。--force 选项使得 pngquant 在文件已经存在时会覆盖它，而 --ext .png 选项会使得输出文件的扩展名为 .png。

请注意，你可能需要根据 pngquant 在你的系统上的实际安装位置来修改脚本中的 `/usr/local/bin/pngquant`。你可以通过在终端运行 which pngquant 命令来找到 pngquant 的实际路径。

同样，你需要根据实际情况来调整 pngquant 的参数。例如，如果你想要指定压缩级别，你可以添加 -quality 参数，如 --quality 60-80。你可以参考 pngquant 的文档来了解更多的参数和选项。

# 添加图片前缀

---
**Human:**  
我想在脚本中改一下压缩后的文件名，在每个文件明前面加上日期前缀，比如20230601_ ，要怎么做呢？

**ChatGPT:**  
为了实现这个功能，你需要获取当前日期，然后格式化为你需要的格式。然后，你可以将这个日期前缀添加到文件名中。你可以使用 `do shell script` 和 `date` 命令来获取和格式化日期，然后使用 `text item delimiters` 来修改文件名。以下是你可以尝试的 AppleScript：

```applescript
on run {input, parameters}
	tell application "System Events"
		set currentDate to do shell script "date '+%Y%m%d'"
		repeat with i in input
	    ...
		end repeat
	end tell
end run
```

这个脚本首先获取当前日期，并将其格式化为 "YYYYMMDD" 的形式。然后，对于每个输入文件，它检查扩展名是否为 "png"。如果是，它获取文件名，将其分解为基本名称和扩展名，然后将日期前缀添加到基本名称。然后，它将文件重命名为新的文件名，然后使用新的文件路径来执行 pngquant 命令。

> 这里有坑，因为没写过apple script，也懒得去看代码。结果这里代码死循环添加前缀，中间和 GPT 交流了几轮，改了几遍代码，有点不顺。最后提示让 GPT 一步步来思考，竟然可以啦。

---
**Human:**  
还是不行，你重新一步步思考下这个步骤，然后给出一个正确的代码

**ChatGPT:**   
我明白你的问题了，确实是我之前的脚本存在问题。因为每次添加文件到文件夹，`Folder Action`都会触发一次，处理文件夹中所有的文件。如果同时添加了多个文件，这个`Folder Action`就会被多次触发，处理的对象包括已经处理过的文件，这就导致了问题。

我们可以修改脚本，使得它只处理那些没有被处理过的文件。具体来说，我们可以检查文件名是否已经包含了日期前缀，如果包含，我们就跳过这个文件。

另外，我们应该在压缩文件后立即重命名文件，而不是在压缩前。因为pngquant工具会直接覆盖原文件，如果我们先重命名再压缩，原文件就不会被压缩，而新文件会保留原来的大小。

下面是修改后的脚本：

```applescript
on run {input, parameters}
    set currentDate to do shell script "date '+%Y%m%d'"
    tell application "System Events"
        repeat with i in input
        ...
        end repeat
    end tell
end run
```

这个脚本应该可以解决你的问题。它只会处理那些没有被处理过的.png文件，并且在压缩文件后立即重命名文件。同时添加的多个文件也不会造成问题。

> 这次可以自动压缩重命名了，还想再自动传到 COS 上。

# 上传 COS

**Human:**  
在上面的改名字和压缩步骤完成后，我想把图片传到 Tencent cos 的某一个 bucket 中，要怎么做呢？

**ChatGPT:**    
首先，你需要在本地安装腾讯云的命令行工具 COSCMD，你可以使用以下命令进行安装：`pip install coscmd`

然后，你需要配置你的COSCMD。运行以下命令并按照提示输入你的腾讯云 API 密钥（SecretId 和 SecretKey）以及你的地域（Region）和默认的存储桶（Bucket）：

```applescript
coscmd config -a <SecretId> -s <SecretKey> -b <Bucket> -r <Region>
```

在上面的命令中，<SecretId>，<SecretKey>，<Bucket> 和 <Region> 是你需要替换的部分。例如，你可能需要这样：

```applescript
coscmd config -a AKIDxxxxxxxx -s xxxxxxxx -b mybucket-1250000000 -r ap-beijing
```

现在，你可以在 AppleScript 中使用 do shell script 命令来调用 COSCMD 并将文件上传到你的存储桶中。你可以使用 coscmd upload 命令来上传文件，如下所示：

```applescript
do shell script "coscmd upload " & quoted form of filePath & " /"
```

所以，你的 AppleScript 可能看起来像这样：

```applescript
on run {input, parameters}
    set currentDate to do shell script "date '+%Y%m%d'"
    tell application "System Events"
        repeat with i in input
            set filePath to POSIX path of i
            set fileExtension to name extension of i
            ...
        end repeat
    end tell
end run
```

在这个脚本中，我们在重命名文件后获取新的文件路径，并将其上传到 COS。注意，你需要确保你的计算机上已经安装了 Python 和 pip，并且你的腾讯云 API 密钥、Bucket 和 Region 都是正确的。你还需要确保你的 Bucket 允许你上传文件。

> 这里自己搞错了几个地方，不过 GPT 提示加了 log，然后也很快定位到了。

# 最终结果

最终脚本如下:

```applescript
on run {input, parameters}
	set currentDate to do shell script "date '+%Y%m%d'"
	tell application "System Events"
		repeat with i in input
			set filePath to POSIX path of i
			set fileExtension to name extension of i
			set folderName to do shell script "dirname " & filePath
			if fileExtension is "png" then
				set fileName to name of i
				set AppleScript's text item delimiters to "."
				set baseName to first text item of fileName
				if baseName does not start with currentDate then
					do shell script "/opt/homebrew/bin/pngquant --force --ext .png " & quoted form of filePath
					set newBaseName to currentDate & "_" & baseName
					set newFileName to newBaseName & "." & fileExtension
					set name of i to newFileName
					set newFilePath to folderName & "/" & newFileName
					set uploadCommand to "/opt/homebrew/Caskroom/miniconda/base/bin/coscmd upload " & quoted form of newFilePath & " /"
					do shell script uploadCommand
				end if
			end if
		end repeat
	end tell
end run
```

实现的结果，指定一个目录，后面往这个目录新增加的 png，都自动压缩，在前缀加上当前日期，然后传输到腾讯云 COS 上。完整的对话在[这里](https://chat.openai.com/share/724a1870-7524-4ed7-be08-c22c2b4acfb3)。

![最终自动化工具](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230602_auto_compress_upload_final.png)

# 后续优化

_2023.07.28 更新_

上面的自动化脚本在单机执行的时候，没啥问题。但是我的图片其实在 git 仓库的，有时候在 1 台电脑处理完上传 cos ，然后提交了 git。在另一台电脑上 pull 下来后，新增加的图片又会被加日期前缀和上传 cos，有点傻了。于是直接把上面的脚本给 ChatGPT，让它判断如果图片有日期前缀，就不做处理了。改动比较小：

```bash
# before
	set baseName to first text item of fileName
	if baseName does not start with currentDate then
# after
	set regexMatch to do shell script "if [[ " & baseName & " =~ ^[0-9]{8}_ ]]; then echo 'true'; else echo 'false'; fi"
	if regexMatch is "false" then
```

再后来又发现，这里其实不止 png 图片，我会经常传一些 svg，gif, webp, jpeg 格式的图片，这一类一般都是压缩好了，只用加个日期前缀，然后进行上传就行。继续让 ChatGPT 改脚本，最后脚本如下：

```bash
on run {input, parameters}
	set currentDate to do shell script "date '+%Y%m%d'"
	tell application "System Events"
		repeat with i in input
			set filePath to POSIX path of i
			set fileExtension to name extension of i
			set folderName to do shell script "dirname " & filePath
			set fileName to name of i
			set AppleScript's text item delimiters to "."
			set baseName to first text item of fileName
			set regexMatch to do shell script "if [[ " & baseName & " =~ ^[0-9]{8}_ ]]; then echo 'true'; else echo 'false'; fi"
			if fileExtension is "png" and regexMatch is "false" then
				do shell script "/opt/homebrew/bin/pngquant --force --ext .png " & quoted form of filePath
				set newBaseName to currentDate & "_" & baseName
				set newFileName to newBaseName & "." & fileExtension
				set name of i to newFileName
				set newFilePath to folderName & "/" & newFileName
			else if fileExtension is in {"webp", "jpeg", "gif"} and regexMatch is "false" then
				set newBaseName to currentDate & "_" & baseName
				set newFileName to newBaseName & "." & fileExtension
				set name of i to newFileName
				set newFilePath to folderName & "/" & newFileName
			else if regexMatch is "true" then
				set newFilePath to filePath
			end if
			set uploadCommand to "/opt/homebrew/Caskroom/miniconda/base/bin/coscmd upload " & quoted form of newFilePath & " /"
			do shell script uploadCommand
		end repeat
	end tell
end run
```
