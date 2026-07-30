# QClaw-Beacon: Feishu Edition | 烽火台：飞书版

> 烽火台 · 无公网IP也能操控本地AI | No Public IP? No Problem — Control Your Local AI via Feishu

[![Star History](https://api.star-history.com/svg?repos=SoulTreasure/QClaw-Beacon&type=Date)](https://star-history.com/#SoulTreasure/QClaw-Beacon&Date)

---

## ⚠️ 核心痛点 | The Core Problem

**你在飞书群里问问题，回复你的不是你的那只龙虾——是飞书自己的AI。**

> 你在家里电脑上配置了 QClaw，接入了你的工作记忆、个人数据、团队上下文……
> 结果你在飞书群里发消息，飞书的AI直接抢答了。
> 你的 QClaw Agent 根本没收到这条消息。
> 用户以为在跟自己的AI对话，实际上在跟一个陌生AI鸡同鸭讲。

**烽火台解决的就是这个问题：确保你发出的每一条指令，交给你的那只龙虾来处理。**

---

## 是什么？| What Is It?

**🇨🇳 烽火台**是一个消息中继工具，将飞书群消息透明传递给本地 QClaw Agent，并将其回复传回飞书群——整个过程**无需公网IP**，飞书原生AI无法干预。

**🇺🇸 Beacon** is a message relay that transparently pipes Feishu group messages to your local QClaw Agent and pipes its replies back — **no public IP required**, and Feishu's native AI cannot interfere.

> 💡 **灵感 | Inspiration**：古代边关用烽火传递军情，狼烟一燃，千里传信。我们用飞书群消息代替狼烟，指令中继零成本。
> Ancient border watchtowers lit signal fires to relay warnings across the frontier. We use Feishu group messages as our signal fire — zero infrastructure cost.

---

## 解决了什么问题？| What Problems Does It Solve?

| 痛点 | 没有烽火台 | 有烽火台 |
|---|---|---|
| 飞书AI抢答，QClaw收不到消息 | ❌ 鸡同鸭讲 | ✅ 只有QClaw能回复 |
| 家里PC没有公网IP，无法远程操控 | ❌ 需内网穿透 | ✅ 飞书发消息即可触达 |
| 想让AI用自己的记忆/上下文回答 | ❌ 飞书AI用的是通用知识 | ✅ QClaw用自己的全部记忆 |
| 多设备控制同一AI | ❌ 各端独立、状态割裂 | ✅ 统一飞书入口 |

---

## 为什么选烽火台？| Why Beacon?

| 对比维度 | 其他方案 | 烽火台 |
|---|---|---|
| 搭建难度 | 需要配置 WebSocket / 内网穿透 / HTTPS 证书 | **普通人 5 分钟能搭起来** |
| Token 消耗 | 实时响应 → 用户发 5 条 = 龙虾回复 5 次 = 消耗 5 次 | **攒消息批量处理 → 同样 5 条 = 7 分钟后 1 次回复 = 消耗 1 次** |
| 稳定性 | WebSocket 长连接需处理断线重连，配置复杂 | **轮询 = 断线无忧，2 分钟后自动重来，无需任何重连逻辑** |
| 安装文档 | 英文为主，macOS 偏向严重 | **完整 Windows / macOS / Linux 三平台安装步骤** |
| 延迟说明 | 掩盖延迟，用户以为秒回实际也慢 | **主动告知 6～9 分钟，用户有心理预期** |
| 记忆与个性 | 飞书 AI 通用回答，没有你的记忆 | **你的龙虾用自己的全部记忆，回复更懂你** |

> 💡 **核心理念**：不是不能用高大上的技术，是用最简单的工具解决真实的问题。
> 轮询土，但土办法更稳、更省、更容易维护。

**一句话总结：烽火台 = 简单到极致 + 省钱到极致 + 稳定到极致。**

---

## 效果演示 | Demo

```
📱 你在飞书群发：「帮我查一下今天的日计划」
⏱️ 6～9分钟后，群里有回复：
    「📋 龙虾今日计划 · 2026-07-30
     【P0】…
     【P1】…」
    — QClaw

> ⏱️ **为什么会延迟 6～9 分钟？**
> 龙虾需要思考、组织语言、查询记忆文件；飞书中继脚本每 2 分钟轮询一次。
> 两个时间叠加 = 首次响应典型延迟 **6～9 分钟**，高峰时段可能更长。
> 建议：发出指令后不必盯着手机等，去忙别的，回来就有回复了。

（6～9分钟内回复你的是你自己的龙虾，而不是飞书的通用助手）
```

---

## 适用场景 | Use Cases

| 🇨🇳 场景 | 🇺🇸 Scenario | 说明 |
|---|---|---|
| 🏠 家庭/办公室 PC | Home/Office PC | 没有公网IP，飞书远程控制 |
| 📱 手机党 | Mobile-Only Users | 出门在外也能操控自己的AI |
| 🧠 个人知识库 | Personal Knowledge | AI用自己的记忆/文件回答你 |
| 🔄 多设备 | Multi-Device | 手机+平板+电脑统一入口 |
| 📊 群历史 | Chat History | 对话沉淀在飞书群，可追溯 |

---

## 适用系统 | System Compatibility

- ✅ Windows 10/11（当前测试环境）
- ✅ macOS（Intel & Apple Silicon）
- ✅ Linux（Ubuntu 20.04+ / Debian 11+）
- 需求：Node.js 18+

---

## 快速开始 | Quick Start

### 前提 | Prerequisites

- QClaw 已安装并运行 | QClaw installed and running
- 飞书账号 + 飞书开放平台自建应用 | Feishu account + self-built app on Feishu Open Platform
- Node.js 18+（运行 relay 脚本）| Node.js 18+ to run the relay script

### Step 1：创建飞书 Bot | Create a Feishu Bot

1. 打开 [飞书开放平台](https://open.feishu.cn/app) → 创建企业自建应用
2. 获取 `App ID` 和 `App Secret`
3. 开启「机器人」能力
4. 订阅事件：`im.message.receive_v1`
5. 申请权限：`im:message:receive_v1`、`im:message:send_as_bot`
6. 发布应用版本

### Step 2：配置环境变量 | Configure Environment Variables

```bash
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 3：配置定时任务（按你的系统选一种）

需要配置两个定时任务：

| 任务 | 频率 | 说明 |
|---|---|---|
| 拉取 + 发送 Pull & Send | 每 2 分钟 | 运行 `feishu_relay.js` |
| 处理指令 Process Commands | 每 7 分钟 | QClaw 读取 inbox 并回复 |

#### Windows（任务计划程序）

**任务一：每 2 分钟拉取 + 发送**
1. 打开「任务计划程序」→ 创建基本任务
2. 名称：`烽火台-拉取发送`
3. 触发器：选择「每日」→ 开始时间填当前时间 → 勾选「重复任务间隔」→ 选择「2 分钟」→ 持续时间选「无限期」
4. 操作：启动程序 → 程序填 `node` → 参数填 `feishu_relay.js`（完整路径）
5. 起始位置填脚本所在目录

**任务二：每 7 分钟处理指令**
同上，间隔改为「7 分钟」，程序填 `QClaw`（或你的 QClaw 启动命令）。

#### macOS / Linux（cron）

打开终端，依次执行：

```bash
# 编辑 crontab
crontab -e

# 按 i 进入编辑模式，粘贴以下内容：

# ---- 烽火台 · 每 2 分钟拉取飞书消息并发送回复 ----
*/2 * * * * cd /path/to/QClaw-Beacon && /usr/local/bin/node feishu_relay.js >> /tmp/beacon.log 2>&1

# ---- 烽火台 · 每 7 分钟处理指令（由 QClaw 自动执行，可跳过） ----
*/7 * * * * cd /path/to/QClaw-Beacon && /path/to/qclaw --poll-inbox >> /tmp/beacon_poll.log 2>&1

# 按 ESC，然后输入 :wq 保存退出
```

> ⚠️ 把 `/path/to/QClaw-Beacon` 换成你实际的仓库路径。
> ⚠️ 把 `/usr/local/bin/node` 换成你本机 `which node` 的结果。
> 第二行（QClaw 轮询）通常由 QClaw 内置 cron 自动处理，可跳过。

#### 验证是否运行

```bash
# Windows：打开「任务计划程序」→ 查看「运行中」
# macOS/Linux：
crontab -l        # 查看已注册的定时任务
ps aux | grep feishu_relay  # 查看脚本是否在运行
```

详见 → [QUICKSTART.md](./QUICKSTART.md)

---

## 技术原理 | How It Works

```
┌─────────────────────────────────────────────────────────┐
│  飞书群 · Feishu Group                                  │
│  用户发消息 → 飞书Bot → inbox.json（只写到inbox）       │
│  QClaw回复 ← 飞书Bot ← outbox.json ← QClaw Agent       │
└─────────────────────────────────────────────────────────┘
              ↑ feishu_relay.js（每 2 分钟 | Every 2 min）
              ↑ QClaw Agent（每 7 分钟处理 | Every 7 min）
```

**关键设计：** 所有消息只写到 inbox，由 QClaw Agent 决定是否回复——飞书原生AI完全隔离，无法干预。

**Append-only 文件**：数据只追加，不修改历史记录。两端永远往末尾加条目，**零冲突、崩溃可恢复**。

---

## 文件说明 | File Structure

| 文件 | 说明 | Description |
|---|---|---|
| `feishu_relay.js` | 核心中继脚本 | Core relay engine (Node.js) |
| `config.example.js` | 配置文件示例 | Config template |
| `BEACON_MODE.md` | 完整使用手册 | Full usage guide |
| `QUICKSTART.md` | 快速入门 | Quick start |
| `ARCHITECTURE.md` | 技术架构详解 | Technical architecture |
| `CHANGELOG.md` | 更新日志 | Changelog |

---

## 反馈与联系 | Feedback & Contact

**🇨🇳 欢迎国内外站内的朋友，多多交流、互相学习！**

- 💬 **微信**（推荐，反馈最即时）：`wxid_qakb4voa8iyn12`
- 🐛 **GitHub Issue**：Bug 报告、功能建议
- 📧 **邮件**：`3286905927@qq.com`

---

## License

MIT License · SoulTreasure · 2026
