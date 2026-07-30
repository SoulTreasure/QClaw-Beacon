# 🚀 快速上手 / Quick Start

## 环境要求

- **Node.js** ≥ 14（推荐 v18+）
- **飞书企业账号** + 飞书开放平台开发者权限

---

## 第一步：安装 Node.js

如果已安装，跳过此步。

- Windows: https://nodejs.org/ → 下载 LTS 版本，安装
- macOS: `brew install node`
- Linux: `sudo apt install nodejs npm`

验证安装：
```bash
node --version  # 应显示 v14+ 版本号
npm --version   # 应显示 npm 版本号
```

---

## 第二步：克隆本仓库

```bash
git clone https://github.com/SoulTreasure/openclaw-feishu-beacon.git
cd openclaw-feishu-beacon
```

---

## 第三步：配置飞书凭证

### 3.1 创建飞书自建应用

1. 打开 [飞书开放平台](https://open.feishu.cn/app) → 创建企业自建应用
2. 填写应用名称（如「烽火台中继」）→ 创建
3. 进入「凭证与基础信息」→ 复制 **App ID** 和 **App Secret**

### 3.2 开启机器人能力

1. 应用 → 应用功能 → 机器人 → 开启
2. 权限管理 → 添加以下权限：
   - `im:message`（获取与发送单聊、群组消息）
   - `im:message:send_as_bot`（以机器人身份发送消息）
3. 事件订阅 → 添加事件：`im.message.receive_v1`（接收消息）

### 3.3 填写配置

```bash
# 复制配置文件
cp config.example.js config.js

# 用文本编辑器打开 config.js，填入：
#   appId     → 飞书 App ID（以 cli_ 开头）
#   appSecret → 飞书 App Secret
```

---

## 第四步：获取目标群的 chatId

1. 在飞书中搜索并进入目标群
2. 在群设置中找「群信息」→「群 ID」
3. 或者：在飞书开放平台的「消息事件」里查看 chat_id

将 chatId 填入 `config.js`：

```javascript
targetChats: {
  'oc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx': {
    name: '水镜大学堂',
    priority: 'high',  // high = 必回；normal = 仅 @我/提问 才强制补回
  },
},
```

---

## 第五步：运行中继

### 首次测试（Dry Run 模式）

```bash
node feishu_relay.js --dry-run
```

输出类似：
```
[relay] dryRun=true 目标会话=1
[PULL] ✅ 新消息[水镜大学堂] 你好
```

> Dry Run 模式不实际发送消息，不落盘文件，**安全可重跑**。

### 正式运行

```bash
node feishu_relay.js
```

---

## 配置定时任务（可选）

Linux / macOS（每 5 分钟运行一次）：
```bash
crontab -e
# 添加：
*/5 * * * * /usr/bin/node /path/to/feishu_beacon/feishu_relay.js >> /tmp/beacon.log 2>&1
```

Windows 任务计划程序：
1. 打开「任务计划程序」→ 创建基本任务
2. 触发器：按设定时间（如每 5 分钟）
3. 操作：启动程序 → 程序：`node`；参数：`feishu_relay.js`；起始位置：`项目目录`

---

## 验证运行

```bash
# 查看 inbox（收到的新消息）
cat feishu_inbox.json | python -m json.tool | head -30

# 查看 outbox（待发送的回复）
cat feishu_outbox.json | python -m json.tool | head -20

# 查看已处理消息 ID（去重记录）
cat processed.json
```

---

## 常见问题排查

| 现象 | 原因 | 解决 |
|---|---|---|
| `获取 tenant_access_token 失败` | App ID/Secret 填写错误 | 检查 config.js 中 appId / appSecret |
| `拉取消息失败` | 飞书应用未开启机器人 | 确认应用 → 应用功能 → 机器人已开启 |
| `权限不足` | 未在飞书开放平台添加权限 | 权限管理 → 添加 im:message 等权限 |
| `发送失败` | targetChats 的 chatId 错误 | 确认 chatId 与目标群一致 |
| `消息重复` | 多实例同时运行 | 确认只有一个中继进程在运行 |

---

## 下一步

- 阅读 [ARCHITECTURE.md](ARCHITECTURE.md) 了解完整架构原理
- 阅读 [CHANGELOG.md](CHANGELOG.md) 了解版本历史
- 提交 Issue 报告问题或提出功能建议
