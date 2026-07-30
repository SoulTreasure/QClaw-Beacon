/**
 * config.example.js — 飞书烽火台配置文件
 * 
 * 使用方法：
 *   1. 复制本文件为 config.js
 *   2. 填入飞书 App ID / Secret / Bot Token（见下方说明）
 *   3. 填入目标飞书群的 chatId
 *
 * ⚠ 重要：config.js 已加入 .gitignore，不会被提交到 GitHub
 */

module.exports = {

  // ── 飞书凭证 ────────────────────────────────────────────────
  // 获取方式：
  // 1. 打开 https://open.feishu.cn/app → 你的应用
  // 2. 凭证与基础信息 → 复制 App ID 和 App Secret

  appId:     'cli_xxxxxxxxxxxxxxxx',   // 替换为你的飞书 App ID（以 cli_ 开头）
  appSecret: 'xxxxxxxxxxxxxxxxxxxxxxxx', // 替换为你的飞书 App Secret

  // ── 目标会话配置 ─────────────────────────────────────────────
  // chatId 获取方式：
  //   飞书开放平台 → 应用功能 → 机器人 → 开启机器人
  //   在飞书中 @ 机器人，然后在事件订阅里查看 chat_id
  // priority: high = 私聊/核心群，必回；normal = 普通群，仅 @我/提问 强制补回

  targetChats: {
    // 示例：取消注释并填入你的 chatId
    // 'oc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx': { name: '水镜大学堂', priority: 'high' },
    // 'oc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx': { name: '脑洞大开.Dept', priority: 'normal' },
  },

  // ── 文件路径（可选，不填则用默认值）────────────────────────────
  // inboxPath:   __dirname + '/feishu_inbox.json',
  // outboxPath:  __dirname + '/feishu_outbox.json',
  // processedPath: __dirname + '/processed.json',

};
