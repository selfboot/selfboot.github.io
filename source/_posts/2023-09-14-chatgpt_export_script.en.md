---
title: ChatGPT Teacher Teaches Me Writing a Tampermonkey Script
tags:
  - ChatGPT
  - Frontend
mathjax: true
category: Programming
toc: true
description: This article documents the process of a backend developer developing a browser Tampermonkey script from scratch under ChatGPT's guidance. It covers the working principles of Tampermonkey scripts, debugging frontend styles, capturing DOM changes, adding interactions, and other techniques. It successfully implemented the function of capturing Latex mathematical formula text on the ChatGPT page. It shares the unique experience of using ChatGPT to learn new skills and enhance problem-solving abilities.
date: 2023-09-15 07:50:38
lang: en
---

Learning frontend with ChatGPT as a teacher? Sounds a bit incredible, after all, frontend has a lot to do with UI, and communicating frontend with ChatGPT, which doesn't have **multimodal capabilities**, seems difficult just thinking about it. However, recently, with the help of ChatGPT, I quickly wrote a [Tampermonkey plugin](https://greasyfork.org/en/scripts/475169-chatgpt-export) that can copy the Latex text of mathematical formulas on ChatGPT's chat interface.

As a backend developer with zero frontend experience, writing a Tampermonkey plugin would first require finding documentation and spending a lot of time just to write a prototype without ChatGPT. If problems were encountered in the middle, one would have to find answers on their own, which could be a very long process and might lead to giving up halfway. But with ChatGPT as a teacher, you can directly ask questions when encountering problems, making the entire development experience so much better.

Once again, I marvel at how ChatGPT really **greatly expands personal technical capabilities and greatly improves personal problem-solving abilities!**

![ChatGPT export plugin](https://slefboot-1251736664.file.myqcloud.com/20230913_chatgpt_export_script_copy.png)

<!-- more -->

## Tampermonkey Script Background

Recently, a book I was reading mentioned **vector inner product**, so I delved deeper into this [mathematical knowledge](https://selfboot.cn/2023/09/14/chatgpt_math_product/) on ChatGPT. Then I wanted to copy the formulas from the chat page to my markdown notes, but found that directly copying the content wasn't feasible.

Opening the browser's developer tools, I saw that the html actually contained the Latex text representation of the formula, which could be viewed after copying and converting on [mathjax](https://www.mathjax.org/#demo):

![Online preview of mathematical formulas](https://slefboot-1251736664.file.myqcloud.com/20230913_chatgpt_export_script_mathjax.png)

However, we can't open the developer tools every time we want to copy a formula. So I thought about writing a Tampermonkey script that could place a copy button next to the formula, which when clicked would copy the Latex formula.

## The First Version

I hadn't worked with Tampermonkey scripts before, but I wasn't worried. I directly asked ChatGPT teacher:

> I want to write a Tampermonkey script that provides a copy button on the right side of formulas on the chat.openai.com page, to copy the text content of the formula. For example, the following html:
> ...
> ...
> Copy the content inside annotation encoding="application/x-tex"

Soon, a simple prototype script came out, but after installing the script, I didn't see the copy button. So I asked ChatGPT teacher again, and it told me that for dynamically loaded content, the `window.load` event that the above script relies on might not work completely. Because when window.load is triggered, these dynamic elements may not have loaded yet. In this case, a more reliable method is to use `MutationObserver` to listen for DOM changes. When new **.math** elements are added to the DOM, MutationObserver will trigger, and then you can add copy buttons accordingly.

Then it gave new script logic, defining an addCopyButtons function that performs the same task as before: finding all .math elements and adding copy buttons. Then, use MutationObserver to watch for all newly added or removed nodes on the page. Whenever the DOM changes, the addCopyButtons function will be called, ensuring that all new .math elements also get copy buttons.

```javascript
  // Initial adding
  addCopyButtons();

  // Observe for new formulas
  const observer = new MutationObserver(() => {
    console.log("DOM has changed, rechecking...");
    addCopyButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });
```

With this script, **the page froze immediately upon opening**, it seems the script has some form of infinite loop or excessive resource consumption. Then I directly gave all the current code to ChatGPT and asked it to help troubleshoot the reason for freezing. It found 3 places that might cause performance issues:

1. MutationObserver triggers too frequently: If the page's DOM changes frequently, MutationObserver might trigger many times, causing the addCopyButtons function to be called frequently as well.
2. Complex DOM queries: document.querySelectorAll and div.querySelector might become relatively slow in complex DOM structures.
3. Event listener accumulation: Every time addCopyButtons is called, you add a click event listener to the newly created button. If this function is called multiple times, the same element might bind multiple identical event listeners.

Then it modified the above script, adding a simple debounce mechanism to limit the frequency of MutationObserver triggers, and avoiding adding the same event listener repeatedly. The main modifications are as follows:

```javascript
(function() {
    ...
    const addCopyButtons = () => {
      const mathDivs = document.querySelectorAll('.math, .math-inline, .math-display');
        mathDivs.forEach(div => {
          if (div.getAttribute('data-copy-button-added') === 'true') return;
          div.setAttribute('data-copy-button-added', 'true');
          ...
      }
    ...
    };

    const debounceAddCopyButtons = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(addCopyButtons, 300);
    };

    addCopyButtons();  // Run once initially

    const observer = new MutationObserver(() => {
        console.log("DOM has changed, rechecking...");
        debounceAddCopyButtons();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();    
```

At this point, the plugin basically works, but the style of the copy button is different from ChatGPT's built-in copy button, and there's no prompt after successful copying. To pursue perfection, we continue to optimize here.

## Replicating Frontend Styles

For a backend developer with zero frontend experience, I had no idea how to adjust these CSS styles. Here I wanted the copy button after each formula to be completely consistent with ChatGPT's own copy button. In the browser's developer tools, I directly copied over the SVG tag of the icon:

```html
<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round"
stroke-linejoin="round" class="icon-sm" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
<rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
</svg>
```

I found that there was indeed an icon, but **the style wasn't quite right, the color and mouse hover effect weren't there**, not to mention the color adaptation in dark mode. I had learned from GPT before that styles are usually set through the class of the tag, and I just happened to see that there was a button outside the svg tag with many classes, so I copied over this button and its classes as well, and the styles were basically consistent.

To understand what styles each class is responsible for, I used to remove them in the developer tools and compare the effects, but with ChatGPT, I could just ask it directly:

> Can you explain what styles each class is responsible for here:
> class="flex ml-auto gap-2 rounded-md p-1 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400"

So I learned the following explanation, these are class names from `Tailwind CSS`, each corresponding to a specific style:

- flex: Makes the element use Flexbox layout.
- ml-auto: Sets the left margin (margin-left) to auto, typically used to push an element to the right of its container.
- gap-2: Sets the gap between elements in a Flex or Grid layout.
- rounded-md: Sets the element's corners to medium-sized rounded corners.
- p-1: Sets the element's padding.

Hover state
- hover:bg-gray-100: When the mouse hovers over the element, sets the background color to light gray.
- hover:text-gray-700: When the mouse hovers over the element, sets the text color to dark gray.

Dark mode
- dark:text-gray-400: In dark mode, sets the text color to medium gray.
- dark:hover:bg-gray-700: In dark mode, when hovering, sets the background color to a deeper gray.
- dark:hover:text-gray-200: In dark mode, when hovering, sets the text color to light gray.

Dark mode + Disabled state
- disabled:dark:hover:text-gray-400: In dark mode, if the element is disabled, sets the text color to medium gray when hovering.

Each of these class names is responsible for a very small but specific style setting, which is how Tailwind CSS works. By combining these class names, you can very flexibly build complex styles. With the above settings, the copy button is now consistent with the native one. **The only imperfection is that when you click the native copy button, the icon changes to a check mark and then changes back, which the script can't do yet**.

## Capturing Dynamic Content

To pursue a perfect effect, I wanted to implement the same click effect in the Tampermonkey script. First, I needed to know what graphic ChatGPT's successful copy checkmark prompt is. So I asked:

> There's an svg button that changes to another svg when clicked, but it changes back very quickly. I want to see the svg it changes to in the middle, how can I do this?

ChatGPT gave several approaches:

1. When the SVG changes, the developer tools usually highlight the changed part, and you can quickly copy the SVG code at this time.
2. Use JavaScript in the console to pause the SVG change. If the SVG change is triggered by a function, you can rewrite that function to prevent it from performing its original task.
3. Find the JavaScript code that triggers the SVG change and set a breakpoint on the corresponding line. When the code executes to that line, it will pause, allowing you to view the SVG state at that time.
4. If the SVG is obtained through a network request, you can find the corresponding request in Network. Then you can see the SVG data in the "Response" section.

The first few methods weren't very feasible. For the first method, it changed back before I could copy it. For the 2nd and 3rd methods, I didn't know how to find the JavaScript code that triggers the SVG change. The 4th method wasn't applicable because no network request was triggered here.

Actually, the breakpoint method seemed most practical, because it's difficult to find the part that triggers the SVG change by directly looking at the Script code. ChatGPT recommended using the "Event Listeners" feature of the browser's developer tools to find the click event of this button. But when I looked at the Click event of the button element, the JS code found through the event wasn't quite right either. Don't panic, continue to ask ChatGPT teacher:

> I can't find which event listener it is here, is there a more convenient method?

ChatGPT recommended 3 more methods:

1. Use JavaScript in the Console to manually add a click event to the button or svg here, outputting the content that changes after clicking the button.

```javascript
document.querySelector('.text-gray-400').addEventListener('click', function(e) {
if (e.target.closest('button')) {  // Check if the click is on the button or its child elements
    setTimeout(() => {  // Set a brief delay to capture possible changes
    console.log(e.target.closest('.text-gray-400').innerHTML);  // Output the changed content
    }, 100);  // Delay 100 milliseconds, can be adjusted according to actual situation
}
});
```

But after several attempts, there was no output here.

2. Find this svg element in the "Elements" panel. Right-click on this element, select "Break on" -> "attribute modifications" from the menu that appears. This way, when the attributes of the element change, the code will automatically pause, giving you a chance to view or copy the current SVG code. Similarly, I tried Break on under several tags, but none of them paused at the right moment.

3. Use `MutationObserver`. This is a more advanced solution. Through the MutationObserver API, you can listen for DOM changes, including the addition and removal of elements.

It was this third method that allowed me to successfully capture the changed icon content. The prompt here was also very simple, as follows:

> Here MutationObserver is used, can I directly output the changed small block when the page's dom changes?

So I got the following JS code (ChatGPT also thoughtfully provided comments):

```javascript
// Create an observer instance and pass in a callback function
const observer = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    // Check if child nodes have been added or removed
    if (mutation.type === 'childList') {
      // If child nodes have been added
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(function(node) {
          console.log('Added node:', node);
        });
      }
      // If child nodes have been removed
      if (mutation.removedNodes.length > 0) {
        mutation.removedNodes.forEach(function(node) {
          console.log('Removed node:', node);
        });
      }
    }
    // Check if attributes have changed
    if (mutation.type === 'attributes') {
      console.log('Attributes changed:', mutation.target);
    }
  });
});

// Configure observation options
const config = { attributes: true, childList: true, subtree: true };
// Start observing on the target node
observer.observe(document.body, config);
```

Copy and paste this code into the browser's developer tools console to run, then click copy, and you can see the output content, as shown in the following image:

![Button changes observed in the console](https://slefboot-1251736664.file.myqcloud.com/20230913_chatgpt_export_script_dom_change.png)

Here we can see that the HTML content of ChatGPT's checkmark is as follows:

```html
<button class="flex ml-auto gap-2 rounded-md p-1 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400">
    <svg
        stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round"
        stroke-linejoin="round" class="icon-sm" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
</button>
```

With this svg icon, it's easy now. The rest is to replace the original icon with this one when clicked. First define this html as copiedButton, then ask ChatGPT to add the click event code.

## Setting Copy Action

When asking questions here, it's important to **bring up the current version of the script**, because this way it will make changes in the context of the current code. The prompt is as follows:

> I want to add an action to the following Tampermonkey script:
> 
> // ==UserScript==
> // @name         chatgpt-export
> ...
> ...(omitted)
> When copy is clicked, after successfully copying the formula, the copyButton here changes to copiedButton, and automatically reverts back after 2 seconds.

ChatGPT provided a detailed method, suggesting that operations can be performed inside the click event listener, first changing the innerHTML of copyButton to copiedButton, then using setTimeout to change it back to copyButton after 2 seconds.

```javascript
// ...omit other code
copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(latexText).then(() => {
        console.log('Copy successful!');
        // After successful copy, change the button to 'copiedButton'
        copyButton.innerHTML = copiedButton;
        
        // Revert the button after 2 seconds
        setTimeout(() => {
            copyButton.innerHTML = copyButton;
        }, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
    });
});
// ...omit other code
```

It also kindly **pointed out a problem in my code**: when creating copyButton, I used a **local variable with the same name** again. This would cause the original copyButton (the one storing the button HTML) to be overwritten. To avoid this problem, you should use different names for the copyButton variable used to store HTML and the copyButton variable used to create the actual DOM element.

However, **I didn't notice this problem**, and after making the change, I found that the button was gone, replaced by [object HTMLSpanElement]. Asking ChatGPT again, I learned that copyButton is an HTMLSpanElement object, and setting it as its own innerHTML would cause it to become the string "[object HTMLSpanElement]". The solution to this problem is to use different variable names to store HTML content and DOM elements. This way, you can reference them separately when needed. The key code is as follows:

```javascript
const copyButtonHtml = `<button **** </button>` // Change the name here from copyButton to copyButtonHtml
const copyButton = document.createElement('span');
copyButton.innerHTML = copyButtonHtml;
```

With this, the copy functionality was complete. The last step was to publish the script. Not knowing the publishing process myself, I once again sought help from ChatGPT and uploaded the script to Greasy Fork. Finally, here's the Tampermonkey script address: [chatgpt-export](https://greasyfork.org/zh-CN/scripts/475169-chatgpt-export).

After installing the script, in chat interfaces with mathematical formulas, there will be an additional copy button next to both inline formulas and block-level formulas. Clicking it allows you to copy the formula, and after copying, it briefly displays a checkmark. The overall effect is the same as the official native copy button.

## Unexpected Ending

After publishing the plugin and experiencing it again, I suddenly discovered that the **built-in copy function** of the official version can export the markdown content of the current chat session, which also includes the latex text in the formulas, so this script is **somewhat redundant**. However, in this process, I still learned a lot of frontend knowledge and gained a deeper understanding of ChatGPT's capabilities, which was still very worthwhile.

I also welcome everyone to try this script, after all, you can copy just one formula instead of the entire content~