title: 使用python写vim插件
tags:  [教程, Python]
category: 程序设计
toc: true
description: 这篇文章详细介绍了如何使用Python编写Vim插件。从Vim的编译特性，到如何在Vim中执行Python命令，再到如何使用Vim模块进行更复杂的操作，这篇文章都有详尽的解释和示例。如果你是一名Vim用户，并且对Python有一定的了解，那么这篇文章将是你的宝贵资源。
---

vim有各种强大的插件，这不仅归功于其提供的用来编写插件的脚本语言vimL，还得益于它良好的接口实现，从而支持python等语言编写插件。当vim编译时带有`+python`特性时就能使用python2.x编写插件，`+python3`则支持python3.x，可以使用`vim --version`来查看vim的编译特性。

要使用python接口，可以用`:h python`来查看vim提供的帮助文档，本文做一个简单的介绍。我们都知道在vim里可以执行bash命令，只需要`:!command`即可，那么vim里可以执行python语句吗？当然可以了，vim那么强大！

<!-- more -->

# vim中执行python命令

在vim中可以使用`py[thon] {stmt}`来执行python语句{stmt}，你可以用`:python print "Hello World!"`来验证一下。

只能执行一条语句，没什么用，不是吗？所以有更加强大的接口，语法如下：

> py[thon] << {endmarker}
> {script}
> {endmarker}

这样我们就可以执行python脚本{script}中的内容了。{endmarker}是一个标记符号，可以是任何内容，不过**{endmarker}后面不能有任何的空白字符**。看一个简单的例子，假设下面代码保存为script_demo.vim：

```
function! Foo()
python << EOF

class Foo_demo:
    def __init__(self):
        print 'Foo_demo init'

Foo_demo()
EOF
endfunction
```

那么在vim中我们先用`:source path_to_script/script_demo.vim`来加载脚本，然后就可以用`:call Foo()`来运行python脚本了，整个过程如图所示：

![vim中执行python脚本][1]

此外，我们还可以将python脚本放到一个单独的.py文件中，然后用`pyf[ile] {file}`来运行python文件中的程序，要注意这里pyf[ile]后面的所有参数被看做是一个文件的名字。

# vim模块

我们已经可以在vim中执行python命令了，但是python怎么获取vim中的一些信息呢？比如说我想知道vim当前缓冲区一共有多少行内容，然后获取最后一行的内容，用python该怎么做呢？

于是vim提供了一个python模块，有趣的是模块名字就叫做vim，我们可以用它来获取vim编辑器里面的所有信息。上面问题用以下python脚本就可以解决了：

```
function! Bar()
python << EOF
import vim

cur_buf = vim.current.buffer
print "Lines: {0}".format(len(cur_buf))
print "Contents: {0}".format(cur_buf[-1])
EOF
endfunction
```

你可以自己加载脚本运行一下见证奇迹！上面代码出现了`vim.current.buffer`，想必你已经从名字猜到了它的意思了，不过还是来详细看下吧：

**vim模块中的常量**

1、vim.buffers: 用来访问vim中缓冲区的列表对象，可以进行如下操作：

```
:py b = vim.buffers[i]	  # Indexing (read-only)
:py b in vim.buffers	  # Membership test
:py n = len(vim.buffers)  # Number of elements
:py for b in vim.buffers: # Iterating over buffer list
```

2、 vim.windows: 用来访问vim中窗口的列表对象，和vim.buffers支持的操作基本相。

3、 vim.current: 用来访问vim中当前位置的各种信息，比如：

> vim.current.line
> vim.current.buffer
> vim.current.window
> vim.current.tabpage
> vim.current.range

4、 vim.vvars: 类似字典的对象，用来存储global(g:)变量或者vim(v:)变量。

还有其他的一些常量，这里不做叙述。注意这里的常量并不是真正意义上的常量，你可以重新给他们赋值。但是我们应该避免这样做，因为这样会丢失该常量引用的值。现在为止我们已经能获取vim中数据，然后用python来对其进行操作，似乎完美了。

不过vim并没有止步于此，它可是`Stronger than Stronger`！因为我们可以在python里使用vim强大的命令集，这样就可以用python写一些常用的批处理插件，看下面简单的例子：

```
function! Del(number)
python << EOF
import vim

num = vim.eval("a:number")
vim.command("normal gg{0}dd".format(num))
vim.command("w")
EOF
endfunction
```

可以调用上面函数Del(n)用来删除当前缓冲区前n行的内容（只是示例而已，现实中别这么做！）上面用到了eval和command函数，如下：

**vim模块中两个主要的方法**

1、 `vim.command(str)`: 执行vim中的命令str(ex-mode，命令模式下的命令)，返回值为None，比如：

```
:py vim.command("%s/aaa/bbb/g")
```

也可以用`vim.command("normal "+str)`来执行normal模式下的命令，比如说用以下命令删除当前行的内容：

```
:py vim.command("normal "+'dd')
```

2、 `vim.eval(str)`: 用vim内部的解释器来计算str中的内容，返回值可以是字符串、字典、或者列表，比如计算12+12的值：

```
:py print vim.eval("12+12")
```

将返回结算结果24。

前面的Del函数还提供了一个number参数，在vimL里面可以通过`let arg=a:number`来使用，在python中通过`vim.eval("a:number")`来使用。也可以通过参数位置来访问，比如let arg=a:0或者是vim.eval("a:0")。我们可以使用"..."来代替命名参数来定义一个能接收任意数量参数的函数，不过这样只能通过位置来访问。

vim模块还提供了一个`异常处理对象vim.error`，使用vim模块时一旦出现错误，将会触发一个vim.error异常，简单的例子如下：

```
try:
    vim.command("put a")
except vim.error:
# nothing in register a
```

# vim模块提供的对象

到这里你基本能用python来对缓冲区进行基本的操作，比如删除行或者是在指定行添加内容等。不过在缓冲区添加内容会很不pythoner，因为你得使用command来调用vim的i/I/a/A命令。好在有更科学的方式，那就是利用vim模块提供的对象来进行操作，看下面简单的例子：

```
function! Append()
python << EOF
import vim

cur_buf = vim.current.buffer
lens = len(cur_buf)
cur_buf.append('" Demo', lens)
EOF
endfunction
```

Append函数在当前缓冲区的结尾添加注释内容`" Demo`，缓冲区对象是怎么一会儿事呢？

**缓冲区对象**

vim模块提供了缓冲区对象来让我们对缓冲区进行操作，该对象有两个只读属性name和number，name为当前缓冲区文件的名称（包含绝对路径），number为缓冲区的数量。还有一个bool属性valid，用来标识相关缓冲区是否被擦除。

缓冲区对象有以下几种方法:

* b.append(str): 在当前行的下面插入新的行，内容为str；
* b.append(str, n):  在第n行的下面插入新的行，内容为str；
* b.append(list)
* b.append(list, n): 插入多行到缓冲区中；
* b.range(s,e): 返回一个`range对象`表示缓冲区中s到e行的内容。

注意使用append添加新行str时，str中一定不能包含换行符"\n"。str结尾可以有"\n"，但会被忽略掉。

缓冲区对象的range方法会返回一个range对象来代表部分的缓冲区内容，那么range对象又有那些属性以及方法呢? 其实在操作上range对象和缓冲区对象基本相同，除了range对象的操作均是在指定的区域上。range对象有两个属性start和end，分别是range对象的起始和结尾行。它的方法有r.append(str)，r.append(str, n)和r.append(list)，r.append(list, n)。

我们可以通过`vim.windows`来获取vim中的窗口对象，我们只能通过窗口对象的属性来对其进行操作，因为它没有提供方法或者其他接口来操作。其中只读属性有buffer、number、tabpage等，读写属性有cursor、height、width、valid等。具体可以查看帮助`:h python-window`

# 更多阅读
[Scripting Vim with Python](http://orestis.gr/blog/2008/08/10/scripting-vim-with-python/)
[如何用python写vim插件](http://python.42qu.com/11165602)

[1]: https://slefboot-1251736664.file.myqcloud.com/20141103_vim_python_script.gif

