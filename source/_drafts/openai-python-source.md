---
title: OpenAI Python 库源码剖析
tags: [ChatGPT, Python]
category: 源码剖析
toc: true
description: 
---

ChatGPT 问世后，OpenAI 就开源了模型调用的 Python 库 [openai-python](https://github.com/openai/openai-python)。这个库功能十分齐全，封装了 OpenAI 对外公布的 API，使用起来也十分简单。本文就来剖析一下 OpenAI Python 库的源码，希望能够帮助大家理解它的实现原理。

![openai python 库的核心类图](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230829_openai_python_source_classes_core.png)

<!-- more -->


## Python 高级用法


### 类型注解


### overload 装饰器

[openai-python/openai/api_requestor.py](https://github.com/openai/openai-python/blob/main/openai/api_requestor.py#L221) 中 APIRequestor 类中有很多 overload 修饰的方法，这是 Python 3.5 新增的语法，属于 [typeing 包](https://docs.python.org/3/library/typing.html#typing.overload)。

```python
class APIRequestor:
    # ...
    @overload
    def request(
        self,
        method,
        url,
        params=...,
        headers=...,
        files=...,
        *,
        stream: Literal[True],
        request_id: Optional[str] = ...,
        request_timeout: Optional[Union[float, Tuple[float, float]]] = ...,
    ) -> Tuple[Iterator[OpenAIResponse], bool, str]:
        pass 
    # ...
```

在 Python 中，使用 `@overload` 装饰器定义的方法重载**仅用于类型检查和文档，它们实际上不会被执行**。这些重载主要是为了提供更准确的类型信息，以便在使用静态类型检查器（如 mypy）或 IDE（如 PyCharm）时能够得到更准确的提示和错误检查。

使用 @overload 可以更准确地描述一个函数或方法**在不同参数组合下的行为**。实际的实现是在没有 `@overload` 装饰器的 request 方法中。这个方法通常会使用条件语句（如 if、elif、else）或其他逻辑来根据不同的参数组合执行不同的操作。上面 overload 修饰的 4 个 request 方法，实际上是定义了4个不同的方法，分别接受不同的参数组合，返回不通的类型值。

上面代码请求参数解释：

- `files=...`：这里的 files=... 表示 files 参数是可选的，但类型没有明确指定。在 Python 的类型提示中，`...`（省略号）通常用作占位符，表示“这里应该有内容，但尚未指定”。
- `stream: Literal[True]`：这里的 stream: `Literal[True]` 表示 stream 参数必须是布尔值 True。Literal 类型用于指定一个变量只能是特定的字面值，这里就是 True。
- `request_id: Optional[str] = ...`：这里的 `Optional[str]` 表示 request_id 参数可以是 str 类型，也可以是 None。Optional 在类型提示中通常用于表示一个值可以是某种类型或 None。这里的 `= ...` 同样是一个占位符，表示默认值尚未指定。在实际的方法实现中，这通常会被一个实际的默认值替换。

举一个相对简单的例子，假设我们有一个函数 add，它可以接受两个整数或两个字符串，但不能接受一个整数和一个字符串，使用 @overload 的情况：

```python
from typing import Union, overload

@overload
def add(a: int, b: int) -> int:
    ...

@overload
def add(a: str, b: str) -> str:
    ...

def add(a: Union[int, str], b: Union[int, str]) -> Union[int, str]:
    if isinstance(a, int) and isinstance(b, int):
        return a + b
    elif isinstance(a, str) and isinstance(b, str):
        return a + b
    else:
        raise TypeError("Invalid types")
```

添加注解后的好处有：

- 类型检查：使用 `@overload` 后，如果尝试传入一个整数和一个字符串到 add 函数，静态类型检查器会立即报错，而不需要等到运行时。
- 代码可读性：通过查看 `@overload` 定义，其他开发者可以更容易地理解 add 函数接受哪些类型的参数，以及在不同情况下的返回类型。
- IDE 支持：在像 `PyCharm` 这样的 IDE 中，`@overload` 可以提供更准确的自动完成和参数提示。
- 文档：`@overload` 也可以作为文档，说明函数或方法的不同用法。

上面的 `add` 函数，如果你这样调用： print(add(1, "2"))，mypy 就能检查出错误，不用到运行时才发现：

```shell
override.py:22: error: No overload variant of "add" matches argument types "int", "str"  [call-overload]
override.py:22: note: Possible overload variants:
override.py:22: note:     def add(a: int, b: int) -> int
override.py:22: note:     def add(a: str, b: str) -> str
```

