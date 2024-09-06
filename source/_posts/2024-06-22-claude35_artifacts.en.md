---
title: Creating Games Using Free Claude3.5 with Artifacts
tags:
  - LLM
category: Artificial Intelligence
toc: true
date: 2024-06-22 13:47:28
description: This article explores Anthropic's newly released Claude 3.5 model and its Artifacts feature, showcasing its exceptional code generation and problem-solving capabilities through the rapid implementation of Gomoku and Tetris games. It also discusses some limitations of the current version, such as restrictions on workspace functionality, and looks ahead to the future direction of AI-assisted programming.
lang: en
---

Anthropic has **quietly** released the [Claude 3.5 model](https://www.anthropic.com/news/claude-3-5-sonnet), which not only improves model performance but also supports Artifacts. After initial experience, I feel this is what the future of AI should look like, even more impressive than the previous GPT4-o.

![Coding in the Artifacts workspace](https://slefboot-1251736664.file.myqcloud.com/20240621_claude35_artifacts_artifacts.png)

Before Artifacts, if you wanted to use ChatGPT or other LLMs to help implement program functionality, you needed to first provide the functional requirements, then copy the AI's code into your own environment to run. If it didn't meet expectations, you had to ask again, modify the code, and run it again. This process needed to be repeated until satisfaction or giving up (some complex code is still not well written by AI currently).

<!--more-->

Now with Artifacts, after providing specific functional requirements, Claude creates a **workspace**, where AI can view and edit code in real-time during the subsequent dialogue process. This way, Claude has transformed from an ordinary conversational generation AI into a **collaborative work environment**. Perhaps in the near future, we can incorporate Claude into our own projects, allowing it to participate in development like a regular team member.

The vision is certainly beautiful, but Artifacts is still a beta feature at present. How does it perform? Let's try and see.

## AI Implementation of Gomoku Game

First, I tried to let Claude implement a web version of the Gomoku game. My prompt was also very simple:

> I want to write a web Gomoku game, please provide the complete implementation code

Then, I saw the Artifacts workspace, which already had a code file and was automatically generating code.

![Artifacts generating Gomoku code file](https://slefboot-1251736664.file.myqcloud.com/20240621_claude35_artifacts_gobang_code.png)

After the code was generated, it directly jumped to a preview page where I could see the Gomoku interface. I originally thought this preview page was static, but surprisingly, I could interact on this page. Clicking on positions on the board would alternately place black and white pieces.

![Artifacts generated Gomoku interface preview](https://slefboot-1251736664.file.myqcloud.com/20240621_claude35_artifacts_gobang_preview.png)

Since it could place pieces, I wondered if it had implemented the rules of Gomoku. So I played a bit and found that AI had indeed implemented the rules of Gomoku, and even had win/loss judgment.

This **completely exceeded expectations**!!! With just one sentence, really just one sentence, **AI implemented a fairly complete Gomoku game, with a beautiful interface, rule judgment, and win/loss determination. It's already completely playable**.

The key is that AI also gave some suggestions for further improving the game, such as:

- Adding an undo function
- Implementing a timer
- Adding sound effects
- Implementing an AI opponent
- Optimizing the experience on mobile devices

It feels like this is not an AI, but a flesh-and-blood, opinionated, experienced front-end engineer.

### Gomoku Game Demo

You can experience the AI-written Gomoku game at the [demo address](#Gomoku-Game-Demo) in the blog post.

<div id="game-container">
    <div id="board"></div>
    <p id="status">Black's turn</p>
    <button onclick="resetGame()">Restart</button>
</div>

After showing the Gomoku effect generated by Claude3.5 to a friend, they were a bit skeptical about where AI got the code from. After all, Gomoku implementations are everywhere on the internet, and AI might have learned someone else's code and used it. This makes sense, so we can only upgrade the difficulty to see how Claude3.5 performs.

## AI Implementation of Tetris

Next, let's try a more complex game, Tetris. Also starting with a simple prompt, AI generated an initial Python version. To run it directly in the blog, I asked it to change to a web version. The first version generated, when embedded in the blog, found that the border was gone, and when using the up and down keys to switch shapes, the webpage would scroll along. So I asked Claude to solve this problem, and unexpectedly, it gave perfect code in one go.

As you can see from the image below, after re-prompting, Claude provided a second version of the file, and then the preview page was a complete Tetris game, controllable by keyboard to move and rotate blocks.

![Artifacts generated Tetris interface preview](https://slefboot-1251736664.file.myqcloud.com/20240621_claude35_artifacts_tetris.png)

Here, through **continuous dialogue prompts**, some functions were modified, and by the 5th version, we got a very good functional prototype. Throughout the conversation process, Claude3.5's **understanding ability was quite good**, not very different from GPT4, and the final implementation effect also exceeded expectations.

### Tetris Demo

I've directly embedded the AI-generated code into the blog, and you can experience the Tetris game in the [demo below](###Tetris-Demo).

<div id="tetrisContainer">
    <canvas id="tetrisCanvas" width="300" height="600"></canvas>
    <button id="startButton">Start Game</button>
    <div id="gameOverMessage">
        Game Over!<br>
        Your score is: <span id="finalScore"></span><br>
        <button id="restartButton">Restart</button>
    </div>
</div>

Judging from the continuous modification process of Tetris here, AI's understanding ability and coding skills are quite strong, probably on par with GPT4.

## Everyone Using AI to Write Programs

From the simple games written above, Anthropic's performance is quite impressive. In fact, I also tried to use it to do some algorithm Web visualizations, and Claude3.5 provided very good examples. For instance, I asked it to implement a token bucket rate limiting algorithm, where you can set the token bucket capacity and rate, as well as the token consumption speed, and then have it draw a request monitoring curve.

After setting the parameters each time, it would dynamically generate a monitoring curve. Then you could pause at any time, reset the parameters, and continue to generate new monitoring curves. After setting a few parameters and running, I got the following result:

![Artifacts generated token bucket rate limiting algorithm interface preview](https://slefboot-1251736664.file.myqcloud.com/20240622_claude35_artifacts_token_bucket.png)

For people without front-end development experience, being able to quickly implement a visualized algorithm demonstration is truly magical. With Anthropic's help, everyone can break out of their circle, **no longer limited by their own technical experience, and quickly implement some of their ideas**.

Especially for people who want to learn programming, in the past, you basically had to first study books, learn skills, and then gradually apply them to projects. Now you can have a conversation with AI with questions, let AI help implement, and if you have any problems in between, you can communicate with AI at any time. **This learning process is more interesting**. After all, if you ask me to first learn a bunch of front-end syntax and then stumble to implement a Tetris game, I would give up very quickly. But if I can generate a complete, runnable game with just one sentence, and then discuss the implementation process and code details with AI, it would be much more interesting and give a greater sense of achievement.

## Anthropic's Shortcomings

Of course, the current Anthropic is only a beta version and still has many shortcomings. The article title mentions using free Claude3.5, but there are quite a few limitations in the free version. First, there's a [limit on conversation length](https://support.anthropic.com/en/articles/7996848-how-large-is-claude-s-context-window). If the content is a bit long, adding attachments will prompt:

> Your message will exceed the length limit for this chat. Try attaching fewer or smaller files or starting a new conversation. Or consider upgrading to Claude Pro.

Even without attachments, too many conversation turns will prompt:

> Your message will exceed the length limit for this chat. Try shortening your message or starting a new conversation. Or consider upgrading to Claude Pro.

Moreover, the free version **has a limit on the number of messages that can be sent per hour**, which is easily triggered. However, these are all minor issues that can be solved by upgrading to Pro. In my opinion, Anthropic's **biggest flaw currently is that the workspace functionality is too limited**, still quite far from being truly practical.

Currently (as of 2024.06.22), the code in the workspace can only be generated by AI, **it cannot be edited by yourself**, nor can you upload your own code. If you want to make some simple modifications based on AI code, it's very difficult. Additionally, in each conversation, the content generated in the workspace is all put together, **you can't generate multiple files like in a file system**.

For example, if I want to use Python to implement a web backend service, using the FastAPI framework, implementing APIs with authentication functionality, and requiring convenient Docker deployment. Claude3.5 **only generated one file** in the workspace, and put main.py, Dockerfile, requirements.txt, and other content in it. If I want to use it, I still need to create folders locally, copy the contents into different files separately, and then initialize the environment to run.

If Anthropic's workspace **could create folders and then put the entire project's code in it**, and provide a function to download the entire project, it would be much more convenient. Going even further, Anthropic could provide a Python runtime environment, **allowing users to run and debug code directly in the workspace**. In this way, Anthropic could become a true collaborative work environment, not just a code generation tool.

Ideally, the future Anthropic should be able to generate and manage multiple folders or files in the workspace, allow us to manually modify parts of the code, and debug code in the workspace. Then Anthropic can discover problems during debugging and fix them. In other words, **AI can understand the entire project code and participate in every process of development together with humans**.

Perhaps such an Anthropic will be born soon.

<!-- Tetris -->
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
            document.getElementById('status').textContent = `${currentPlayer === 'black' ? 'Black' : 'White'} Wins！`;
            disableBoard();
        } else {
            currentPlayer = currentPlayer === 'black' ? 'white' : 'black';
            document.getElementById('status').textContent = `${currentPlayer === 'black' ? 'Black' : 'White'}'s Turn`;
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
        document.getElementById('status').textContent = 'Black\'s turn';
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