---
title: 解锁 GPT4 的潜能：在复杂业务开发中用好 AI
tags:
  - GPT4
  - C++
category: 项目实战
toc: true
description: >-
  本文深入探讨了如何结合人的专业知识和 GPT-4 的文本生成能力来提高工作效率，通过具体的业务示例，我们分析了 GPT-4
  在生成测试代码、优化代码和翻译代码等方面的应用。
date: 2023-07-07 13:51:42
---


GPT4 作为一种先进的语言生成模型，目前在聊天场景中大放异彩，很多人通过问答来解决一些简单问题。然而，在实际程序开发工作中，我们面临着错综复杂的业务需求和丰富的上下文知识。在这种情况下，简单地将所有任务交给 GPT4 处理显然是不切实际的。

那么问题来了，在这个复杂的真实业务世界里，GPT4 究竟能在哪些方面发挥作用呢？首先，我们需要理解GPT-4的核心优势和局限性。作为一种语言模型，GPT-4擅长处理和生成文本，但在处理需要<span  style="color:red;">深入理解和复杂推理</span>的任务时，它可能会遇到困难。因此，我们应该聚焦于那些可以充分利用 GPT4 文本处理能力的场景。

接下来，我们将深入探讨 GPT4 在复杂业务开发中的应用场景。通过几个具体的业务例子，分析如何**结合人的专业知识和 GPT4 的文本生成能力**，来更高效率、更高标准的完成工作任务。这里以后台开发业务场景为例，其他前端或者算法开发，应该也能有类似的 GPT4 使用场景。

(**写这篇文章的时候，GPT4 即将对所有 Plus 用户开放 Code Interpreter，到时候可以直接上传文件，让 AI 写代码并且执行，来分析数据，创建表格等。到时候 GPT4 能完成的工作会更多了，可以期待。**)

![即将到来的 Code Interpreter](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230707_gpt4_worker_copilot_code_interpreter.png)

<!--more-->

## 命令和脚本

日常工作中，往往会遇到一些需要迅速解决的临时问题，这时候编写一些“**胶水脚本**”就变得不可或缺。这些脚本通常用于执行一些特定的任务，比如从庞大的日志文件中筛选出关键信息，或者对一大段文本进行批量处理。在这种情境下，GPT4 就显得格外强大和好用。

拿过滤格式化的日志来说，一般会用到 `awk`, `grep`, `sort` 等工具，刚开始写的话可能要去查文档看语法，比较耗时。如果交给 GPT4 的话，瞬间就能拿到想要的结果。详细可以看我之前的一篇文章 [GPT4 帮忙写 sed, awk 数据处理命令](https://selfboot.cn/2023/06/05/gpt4_write_cmd/)，GPT4 可以帮写脚本，解释脚本，纠正错误的脚本，很是方便。

再比如有时候想把 mysql 的执行结果 dump 到一个文件中，mysql 的 client 肯定有一些参数可以完成这个工作，但是需要看文档。交给 GPT4 的话，只用提问，立马就能拿到一个可以用的命令了， GPT4 还会给你详细的参数说明，真香。

```bash
mysql -h [hostname/IP] -P [port] -u [username] -p[password] -D [database] -e "SELECT * FROM [table]" | sed 's/\t/,/g' > output.csv
```

此外，基本每个后台都会写点 shell 脚本，但 shell 的语法并不那么直观好记，经常需要去边搜索边写。用 GPT4 的话就简单多了，比如可以这样向 GPT4 提需求：

> 我有一个 csv 文件，里面有两列，name, age， 帮我写一个 shell 脚本，循环读每一行，然后发一个post 请求到 http://demo.com?n=name&a=age ，并且如果请求返回不是 200，打印这一行的内容。

很快就能拿到一个不错的 shell 脚本了：

```bash
#!/bin/bash
# CSV 文件路径
FILE_PATH="path_to_your_csv_file.csv"

# 读取 CSV 文件的每一行
while IFS=, read -r name age; do
    # 发送 POST 请求
    response=$(curl -s -o /dev/null -w "%{http_code}" "http://demo.com?n=$name&a=$age")
    
    # 检查 HTTP 响应代码是否为 200
    if [ "$response" -ne 200 ]; then
        # 如果响应代码不是 200，则打印这一行的内容
        echo "Failed row: name=$name, age=$age"
    fi
done < <(tail -n +2 "$FILE_PATH") # 跳过 CSV 文件的标题行
```

除了上面的脚本工作，开发中也会用 Excel 处理一些简单数据。Excel 的功能太过强大，没有深入学习的话，还是很难用的好。比如有一个简单的对比去重任务，**在一个 Excel 中，有两列数据，P 和 U，找到所有在 P 和 U 都有的列，然后删除对应的行**。交给 GPT4 来完成的话，就很简单，一步步傻瓜式跟着操作就行。

![GPT4 的详细 Excel 操作教程](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230707_gpt4_worker_copilot_excel_oper.png)

## 解释、优化代码

虽然 GPT4 还没法理解大型项目的复杂业务逻辑，但是可以用来阅读一小部分代码，解释代码的作用，甚至可以用来优化代码，或者翻译成另一种语言的代码。

### 解释代码

我们以 Clickhouse 的 [CurrentMetrics.cpp](https://github.com/ClickHouse/ClickHouse/blob/master/src/Common/CurrentMetrics.cpp) 为例。这个类用来统计当前 clickhouse 中的一些观测指标，比如正在执行的 queries 等。但是它的实现用到了宏，看起来有点难懂，可以直接询问 GPT4 实现细节。

GPT4 对这段代码的总体解释如下：

> 这段代码似乎是一个度量收集系统的一部分，它定义了一系列度量，每个度量都有一个名称和文档字符串，并使用原子变量存储度量值。这可能是一个性能监控或诊断工具的一部分。

对于一些实现细节也有不错的解释，比如

```c++
#define M(NAME, DOCUMENTATION) extern const Metric NAME = Metric(__COUNTER__); 
// 这一行定义了一个宏M，它接受两个参数NAME和DOCUMENTATION，并定义一个外部常量NAME，其类型为Metric，值为Metric(__COUNTER__)。这里的__COUNTER__是一个预处理器宏，它表示这个宏每次展开时的递增整数。
```

### 翻译代码

另一个常见的开发场景就是，可能项目用 js 实现了一个计算过程，后来需要用 go 语言实现同样的计算过程。这时候就需要用 go 重写之前的 js 代码，人工来写的话比较费时，这种**翻译工作**恰恰是 GPT 很擅长的。比如下面这段 js 代码：

```javascript
function encrypt(str) {
    if (typeof str === 'number') {
        str = str.toString();
    }
    if (typeof str !== 'string') {
        return str;
    }
    const strMd5 = crypto.createHash('md5').update(str).digest('hex');
    let result = strMd5.substr(0, 4);
    return result
}
```

GPT4 翻译后的 golang 代码如下, 这里不只翻译了这个函数，还提供了完整的测试代码，可以拿来直接用。

```golang
package main

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"strconv"
)

func encrypt(input interface{}) string {
	switch v := input.(type) {
	case int:
		input = strconv.Itoa(v)
	case float64:
		input = strconv.FormatFloat(v, 'f', -1, 64)
	case string:
		hasher := md5.New()
		hasher.Write([]byte(v))
		strMd5 := hex.EncodeToString(hasher.Sum(nil))
		return strMd5[:4]
	default:
		return fmt.Sprintf("%v", input)
	}
	return ""
}

func main() {
	fmt.Println(encrypt("hello")) // Example usage with a string
	fmt.Println(encrypt(12345))   // Example usage with a number
	fmt.Println(encrypt(true))    // Example usage with a non-string, non-number
}
```

### 优化代码

除了可以用来解释、翻译代码，GPT4 做重构优化也是很厉害的。看下面的一段 python 代码，if 分支写了一堆，不太优雅。

```python
@property    
def rank(self):
        """按照评分对电影分级：
        - S: 8.5 分及以上
        - A：8 ~ 8.5 分        
        - B：7 ~ 8 分        
        - C：6 ~ 7 分        
        - D：6 分以下        
        """        
        rating_num = float(self.rating)        
        if rating_num >= 8.5:            
            return 'S'        
        elif rating_num >= 8:            
            return 'A'        
        elif rating_num >= 7:            
            return 'B'        
        elif rating_num >= 6:            
            return 'C'        
        else:            
        return 'D'
```

可以让 GPT4 来，简单提示词："**优化下面的代码实现，去掉这里的分支，并且使代码更好扩展**"。就能得到一个更好的代码实现，如下所示。

```python
@property
def rank(self):
    rating_num = float(self.rating)
    # 定义一个列表，其中包含评分阈值和对应的等级
    rating_thresholds = [
        (8.5, 'S'),
        (8, 'A'),
        (7, 'B'),
        (6, 'C')
    ]
    # 遍历列表，检查评分是否大于或等于阈值
    for threshold, rank in rating_thresholds:
        if rating_num >= threshold:
            return rank
    
    # 如果评分低于所有阈值，返回 'D'
    return 'D'
```

如果对这个代码不满意，可以继续让它优化。比如下面这样提示 "**可以换一种实现，用一些二分查找的库来实现**"，于是又得到一个用到 `bisect` 模块的写法。Python的 bisect 模块提供了对有序列表进行二分查找的支持，当阈值列表很大时，查找更加高效。新的优化实现如下：

```python
import bisect

@property
def rank(self):
    rating_num = float(self.rating)
    # 定义一个列表，其中包含评分阈值
    thresholds = [6, 7, 8, 8.5]
    # 定义一个列表，其中包含对应的等级
    ranks = ['D', 'C', 'B', 'A', 'S']
    # 使用 bisect 模块进行二分查找
    index = bisect.bisect_left(thresholds, rating_num)
    return ranks[index]
```

## 生成测试代码

写测试用例是一个**费心费力费时间，但是又没有成就感**的事情。有了 GPT4，写测试会变得舒服多了，我们只用提供代码实现，然后就可以让 GPT4 来写各种测试用例。比如我在印象笔记导入 notion 的项目 [html2notion](https://github.com/selfboot/html2notion/) 中，需要判断一个 url 是不是合法的，于是有了下面的[实现](https://github.com/selfboot/html2notion/blob/master/html2notion/utils/url_process.py)：

```python
def is_valid_url(url):
    if not isinstance(url, str):
        return False
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc]) and is_valid_port(result.port)
    except ValueError:
        return False


def is_valid_port(port):
    if port is None:
        return True
    return 0 <= port <= 65535
```

然后就可以让 GPT4 生成 pytest 的测试用例了，如下：

```python
import pytest
from your_module import is_valid_url, is_valid_port  
# Replace 'your_module' with the name of the module containing your functions
from urllib.parse import urlparse


@pytest.mark.parametrize("url,expected", [
    ("https://example.com", True),
    ("http://example.com:8080", True),
    ("ftp://example.com", True),
    ("example.com", False),
    ("http://", False),
    (12345, False),
    (None, False),
])
def test_is_valid_url(url, expected):
    assert is_valid_url(url) == expected

# ...
```

这里使用 `pytest.mark.parametrize`装饰器为 `is_valid_url` 和 `is_valid_port` 函数提供了多个测试用例。是不是很方便，不用自己编码了，拿来就能直接用。

## 展望

随着AI基础模型的不断发展和进步，我们可以预见，在不久的将来，AI有潜力替代日常开发中的大部分工作。这不仅能大大提高开发效率，还能为开发人员提供更多的空间去关注更加复杂和创新性的任务。

目前市面上已经出现了一些令人瞩目的开源项目，如[AutoGPT](https://github.com/Significant-Gravitas/Auto-GPT)，只需简洁地描述他们的需求，AutoGPT 就会自动收集相关资料，进行深入的推理分析，编写高效的代码，并执行这些代码。这一切都在 GPT4 的帮助下完成，无需过多的人工干预。

这还是只刚出道没多久的 GPT4，等后面 GPT5，GPTX 出来，会是一番怎么样的场景，真让人期待。最后放一张微软的 AI 发展历程的一个手绘图片，等待更强大的 AI 的到来。

![AI 简单介绍的一个手绘](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230707_gpt4_worker_copilot_ai_beginners.png)