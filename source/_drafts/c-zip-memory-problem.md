---
title: C++ 问题排查：创建 Zip 压缩包，解压后内容错乱
tags:
  - ChatGPT
  - C++
category: 项目实践
toc: true
description: 
date: 
---

在日常的 C++ 后台开发工作中，很少会动态生成 Zip 包，所以对 C++ 的 libzip 并不熟悉。最近刚好有个场景，需要将后台生成的一份数据压缩为一个 Zip 包以便下载。这里其实之前已经有生成 Zip 包的代码，只是需要在 Zip 包里面增加一个文件。本来是一个简单的需求，但是实现中遇到了一个诡异的问题，解压生成的 Zip 包里，里面**文件开头部分有错乱**。

![C++ 创建 Zip 压缩包乱码问题](https://slefboot-1251736664.file.myqcloud.com/20231018_C++_zip_memory_problem_index.png)

<!-- more -->

问题的排查过程中，绕了一些弯路，最后发现是 C++ 的内存问题导致的，这里记录下问题的排查和修复，以及对第三方库 Zip 的源码解读。对 C++ 不熟悉的读者也可以放心阅读，来**感受下 C++ 的内存问题有多难调试**。

## 问题复现

业务中是通过一个 `RPC` 请求拿到了部分数据，然后把这些数据进行处理后，生成一个 Zip 包，最后返回给前端。前端解码 zip 包后发现部分内容乱码，不符合事先约定的协议内容。由于是个必现的问题，比较好定位，**直接加日志调试**，发现 RPC 拿回来的数据并没有问题，但是生成 Zip 包之后，里面的内容就会多了些乱码内容。

这里为了能够方便地复现问题，直接把生成 Zip 包部分抽离出来，写了一个简单的示例，核心代码如下：

```c++
zip* archive = zip_open(tmpFile, ZIP_CREATE | ZIP_TRUNCATE, &error);
if (archive == NULL) {
    printf("fail to open %s err %d", tmpFile, error);
    return 1;
}

zip_source* s = NULL;
for (auto item : copyrightInfos) {
    if (NULL == (s = zip_source_buffer(archive, item.htmltemlate.c_str(), item.htmltemlate.size(), 0)) ||
        zip_file_add(archive, (item.filename + "_temp.xhtml").c_str(), s, ZIP_FL_ENC_UTF_8 | ZIP_FL_OVERWRITE) < 0) {
        zip_source_free(s);
        printf("fail to add info.txt err %s", zip_strerror(archive));
        error = -1;
    }
}
if (zip_close(archive) < 0) {
    printf("fail to close %s ret %d", tmpFile, error);
    return 1;
}
```

完整代码在 [Gist](https://gist.github.com/selfboot/acda3473f687f610dc1f6230e555df03) 上。逻辑比较简单，将代码里一段 string 放进去一个文件，然后添加到 tar 包中去。压缩后再用 `unzip` 工具来尝试解压 tar 包，打印文件内容。

![C++ 创建 Zip 乱码复现](https://slefboot-1251736664.file.myqcloud.com/20231018_C++_zip_memory_problem_error.png)

文件原来的内容是`<html>Content 1</html>`，但是上面的运行结果可以看到，输出的内容缺失了开头部分。为了能够看到这里解压后的文件开始部分到底是什么内容，这里直接用 `hexdump` 来查看文件的内容：

```bash
hexdump -C file2_temp.xhtml
00000000  00 00 00 00 00 00 00 00  01 00 00 00 00 00 00 00  |................|
00000010  2f 68 74 6d 6c 3e                                 |/html>|
00000016
```

发现头部多了不少 `00`，有点奇怪，没有任何地方会写入这些内容的。这时候最好是用 GDB 调试，或者直接去看 zip 库的文档或者源码，看看这里是哪里出了问题。

## 问题排查

不过自从有了 ChatGPT，遇见问题的第一反应就是丢给 ChatGPT 来看看。先把这部分写 zip 包的代码直接丢给 ChatGPT，然后提问“这样往里面添加文件是合理的吗？”。ChatGPT 认为这段代码基本是合理的，没有什么错误使用方法。没关系，继续追问，这次提示词提供了更多细节，参考[ChatGPT Prompt 最佳指南二：提供参考文本](https://selfboot.cn/2023/06/12/gpt4_prompt_reference/)，如下：

> 我用上面的代码，生成的 zip 文件，用 unzip 解压缩后，file2_temp.xhtml 文件的内容为啥不等于 htmltemlate，在前面部分有乱码的内容。
> 
> hexdump -C file2_temp.xhtml
> 00000000  00 00 00 00 00 00 00 00  01 00 00 00 00 00 00 00  |................|
> 00000010  2f 68 74 6d 6c 3e                                 |/html>|

ChatGPT 果真不负众望，一下子就给出了一个看起来正确的答案：

![ChatGPT Zip 包乱码问题分析](https://slefboot-1251736664.file.myqcloud.com/20231018_C++_zip_memory_problem_gpt.png)

按照 ChatGPT 的回答，这里循环 copyrightInfos 执行完后，zip_close 被调用之前，`item.htmltemlate` 内存里的内容可能已经被释放了，所以这里添加的内容不对。这个结论很容易**验证**是不是靠谱，直接改下这行代码：

```c++
for (const auto &item : copyrightInfos) 
```

把这里改成引用(其实本来也应该用引用，这样可以**减少拷贝操作**)，重新跑下，发现问题果然解决了。

### GDB 调试

定位到了问题后，再回过头来，用 GDB 复现下没有用引用的时候，这里写乱码的执行过程。

## 源码分析


## 总结

这个问题遇到的人还有不少，比如 Stack Overflow 上的这两个问题：

- [libzip with zip_source_buffer causes data corruption and/or segfaults](https://stackoverflow.com/questions/58844649/libzip-with-zip-source-buffer-causes-data-corruption-and-or-segfaults)
- [Add multiple files from buffers to ZIP archive using libzip](https://stackoverflow.com/questions/73820283/add-multiple-files-from-buffers-to-zip-archive-using-libzip)

