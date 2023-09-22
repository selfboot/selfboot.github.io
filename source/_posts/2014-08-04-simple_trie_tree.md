title: 简单字典树(Trie)的实现
tags: Python
category: 数据结构与算法
description: 深入探索Python中简单字典树的实现，包括插入、查找和删除操作。这篇文章详细介绍了字典树的工作原理和实现方法，通过具体的代码示例和详细的解释，帮助你更好地理解和使用字典树。无论你是Python初学者还是有经验的开发者，这篇文章都能帮助你更深入地理解Python中的字典树。
---

# 字典树介绍

我们经常会在网上输入一些单词，一般情况下，当我们输入几个字母时，输入框中会自动弹出以这些字母开头的单词供我们选择，用户体验非常好。

不过这种自动提示功能到底是怎么实现的呢？这就要用到我们的前缀树了，前缀树也叫字典树、Trie树。假如我们有一个简单的字典，里面包含以下几个单词：`apps apple cook cookie cold`，那么可以构建以下树：

![简单的字典树][1]

<!-- more -->

当我们输入a时，程序会遍历a的子树，找出所有的单词，这里就是apps和apple了。继续输入ppl，那么只用遍历`appl`下面的子树，然后即得到apple。同理，输入co时，会遍历o下面的子树，取得单词cook, cookie, cold。这里的单词不一定都在叶节点上，像上例中的cook就是在其中一个子节点上。

从上面的图中，我们可以总结出字典树的一些特征来：

1. 根节点不包含字符，除去根节点的每一个节点均包含有一个字符。
2. 从根节点到某一节点，路径上经过的所有节点的字符连接起来就是该节点对应的字符串。
3. 每个节点的所有子节点包含的字符都不相同。

# 字典树的基本操作

字典树有三个基本操作：`插入，查找，删除`：

* 插入操作：向字典树中插入某个单词。将单词标记为`当前单词`，将根节点标记为`当前节点`，执行操作1：
	1. 当前单词为空，将当前节点标记为`单词位置`，终止操作；否则取出当前单词的首字符记为X，遍历当前节点的子节点：如果X存在于子节点N，将剩余字符标记为当前单词，将N标记为当前节点，重复操作1，如果X不存在于当前节点的子节点中，那么进入操作2。
	2. 取出当前单词的首字符记为X，新建一个节点M存储X，M的父节点为当前节点。剩余字符串记为当前单词，如果当前单词为空，将M标记为`单词位置`，终止操作；否则，将M标记为当前节点，重复操作2。

* 查找操作：查询指定单词是否在字典树中。将单词标记为`当前单词`，将根节点标记为`当前节点`，执行操作1：
	1. 当前单词为空，那么返回true，即字典树中存在该单词。否则，取出当前单词的首字符，标记为X，遍历当前节点的子节点，如果X存在于子节点N中，将N标记为当前节点，将剩余字符串标记为当前单词，重复操作1；如果X不存在于子节点中，返回false，即字典树中不存在该单词。

* 删除操作：删除字典树中的某个单词。将单词标记为`当前单词`，将根节点标记为`当前节点`，执行操作1：
	1. 当前单词为空，如果当前节点不为叶子节点，那么取消标记当前节点为`单词位置`，当前节点为叶子节点，删除该叶子节点即可，然后终止操作。当前单词不为空，取出当前单词的首字符记为X，遍历当前节点的子节点：如果X存在于当前节点的子节点N上，将N标记为当前节点，将剩余字符串记为当前单词，重复过程1；否则删除失败，即单词不在字典树上，终止操作。

# 字典树的简单实现

插入操作：

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
        mark
        current_node
        insert_node


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
        mark
        M
        insert_node
```

查找操作：

```python
def find(word):
    current_word = word
    current_node = root
    return find_opration(current_word, current_node)


def find_opration(current_word, current_node):
    if current_word not empty:
        X = current_word[0]
        if X in current_node.child_node:
            current_word = current_word[1:]
            current_node = child_node
            return find_opration(current_word, current_node)
        else:
            return false
    else:
        return current_node.isword
```

删除操作：

```python
def delete(word):
    current_word = word
    current_node = root
    return delete_operation(current_word, current_node)


def delete_operation(current_word, current_node):
    if current_word not empty:
        X = current_word[0]
        if X in current_node.child_node:
            current_word = current_word[1:]
            current_node = child_node
            is_deleted = delete_operation(current_word, current_node)
        else:
            return false
    else:
        if current_node have child_node:
            mark
            current_node
            no_word_node
        else:
            delete
            current_node
        return true
```

具体实现放在gist上，可以在[这里][2]找到。


# 更多阅读
[wiki: Trie](https://en.wikipedia.org/wiki/Trie)
[6天通吃树结构—— 第五天 Trie树](http://www.cnblogs.com/huangxincheng/archive/2012/11/25/2788268.html)
[从Trie树（字典树）谈到后缀树](http://blog.csdn.net/v_july_v/article/details/6897097)
[数据结构之Trie树](http://dongxicheng.org/structure/trietree/)



[1]: https://slefboot-1251736664.file.myqcloud.com/20140804_simple_trie.png
[2]: https://gist.github.com/xuelangZF/1848c9f1c70ab0a74627

