# CHANGELOG

## v0.1.0 — MVP 发布 · 2026-07-29

### 🆕 首次发布

**核心能力：**
- 飞书群消息拉取 → inbox（Append-only JSON，7天滚动）
- QClaw/Agent 回复 → outbox → 飞书发送（单向数据流）
- 无公网 IP 需求，彻底替代 Webhook

**支持场景：**
- 监听目标群（脑洞大开.Dept / 水镜大学堂 / P2P私聊）
- Cron 驱动，每 2 分钟自动轮询
- 支持多飞书 Bot 实例（中转层可扩展）

**v0.1.0 相较测试版的修复（relay v8）：**

| # | 严重度 | 问题 | 修复 |
|---|---|---|---|
| 1 | 🔴 致命 | HTTP 响应解析只取最后一行，gzip 压缩响应直接返回 `{}` | 完整 gzip 解压 + NDJSON 首行优先解析 |
| 2 | 🔴 致命 | `normalizeTime` 时间戳逻辑反，毫秒偏差 1000× | 阈值为 `1e12`；>1e12=毫秒直接用，≤1e12=秒×1000 |
| 3 | 🔴 致命 | merge/send 幂等冲突，同一回复可能重复发送 | `sentIds` 持久化去重 + extraOutboxPaths 消费制清空 |
| 4 | 🟡 高 | LEAK 阶段 `outboxIds` 在函数入口只计算一次，漏回防护配对失败 | 每次迭代前重新计算 |
| 5 | 🟡 高 | `processed` Set 无上限，327→无限膨胀 | 超过 2000 条自动裁剪到最近 |
| 6 | 🟡 中 | dry-run 没保护所有写操作 | 所有 `writeJSON` 接收 dryRun 参数 |
| 7 | 🟡 中 | Schema 垃圾检测硬编码具体对话内容，换用户即失效 | 改为结构检测（数组类型 + 额外字段数），不依赖内容 |
| 8 | 🟢 低 | 无 `--dry-run` 参数 | 支持 `node feishu_relay.js --dry-run` 预演模式 |

### 架构特性

- **最小依赖**：仅 Node.js 标准库（fs/path/http/https/zlib）
- **幂等设计**：processed + sentIds 双重持久化防重
- **原子落盘**：.tmp + rename 防止半截文件
- **自愈机制**：inbox 腐化率 > 40% 时硬重置
- **Token 容错**：过期自动刷新 + 重试

### 目录结构

```
feishu_relay.js       # 核心中继脚本（单一入口）
config.example.js      # 配置文件模板
relay/                 # 状态文件目录（需写入权限）
  feishu_inbox.json    # 飞书拉取的消息
  feishu_outbox.json   # 待发送的回复
  feishu_sentIds.json  # 已发送 ID（幂等）
```

### 快速开始

```bash
# 1. 复制配置
cp config.example.js config.js
# 编辑 config.js，填入 FEISHU_APP_ID / FEISHU_APP_SECRET / targetChats

# 2. 预演模式（不发送消息）
node feishu_relay.js --dry-run

# 3. 正式运行
node feishu_relay.js

# 4. 配置 cron（每 2 分钟）
# Windows 任务计划程序 / Linux cron：
#   */2 * * * * node /path/to/feishu_relay.js
```

### 技术限制

- **不支持消息类型**：仅支持 text 消息；图片/文件/卡片等非文本消息会显示为 `[类型]`
- **Token 有效期**：飞书 tenant_access_token 有效期 2 小时，relay 每次运行自动刷新
- **并发限制**：飞书 API 限流约 100次/分钟，本脚本远低于该阈值
