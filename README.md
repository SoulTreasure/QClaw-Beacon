# QClaw-Beacon: Feishu Edition | 烽火台

> 烽火台 · QClaw 无公网 IP 消息中继 | QClaw Remote Control Without a Public IP

[![Star History](https://api.star-history.com/svg?repos=SoulTreasure/QClaw-Beacon&type=Date)](https://star-history.com/#SoulTreasure/QClaw-Beacon&Date)

---

## 是什么？| What Is It?

**🇨🇳 烽火台**是 QClaw 的远程控制增强插件，让你在没有公网 IP 的情况下，通过**飞书群消息**远程操控本地 QClaw Agent。

**🇺🇸 Beacon** is a remote-control enhancement for QClaw, enabling you to control your local QClaw Agent via **Feishu group messages** — without needing a public IP address.

> 💡 **灵感 | Inspiration**：古代边关用烽火传递军情，狼烟一燃，千里传信。我们用飞书群消息代替狼烟，指令中继零成本。
> Ancient border watchtowers lit signal fires to relay warnings across the frontier. We use Feishu group messages as our signal fire — zero infrastructure cost.

---

## 效果演示 | Demo

```
📱 你打开飞书
    ↓ 在群里发：「帮我查一下今天的日计划」
⏱️ 2分钟内，群里自动收到回复：
    「📋 QClaw 今日计划 · 2026-07-30
     【P0】…
     【P1】…」
```

---

## 适用场景 | Use Cases

| 🇨🇳 场景 | 🇺🇸 Scenario | 说明 |
|---|---|---|
| 🏠 家庭/办公室 PC | Home/Office PC | 没有公网 IP，无法远程直连 |
| 📱 手机党 | Mobile-Only Users | 出门在外也能操控 QClaw |
| 📊 群历史 | Chat History | 所有对话沉淀在飞书群，可追溯 |
| 🔄 多设备 | Multi-Device | 手机+平板+另一台电脑都能控制 |

---

## 快速开始 | Quick Start

### 前提 | Prerequisites

- QClaw 已安装并运行 | QClaw installed and running
- 飞书账号 + 飞书开放平台自建应用 | Feishu account + self-built app on Feishu Open Platform
- Node.js 14+（运行 relay 脚本）| Node.js 14+ to run the relay script

### Step 1：创建飞书 Bot | Create a Feishu Bot

1. 打开 [飞书开放平台](https://open.feishu.cn/app) → 创建企业自建应用 | Open Feishu Open Platform → Create an enterprise app
2. 获取 `App ID` 和 `App Secret`
3. 开启「机器人」能力 | Enable Bot capability
4. 订阅事件：`im.message.receive_v1`
5. 申请权限：`im:message:receive_v1`、`im:message:send_as_bot`
6. 发布应用版本 | Publish the app version

### Step 2：配置环境变量 | Configure Environment Variables

```bash
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 3：配置 QClaw Cron

两个定时任务：

| 任务 | 频率 | 说明 |
|---|---|---|
| 拉取 + 发送 Pull & Send | 每 2 分钟 | 运行 `feishu_relay.js` |
| 处理指令 Process Commands | 每 7 分钟 | QClaw 读取 inbox 并回复 |

详见 → [QUICKSTART.md](./QUICKSTART.md)

---

## 技术原理 | How It Works

```
┌─────────────────────────────────────────────────────────┐
│  飞书群 · Feishu Group                                  │
│  用户发消息 → Bot → inbox.json                          │
│  QClaw 回复 ← Bot ← outbox.json                        │
└─────────────────────────────────────────────────────────┘
              ↑ feishu_relay.js (每 2 分钟 | Every 2 min)
              ↑ QClaw Agent
```

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

**🇨🇳 欢迎中国 AI 圈友留言、提需求！**

- 💬 **微信**（推荐，反馈最即时）：`wxid_qakb4voa8iyn12`
- 🐛 **GitHub Issue**：Bug 报告、功能建议
- 📧 **邮件**：`3286905927@qq.com`

> 我们是中国人，本国友人优先。有任何问题、建议或合作想法，欢迎直接微信联系！🇨🇳

---

## License

MIT License · 2026
