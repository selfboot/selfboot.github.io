title: 大展身手的字典树
tags: [Python]
category: 数据结构与算法
description: 这是一篇详细介绍如何在Python中使用字典树（Trie Tree）的文章。作者首先回顾了字典树的基本实现，然后详细讲解了字典树在前缀匹配和字频统计两个常见应用场景的实现方法。文章通过具体的代码实例和详细的解释，让读者能够深入理解字典树的工作原理和应用方法。无论你是初学者还是有经验的开发者，这篇文章都能帮助你更好地理解和使用字典树。
---

在[简单字典树(Trie)的实现][1]一文中，我们以`单词输入自动提示`为引子，简单介绍了字典树的实现。那么，字典树到底可以用于哪些场合呢？

1. 前缀匹配：给定字典库，输入一段字符，返回以该字符串为前缀的所有单词。
2. 字频统计：给出一段文本，统计其中指定单词出现的频数。

<!-- more -->

# 前缀匹配
本文讲述前缀匹配的字典树实现方案。仍然假设我们有以下单词：apps apple cook cookie cold，当我们想获得以co为前缀的单词时，只需要在字典树中依次找到c、o节点，然后搜索o节点的所有子树，取出其中的单词即可。

在[简单字典树(Trie)的实现][1]一文中，我们已经实现了字典树的基本操作，这里只需要再加上一个前缀匹配方法即可。具体流程如下，将前缀字符串标记为`当前前缀`，将根节点标记为`当前节点`，执行操作1：

1. 当前前缀为空，对当前节点执行操作2。否则，取出当前单词的首字符，标记为X，遍历当前节点的子节点，如果X存在于子节点N中，将N标记为当前节点，将剩余字符串标记为当前单词，重复操作1；如果X不存在于子节点中，返回None。
2. 以当前节点为根节点，进行深度优先搜索，取得当前节点所有子树下的所有单词。

实现的伪代码如下：

```python
def pre_match_op(current_word, current_node):
    if current_word not empty:
        X = current_word[0]
        if X in current_node.child_node:
            current_word = current_word[1:]
            current_node = child_node
            return pre_match_op(current_word, current_node)
        else:
            return None
    else:
        return pre_match_bfs("", current_node)

def pre_match_dfs(keep_char, current_node):
    match_word = []
    for child in current_node.child_node:
        current_pre = pre_str + keep_char
        if child.isword = True:
            word = current_pre + child.char
            match_word.append(word)
        else:
            pass

        pre_match_dfs(current_pre, child)

    return match_word
```

具体程序以及测试例子放在gist上，可以在[这里][2]找到。测试了一下，两千多个单词，寻找共同前缀的单词，速度还是蛮快的。

# 字频统计

有时候我们需要统计一篇文章中一些单词出现的次数，这个时候用字典树可以很方便的解决这个问题。在[字典树的简单实现][1]中，我们设计的节点数据结构如下：

![字典树节点数据结构][3]

只要对这里节点的数据结构稍作修改，就可以用于统计字频了。把原来数据结构中的标记位改为`频数位`，即保存该单词出现的次数。然后，再把原有字典树实现中的插入操作和查找操作稍微改动，就可以实现字频统计功能了。

* 插入操作：将单词标记为`当前单词`，将根节点标记为`当前节点`，执行操作1：
	1. 当前单词为空，当前节点单词出现频数加1，终止操作；否则取出当前单词的首字符记为X，遍历当前节点的子节点：如果X存在于子节点N，将剩余字符标记为当前单词，将N标记为当前节点，重复操作1，如果X不存在于当前节点的子节点中，那么进入操作2。
	2. 取出当前单词的首字符记为X，新建一个节点M存储X，M的父节点为当前节点。剩余字符串记为当前单词，如果当前单词为空，M节点单词出现频数加1，终止操作；否则，将M标记为当前节点，重复操作2。

* 查询操作：将单词标记为`当前单词`，将根节点标记为`当前节点`，执行操作1：
	1. 当前单词为空，返回当前节点字频数，即为该单词出现的次数。否则，取出当前单词的首字符，标记为X，遍历当前节点的子节点，如果X存在于子节点N中，将N标记为当前节点，将剩余字符串标记为当前单词，重复操作1；如果X不存在于子节点中，返回0。

实现伪代码如下，插入操作如下：

```python
def insert(word):
    current_word = word
    current_node = root
    insert_operation_1(current_word, current_node)


def insert_operation_1(current_word, current_node):
    if current_word not empty:
        X = current_word[0]

        if X in current_node.child:
            current_word = current_word[1:]
            current_node = child_node
            insert_operation_1(current_word, current_node)
        else:
            insert_operation_2(current_word, current_node)

    else:
        current_node.count ++


def insert_operation_2(current_word, current_node):
    X = current_word[0]
    M.value = x
    M.father = current_node
    current_node.child = M

    current_word = current_word[1:]
    if current_word not empty:
        current_node = M
        insert_operation_2(current_word, current_node)

    else:
        current_node.count ++
```

查询操作：

```python
def count(word):
    current_word = word
    current_node = root
    return find_opration(current_word, current_node)


def count_opration(current_word, current_node):
    if current_word not empty:
        X = current_word[0]
        if X in current_node.child_node:
            current_word = current_word[1:]
            current_node = child_node
            return find_opration(current_word, current_node)
        else:
            return 0
    else:
        return current_node.count
```

具体程序以及测试例子放在gist上，可以在[这里][4]找到。


[1]: ../08-04-2014/simple_trie_tree.html
[2]: https://https://gist.github.com/xuelangZF/7addb2810e60a9031d76
[3]: https://slefboot-1251736664.file.myqcloud.com/20140812_trie_data_structure.png
[4]: https://gist.github.com/xuelangZF/f8d731a0dbf24d692860

