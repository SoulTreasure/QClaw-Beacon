/**
 * publish.js — 烽火台 GitHub 发布自动化脚本
 *
 * 依赖：Node.js + GitHub PAT (classic, repo scope)
 *
 * 用法：
 *   node publish.js                    # 交互模式（输入 token）
 *   GITHUB_TOKEN=xxx node publish.js    # 跳过交互，直接发布
 *
 * 功能：
 *   1. 读取所有文件
 *   2. 创建/更新仓库 QClaw-Beacon
 *   3. 创建 release v0.1.0 (draft)
 *   4. 上传所有文件作为 release assets
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const readline = require('readline');

const REPO_DIR  = 'C:\\Users\\78277\\AppData\\Local\\Temp\\openclaw-feishu-beacon';
const REPO_PATH = 'C:\\Users\\78277\\AppData\\Local\\Temp\\feishu-beacon-git';
const OWNER     = 'SoulTreasure';
const REPO_NAME = 'QClaw-Beacon';
const TAG       = 'v0.1.0';
const VERSION   = '0.1.0';

// ─── GitHub API ───────────────────────────────────────────────
const GitHub = {
  _token: '',

  init(token) { this._token = token; },

  _req(path, options = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(`https://api.github.com${path}`);
      const req = https.request({
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: {
          Authorization: `Bearer ${this._token}`,
          'User-Agent': 'QClaw-Beacon-Publisher/0.1',
          'Accept': 'application/vnd.github+json',
          ...(options.body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(options.body) } : {}),
        },
      }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8').trim();
          try { resolve(JSON.parse(raw)); }
          catch { resolve({ raw }); }
        });
      });
      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  },

  /** 检查仓库是否存在 */
  async repoExists() {
    const r = await this._req(`/repos/${OWNER}/${REPO_NAME}`);
    return r.hasOwnProperty('id') && r.id > 0;
  },

  /** 创建仓库 */
  async createRepo() {
    return await this._req('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name       : REPO_NAME,
        description: 'QClaw + 飞书无公网IP消息中继 · Be a beacon in the dark',
        homepage   : 'https://qclaw.ai',
        private    : false,
        has_issues : true,
        has_wiki   : false,
        auto_init  : false,
      }),
    });
  },

  /** 获取默认分支 */
  async getDefaultBranch() {
    const r = await this._req(`/repos/${OWNER}/${REPO_NAME}`);
    return r.default_branch || 'main';
  },

  /** 获取分支 SHA */
  async getRef(branch) {
    return await this._req(`/repos/${OWNER}/${REPO_NAME}/git/refs/heads/${branch}`);
  },

  /** 获取当前 treesha */
  async getTreeSha(branch) {
    const ref = await this.getRef(branch);
    return ref.object?.sha;
  },

  /** 创建 blob */
  async createBlob(content, encoding = 'utf-8') {
    const body = JSON.stringify({
      content : encoding === 'base64'
                ? Buffer.from(content).toString('base64')
                : content,
      encoding,
    });
    return await this._req(`/repos/${OWNER}/${REPO_NAME}/git/blobs`, {
      method: 'POST',
      body,
    });
  },

  /** 创建 tree */
  async createTree(baseTree, files) {
    const body = JSON.stringify({
      base_tree: baseTree,
      tree: files.map(({ path: p, sha, mode = '100644' }) => ({ path: p, mode, sha })),
    });
    return await this._req(`/repos/${OWNER}/${REPO_NAME}/git/trees`, {
      method: 'POST',
      body,
    });
  },

  /** 创建 commit */
  async createCommit(tree, message, parent) {
    const body = JSON.stringify({
      message,
      tree,
      parents: [parent],
    });
    return await this._req(`/repos/${OWNER}/${REPO_NAME}/git/commits`, {
      method: 'POST',
      body,
    });
  },

  /** 更新分支引用 */
  async updateRef(branch, sha) {
    return await this._req(`/repos/${OWNER}/${REPO_NAME}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha, force: false }),
    });
  },

  /** 创建 Release */
  async createRelease(tag, name, body, draft = true) {
    return await this._req(`/repos/${OWNER}/${REPO_NAME}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name       : tag,
        name           ,
        body           ,
        draft          ,
        prerelease     : false,
        generate_release_notes: false,
      }),
    });
  },

  /** 上传 Release Asset */
  async uploadAsset(uploadUrl, name, content, contentType) {
    return new Promise((resolve, reject) => {
      // uploadUrl 格式: https://uploads.github.com/repos/.../assets?name=xxx
      const u = new URL(uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(name)}`));
      const req = https.request({
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this._token}`,
          'Content-Type'  : contentType,
          'Content-Length' : Buffer.byteLength(content),
        },
      }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
          catch { resolve({}); }
        });
      });
      req.on('error', reject);
      req.write(content);
      req.end();
    });
  },
};

// ─── 工具 ─────────────────────────────────────────────────────
function readFiles(dir) {
  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      result.push(...readFiles(full).map(f => ({
        ...f,
        path: `${e.name}/${f.path}`,
      })));
    } else {
      const rel = e.name;
      const raw = fs.readFileSync(full);
      result.push({ path: rel, content: raw, contentType: getMime(rel) });
    }
  }
  return result;
}

function getMime(p) {
  const ext = path.extname(p).toLowerCase();
  const map = {
    '.js': 'text/plain; charset=utf-8',
    '.md' : 'text/markdown; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.yml': 'text/yaml; charset=utf-8',
    '.yaml': 'text/yaml; charset=utf-8',
  };
  return map[ext] || 'text/plain; charset=utf-8';
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

// ─── 主流程 ───────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  QClaw-Beacon: Feishu Edition');
  console.log('  GitHub 发布脚本 v1.0');
  console.log('═══════════════════════════════════════\n');

  // 1. Token：优先环境变量，其次 openclaw.json env，最后交互输入
  let token = process.env.GITHUB_TOKEN;

  if (!token) {
    // 尝试从 openclaw.json env 段读取
    const cfgPaths = [
      process.env.OPENCLAW_CONFIG_PATH,
      'C:\\Users\\78277\\.qclaw\\openclaw.json',
      path.join(process.env.HOME || '', '.qclaw', 'openclaw.json'),
    ].filter(Boolean);

    for (const p of cfgPaths) {
      try {
        const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (cfg.env && cfg.env.GITHUB_TOKEN) {
          token = cfg.env.GITHUB_TOKEN;
          console.log(`    [从 ${p} 读取 token]`);
          break;
        }
      } catch { /* 忽略错误，继续尝试下一个路径 */ }
    }
  }

  if (!token) {
    console.log('请提供 GitHub Personal Access Token (classic, repo scope)');
    console.log('获取地址: https://github.com/settings/tokens/new?scopes=repo');
    token = await prompt('GitHub Token: ');
  }
  if (!token.trim()) { console.error('Token 不能为空'); process.exit(1); }
  GitHub.init(token.trim());

  // 2. 测试 token
  console.log('\n[1/5] 测试 Token...');
  try {
    const me = await GitHub._req('/user');
    console.log(`    ✅ 认证成功: @${me.login}`);
  } catch (e) {
    console.error('    ❌ Token 无效:', e.message);
    process.exit(1);
  }

  // 3. 仓库
  console.log('\n[2/5] 检查/创建仓库...');
  let exists;
  try {
    exists = await GitHub.repoExists();
  } catch (e) {
    console.error('    ❌ API 错误:', e.message || e.raw);
    process.exit(1);
  }

  let branch = 'main';
  if (exists) {
    console.log('    ✅ 仓库已存在');
    branch = await GitHub.getDefaultBranch();
  } else {
    console.log('    🆕 创建仓库...');
    const r = await GitHub.createRepo();
    if (r.id) console.log('    ✅ 仓库创建成功');
    else { console.error('    ❌ 创建失败:', JSON.stringify(r)); process.exit(1); }
  }

  // 4. 上传文件
  console.log('\n[3/5] 上传文件到 main 分支...');
  const files = readFiles(REPO_DIR);
  console.log(`    找到 ${files.length} 个文件`);

  let baseTree;
  try { baseTree = await GitHub.getTreeSha(branch); }
  catch (e) { baseTree = null; }

  const blobs = [];
  for (const f of files) {
    process.stdout.write(`    上传 ${f.path} (${(f.content.length / 1024).toFixed(1)}KB)... `);
    const r = await GitHub.createBlob(
      typeof f.content === 'string' ? f.content : f.content.toString('base64'),
      typeof f.content === 'string' ? 'utf-8' : 'base64'
    );
    blobs.push({ path: f.path, sha: r.sha });
    console.log('✅');
  }

  const tree = await GitHub.createTree(baseTree || '空的', blobs);
  console.log(`    树 SHA: ${tree.sha?.slice(0, 7)}...`);

  const commit = await GitHub.createCommit(tree.sha, `feat: 初始发布 v${VERSION}\n\n${files.map(f => `- ${f.path}`).join('\n')}`, baseTree || '空的');
  console.log(`    Commit SHA: ${commit.sha?.slice(0, 7)}...`);

  await GitHub.updateRef(branch, commit.sha);
  console.log('    ✅ main 分支已更新');

  // 5. 创建 Draft Release
  console.log('\n[4/5] 创建 Draft Release...');
  const changelog = fs.existsSync(path.join(REPO_DIR, 'CHANGELOG.md'))
    ? fs.readFileSync(path.join(REPO_DIR, 'CHANGELOG.md'), 'utf8')
    : `## v${VERSION}\n\nInitial release.`;

  const release = await GitHub.createRelease(
    TAG,
    `v${VERSION} — MVP · 无公网IP消息中继`,
    changelog,
    true // draft
  );
  if (release.id) {
    console.log(`    ✅ Draft Release 创建成功: ${release.html_url}`);
  } else {
    console.log('    ⚠️  Release API 返回异常（非致命）:', JSON.stringify(release).slice(0, 200));
  }

  // 6. 上传 Release Assets
  console.log('\n[5/5] 上传 Release Assets...');
  if (release.upload_url) {
    for (const f of files) {
      process.stdout.write(`    ${f.path}... `);
      const r = await GitHub.uploadAsset(release.upload_url, path.basename(f.path),
        typeof f.content === 'string' ? f.content : f.content,
        f.contentType
      );
      console.log(r.browser_download_url ? `✅ ${r.browser_download_url}` : '⚠️');
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  ✅ 发布完成！');
  if (release.html_url) {
    console.log(`  草稿地址: ${release.html_url}`);
  }
  console.log(`  版本: v${VERSION} | 文件: ${files.length} 个`);
  console.log('  下一步: 登录 GitHub → 确认草稿 → 点击 Publish');
  console.log('═══════════════════════════════════════');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
