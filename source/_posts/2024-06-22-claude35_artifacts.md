---
title: 免费版 Claude3.5 配合 Artifacts，一句话就能写个游戏
tags:
  - LLM
category: 人工智能
toc: true
date: 2024-06-22 13:47:28
description: 深入探讨 Anthropic 新发布的 Claude 3.5 模型及其 Artifacts 功能，通过五子棋和俄罗斯方块游戏的快速实现，展示了代码生成和问题解决方面的卓越能力。还讨论了当前版本的一些局限性，如工作空间功能的限制，并展望了未来 AI 辅助编程的发展方向。
---

Anthropic **不声不响**地发布了 [Claude 3.5 模型](https://www.anthropic.com/news/claude-3-5-sonnet)，除了模型效果提升，还支持了 Artifacts。初步体验后，感觉这才是未来 AI 的样子，比之前 GPT4-o 更让我震撼。

![Artifacts 工作空间内写代码](https://slefboot-1251736664.file.myqcloud.com/20240621_claude35_artifacts_artifacts.png)

在 Artifacts 之前，如果想用 ChatGPT 等 LLM 来帮忙实现程序功能，需要先提功能需求，然后复制 AI 的代码到自己的环境中运行。如果和预期不符合，要再追问、再修改代码运行。需要重复这个过程，直到满意或者放弃（有些复杂代码目前 AI 还是写不太好）。

<!--more-->

现在有了 Artifacts，提供具体功能需求后，Claude 会创建一个**工作空间**，后续对话过程中，AI 可以在这个动态工作空间中实时查看、编辑代码。这样，Claude 就从普通的对话式生成 AI 变成了一个**协作工作环境**，或许在不久的将来，可以将 Claude 引入到我们自己的项目中，让它像普通团队成员一样参与到开发。

愿景当然很美好，不过目前的 Artifacts 还只是 beta 功能，表现如何呢？下面来试试看。

## AI 实现五子棋游戏

先试着让 Claude 实现一个 web 版五子棋游戏，我的提示词也很简单：

> 我想写一个网页五子棋游戏，给出完整的实现代码

然后，就看到了 Artifacts 的工作空间，里面已经有了一个代码文件，并且在自动生成代码。

![Artifacts 生成五子棋代码文件中](https://slefboot-1251736664.file.myqcloud.com/20240621_claude35_artifacts_gobang_code.png)

代码生成之后，直接跳到了一个预览页面，可以看到五子棋的界面。本来以为这个预览页面是静态的，没想到还可以在这个页面上进行交互，点击棋盘上的位置，会轮流下黑白子。

![Artifacts 生成五子棋界面预览](https://slefboot-1251736664.file.myqcloud.com/20240621_claude35_artifacts_gobang_preview.png)

既然能下子，那么到底有没有实现五子棋的规则呢？于是玩了下，发现 AI 确实实现了五子棋的规则，而且还有胜负判断。

**完全超出预期了**！！！一句话，真的只要一句话，**AI 就实现了一个还算完整的五子棋游戏，有美观的界面，有规则判断，还有胜负判定，已经完全可以拿来玩了**。

关键是 AI 还接着给出了一些继续完善游戏的建议，比如：

- 添加悔棋功能
- 实现计时器
- 添加音效
- 实现AI对手
- 优化移动设备上的体验

感觉这不是一个 AI，而是一个有血有肉，有自己想法，经验丰富的前端工程师了。

### 五子棋游戏演示

大家可以在博客文章中的[演示地址](#五子棋游戏演示)体验下 AI 写的五子棋游戏。

<div id="game-container">
    <div id="board"></div>
    <p id="status">黑方回合</p>
    <button onclick="resetGame()">重新开始</button>
</div>

跟朋友展示了 Claude3.5 生成的五子棋效果后，朋友有点怀疑 AI 是从哪里抄的代码。毕竟五子棋的实现网上到处都是，AI 学到的别人的代码并拿来用。这样说也不是没道理，那就只能升级下难度，来看看 Claude3.5 的表现如何。
## AI 实现俄罗斯方块

接着再来一个复杂点的游戏，俄罗斯方块。也是从一句简单的提示开始，AI 生成了一个初始的 python 版本。为了在博客里直接跑，就让它换成 web 版的。开始生成的第一个版本，嵌入到博客后，发现边框没有了，并且上下键切换形状的时候，网页会跟随滚动。于是让 Claude 解决这个问题，没想到一次就给出了完美的代码。

从下图也可以看到，重新提示后，Claude 给出可第 2 版本的文件，然后预览页面就是一个完整的俄罗斯方块游戏，可以通过键盘控制方块的移动和旋转。

![Artifacts 生成俄罗斯方块界面预览](https://slefboot-1251736664.file.myqcloud.com/20240621_claude35_artifacts_tetris.png)

这里后续又**通过不断的对话提示**，对一些功能进行了修改，第 5 个版本，就拿到了一个很不错的功能雏形了。整个对话过程感觉 Claude3.5 的**理解能力还是很不错的**，和 GPT4 差别不是很大，最后实现的效果也是超出预期。

### 俄罗斯方块演示

我把 AI 生成的代码直接嵌入到博客中，大家可以在[下面的演示](###俄罗斯方块演示)中体验俄罗斯方块游戏。

<div id="tetrisContainer">
    <canvas id="tetrisCanvas" width="300" height="600"></canvas>
    <button id="startButton">开始游戏</button>
    <div id="gameOverMessage">
        游戏结束！<br>
        你的得分是：<span id="finalScore"></span><br>
        <button id="restartButton">重新开始</button>
    </div>
</div>

从这里俄罗斯方块的不断修改过程来看，AI 的理解能力和代码能力还是很强的，和 GPT4 应该在一个段位。
## 人人用 AI 写程序

从上面写的简单游戏来看，Anthropic 表现很不错。其实我还尝试用它来做一些算法的 Web 可视化演示，Claude3.5 给出的示例也很可以。比如我让它实现了一个令牌桶限频算法，可以设置令牌桶的容量和速率，以及消耗令牌速度，然后让它绘制一个请求监控曲线。

每次设置好参数后，会动态生成监控曲线。然后可以随时暂停，重新设置参数，再继续生成新的监控曲线。设置几个参数，并运行后，就得到了下面结果：

![Artifacts 生成令牌桶限频算法界面预览](https://slefboot-1251736664.file.myqcloud.com/20240622_claude35_artifacts_token_bucket.png)

对于没有前端开发经验的人来说，能够很快实现一个可视化的算法演示，真的是神奇。在 Anthropic 的帮助下，每个人都可以破圈，**不再受限于自己的技术经验，快速实现自己的一些想法**。

特别是对于想学习编程的人来说，以前基本要先啃书，学习技能，然后逐步应用在项目中。现在可以带着问题和 AI 对话，让 AI 帮忙实现，中间有任何问题，可以随时和 AI 沟通，**这样的学习过程更加有趣**。毕竟，如果让我先学习一堆前端语法，然后磕磕碰碰去实现一个俄罗斯方块，我很快就会放弃。而如果我一句话，就生成了一个完整可运行的游戏，然后可以和 AI 一起交流实现的过程和代码细节，就会有趣很多，也会有更多的成就感。

## Anthropic 不足

当然，目前的 Anthropic 只是一个 beta 版本，还有很多不足之处。文章标题写着使用免费 Claude3.5，不过这里免费版限制也比较多，首先是[对话长度有限制](https://support.anthropic.com/en/articles/7996848-how-large-is-claude-s-context-window)，内容稍微长一点，添加附件就会提示：

> Your message will exceed the length limit for this chat. Try attaching fewer or smaller files or starting a new conversation. Or consider upgrading to Claude Pro.

就算没附件，对话轮次太多也会提示：

> Your message will exceed the length limit for this chat. Try shortening your message or starting a new conversation. Or consider upgrading to Claude Pro.

此外，免费版**每小时可以发的消息条数也是有限制的**，很容易触发限制。不过这些都还是小问题，升级 Pro 之后，都能解决。在我看来，目前 Anthropic **最大的缺陷在于工作空间功能太受限**，离真正实用还差不少距离。

目前(2024.06.22)工作空间中的代码只能是 AI 生成，**不能自己编辑**，也不能上传自己的代码。如果想在 AI 代码基础上做一些简单改动，就很困难。另外，每个对话中，工作空间里生成的内容都放在一起，**不能像在文件系统里一样，生成多个文件**。

比如我想用 python 实现一个 web 后端服务，用 fastapi 框架，实现带鉴权功能的 api，要求方便用 docker 部署。Claude3.5 在工作空间**只生成了一个文件**，然后在里面放了 main.py，Dockfile，requirements.txt 等内容。我想拿来用的话，还需要在本地创建文件夹，把里面的内容单独拷贝到不同文件，然后再初始化环境运行。

如果 Anthropic 的工作空间，**能够创建文件夹，然后在里放入整个项目的代码**，并提供下载整个项目的功能，就方便很多。甚至更进一步，Anthropic 可以提供 Python 的运行环境，**让用户直接在工作空间里运行并调试代码**。这样的话，Anthropic 就可以成为一个真正的协作工作环境，而不仅仅是一个代码生成工具。

理想状况下，未来的 Anthropic 应该可以在工作空间生成并管理多个文件夹或者文件，允许我们人工修改部分代码，并在工作空间调试代码。然后 Anthropic 可以在调试过程中发现问题，并进行修复。也就是说，**AI 可以了解整个项目代码，并和人一起，参与到开发的每个过程中去**。

或许这样的 Anthropic 很快就会诞生吧。

<!-- 俄罗斯方块 -->
<style>
    #tetrisContainer {
        position: relative;
        width: 300px;
        height: 600px;
        margin: 20px auto;
    }
    #tetrisCanvas {
        border: 2px solid #333;
    }
    #startButton {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 10px 20px;
        font-size: 16px;
        cursor: pointer;
    }
    #gameOverMessage {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 20px;
        text-align: center;
        display: none;
        width: 80%;
        box-sizing: border-box;
    }
    #restartButton {
        margin-top: 15px;
        padding: 10px 20px;
        font-size: 16px;
        cursor: pointer;
    }
</style>


<script>
    const canvas = document.getElementById('tetrisCanvas');
    const ctx = canvas.getContext('2d');
    const startButton = document.getElementById('startButton');
    const restartButton = document.getElementById('restartButton');
    const gameOverMessage = document.getElementById('gameOverMessage');
    const finalScoreSpan = document.getElementById('finalScore');

    const ROWS = 20;
    const COLS = 10;
    const BLOCK_SIZE = 30;

    const SHAPES = [
        [[1, 1, 1, 1]],
        [[1, 1], [1, 1]],
        [[1, 1, 1], [0, 1, 0]],
        [[1, 1, 1], [1, 0, 0]],
        [[1, 1, 1], [0, 0, 1]],
        [[1, 1, 0], [0, 1, 1]],
        [[0, 1, 1], [1, 1, 0]]
    ];

    const COLORS = [
        '#00FFFF', '#FFFF00', '#FF00FF', '#FF0000',
        '#00FF00', '#0000FF', '#FFA500'
    ];

    let board = Array(ROWS).fill().map(() => Array(COLS).fill(0));
    let currentPiece = null;
    let score = 0;
    let gameActive = false;
    let gameLoop;

    function createPiece() {
        const shapeIndex = Math.floor(Math.random() * SHAPES.length);
        const colorIndex = Math.floor(Math.random() * COLORS.length);
        return {
            shape: SHAPES[shapeIndex],
            color: COLORS[colorIndex],
            x: Math.floor(COLS / 2) - Math.floor(SHAPES[shapeIndex][0].length / 2),
            y: 0
        };
    }

    function drawBlock(x, y, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        ctx.strokeStyle = '#000';
        ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    }

    function drawBoard() {
        board.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value) {
                    drawBlock(x, y, value);
                }
            });
        });
    }

    function drawPiece() {
        currentPiece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value) {
                    drawBlock(currentPiece.x + x, currentPiece.y + y, currentPiece.color);
                }
            });
        });
    }

    function isValidMove(piece, x, y) {
        return piece.shape.every((row, dy) => {
            return row.every((value, dx) => {
                let newX = x + dx;
                let newY = y + dy;
                return (
                    value === 0 ||
                    (newX >= 0 && newX < COLS && newY < ROWS && (newY < 0 || board[newY][newX] === 0))
                );
            });
        });
    }

    function rotatePiece() {
        let rotated = currentPiece.shape[0].map((_, i) =>
            currentPiece.shape.map(row => row[i]).reverse()
        );
        if (isValidMove({...currentPiece, shape: rotated}, currentPiece.x, currentPiece.y)) {
            currentPiece.shape = rotated;
        }
    }

    function movePiece(dx, dy) {
        if (isValidMove(currentPiece, currentPiece.x + dx, currentPiece.y + dy)) {
            currentPiece.x += dx;
            currentPiece.y += dy;
            return true;
        }
        return false;
    }

    function mergePiece() {
        currentPiece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value) {
                    board[currentPiece.y + y][currentPiece.x + x] = currentPiece.color;
                }
            });
        });
    }

    function clearLines() {
        let linesCleared = 0;
        for (let y = ROWS - 1; y >= 0; y--) {
            if (board[y].every(cell => cell !== 0)) {
                board.splice(y, 1);
                board.unshift(Array(COLS).fill(0));
                linesCleared++;
            }
        }
        if (linesCleared > 0) {
            score += linesCleared * 100;
        }
    }

    function gameOver() {
        return board[0].some(cell => cell !== 0);
    }

    function updateGame() {
        if (!movePiece(0, 1)) {
            mergePiece();
            clearLines();
            if (gameOver()) {
                endGame();
            } else {
                currentPiece = createPiece();
            }
        }
        drawGame();
    }

    function drawGame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBoard();
        if (currentPiece) {
            drawPiece();
        }
    }

    function startGame() {
        board = Array(ROWS).fill().map(() => Array(COLS).fill(0));
        score = 0;
        currentPiece = createPiece();
        gameActive = true;
        startButton.style.display = 'none';
        gameOverMessage.style.display = 'none';
        drawGame();
        gameLoop = setInterval(updateGame, 500); // 每500毫秒更新一次游戏状态
    }

    function endGame() {
        gameActive = false;
        clearInterval(gameLoop);
        finalScoreSpan.textContent = score;
        gameOverMessage.style.display = 'block';
    }

    startButton.addEventListener('click', startGame);
    restartButton.addEventListener('click', startGame);

    document.addEventListener('keydown', event => {
        if (!gameActive) return;

        event.preventDefault();
        switch (event.keyCode) {
            case 37: // 左箭头
                movePiece(-1, 0);
                break;
            case 39: // 右箭头
                movePiece(1, 0);
                break;
            case 40: // 下箭头
                movePiece(0, 1);
                break;
            case 38: // 上箭头
                rotatePiece();
                break;
        }
        drawGame();
    });

    drawGame();
</script>


<!-- 五子棋游戏 -->

<script>
    const boardSize = 15;
    let currentPlayer = 'black';
    let gameBoard = [];

    function createBoard() {
        const board = document.getElementById('board');
        for (let i = 0; i < boardSize; i++) {
            const row = document.createElement('div');
            row.className = 'row';
            gameBoard[i] = [];
            for (let j = 0; j < boardSize; j++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.onclick = () => placePiece(i, j);
                row.appendChild(cell);
                gameBoard[i][j] = '';
            }
            board.appendChild(row);
        }
    }

    function placePiece(row, col) {
        if (gameBoard[row][col] !== '') return;

        const cell = document.getElementById('board').children[row].children[col];
        const piece = document.createElement('div');
        piece.className = `piece ${currentPlayer}`;
        cell.appendChild(piece);

        gameBoard[row][col] = currentPlayer;

        if (checkWin(row, col)) {
            document.getElementById('status').textContent = `${currentPlayer === 'black' ? '黑' : '白'}方获胜！`;
            disableBoard();
        } else {
            currentPlayer = currentPlayer === 'black' ? 'white' : 'black';
            document.getElementById('status').textContent = `${currentPlayer === 'black' ? '黑' : '白'}方回合`;
        }
    }

    function checkWin(row, col) {
        const directions = [
            [1, 0], [0, 1], [1, 1], [1, -1]
        ];

        for (const [dx, dy] of directions) {
            let count = 1;
            count += countDirection(row, col, dx, dy);
            count += countDirection(row, col, -dx, -dy);

            if (count >= 5) return true;
        }

        return false;
    }

    function countDirection(row, col, dx, dy) {
        let count = 0;
        let x = row + dx;
        let y = col + dy;

        while (x >= 0 && x < boardSize && y >= 0 && y < boardSize && gameBoard[x][y] === currentPlayer) {
            count++;
            x += dx;
            y += dy;
        }

        return count;
    }

    function disableBoard() {
        const cells = document.getElementsByClassName('cell');
        for (const cell of cells) {
            cell.onclick = null;
        }
    }

    function resetGame() {
        const board = document.getElementById('board');
        board.innerHTML = '';
        gameBoard = [];
        currentPlayer = 'black';
        document.getElementById('status').textContent = '黑方回合';
        createBoard();
    }

    createBoard();
</script>

<style>
    #game-container {
        text-align: center;
    }
    #board {
        display: inline-block;
        background-color: #d4a36a;
        padding: 10px;
        border: 2px solid #8b4513;
    }
    .row {
        display: flex;
    }
    .cell {
        width: 30px;
        height: 30px;
        border: 1px solid #000;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
    }
    .piece {
        width: 26px;
        height: 26px;
        border-radius: 50%;
    }
    .black {
        background-color: #000;
    }
    .white {
        background-color: #fff;
    }
</style>