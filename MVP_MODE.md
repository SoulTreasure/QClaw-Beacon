# QClaw-Beacon: Feishu Edition（烽火台 MVP 模式）

> 无公网 IP 也能远程控制 QClaw —— 利用飞书群消息作为中继指令通道

## 核心原理

```
远程用户（手机飞书）
    ↓ 发送指令消息到飞书群
飞书群 → QClaw 飞书 Bot → relay/feishu_inbox.json
    ↓
feishu_relay.js（每2分钟 cron）读取 inbox
    ↓
QClaw Agent 处理指令 → 写入 relay/feishu_outbox.json
    ↓
feishu_relay.js（每2分钟 cron）发送回复到飞书群
    ↓
远程用户在飞书群收到回复
```

**一句话**：用飞书群消息代替公网 IP，把「指令 → 处理 → 回复」变成异步中继模式。

## 适用场景

- 家庭/办公室 PC 无公网 IP，无法远程直连
- 需要手机端随时操控 QClaw（查文件、改配置、发指令）
- 想在飞书群沉淀 AI 助手的回答历史
- 多设备党：手机+平板+另一台电脑都能控制同一台 QClaw

## 前提条件

1. 一台能运行 QClaw 的 Windows/macOS 电脑（需保持开机）
2. 飞书账号 + 创建一个专用飞书群（用作指令通道）
3. 飞书自建应用 App ID + App Secret（[飞书开放平台](https://open.feishu.cn/)创建）
4. QClaw 已安装并运行

## 快速安装

### Step 1：配置飞书 Bot

1. 打开 [飞书开放平台](https://open.feishu.cn/app) → 创建企业自建应用
2. 在「凭证与基础信息」获取 `App ID` 和 `App Secret`
3. 开启「机器人」能力
4. 在「事件订阅」中添加事件：
   - `im.message.receive_v1`（接收消息）
5. 申请权限：
   - `im:message:receive_v1`
   - `im:message:send_as_bot`
   - `im:chat.member:bot_get_version_list`
6. 发布应用版本

### Step 2：配置 QClaw 环境变量

在系统环境变量中添加（Windows 用「系统属性 → 环境变量」，macOS 用 `~/.bash_profile` 或 `~/.zshrc`）：

```bash
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**获取方式**：飞书开放平台 → 你的应用 → 凭证与基础信息

### Step 3：安装 feishu_relay.js

把 `feishu_relay.js` 放到任意目录，例如：
```
C:\Users\你的用户名\.qclaw\workspace\bot-router\feishu_relay.js
```

### Step 4：创建 relay 目录

```bash
mkdir relay
cd relay
echo "[]" > feishu_inbox.json
echo "[]" > feishu_outbox.json
```

### Step 5：配置飞书群 ID

在 `feishu_relay.js` 顶部修改群 ID：
```javascript
const CONFIG = {
  // 监听和发送的目标群（改成你自己的群 ID）
  targetGroups: [
    'oc_your_group_id_here'
  ],
  // ... 其他配置
};
```

**如何获取群 ID**：把飞书机器人拉进群后，在群设置里看「群信息」→「群 ID」

### Step 6：配置 QClaw Cron

在 QClaw 中创建两个定时任务（用 cron 工具）：

**Cron 1：拉取飞书消息（每2分钟）**
```javascript
// 在 QClaw cron 添加：
name: "飞书烽火台·拉取与发送"
schedule: { kind: "every", everyMs: 120000 }
payload: {
  kind: "agentTurn",
  message: "请运行命令：node C:\\Users\\你的用户名\\.qclaw\\workspace\\bot-router\\feishu_relay.js 。该脚本会：1) 拉取飞书群新消息并写入 relay/feishu_inbox.json；2) 把 relay/feishu_outbox.json 中 status 为 done 的回复发回对应飞书群。运行完成后用一句话报告本次拉取条数与发送条数。"
}
delivery: { mode: "none" }
```

**Cron 2：处理指令并回复（每7分钟）**
```javascript
// 在 QClaw cron 添加：
name: "飞书烽火台·指令处理"
schedule: { kind: "every", everyMs: 420000 }
payload: {
  kind: "agentTurn",
  message: "请读取 relay/feishu_inbox.json，找出所有 status 为 'pending' 的指令。以'心心'的身份（中文、活泼可爱）理解并回应，必要时可读取 workspace 文件。把你的回复写入 relay/feishu_outbox.json（追加一个对象：{id, group, chatId, reply, status:'done'}），同时把 inbox 中该条目的 status 改为 'done'。如果没有 pending 指令，只用一句话说明即可。"
}
delivery: { mode: "none" }
```

## 使用方法

### 从手机/远程端发送指令

在飞书群里直接发消息，格式随意，例如：

```
帮我查一下今天的日计划
```

### 心心收到后的回复

心心会在几分钟内（≤7分钟）在同一个飞书群里回复你：

```
📋 心心今日计划 · 2026-07-29
🌙 夜间未读摘要
暂无新消息，一切安静~
🎯 今日执行计划
【P0 必须完成】
1. 回复小飞侠延保问题
2. GitHub 发布准备
...
🌸 心心 · QClaw
```

### 发送文件/图片

在飞书群里发文件，心心会自动下载到 `relay/inbox_attachments/` 目录。

## 架构说明

```
┌─────────────────────────────────────────────┐
│                  飞书群                      │
│  [用户消息] → Bot接收 → relay/feishu_inbox  │
│  [心心回复] ← Bot发送 ← relay/feishu_outbox │
└─────────────────────────────────────────────┘
                    ↑
        feishu_relay.js（每2分钟）
                    ↑
              QClaw Cron
                    ↑
              心心 Agent（每7分钟处理 inbox）
```

## 故障排除

**Q：飞书收不到消息？**
A：检查飞书 Bot 是否已加入目标群；检查飞书开放平台事件订阅是否正确配置；检查 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 环境变量是否正确。

**Q：心心不回复？**
A：检查 `relay/feishu_inbox.json` 是否有新的 pending 消息；检查 QClaw 两个 cron 是否在运行（用 `openclaw cron list` 查看）；检查 cron 最近一次运行状态是否为 `ok`。

**Q：消息重复发送？**
A：`feishu_relay.js` 有幂等保护（基于消息 ID 去重），同一消息不会重复处理。如果持续重复，检查 cron 是否配置了多个实例。

**Q：消息延迟很久才到？**
A：默认 2 分钟拉取间隔，如需更快可改为 1 分钟（`everyMs: 60000`），但注意飞书 API 有频率限制。

## 进阶配置

### 多群支持

修改 `feishu_relay.js` 顶部的 `targetGroups` 数组：
```javascript
targetGroups: [
  'oc_group_id_1',
  'oc_group_id_2',
  'oc_group_id_3'
]
```

### 过滤只看 @ 机器人的消息

在 `feishu_relay.js` 中设置：
```javascript
const CONFIG = {
  // ... 其他配置
  onlyMentioned: true  // 只处理 @ 机器人的消息
};
```

### 自定义 Agent 身份

修改第二个 cron 的 `message` payload，把"心心"换成你喜欢的名字和风格：
```javascript
message: "请读取 relay/feishu_inbox.json...以'[你的名字]'的身份..."
```

## 开源许可

MIT License —— 随便用，改成自己的名字也行 😄
