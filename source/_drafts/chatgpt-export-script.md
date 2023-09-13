---
title: ChatGPT 老师教我写前端：从零写油猴脚本
tags: [ChatGPT, 前端]
mathjax: true
category: 项目实践
toc: true
description: 
---

可以跟着 ChatGPT 老师学前端？听起来有点不可思议，毕竟前端很多和 UI 有关，和没有**多模态能力**的 ChatGPT 沟通前端，想想都有点难。不过最近在 ChatGPT 的帮助下，很快就写了一个[油猴插件](https://greasyfork.org/en/scripts/475169-chatgpt-export)，能够在 ChatGPT 的聊天界面上，复制数学公式的 Latex 文本。

作为一个后台开发，前端零基础，要写一个油猴插件，如果没有 ChatGPT，首先得去找文档看，写一个雏形都要花很多时间。如果中间遇到了问题，还得自己去找答案，这个过程可能会很漫长，可能中途就放弃了。但是有了 ChatGPT 老师，遇到问题直接提问，整个开发体验就好了太好了。

再次感叹下，ChatGPT 真的是极大**拓宽个人的技术能力边界，极大提高个人解决问题的能力！**

![ChatGPT export 插件](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230913_chatgpt_export_script_copy.png)

<!-- more -->

## 油猴脚本背景

刚好最近看的一本书提到了**向量内积**，就在 ChatGPT 上深入了解了下这里的数学知识。然后想把聊天页面这里的公式复制到 markdown 笔记中去，发现直接复制内容不太可行。

打开浏览器的开发者工具，看到在 html 中其实有公式的 Latex 文本表示，复制后可以在 [mathjax](https://www.mathjax.org/#demo) 查看转换后的公式：

![数学公式在线预览](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230913_chatgpt_export_script_mathjax.png)

不过总不能每次要复制一个公式，就去开发者工具里面复制吧。于是想着可以写一个油猴脚本，能够在公式旁边放一个复制按钮，点击后就能把 Latex 公式复制出来。

## 第一个版本

之前没搞过油猴脚本，不过不担心，直接问 ChatGPT 老师：

> 我想写一个油猴脚本，在 chat.openai.com 页面中，对于公式，可以在右边提供一个复制按钮，复制公式的文本内容。比如下面的 html：
> ...
> ...
> 复制 annotation encoding="application/x-tex" 里面的内容

很快一个简单的雏形脚本就出来了，不过安装脚本后，没看到复制按钮。对于动态加载的内容，上面脚本依赖的 `window.load` 事件可能不会完全起作用。因为在 window.load 触发时，这些动态元素可能还没有加载。在这种情况下，一个更可靠的方法是使用 `MutationObserver` 来监听 DOM 变化。当新的 **.math** 元素被添加到 DOM 时，MutationObserver 将触发，然后可以相应地添加复制按钮。


## 复刻前端样式

对于一个前端零基础的后台开发来说，根本不知道怎么调这些 CSS 样式。这里我想要在每个公式后面的复制按钮，能够和 ChatGPT 自己的复制按钮保持完全一致。在浏览器的开发者工具里，直接复制图标的 SVG 标签过来：

```html
<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round"
stroke-linejoin="round" class="icon-sm" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
<rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
</svg>
```

发现确实有图标，但是**样式不太对，颜色和鼠标停留上去都没效果**，更不用说暗黑模式下的颜色适配了。之前从 GPT 那里学到过，这里样式一般是通过 tag 的 class 来设定的，刚好看到 svg 标签外层有一个 button，里面有很多 class，于是把这个 button 以及它的 class 也都复制过来，样式基本就一致了。

为了了解某个 class 各自到底负责什么样式，之前都是在开发者工具去掉之后看看效果，不过有了 ChatGPT 还可以直接问它了：

> 帮我解释下这里每个 class 负责什么样式：
> class="flex ml-auto gap-2 rounded-md p-1 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400"

于是学到了下面的解释，这里使用的是 `Tailwind CSS` 的类名，每个都对应某种特定的样式：

- flex: 使元素使用 Flexbox 布局。
- ml-auto: 设置左外边距（margin-left）为自动，通常用于将元素推到容器的右边。
- gap-2: 设置 Flex 或 Grid 布局中的元素之间的间距。
- rounded-md: 设置元素的边角为中等大小的圆角。
- p-1: 设置元素的内边距（padding）。

悬停（Hover）状态
- hover:bg-gray-100: 当鼠标悬停在元素上时，设置背景色为浅灰色。
- hover:text-gray-700: 当鼠标悬停在元素上时，设置文本颜色为深灰色。

暗黑模式（Dark mode）
- dark:text-gray-400: 在暗黑模式下，设置文本颜色为中灰色。
- dark:hover:bg-gray-700: 在暗黑模式下，鼠标悬停时设置背景颜色为更深的灰色。
- dark:hover:text-gray-200: 在暗黑模式下，鼠标悬停时设置文本颜色为浅灰色。

暗黑模式 + 禁用（Disabled）状态
- disabled:dark:hover:text-gray-400: 在暗黑模式下，如果元素被禁用，鼠标悬停时设置文本颜色为中灰色。

这些类名各自负责一个很小但明确的样式设置，这是 Tailwind CSS 的工作方式。通过组合这些类名，可以非常灵活地构建复杂的样式。通过上面的设置，复制按钮和原生的已经保持一致了。这里点原生的复制按钮，复制成功后，图标会变成一个对号，然后又变回去了，目前脚本里的还做不到。

## 捕捉动态内容

为了追求完美的效果，我想在油猴脚本里实现同样的效果。这里首先得知道 ChatGPT 的对号是什么 html 内容。于是问了下：

> 有个svg 的 button，点击后会变成另一个 svg，但是很快就变回去了。我想看下中间变到的 svg，这里要怎么做？

ChatGPT 给了几个思路：

1. 当 SVG 改变时，开发者工具通常会高亮显示改变的部分，可以在此时快速复制 SVG 的代码。
2. 在控制台使用 JavaScript 来暂停 SVG 的变化。如果 SVG 的变化是由某个函数触发的，可以重写该函数以阻止其执行原本的任务。
3. 找到触发 SVG 变化的 JavaScript 代码，在相应的行设置断点。当代码执行到该行时，它会暂停，允许查看此时的 SVG 状态。
4. 如果 SVG 是通过网络请求获得的，可以在 Netword 找到对应的请求。然后在“Response”（或“响应”）部分看到 SVG 数据。

前面几个方法都不太可行，第 1 个方法，没来的及复制就变回去了。第 2、3 个方法，我不知道怎么找到触发 SVG 变化的 JavaScript 代码。第 4 个方法，因为这里没触发网络请求，所以不适用。

其实断点这个方法看起来最实用，中间让 ChatGPT 一步步的讲这里怎么用断点。因为直接看 Script 的代码找触发 SVG 变化的部分有难度，ChatGPT 推荐用浏览器开发者工具的"Event Listeners"（事件监听器）功能来查找这个按钮的点击事件。但是我看了 button 元素的 Click 事件，通过事件找到的 JS 代码也不太对。不要慌，继续追问 ChatGPT 老师：

> 我找不到这里是哪个事件监听，有没有更方便的方法。

ChatGPT 又给我推荐了 3 种方法：

1、使用 JavaScript 在 Console（控制台）中手动增加这里 button 或 svg 的点击事件，输出点击 button 后变化的内容。

```javascript
document.querySelector('.text-gray-400').addEventListener('click', function(e) {
if (e.target.closest('button')) {  // 检查点击的是否是 button 或其子元素
    setTimeout(() => {  // 设置一个短暂的延迟以捕获可能的变化
    console.log(e.target.closest('.text-gray-400').innerHTML);  // 输出变化后的内容
    }, 100);  // 延迟 100 毫秒，可以根据实际情况调整
}
});
```

但是尝试了几次，这里都没有任何输出。

2、在 "Elements"（元素）面板中找到这个 svg 元素。右键点击这个元素，在出现的菜单中选择 "Break on" -> "attribute modifications"。这样当该元素的属性发生变化时，代码会自动暂停，让你有机会查看或者拷贝当前的 SVG 代码。同样试了几个 tag 下的 Break on，都没有在正确的时机暂停过。

3、使用 `MutationObserver`。这是一个更高级的方案，通过 MutationObserver API 可以监听 DOM 的变更，包括元素的添加和删除。

正是这第三个方法，让我成功拿到了变化后的图标内容。这里提示问题也很简单，就是直接让他显示 DOM 变化的内容：

> 这里使用了 MutationObserver，我能在页面发生 dom 变化的时候，就直接输出变化的那一小块吗?

于是拿到了下面的这个 JS 代码(ChatGPT 还贴心的给了注释)：

```javascript
// 创建一个观察器实例并传入回调函数
const observer = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    // 检查是否有子节点被添加或删除
    if (mutation.type === 'childList') {
      // 如果有子节点被添加
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(function(node) {
          console.log('Added node:', node);
        });
      }
      // 如果有子节点被删除
      if (mutation.removedNodes.length > 0) {
        mutation.removedNodes.forEach(function(node) {
          console.log('Removed node:', node);
        });
      }
    }
    // 检查是否有属性变化
    if (mutation.type === 'attributes') {
      console.log('Attributes changed:', mutation.target);
    }
  });
});

// 配置观察选项
const config = { attributes: true, childList: true, subtree: true };
// 在目标节点上开始观察
observer.observe(document.body, config);
```

把这段代码复制并粘贴到浏览器的开发者工具的控制台中运行，然后点击复制，就可以看到输出的内容了，如下图：

![控制台观察到了这里的 Button 变化](https://slefboot-1251736664.cos.ap-beijing.myqcloud.com/20230913_chatgpt_export_script_dom_change.png)

这里看到 ChatGPT 的对号 HTML 内容如下：

```html
<button class="flex ml-auto gap-2 rounded-md p-1 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400">
    <svg
        stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round"
        stroke-linejoin="round" class="icon-sm" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
</button>
```

## 设置复制动作

接下来就是让他帮我在脚本里添加上复制动作效果了。提问的时候，需要把**目前版本的脚本带上去**，这点很重要，因为这样它就会在当前的代码上下文做改动。提示词如下：

> 我想给下面的油猴脚本增加一个动作：
> 
> // ==UserScript==
> // @name         chatgpt-export
> ...
> ...(省略掉)
> 点击 copy ，复制成功公式后，这里 copyButton 变成 copiedButton，过 2s 后自动再复原。

ChatGPT 给出了详细的方法，可以在 click 事件监听器内部进行操作，先将 copyButton 的 innerHTML 改为 copiedButton，然后使用 setTimeout 在2秒后再改回 copyButton。

```javascript
// ...省略其他代码
copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(latexText).then(() => {
        console.log('复制成功！');
        // 复制成功后，更改按钮为 'copiedButton'
        copyButton.innerHTML = copiedButton;
        
        // 2秒后复原按钮
        setTimeout(() => {
            copyButton.innerHTML = copyButton;
        }, 2000);
    }).catch(err => {
        console.error('复制失败:', err);
    });
});
// ...省略其他代码
```

这里还温馨提示**发现我代码里有一个问题**：在创建 copyButton 时，你再次用了一个**同名的局部变量**。这会导致原始的 copyButton（存储按钮 HTML 的那个）被覆盖。为了避免这个问题，你应该给用于存储 HTML 的 copyButton 变量和用于创建实际 DOM 元素的 copyButton 变量使用不同的名字。

不过我没注意到这个问题，改了后 button 没了，变成了 `[object HTMLSpanElement]`，再次提问后，ChatGPT 耐心又给我解释了一遍。这是因为 copyButton 是一个 `HTMLSpanElement` 对象，将其设置为自己的 innerHTML 会导致其变成字符串 "[object HTMLSpanElement]"。解决这个问题的一个方法是使用不同的变量名存储 HTML 内容和 DOM 元素。这样，你就可以在需要的时候分别引用它们。关键代码如下：

```javascript
const copyButtonHtml = `<button **** </button>` // 这里名字由 copyButton 改为 copyButtonHtml
const copyButton = document.createElement('span');
copyButton.innerHTML = copyButtonHtml;
```

至此这里复制功能就完成了。最后就是发布脚本了，发布的流程自己也不清楚，同样在 ChatGPT 的帮助下，把脚本上传到 Greasy Fork 上，最后奉上油猴脚本地址：[chatgpt-export](https://greasyfork.org/zh-CN/scripts/475169-chatgpt-export)。

装了脚本后，在有数学公式的聊天界面里，对于行内公式和块级公式，在旁边都会多一个复制按钮，点击后就可以复制公式，复制后会短暂显示一个对号，整体效果和官方原生的复制按钮一样。

## 意外的结尾

发布完插件，再来体验的时候，忽然发现官方**自带的复制功能**，就可以导出当前聊天会话的 markdown 内容，也包括了公式里的 latex 文本，所以这个脚本**多少有点鸡肋**。不过这个过程，还是学到了很多前端的知识，对 ChatGPT 的能力也有了更深的认识，还是很值得的。