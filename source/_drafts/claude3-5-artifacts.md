---
title: 免费版 Claude3.5 配合 Artifacts，人人都可以写程序
category: 人工智能
tags: [LLM]
toc: true
---

Anthropic **不声不响**地发布了 [Claude 3.5 模型](https://www.anthropic.com/news/claude-3-5-sonnet)，除了模型效果提升，还支持了 Artifacts。初步体验后，感觉这才是未来 AI 的样子，比之前 GPT4-o 更让我震撼。

![Artifacts 工作空间内写代码](https://slefboot-1251736664.file.myqcloud.com/20240621_claude35_artifacts_artifacts.png)

在 Artifacts 之前，如果想用 ChatGPT 等 LLM 来帮忙实现程序功能，需要先提功能需求，然后复制 AI 的代码到自己的环境中运行。如果和预期不符合，要再追问、再修改代码运行。需要重复这个过程，直到满意或者放弃（有些复杂代码目前 AI 还是写不太好）。

<!--more-->

现在有了 Artifacts，提供具体功能需求后，Claude 会创建一个**工作空间**，后续对话过程中，我们和 AI 可以一起在这个动态工作空间中实时查看、编辑和预览代码。这样，Claude 就从普通的对话式生成 AI 变成了一个**协作工作环境**，或许在不久的将来，可以将 Claude 引入到我们自己的项目中，让它像普通团队成员一样参与到开发。

愿景当然很美好，不过目前的 Artifacts 还只是 beta 功能，到底能不能完成一些简单功能呢？下面来试试看。

## AI 实现五子棋游戏

先试着让 Claude 实现一个 web 版五子棋游戏，我的提示词也很简单：

> 我想写一个网页五子棋游戏，给出完整的实现代码

然后，就看到了 Artifacts 的工作空间，里面已经有了一个代码文件，并且在自动生成代码。

![Artifacts 生成五子棋代码文件中](https://slefboot-1251736664.file.myqcloud.com/20240621_claude35_artifacts_gobang_code.png)

代码生成之后，直接跳到了一个预览页面，可以看到五子棋的界面。本来以为这个预览页面是静态的，没想到还可以在这个页面上进行交互，点击棋盘上的位置，会轮流下黑白子。

![Artifacts 生成五子棋界面预览](https://slefboot-1251736664.file.myqcloud.com/20240621_claude35_artifacts_gobang_preview.png)

既然能下子，那么到底有没有实现五子棋的规则呢？于是玩了下，发现 AI 确实实现了五子棋的规则，而且还有胜负判断。

**完全超出预期了**！！！一句话，真的只要一句话，**AI 就实现了一个还算完整的五子棋游戏，有美观的界面，有规则判断，还有胜负判定，已经完全可以玩了**。

关键是 AI 还接着给出了一些继续完善游戏的建议，比如：

- 添加悔棋功能
- 实现计时器
- 添加音效
- 实现AI对手
- 优化移动设备上的体验

感觉这不是一个 AI，而是一个有血有肉，有自己想法，经验丰富的前端工程师了。

### 五子棋游戏演示

大家可以在本博客文章[下面的演示](#五子棋游戏演示)体验下 AI 写的五子棋游戏。

<div id="game-container">
    <div id="board"></div>
    <p id="status">黑方回合</p>
    <button onclick="resetGame()">重新开始</button>
</div>

## AI 实现俄罗斯方块

再来一个复杂点的游戏，俄罗斯方块。也是从一句简单的提示开始，AI 生成了一个初始的 python 版本。为了在博客里直接跑，就让它换成 web 版的。开始生成的第一个版本，嵌入到博客后，发现边框没有了，并且上下键切换形状的时候，网页会跟随滚动。于是让 Claude 解决这个问题，没想到一次就给出了完美的代码。

从下图也可以看到，重新提示后，Claude 给出可第 2 版本的文件，然后预览页面就是一个完整的俄罗斯方块游戏，可以通过键盘控制方块的移动和旋转。

![Artifacts 生成俄罗斯方块界面预览](https://slefboot-1251736664.file.myqcloud.com/20240621_claude35_artifacts_tetris.png)

这里后续又通过提示，不断修了几次，第 5 个版本，就拿到了一个很不错的功能雏形了。整个对话过程感觉 Claude3.5 的理解能力还是很不错的，和 GPT4 差别不是很大，最后实现的效果也是超出预期。

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

## Anthropic 缺陷

当然，目前的 Anthropic 只是一个 beta 版本，还有很多不足之处。



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