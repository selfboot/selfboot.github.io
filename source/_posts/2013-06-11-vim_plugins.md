title: Vim插件简单介绍
tags: [教程, 总结]
category: 工具介绍
toc: true
---

Vim作为一个强大的编辑器，再配合强大的插件，就可以称得上为编辑神器了。

# [pathogen](https://github.com/tpope/vim-pathogen)
pathogen为管理插件的插件，类似的还有vundle。在 Pathogen 之前，安装插件就是把插件文件放在.vim目录下，所有的插件都混在一起，不便于管理。

通过pathogen，可以将不同的插件放到不同的目录里，比如：

```bash
➜  ~  tree .vim/bundle -L 2
.vim/bundle
├── SingleCompile
│   ├── COPYING
│   ├── README.rst
│   ├── autoload
│   ├── doc
│   ├── mkzip.sh
│   └── plugin
```

这样，各个插件之间的文件都独立于自己的目录。以后安装插件时只需要将插件clone到bundle下相应的目录即可，重新打开vim用`:Helptags`生成帮助文档。删除一个插件，只要直接删除这个插件的目录。

<!-- more -->

pathogen的安装十分简单，只需要将pathogen clone到`.vim/bundle/vim-pathogen`目录，然后在配置文件加下面内容即可：

```bash
runtime bundle/vim-pathogen/autoload/pathogen.vim
execute pathogen#infect()
```

或者可以将pathogen放在其他地方，然后在.vimrc加上如下内容：

```bash
source ~/src/vim/bundle/vim-pathogen/autoload/pathogen.vim
execute pathogen#infect()
```

# [nerdtree](https://github.com/scrooloose/nerdtree)

Nerdtree用来浏览文件系统并打开文件或目录，它提供如下功能及特性：

1. 以继承树的形式显示文件和目录
2. 对如下类型的文件进行不同的高亮显：文件、目录、sym-links、快捷方式、只读文件、可执行文件。
3. 提供许多映射来控制树状结构
4. 对树状结构内容的过滤（可在运行时切换），如自定义文件过滤器阻止某些文件（比如vim备份文件等）的显示、可选是否显示隐藏文件、可选不显示文件只显示目录
5. 可以自定义Nerd窗口的位置和大小，自定义结点排序方式
6. 可以将文件和目录添加到收藏夹，可以用书签标记某些文件或者目录

具体见下图：

![NERDTree][1]

可以在NERDTree栏用?呼出快速帮助文档，或者用`:h NERDTree`查看详细文档。

# [xptemplate](https://github.com/vim-scripts/xptemplate)

编码中难免会有许多重复的代码片段，每次键入这些片段明显是不明智的做法，于是就有大牛写了[snipMate](https://github.com/msanders/snipmate.vim)插件，不过还有一个更加强大的插件：xptemplate。

安装完成后`:Helptags`生成帮助文档，然后`:h xpt`查看帮助文档。要想看当前文件类型支持的代码片段，可以在insert模式下键入`<C-r><C-r><C-\>`。insert模式下输入片段的名字，然后`<C-\>`即可插入代码，然后可以用TAB、Shift Tab前后更改高亮显示的内容。

如下图所示：

![xpt demo][2]

如果输入不完整的代码片段名字，键入`<C-\>`之后就会给出所有可能的片段名称。另外可以嵌套使用代码片段名字，例如在C文件中输入`switch<C-\>`，会产生一个switch片段，然后在

```c++
switch ( var ) {
       case constant :
               /* cursor */
               break;
}
```

然后两次`<Tab>`跳到`cursor`位置，然后`if<C-\>`插入if片段，如下：

```c++
switch ( var ) {
       case constant :
               if ( condition ) {
                       /* cursor */
               }
               break;
}
```

xpt的补全配置文件类似`ftplugin/javascript/javascript.xpt.vim`。另外也可以添加自己的代码片段，可以新建`ftplugin/_common/personal.xpt.vim`文件，写入自己的配置，`personal.xpt.vim`优先级最高，可以保证自己的配置不被覆盖。

# [YouCompleteMe](https://github.com/Valloric/YouCompleteMe)

Valloric觉得Vim下的补全插件跟IDE比差太远，补全时间慢，按键繁琐，所以他自己写了一个，他要求补全时间在10ms之内必须出现。于是就有了YouCompleteMe(以下简称YCM)。

YCM是一个比较新Vim代码补全插件，默认为程序语言提供基于标识符的补全。它会收集当前文件、tags文件以及其他访问过的文件中的标识符，当输入时，会自动显示匹配的标识符。YCM不需要TAB即可呼出匹配的标识符，可以一边输入一边参考YCM呼出的菜单。YCM的强大之处还在于，它的匹配并不是前缀匹配，而是子字符串匹配，也就是说如果输入`abc`，那么标识符中的`xaybgc`也会匹配，而不只是`abc...`。

另外YCM也可以基于[clang](http://clang.llvm.org/)为C/C+＋代码提供语义补全。 对C/C++来说youcompleteme现在应该是最好的选择，借助clang的强大功能，补全效率和准确性极高。

YCM使用[Jedi](https://github.com/davidhalter/jedi)来加强python的语义补全，只需要`git submodule update --init --recursive`。另外YCM也支持其他许多语言，比如ruby、java等。

具体使用可以看下图：

![YCM Demo][3]

YCM需要vim版本至少是7.3.584，可以用`:version`查看vim版本号，如下：

```bash
:version
VIM - Vi IMproved 7.3 (2010 Aug 15, compiled Apr 19 2013 01:00:32)
MacOS X (unix) version
Included patches: 1-806
```

另外需要支持python，`:echo has('python')`的结果是1。YCM的安装相对复杂一点，首先用下载插件，用pathogen（或者vundle）进行相应的安装，然后下载clang，放在`ycm_temp/llvm_root_dir`下：

```bash
$ mkdir -p ~/ycm_temp/llvm_root_dir
$ mv ~/Download/clang+llvm/* ~/ycm_temp/llvm_root_dir
$ cd ycm_temp/llvm_root_dir
$ llvm_root_dir  ls
bin  docs  include  lib  share
```

安装`cmake`和`python-dev`，然后编译如下：

```bash
$ cd ~
$ mkdir ycm_build
$ cd ycm_build
$ cmake -G "Unix Makefiles" -DPATH_TO_LLVM_ROOT=~/ycm_temp/llvm_root_dir . ~/.vim/bundle/YouCompleteMe/cpp
$ ycm_core
```

详细安装说明在[项目主页](http://valloric.github.io/YouCompleteMe/)有说明，可以参考。

# [pydiction](https://github.com/rkulla/pydiction)
pydiction是一款强大的python自动补全插件，可以实现下面python代码的自动补全：

* 简单python关键词补全
* python 函数补全带括号
* python 模块补全
* python 模块内函数，变量补全

该插件需要`filetype plugin on`配置。 输入时TAB即可弹出补全提示，不过需要一个字典文件，比如complete-dict，然后在配置文件中将字典文件路径添加到pydiction_location变量中：

```bash
let g:pydiction_location = '~/.vim/bundle/pydiction/complete-dict'
```

输入时： `raw<Tab>`然后会跳出类似下面的菜单：

```python
raw_input(
raw_unicode_escape_decode(
raw_unicode_escape_encode(
```

要想将某个模块加入字典文件，可以用下面命令：

```bash
$ python pydiction.py <module> ... [-v]
```

-v选项将结果输出到标准输出而不是complete-dict文件，比如要添加requests、BeautifualSoup

```python
python pydiction.py requests bs4
```

生成的字典部分如下：

>    --- import requests ---
>    requests.HTTPError(
>    requests.PreparedRequest(
>    requests.Request(

# [syntastic](https://github.com/scrooloose/syntastic)

syantastic是一款强大的语法检查插件，支持很多语言的语法与编码风格检查，每次保存文件都会引起这个插件的查错操作。实际上这个插件只是个接口，背后的语法检查是交给各个语言自己的检查器，例如JavaScript使用jshint，python使用flake8等。

可以在`syntax_checkers/language`文件中查看syntastic需要的外界语法检查器

```bash
➜  ~  ls .vim/bundle/syntastic/syntax_checkers
c               docbk           java            objcpp          scala           xhtml
css             go              lua             python          text            zsh
cuda            haskell         nasm            ruby            typescript
➜  ~  ls .vim/bundle/syntastic/syntax_checkers/python
flake8.vim   pep8.vim     py3kwarn.vim pyflakes.vim pylint.vim   python.vim
```

外界的语法检测器必须在$PATH中，也可以使用软链接。syntastic特性：

1. 错误信息被载入location-list，需要`:Error`命令
2. 当光标处于有错误的行时，在命令窗口显示错误信息
3. 在有错误或警告的行显示 signs
4. 可以在状态栏显示错误信息
5. 当鼠标放置于有错误的行时，在气泡中显示错误信息
6. 用语法高亮显示具体出错部分。

如图所示：

![syntastic][4]

# [vimwiki](https://github.com/vim-scripts/vimwiki)
维基语法的作用有三点:

1. 使条目更规范，通过一定转换，wiki 能输出为拥有约定俗成格式的HTML；
2. 节约编辑时间，不用写出完整的HTML标签，也不用在可视化编辑器中点来点去；
3. 充分的可读性，使用维基语法书写的文档，即使未被转为HTML，内容的语义也是一目了然，甚至表格也能清晰地阅读。

VimWiki官方称之`a personal wiki for Vim`，一个基于Vim的Wiki 系统，是一个非常不错的用于个人知识管理的利器，并且还支持输出到网页。

在Vim的Normal模式下，键入`\ww`三个键，Vim就会打开wiki首页（index.wiki）。输入模式，在单词上面Enter既可以把此单词变为wiki词条，然后在Normal模式Enter wiki词条，既可以进入相应的词条页面进行编辑。

编辑完词条之后进行保存，然后`\wh`(:Vimwiki2HTML)将当前wiki页转换成Html格式，`\whh`转换为html格式然后打开页面。vimwiki转换html时支持模板文件，配合强大的模板文件，可以自己创建css，或者是实现语法高亮，vimwiki还支持MathJax数学公式编辑。

在vimwiki中使用以下占位符，能对生成的HTML文件做一些特殊的处理。

1. %toc 自动生成的目录
2. %title 指定HTML文档的title，建议放到文档最末尾。如果不指定，title 就是文件名
3. %nohtml 告诉 vimwiki 不为某条目生成HTML文件。即使你在该条目打开时为它单独执行 :Vimwiki2HTML ，也不会生成。

vimwiki 有一个`g:vimwiki_valid_html_tags`值，可以指定允许写在 wiki 中的HTML标签。

Vimwiki的优点:

1. 与Vim紧密结合,可使用Vim的内建的正则表达式规则,高效处理文本
2. 与Vim紧密结合,可利用Vim内建的多种命令,以及可显示多个分页的特性,同时展示多种窗口,快速查看多份资料.
3. 由于Vim是文本处理工具,所以任何笔记,只要存为文本数据,便可以用Vim来组织和整理
4. 内置了特别的语法高亮模式,在观感上与普通见到的wiki没有多大的分别.

但是vimwiki的语法是自创的，和广泛使用的轻量级标记语言markdown等不兼容，因此可移植性比较差。

# [ZenCoding](https://github.com/mattn/zencoding-vim)

vim 插件`zencoding-vim`支持类似[Zen Coding](https://code.google.com/p/zen-coding/)的缩写。Zen Coding是一个高效编写HTML, XML, XSL的编辑器插件，支持许多编辑器。

如下内容：

>    test1
>    test2
>    test3

`V` 进入 `Vim 可视模式`，“行选取”上面三行内容，然后按键 `<c-y>,`，这时Vim的命令行会提示`Tags:`，键入`ul>li*`，然后Enter。

```html
<ul>
    <li>test1</li>
    <li>test2</li>
    <li>test3</li>
</ul>
```

zencoding 支持的简写规则，类似于CSS选择器（大写的E代表一个HTML标签）：

1. E 代表HTML标签。
2. E#id 代表id属性。
3. E.class 代表class属性。
4. E[attr=foo] 代表某一个特定属性。
5. E{foo} 代表标签包含的内容是foo。
6. E>N 代表N是E的子元素。
7. E+N 代表N是E的同级元素。
8. E\^N 代表N是E的上级元素。

还提供了`连写（E*N）`和自动编号`（E$*N）`功能。`div[src=span$]#item$.class$$*3`展开后为：

```html
<div id="item1" class="class01" src="span1"></div>
<div id="item2" class="class02" src="span2"></div>
<div id="item3" class="class03" src="span3"></div>
```

另外还有许多强大的功能，如下：

`<c-y>d`: 插入模式下根据光标位置选中整个标签;
`<c-y>D`: 插入模式下根据光标位置选中整个标签内容;
`<c-y>k`: 移除标签对;
`<c-y>/`: 移动光标到块中, 插入模式中按`<c-y>/`切换注释;
`<c-y>a`: 将光标移至 URL, 按 `<c-y>a`,则从 URL 地址生成锚;

查看帮助文档: `help zencoding`

# [Tagbar](https://github.com/majutsushi/tagbar)

首先来了解下[ctags](http://ctags.sourceforge.net/)，ctags为文件中的各种语言对象生成一个索引文件(或称为标签文件,tags)。标签文件允许这些项目能够被一个文本编辑器或其它工具简捷迅速的定位。一个“标签”是指一个语言对象，它对应着一个有效的索引项 (这个索引项为这个对象而创建)。

ctags 能够为多种程序语言文件的语言对象信息生成可读格式的交叉索引列表，并且支持用户用正则表达式自定义语言对象。

对于C/C++，其生成的标记文件tags中包括这些对象的列表：

* 用#define定义的宏
* 枚举型变量的值
* 函数的定义、原型和声明
* 名字空间（namespace）
* 类型定义（typedefs）
* 变量（包括定义和声明）
* 类（class）、结构（struct）、枚举类型（enum）和联合（union）
* 类、结构和联合中成员变量或函数

要生成tags十分简单：

1. c: `ctags –R src`
2. c++：`ctags -R --c++-kinds=+p --fields=+iaS --extra=+q src`

    * --c++-kinds=+p  : 为C++文件增加函数原型的标签
    * --fields=+iaS   : 在标签文件中加入继承信息(i)、类成员的访问控制信息(a)、以及函数的指纹(S)
    * --extra=+q      : 为标签增加类修饰符。注意，如果没有此选项，将不能对类成员补全
    * -R              : 递归生成src中所有源文件的tags文件

使用tags文件也很简单，把光标移动到某个元素上，`CTRL+]`就会跳转到对应的定义，`CTRL+o`可以回退到原来的地方。如果当前光标下是个局部变量，`gd`跳到这个局部变量的定义处。

tags必须在vim运行的当前目录，才能在vim里面正确跳转，不过也可以使用`set tags="/path/tags"`即可。

而vim下的TagBar插件(Taglist的升级版)则是为了方便浏览源文件的标签，TagBar提供了一个侧边栏列出了当前文件所有的标签。如下图：

![TagBar][5]

注意：mac自带的ctags程序不是exuberant ctags， 所以使用时会出现问题，可以用`homebrew`重新安装ctags，然后做一个软链接即可，具体如下：

```bash
$ brew install ctags
$ cd /usr/local/Cellar/ctags/5.8/bin
$ ./ctags --version
Exuberant Ctags 5.8, Copyright (C) 1996-2009 Darren Hiebert
 Compiled: Jun 14 2013, 11:41:43
 Addresses: <dhiebert@users.sourceforge.net>, http://ctags.sourceforge.net
 Optional compiled features: +wildcards, +regex
$ cd /usr/bin
$ sudo ln -s /usr/local/Cellar/ctags/5.8/bin/ctags ./ctags
```

# 其他插件

[vim-javascript](https://github.com/pangloss/vim-javascript)
vim 自带的 javascript 缩进简直没法使用，同时还有 html 里的 javascript 缩进也是一塌糊涂。而强大的插件vim-javascript则解决了上面的问题。

[pydoc](https://github.com/fs111/pydoc.vim)
pydoc将python帮助文档集成到vim中，可以方便地一边写程序一边浏览帮助文档，如下图：

![pydoc][6]

[vim-flake8](https://github.com/vim-scripts/vim-flake8)
vim的默认配置对python的支持有限，要在编写代码时及时得到变量拼写错误等提示，可安装[Pyflakes](https://pypi.python.org/pypi/pyflakes)。 Python 社区著名的[PEP 8](http://www.python.org/dev/peps/pep-0008/)，是官方的python代码规范,如果想编写严格遵循`PEP 8`的代码，可使用pep8。为了方便，有人将两个插件整合到一起，打造出`flake8`，该工具可通过插件`vim-flake8`与vim整合。

pep8、flake8的安装很简单：

```bash
$ pip install pep8
$ pip install pyflakes
$ pip install flake8
```

不过由于syntastic的存在，没有多大必要使用vim-flake8了。

[SingleCompile](https://github.com/xuhdev/SingleCompile)
有时候想编译运行一个简单的源文件，这种情况退出vim在编译运行无疑显得麻烦，而SingleCompile很好地解决了这个问题。SingleCompile有以下特点：

1. 编译运行源文件时用到了vim的quickfix feature和[compiler feature](http://vimdoc.sourceforge.net/htmldoc/quickfix.html#compiler-select)；
2. 自动选择使用编译器或者解释器；
3. 支持多种语言；
4. 可以自定义编译/解释的模板；

可以设置以下键映射：

> nmap <F7> :SCCompile<cr>
> nmap <F5> :SCCompileRun<cr>

[TagHighlight](https://github.com/vim-scripts/TagHighlight)
给类/结构体/枚举等数据类型添加语法高亮显示, 使 vim 在显示效果上可与 Visual Studio 相媲美。 成功安装该插件后, 打开项目文件, 执行如下命令即可显示高亮效果: `:UpdateTypesFile`。

TagHighlight支持许多种语言：C、C++、Java等。

[Powerline](https://github.com/Lokaltog/vim-powerline)
Powerline插件美化vim状态栏的显示。我的配置如下：

```
set laststatus=2     " Always show the statusline
set t_Co=256         " Explicitly tell Vim that the terminal support 256 colors
let g:Powerline_symbols = 'unicode'
```

效果图如下：

![Powerline][7]

# 禁用插件

可以列出当前加载的所有插件：

> :scriptnames             //list all plugins

启动vim时可以禁用所有插件：

> `--noplugin`  Skip loading plugins.  Implied by `-u NONE`.

也可以禁用指定的某些插件。如果是使用pathogen管理插件，则有两种方法：

1、 修改.vim/bundle中插件目录名字，比如要禁用插件syntastic，可以通过下面命令：

```bash
➜  ~  mv .vim/bundle/syntastic .vim/bundle/syntastic~
```

2、 使用`g:pathogen_disabled`变量，可以将插件名添加到该变量：

```
" To disable a plugin, add it's bundle name to the following list
let g:pathogen_disabled = ['syntastic']
if v:version < '703584'
  call add(g:pathogen_disabled, 'YouCompleteMe')
endif
execute pathogen#infect()
```

上面命令将禁用syntastic插件，并且当vim版本号低于7.3.584时，禁用YouCompleteMe插件。

# 更多阅读
[使用 Pathogen + Git 管理 Vim 插件](http://lostjs.com/2012/02/04/use-pathogen-and-git-to-manage-vimfiles/)
[ZenCoding.vim 教程](http://www.zfanw.com/blog/zencoding-vim-tutorial-chinese.html)
[HTML代码简写法：Emmet和Haml](http://www.ruanyifeng.com/blog/2013/06/emmet_and_haml.html)
[xptemplate:比snipmate更强的代码片段补全](http://ruby-china.org/topics/4054)
[vim中的杀手级插件: YouCompleteMe](http://yunfeizu.github.io/2013/05/16/killer-plugin-of-vim-youcompleteme/)
[Pkm工具：Vimwiki](http://xbeta.info/vimwiki.htm)
[用 vimwiki 搭建你自己的维基世界](http://wiki.ktmud.com/tips/vim/vimwiki-guide.html)
[How do I list loaded plugins in Vim?](http://stackoverflow.com/questions/48933/how-do-i-list-loaded-plugins-in-vim?rq=1)
[Temporarily disable some plugins using pathogen in vim](http://stackoverflow.com/questions/4261785/temporarily-disable-some-plugins-using-pathogen-in-vim)
[在Vim中使用ctags](http://www.vimer.cn/2009/10/%E5%9C%A8vim%E4%B8%AD%E4%BD%BF%E7%94%A8ctags.html)
[Exuberant Ctags中文手册](http://easwy.com/blog/archives/exuberant-ctags-chinese-manual/)
[Mac终端Vim如何安装使用ctags](http://www.douban.com/group/topic/31808699/)
[TagHighlight](http://www.cgtk.co.uk/vim-scripts/taghighlight)

[1]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20130611_NERDTree.png
[2]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20130611_xpt.gif
[3]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20130611_YCM.gif
[4]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20130611_syntastic.png
[5]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20130611_tags.png
[6]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20130611_pydoc.png
[7]: https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20130611_powerline.png

