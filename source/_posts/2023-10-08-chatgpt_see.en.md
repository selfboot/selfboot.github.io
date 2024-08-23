---
title: In-Depth Experience of ChatGPT's Image Understanding Capabilities
tags:
  - ChatGPT
category: Artificial Intelligence
toc: true
description: ChatGPT has recently gained image understanding capabilities. This article comprehensively experiences its power, including impressive object recognition, context explanation, and detail capture, but also notable flaws. ChatGPT can parse birthday party scene images and identify jade food sculptures, but also misjudges objects. Overall, while there's room for improvement, it has exceeded expectations.
date: 2023-10-08 21:05:16
lang: en
---

On September 25th, OpenAI announced new capabilities for ChatGPT: [ChatGPT can now see, hear, and speak](https://openai.com/blog/chatgpt-can-now-see-hear-and-speak). ChatGPT finally got "eyes" and can understand images.
![ChatGPT can now see](https://slefboot-1251736664.file.myqcloud.com/20231007_chatgpt_see_index.webp)

<!-- more -->
During the National Day holiday, I was included in the gradual rollout of image understanding capabilities and had a chance to experience it. It was quite impressive. Next, I'll guide you through an in-depth experience of ChatGPT's image capabilities from the following dimensions:
- Object recognition: Test whether the model can accurately identify the main objects or elements in an image.
- Context interpretation: Judge if the model can infer the underlying story or context based on the image content.
- Detail capture: Check if the model can notice and describe small details or hard-to-notice parts in the image.
- Emotion interpretation: Evaluate if the model can capture human emotions based on the image content.
- Image comparison: When provided with multiple images, test if the model can make comparisons and contrasts.

## Object Recognition

Let's first look at ChatGPT's object recognition ability. During the October holiday, I saw some very realistic food ornaments made of jade and decided to let ChatGPT identify them. The prompt is as follows:

> What foods are in this image?
![Various food ornaments made of jade](https://slefboot-1251736664.file.myqcloud.com/20231008_chatgpt_see_food.png)
ChatGPT's answer was quite good, identifying the following foods. Some of the answers weren't very precise, but they exceeded my expectations. Below is ChatGPT's response. It didn't actually see chicken feet, so I'm not sure what it identified as chicken feet. Also, it identified the fried egg as a pig's ear, which is quite amusing.
- White buns (in a yellow basket)
- Lotus root slices (round slices with holes)
- Eggs (look like they're boiled and cut in half)
- Red dates
- Chicken feet
- Something that looks like pig's ear (bottom left)
- Some kind of candy or dried fruit (in the plate in the middle)
- Some kind of meat slices (possibly beef or lamb, in a bowl)
- Yellow food, shaped like chicken or other poultry
- White round glutinous rice balls
- Chicken-shaped yellow food item, possibly a model or made from pastry
- Long, green vegetables (possibly green beans or similar vegetables)
There was also an image of various ancient books made of jade. ChatGPT recognized that these might be replicas or artworks of the ancient books, rather than actual ancient books. It could also identify the names of some of the books, but it also had hallucinations, giving some book names that weren't in the image.

## Context Interpretation

When we were young, we often had assignments to write compositions based on images, where we were given a picture and asked to write a paragraph describing the story or context in the picture. Let's see how ChatGPT performs. I found an illustration online and used the following prompt:
> Can you help describe the scene in this picture?
![An illustration of a birthday celebration scene](https://slefboot-1251736664.file.myqcloud.com/20231008_chatgpt_see_birth.png)
Then I directly asked ChatGPT to describe the scene in this picture. ChatGPT's answer was still impressive, summarizing that this picture shows a fun and lively birthday party scene, and providing a detailed description:
- In the center of the room, there's a blond boy **playing with a robot toy** with an adult. They seem to be interacting, with the boy reaching out to the robot.
- On the left side of the room, there's a brown little monster wearing a birthday hat, and it seems to be laughing.
- A green alien is standing next to an open gift box, holding a remote control, as if controlling the robot.
- On the right side of the room, there are two adults. A man **wearing a green shirt** is pouring a drink for another man holding a cup.
- On the wall behind, there's a banner that says "Happy Birthday", and there's a TV screen showing pictures of five people.
- Many toys are scattered on the floor, such as a red toy car, accordion, and balloons.
- There's a shelf by the wall with music equipment, with musical notes floating out, indicating that music is playing.
- Other decorations and items, such as lanterns, candlesticks, and a birthday cake, are also distributed around the room.
However, one embarrassing point is that **it mistook the photo frame on the wall for a TV, and the number of people in it is not very accurate**.

## Detail Capture

In the above example, we can already see that ChatGPT has a strong ability to capture details, noticing the scattered toys, cars, balloons, etc. on the ground. We can continue to ask about some details, such as "What's the black thing slightly above the middle on the left side of the picture?" ChatGPT believes that the black object in the middle left of the image is a fireplace. Judging from its structure and position, it should be a fixed decoration or architectural element of the room.
Next, I continued to ask about how many people are in the photo frame on the wall. This time ChatGPT made a mistake, first saying 5 people, then when asked to count again, saying 6, and finally when asked to "**look carefully**", still answering incorrectly: there are five people in the photo, two adults and three children.

## Emotion Interpretation

A human child less than 1 year old can read adults' expressions and understand their emotions, so how does ChatGPT perform in understanding expressions? To make testing easier, I directly used a photo with many facial expressions. The prompt is as follows:

> There are many facial expressions in this picture. What emotions are they? Can you describe them one by one for me?

![Image of various facial expressions](https://slefboot-1251736664.file.myqcloud.com/20231008_chatgpt_see_faces.png)
ChatGPT started from the top left corner and described in order from left to right, top to bottom. However, it initially gave me **17 expression descriptions**, then I told it there are 15 in total and asked it to regenerate the descriptions. To correspond with the image, I'll output a table corresponding to the positions of the expressions above.

| 1 | 2 | 3 | 4 | 5 | 
| -- | -- | -- | -- | -- | 
| Thoughtful or confused | Surprised | Sad | Thoughtful | Expressionless or indifferent | 
| Smiling | Scared | Happy | Surprised | Deep in thought |
| Displeased or frowning | Laughing | Mischievous or joking | Serious or expressionless | Happy or pleased | 

## Image Comparison

Everyone has played games where you find differences between the left and right parts of a picture, right? This can be quite difficult for humans; sometimes we just can't find the differences. So how does ChatGPT perform? I found an image online to try it out. The prompt is as follows:

> Find the differences between the left and right parts of this image, and describe them one by one.

![Image comparison to find differences](https://slefboot-1251736664.file.myqcloud.com/20231008_chatgpt_see_diff.png)
ChatGPT's answer has **quite serious hallucinations**. It believes the differences between the left and right parts are:

1. The first obvious difference is that the lollipop in the middle of the left part is rainbow-colored, while the lollipop in the middle of the right part has simpler colors.
2. In the upper left corner of both parts, there's a chocolate ice cream. The chocolate ice cream on the left has more white dot decorations, while the one on the right has fewer white dot decorations.
3. There's a small candy to the right of the rainbow lollipop in the left part, while the right part doesn't have this small candy.
It can see that there's a rainbow-colored lollipop in the middle of the left part, although in fact, the colors are the same on both sides, but ChatGPT believes the colors on the right side are simpler. The other two differences are also incorrect. It seems that ChatGPT's ability in this type of task is still quite poor.

## Conclusion

Through the above experience, we can see that ChatGPT's ability in image understanding is quite good, showing amazing potential in object recognition, context interpretation, and other aspects. ChatGPT's visual ability has just been launched and still has a lot of room for improvement. We have reason to believe that with the enrichment of training data and the iteration and upgrade of the model, ChatGPT will be able to truly "**see clearly**" in the future.
Before the visual ability was available, to get ChatGPT to generate some front-end code, we had to painstakingly describe what the page looks like. In the future, we can just throw the design drawing or a hand-drawn sketch at it, and then wait for it to implement the code.