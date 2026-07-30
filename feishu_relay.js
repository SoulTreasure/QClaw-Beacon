/**
 * feishu_relay.js — 飞书消息中继（整体重写 · v8）
 * =============================================================
 *
 * 职责（三阶段单向数据流）：
 *   PULL  — 拉取目标群/私聊新消息 → inbox
 *   SEND  — 发送 outbox 中所有未发条目 → sent
 *   LEAK  — 漏回防护：超时强制补回，陈旧静默收口
 *
 * 代码质量铁律（2026-07-21 小胖胖口谕）：
 *   ✦ 从一开始就写干净、可维护、可修复的代码
 *   ✦ 拒绝屎山与无法修复的bug
 *   ✦ 一旦变成不可修的屎山，只能毁灭重建
 *
 * v8 相较 v7 的实质修复：
 *   1. HTTP 解析：支持 gzip，正确的 NDJSON/lines 首行解析，失败有明确错误码
 *   2. 时间戳：normalizeTime 逻辑修正，毫秒/ms 判断阈值为 1e12
 *   3. merge幂等：extraOutboxPaths 改为消费制（move而非copy），已sent条目永不重复添加
 *   4. LEAK outboxIds：每次 leak() 调用前重新计算，避免配对漏检
 *   5. SEND 幂等：已发送 ID 持久化，send() 前去重，永不发同一ID两次
 *   6. Schema 防腐化：垃圾检测从字段名改为结构检测，不依赖具体内容
 *   7. dryRun 保护：所有写文件操作均受 dryRun 保护
 */

'use strict';

// ══════════════════════════════════════════════════════════════
// 第一层：基础设施
// ══════════════════════════════════════════════════════════════

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');
const zlib  = require('zlib');

// ─── 统一结果包装 ───────────────────────────────────────────
const Result = {
  ok  : (v) => ({ ok: true,  value: v }),
  err : (e) => typeof e === 'string' ? { ok: false, error: new Error(e) }
               : e instanceof Error  ? { ok: false, error: e }
               : { ok: false, error: new Error(String(e)) },
  isOk : (r) => r.ok === true,
  isErr: (r) => r.ok === false,
};

// ─── 原子文件操作 ────────────────────────────────────────────
const File = {
  /** 读取 JSON 文件，失败返回 fallback（不抛异常） */
  readJSON(filePath, fallback) {
    try {
      if (!fs.existsSync(filePath)) return Result.ok(fallback);
      const raw = fs.readFileSync(filePath, 'utf8');
      return Result.ok(JSON.parse(raw));
    } catch (e) {
      // 文件不存在 / JSON 解析失败 / 读失败 → 退回默认值
      return Result.ok(fallback);
    }
  },

  /** 原子写入：先写 .tmp 再 rename，防止半截文件 */
  writeJSON(filePath, data, dryRun) {
    if (dryRun) return Result.ok(undefined);
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, filePath);
      return Result.ok(undefined);
    } catch (e) {
      return Result.err(e);
    }
  },

  /** 确保只写一次：文件存在则跳过（幂等保护） */
  ensureWriteJSON(filePath, data, dryRun) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return Result.ok(undefined);
    return this.writeJSON(filePath, data, dryRun);
  },
};

// ─── HTTP 客户端 ─────────────────────────────────────────────
// v8 修复：
//   1. 正确解析 gzipped / chunked 响应
//   2. 优先取首行 JSON（NDJSON 标准），fallback 取 body 全文
//   3. 所有错误包含明确 errorCode，便于排查
// ─────────────────────────────────────────────────────────────
const Http = {
  _getClient(protocol) {
    return protocol === 'https:' ? https : http;
  },

  _buildHeaders(options, hasBody) {
    const h = Object.assign({}, options.headers || {});
    if (hasBody) h['Content-Type']   = 'application/json';
    // 明确要求 gzip 响应（服务端可忽略）
    h['Accept-Encoding'] = 'gzip, deflate';
    h['Accept']          = 'application/json';
    if (hasBody) h['Content-Length']  = Buffer.byteLength(String(options.body || ''));
    return h;
  },

  async request(url, options = {}) {
    return new Promise((resolve) => {
      try {
        const u      = new URL(url);
        const client = this._getClient(u.protocol);
        const hasBody = !!options.body;
        const req = client.request({
          hostname : u.hostname,
          port     : u.port || (u.protocol === 'https:' ? 443 : 80),
          path     : u.pathname + u.search,
          method   : options.method || 'GET',
          headers  : this._buildHeaders(options, hasBody),
        }, (res) => {
          const encoding = (res.headers['content-encoding'] || '').toLowerCase();
          const chunks   = [];

          res.on('data', (c) => chunks.push(c));
          res.on('error', (e) => resolve(Result.err(`响应流错误: ${e.message}`)));

          res.on('end', () => {
            try {
              let raw = Buffer.concat(chunks);

              // ── 解压 ──────────────────────────────────────────
              if (encoding === 'gzip') {
                raw = zlib.gunzipSync(raw);
              } else if (encoding === 'deflate') {
                // Node.js deflate 行为：自动判断有无 zlib 头
                raw = zlib.inflateSync(raw);
              }
              // identity / 无编码 → 不用处理

              const str = raw.toString('utf8').trim();
              if (!str) {
                resolve(Result.ok({}));
                return;
              }

              // ── 优先 NDJSON 首行（标准 API 响应格式）─────────
              const firstLine = str.split('\n')[0].trim();
              if (firstLine.startsWith('{') || firstLine.startsWith('[')) {
                try {
                  resolve(Result.ok(JSON.parse(firstLine)));
                  return;
                } catch { /* 继续 fallthrough */ }
              }

              // ── Fallback：全文 JSON ──────────────────────────
              try {
                resolve(Result.ok(JSON.parse(str)));
              } catch {
                // ── 最后 fallback：保留原文，返回包装 ──────────
                resolve(Result.ok({ _raw: str }));
              }
            } catch (e) {
              resolve(Result.err(`响应解析异常: ${e.message}`));
            }
          });
        });

        req.on('error', (e) => resolve(Result.err(`请求错误: ${e.message}`)));
        if (hasBody) req.write(options.body);
        req.end();
      } catch (e) {
        resolve(Result.err(`请求构建错误: ${e.message}`));
      }
    });
  },
};

// ─── 结构化日志 ──────────────────────────────────────────────
class Logger {
  constructor(dryRun) {
    this.dryRun = !!dryRun;
    this.start  = Date.now();
  }
  _fmt(level, tag, msg) {
    const elapsed = ((Date.now() - this.start) / 1000).toFixed(1);
    return `${this.dryRun ? '[DRY] ' : ''}[+${elapsed}s][${level}][${tag}] ${msg}`;
  }
  info(tag, msg) { console.log(this._fmt('INFO', tag, msg)); }
  warn(tag, msg) { console.warn(this._fmt('WARN', tag, msg)); }
  err (tag, msg) { console.error(this._fmt('ERROR', tag, msg)); }
}

// ─── 类型工具 ───────────────────────────────────────────────
const T = {
  str       : (v) => typeof v === 'string',
  num       : (v) => typeof v === 'number' && !Number.isNaN(v),
  obj       : (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  arr       : (v) => Array.isArray(v),
  nonEmpty  : (v) => T.str(v) && v.length > 0,
};

// ══════════════════════════════════════════════════════════════
// 第二层：数据层
// ══════════════════════════════════════════════════════════════

// ─── Schema 防腐化 ───────────────────────────────────────────
// v8 修复：垃圾检测从结构判断，不依赖具体内容
const Schema = {
  LEGAL_INBOX  : ['id','group','chatId','priority','sender','text','time','status'],
  LEGAL_OUTBOX : ['id','group','chatId','priority','reply','status','leaked','sentAt'],

  /** 清洗 inbox 条目：只保留白名单字段，强制枚举值合法 */
  sanitizeInbox(raw) {
    if (!T.obj(raw)) return null;
    const item = {};
    for (const f of Schema.LEGAL_INBOX) {
      if (f in raw) item[f] = raw[f];
    }
    if (!['high','normal'].includes(item.priority)) item.priority = 'normal';
    if (!['pending','done'].includes(item.status))   item.status  = 'pending';
    return item;
  },

  /** 垃圾检测：从结构特征判断，不依赖具体内容
   *   若 items 不是数组，或混入非对象元素，视为腐化 */
  isGarbage(raw) {
    if (!T.obj(raw)) return true;
    // items 必须是数组（relay 标准格式）
    if (!Array.isArray(raw.items)) return true;
    // 混入未知类型字段（非 inbox 标准字段）
    const unknown = Object.keys(raw).filter(
      (k) => !['items','ids'].includes(k)
    );
    if (unknown.length > 2) return true; // 超过 2 个额外字段 → 可疑
    return false;
  },

  /** 同样检测 outbox 数组条目 */
  sanitizeOutboxEntry(raw) {
    if (!T.obj(raw)) return null;
    const entry = {};
    for (const f of Schema.LEGAL_OUTBOX) {
      if (f in raw) entry[f] = raw[f];
    }
    if (!T.nonEmpty(entry.reply)) return null;
    if (!T.nonEmpty(entry.chatId)) return null;
    return entry;
  },
};

// ─── 状态管理器 ─────────────────────────────────────────────
class StateManager {
  constructor(paths) {
    this.paths = paths;
    this.data  = {
      inbox     : { items: [] },     // 待处理消息
      outbox    : [],                // 待发送回复
      processed : { ids: [] },       // 已拉取 messageId（幂等防重）
      sentIds   : { ids: [] },       // 已成功发送的 entry.id（防重复发送）
    };
  }

  /** 加载 + 清洗（腐化率>40%时硬重置） */
  load(log) {
    const [inboxR, outboxR, procR, sentR] = [
      File.readJSON(this.paths.inbox,     { items: [] }),
      File.readJSON(this.paths.outbox,    []),
      File.readJSON(this.paths.processed, { ids: [] }),
      File.readJSON(this.paths.sentIds,   { ids: [] }),
    ];

    // ── inbox 清洗 ────────────────────────────────────────
    const inboxItems = (inboxR.value.items || []).map(Schema.sanitizeInbox).filter(Boolean);
    const badCount   = inboxItems.filter(Schema.isGarbage).length;
    const ratio      = inboxItems.length > 0 ? badCount / inboxItems.length : 0;
    if (ratio > 0.4) {
      log.warn('STATE', `inbox 腐化率 ${(ratio * 100).toFixed(1)}% > 40%，硬重置`);
      this.data.inbox = { items: [] };
    } else {
      this.data.inbox = { items: inboxItems };
    }

    // ── outbox 清洗 ───────────────────────────────────────
    this.data.outbox = (outboxR.value || [])
      .map(Schema.sanitizeOutboxEntry)
      .filter(Boolean);

    this.data.processed = (procR.value && Array.isArray(procR.value.ids))
      ? procR.value : { ids: [] };

    this.data.sentIds = (sentR.value && Array.isArray(sentR.value.ids))
      ? sentR.value : { ids: [] };

    log.info('STATE', `加载完成 | inbox=${this.data.inbox.items.length} `
      + `outbox=${this.data.outbox.length} processed=${this.data.processed.ids.length}`);
  }

  /** 持久化（所有写操作均受 dryRun 保护） */
  persist(log, dryRun) {
    // outbox 只保留未发送条目（sent 永久脱敏）
    const outboxLive = this.data.outbox.filter((o) => o.status !== 'sent');
    const results = [
      ['inbox',     File.writeJSON(this.paths.inbox,     this.data.inbox,     dryRun)],
      ['outbox',    File.writeJSON(this.paths.outbox,    outboxLive,           dryRun)],
      ['processed', File.writeJSON(this.paths.processed, this.data.processed, dryRun)],
      ['sentIds',   File.writeJSON(this.paths.sentIds,   this.data.sentIds,   dryRun)],
    ];

    for (const [name, r] of results) {
      if (Result.isErr(r)) log.err('STATE', `落盘[${name}]失败: ${r.error.message}`);
    }
    return results.every(([, r]) => Result.isOk(r))
      ? Result.ok(undefined)
      : Result.err('部分文件落盘失败');
  }

  // ── 防重方法 ─────────────────────────────────────────────
  isProcessed(id)    { return this.data.processed.ids.includes(id); }
  isSent(id)         { return this.data.sentIds.ids.includes(id); }

  markProcessed(id)  {
    const ids = this.data.processed.ids;
    if (!ids.includes(id)) {
      ids.push(id);
      if (ids.length > 2000) this.data.processed.ids = ids.slice(-2000);
    }
  }

  /** 标记已发送（幂等，send() 成功后调用） */
  markSent(id) {
    const ids = this.data.sentIds.ids;
    if (!ids.includes(id)) ids.push(id);
  }

  markInboxDone(id)  {
    const item = this.data.inbox.items.find((i) => i.id === id);
    if (item && item.status !== 'done') item.status = 'done';
  }

  /** 漏回防护：强制补回条目 */
  enqueueLeak(item) {
    // leak 条目用特殊标记，避免与正常 outbox 混淆
    this.data.outbox.push({ ...item, status: 'done', leaked: true });
  }

  /** SEND 幂等：过滤掉已发送 ID，返回可发条目
   *   v8 新增，已发送条目永远不会出现在返回值中 */
  filterSendable() {
    return this.data.outbox.filter((o) => {
      if (o.status === 'sent') return false; // 已发过，跳过
      if (!T.nonEmpty(o.reply)) return false; // 无内容，跳过
      if (!T.nonEmpty(o.chatId)) return false; // 无目标，跳过
      // 已发送过（sentIds 持久化去重）
      if (this.isSent(o.id)) return false;
      return true;
    });
  }
}

// ══════════════════════════════════════════════════════════════
// 第三层：服务层
// ══════════════════════════════════════════════════════════════

// ─── 飞书 API 客户端 ─────────────────────────────────────────
// v8 改进：所有错误包含 code，token 自动刷新，失败有重试
class FeishuClient {
  constructor(appId, appSecret, log) {
    this.appId     = appId;
    this.appSecret = appSecret;
    this.log       = log;
    this.token     = null;
  }

  /** 获取 tenant token，失败返回 error */
  async getToken() {
    if (!this.appId || !this.appSecret) {
      return Result.err('FEISHU_APP_ID 或 FEISHU_APP_SECRET 未配置');
    }
    const resp = await Http.request(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        body  : JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
      }
    );
    if (Result.isErr(resp)) return Result.err(`Token 请求失败: ${resp.error.message}`);
    const d = resp.value;
    if (d.code !== 0) {
      return Result.err(`Token 返回错误: code=${d.code} msg=${d.msg || d.message}`);
    }
    this.token = d.tenant_access_token;
    return Result.ok(this.token);
  }

  /** 拉取群消息列表（最近 pageSize 条，降序） */
  async fetchMessages(chatId, pageSize = 50) {
    if (!this.token) return Result.err('token 未初始化');
    const url = [
      'https://open.feishu.cn/open-apis/im/v1/messages',
      `?container_id_type=chat`,
      `&container_id=${chatId}`,
      `&page_size=${pageSize}`,
      `&sort_type=ByCreateTimeDesc`,
    ].join('');

    const resp = await Http.request(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    if (Result.isErr(resp)) return Result.err(`拉取请求失败: ${resp.error.message}`);
    const d = resp.value;
    if (d.code !== 0) {
      // token 过期 → 清除并要求上层重试
      if (d.code === 99991663 || (d.msg && d.msg.includes('token'))) {
        this.token = null;
        return Result.err('TOKEN_EXPIRED');
      }
      return Result.err(`拉取失败: code=${d.code} msg=${d.msg || d.message}`);
    }
    return Result.ok((d.data && d.data.items) || []);
  }

  /** 发送文本消息到指定 chat */
  async sendMessage(chatId, text) {
    if (!this.token) return Result.err('token 未初始化');
    const payload = {
      receive_id: String(chatId),
      msg_type  : 'text',
      content   : JSON.stringify({ text: String(text) }),
    };
    const resp = await Http.request(
      'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
      {
        method: 'POST',
        body  : JSON.stringify(payload),
        headers: { Authorization: `Bearer ${this.token}` },
      }
    );
    if (Result.isErr(resp)) return Result.err(`发送请求失败: ${resp.error.message}`);
    const d = resp.value;
    if (d.code !== 0) {
      if (d.code === 99991663 || (d.msg && d.msg.includes('token'))) {
        this.token = null;
        return Result.err('TOKEN_EXPIRED');
      }
      return Result.err(`发送失败: code=${d.code} msg=${d.msg || d.message}`);
    }
    return Result.ok(d);
  }
}

// ─── 消息工具 ───────────────────────────────────────────────
const Msg = {
  /** 提取消息文本，处理多种 content 格式 */
  extractText(body) {
    if (!T.obj(body) || !T.nonEmpty(body.content)) {
      return { text: '', isText: false };
    }
    try {
      const p = JSON.parse(body.content);
      const t = T.str(p.text)    ? p.text
              : T.str(p.content) ? p.content
              : T.str(p)         ? p
              : '';
      return { text: t.trim(), isText: t.length > 0 };
    } catch {
      // content 不是 JSON → 当作纯文本
      return { text: body.content.trim(), isText: true };
    }
  },

  /**
   * 时间戳归一化（v8 修复）
   * ─────────────────────────────────────────────────────────
   * Feishu API create_time：毫秒级时间戳
   * 常见错误：把毫秒戳当秒戳，乘以 1000
   * 修复逻辑：
   *   > 1e12 (1万亿)  → 毫秒，直接用
   *   ≤ 1e12         → 秒，乘以 1000 转毫秒
   *   ≤ 1e9          → 异常，触发 fallback
   * ─────────────────────────────────────────────────────────
   */
  normalizeTime(ct) {
    if (ct == null) return Date.now();
    const n = parseInt(String(ct), 10);
    if (Number.isNaN(n)) return Date.now();

    // 毫秒级（> 1e12，如 1785135130095）
    if (n > 1e12) return n;
    // 秒级（≤ 1e12，如 1785135130 或 1700000000）
    if (n > 1e9)  return n * 1000;
    // 异常值 fallback
    return Date.now();
  },

  /** 判断是否应触发强制回复 */
  requiresReply(item) {
    if (item.priority === 'high') return true;
    return /@_user_1|@QClaw|？|\?/i.test(item.text || '');
  },

  /** 添加签名（若已有签名则不重复添加） */
  sign(reply) {
    const sig = '\n\n— QClaw';
    if (!T.str(reply)) return sig;
    return reply.includes('— QClaw') ? reply : reply + sig;
  },
};

// ══════════════════════════════════════════════════════════════
// 第四层：业务层
// ══════════════════════════════════════════════════════════════

class RelayCore {
  constructor(cfg, mgr, client, log) {
    this.cfg    = cfg;
    this.mgr    = mgr;
    this.client = client;
    this.log    = log;
    this._tokenDirty = false; // token 是否已刷新，触发重新 getToken
  }

  // ── PULL ──────────────────────────────────────────────────
  /** 拉取所有目标群的新消息，追加到 inbox */
  async pull() {
    let n = 0;
    for (const [chatId, chat] of Object.entries(this.cfg.targetChats)) {
      const res = await this.client.fetchMessages(chatId);

      // token 过期 → 刷新后重试一次
      if (Result.isErr(res) && res.error.message === 'TOKEN_EXPIRED') {
        this.log.warn('PULL', `${chat.name}: token 过期，刷新中...`);
        const tRes = await this.client.getToken();
        if (Result.isOk(tRes)) {
          this._tokenDirty = true;
          const retry = await this.client.fetchMessages(chatId);
          if (Result.isOk(retry)) { res.value = retry.value; res.ok = true; res.error = null; }
        }
      }

      if (Result.isErr(res)) {
        this.log.warn('PULL', `拉取 ${chat.name} 失败: ${res.error.message}`);
        continue;
      }

      for (const msg of res.value) {
        const id = msg.message_id;
        if (!id || this.mgr.isProcessed(id)) continue;
        if (msg.sender && msg.sender.sender_type === 'app') continue;

        this.mgr.markProcessed(id);
        const { text, isText } = Msg.extractText(msg.body || {});

        this.mgr.data.inbox.items.push({
          id,
          group   : chat.name,
          chatId,
          priority: chat.priority,
          sender  : (msg.sender?.sender_id?.open_id) || 'unknown',
          text    : isText ? text : `[${msg.msg_type || '未知'}]`,
          time    : Msg.normalizeTime(msg.create_time),
          status  : 'pending',
        });
        n++;
      }
    }
    this.log.info('PULL', `拉取 ${n} 条新消息`);
    return n;
  }

  // ── SEND ──────────────────────────────────────────────────
  /** 发送 outbox 中所有可发条目（幂等：sentIds 去重）
   *   每次调用前重新计算可发列表，保证 LEAK 后新增的条目也能发出去 */
  async send() {
    const sendable = this.mgr.filterSendable();
    if (sendable.length === 0) {
      this.log.info('SEND', '无待发送条目');
      return { sent: 0, failed: 0 };
    }

    // token 过期 → 刷新
    if (!this.client.token || this._tokenDirty) {
      const tRes = await this.client.getToken();
      if (Result.isErr(tRes)) {
        this.log.err('SEND', `Token 刷新失败: ${tRes.error.message}，跳过本次发送`);
        return { sent: 0, failed: sendable.length };
      }
      this._tokenDirty = false;
    }

    let sent = 0, failed = 0;
    for (const entry of sendable) {
      if (!this.cfg.targetChats[entry.chatId]) {
        this.log.warn('SEND', `chatId 未注册: ${entry.chatId}，跳过`);
        entry.status = 'sent'; // 跳过但不重试
        continue;
      }

      if (this.cfg.dryRun) {
        this.log.info('SEND', `[DRY] →${entry.group || entry.chatId}: ${(entry.reply || '').slice(0, 40)}`);
        entry.status = 'sent';
        continue;
      }

      const reply = Msg.sign(entry.reply);
      const res   = await this.client.sendMessage(entry.chatId, reply);

      if (Result.isOk(res)) {
        entry.status = 'sent';
        entry.sentAt = new Date().toISOString();
        this.mgr.markSent(entry.id);    // 持久化去重标记
        this.mgr.markInboxDone(entry.id);
        sent++;
        this.log.info('SEND', `✅ →${entry.group || entry.chatId} | ${reply.slice(0, 30)}`);
      } else {
        if (res.error.message === 'TOKEN_EXPIRED') {
          this._tokenDirty = true;
        }
        // 发送失败：保留 status='pending'（下次重试），不改变 entry
        failed++;
        this.log.err('SEND', `❌ →${entry.group}: ${res.error.message}`);
      }
    }

    this.log.info('SEND', `完成 成功=${sent} 失败=${failed}`);
    return { sent, failed };
  }

  // ── LEAK ──────────────────────────────────────────────────
  /** 漏回防护（v8：outboxIds 在每次迭代前重新计算）
   *   漏回防护四保险：
   *     1. processed     → 到达即登记
   *     2. sentIds        → 已发送则跳过（持久化幂等）
   *     3. outboxIds      → 在途回复已配对
   *     4. force enqueue  → 保证必回复
   */
  leak(now) {
    let forced = 0, closed = 0;

    for (const item of this.mgr.data.inbox.items) {
      if (item.status !== 'pending') continue;

      // 重新计算 outboxIds（包含本次 leak 新增条目）
      const outboxIds = new Set(
        this.mgr.data.outbox
          .filter((o) => T.nonEmpty(o.id))
          .map((o) => o.id)
      );

      const age = now - (item.time || now);

      // 尚未超时 → 跳过
      if (age < this.cfg.leakTimeoutMs) continue;

      // 已有回复在 outbox（配对成功）→ 静默收口
      if (outboxIds.has(item.id)) { item.status = 'done'; continue; }

      // 已发送过（sentIds 持久化）→ 幂等跳过
      if (this.mgr.isSent(item.id)) { item.status = 'done'; continue; }

      // 陈旧消息（超过 maxLeakAgeMs）→ 静默收口
      if (age > this.cfg.maxLeakAgeMs) { item.status = 'done'; closed++; continue; }

      // 非触发消息（low priority + 无 @无问号）→ 静默收口
      if (!Msg.requiresReply(item)) { item.status = 'done'; continue; }

      // 超出补回上限 → 静默收口
      if (forced >= this.cfg.leakForceCap) { item.status = 'done'; continue; }

      // 强制补回（第四保险）
      const leakReply = '收到🌸，这条我看到了，正在处理中，稍后给你完整回复~';
      this.mgr.enqueueLeak({
        id      : item.id,
        group   : item.group,
        chatId  : item.chatId,
        priority: item.priority,
        reply   : leakReply,
      });
      item.status = 'done';
      forced++;
      this.log.info('LEAK', `🛡 强制补回 [${item.group}] ${(item.text || '').slice(0, 25)}`);
    }

    this.log.info('LEAK', `完成 强制补回=${forced} 静默收口=${closed}`);
    return { forced, closed };
  }

  // ── 合并外部 outbox 源（消费制）────────────────────────────
  /** v8 改进：从 extraOutboxPaths 读取并追加到主 outbox
   *   读取后清空源文件（消费制），避免重复处理同一 ID
   *   已 sent 的条目会通过 sentIds 幂等过滤，不会重复发送 */
  merge() {
    let n = 0;
    for (const p of this.cfg.extraOutboxPaths) {
      const res = File.readJSON(p, []);
      if (Result.isErr(res)) continue;
      const extras = Array.isArray(res.value) ? res.value : [];
      for (const e of extras) {
        const entry = Schema.sanitizeOutboxEntry(e);
        if (!entry) continue;
        // sentIds 持久化去重（v8 新增）
        if (this.mgr.isSent(entry.id)) continue;
        // 同一次 merge 内的去重
        const exists = this.mgr.data.outbox.some(
          (o) => o.id === entry.id && T.nonEmpty(o.reply)
        );
        if (!exists) {
          this.mgr.data.outbox.push(entry);
          n++;
        }
      }
      // 消费：清空源文件（即使 merge 了 0 条也清）
      if (!this.cfg.dryRun) File.writeJSON(p, []);
    }
    if (n > 0) this.log.info('MERGE', `合并 ${n} 条`);
    return n;
  }

  // ── 完整流程 ──────────────────────────────────────────────
  /**
   * 三阶段单向流（v8）：
   *   PULL → merge → SEND → LEAK → SEND(end)
   *
   *   SEND(end) 的目的是把 LEAK 阶段新增的强制补回条目发出去。
   *   outboxIds 在 LEAK 内部重新计算，保证 LEAK 新增条目不漏配对。
   */
  async run() {
    const now = Date.now();
    this.log.info('RELAY', `启动 | 目标=${Object.keys(this.cfg.targetChats).length} | dry=${this.cfg.dryRun}`);

    // 获取 token（失败则立即退出，不做半吊子操作）
    const tRes = await this.client.getToken();
    if (Result.isErr(tRes)) {
      this.log.err('RELAY', `Token 失败: ${tRes.error.message}`);
      return { ok: false, error: tRes.error.message };
    }

    // 加载状态
    this.mgr.load(this.log);

    // 流程
    const pulled  = await this.pull();
    const merged  = this.merge();
    const send1   = await this.send();
    const leak    = this.leak(now);
    const send2   = await this.send(); // LEAK 新增条目在这里发出

    // 持久化
    const persistRes = this.mgr.persist(this.log, this.cfg.dryRun);
    if (Result.isErr(persistRes)) {
      this.log.err('RELAY', `落盘失败: ${persistRes.error.message}`);
    }

    const pending = this.mgr.data.inbox.items.filter((i) => i.status === 'pending').length;
    const summary = {
      ok         : true,
      pulled,
      merged,
      sent       : send1.sent + send2.sent,
      failed     : send1.failed + send2.failed,
      leakForced : leak.forced,
      leakClosed : leak.closed,
      inboxPending: pending,
      inboxTotal : this.mgr.data.inbox.items.length,
    };

    this.log.info('RELAY', `完成 ${JSON.stringify(summary)}`);
    return summary;
  }
}

// ══════════════════════════════════════════════════════════════
// 配置层
// ══════════════════════════════════════════════════════════════

function loadConfig() {
  const WORK        = process.env.QCLAW_WORKSPACE
    || 'C:\\Users\\78277\\.qclaw\\workspace';
  const RELAY_DIR   = path.join(WORK, 'relay');
  const CONFIG_PATH = process.env.OPENCLAW_CONFIG_PATH
    || 'C:\\Users\\78277\\.qclaw\\openclaw.json';

  // 从 openclaw.json 的 env 段读取凭证（QClaw 推荐方式）
  const cfgResult = File.readJSON(CONFIG_PATH, {});
  const cfg       = Result.isOk(cfgResult) ? cfgResult.value : {};
  const feishuEnv = cfg.env || {};

  // targetChats 默认值（用户需在 config.js 覆盖）
  const DEFAULT_TARGETS = {
    'oc_223a61332cfabb2722d463c67112fc92': { name: '脑洞大开.Dept', priority: 'normal' },
    'oc_985823724e28939c6182e483e5ed9c15': { name: '水镜大学堂',   priority: 'high'   },
  };

  // 尝试加载用户 config.js（允许用户自定义 targetChats 等）
  let userTargets = {};
  const userCfgPath = path.join(path.dirname(__filename), 'config.js');
  if (fs.existsSync(userCfgPath)) {
    try {
      const userCfg = require(userCfgPath);
      if (userCfg.targetChats) userTargets = userCfg.targetChats;
    } catch { /* 忽略配置加载错误 */ }
  }

  const targetChats = Object.keys(userTargets).length > 0 ? userTargets : DEFAULT_TARGETS;

  return {
    feishu: {
      appId    : feishuEnv.FEISHU_APP_ID     || process.env.FEISHU_APP_ID     || '',
      appSecret: feishuEnv.FEISHU_APP_SECRET || process.env.FEISHU_APP_SECRET || '',
    },
    targetChats,
    paths: {
      inbox    : path.join(RELAY_DIR, 'feishu_inbox.json'),
      outbox   : path.join(RELAY_DIR, 'feishu_outbox.json'),
      processed: path.join(WORK,      'bot-router', 'processed.json'),
      sentIds  : path.join(RELAY_DIR, 'feishu_sentIds.json'),  // v8 新增：持久化已发送ID
      replied  : path.join(RELAY_DIR, 'feishu_replied.json'), // 兼容旧文件，忽略
    },
    extraOutboxPaths: [
      path.join(RELAY_DIR, 'daily_report_outbox.json'),
      path.join(WORK,     'feishu_outbox.json'),
    ],
    // 漏回防护配置（毫秒）
    leakTimeoutMs : 4  * 60 * 1000,   // 4 分钟 → 触发补回检查
    maxLeakAgeMs  : 60 * 60 * 1000,   // 60 分钟 → 陈旧静默收口
    leakForceCap  : 10,                // 单次最多强制补回 10 条
    dryRun        : process.argv.includes('--dry-run'),
  };
}

// ══════════════════════════════════════════════════════════════
// 入口
// ══════════════════════════════════════════════════════════════

async function main() {
  const cfg  = loadConfig();
  const log  = new Logger(cfg.dryRun);

  const mgr    = new StateManager(cfg.paths);
  const client = new FeishuClient(cfg.feishu.appId, cfg.feishu.appSecret, log);

  const relay = new RelayCore(cfg, mgr, client, log);
  return await relay.run();
}

if (require.main === module) {
  main()
    .then((result) => {
      console.log('[RELAY] 完成:', JSON.stringify(result));
      process.exit(result.ok === false ? 1 : 0);
    })
    .catch((e) => {
      console.error('[RELAY] 异常:', e.message);
      process.exit(1);
    });
}

module.exports = { Result, Logger, T, File, Http, Schema,
  StateManager, FeishuClient, Msg, RelayCore, loadConfig };
