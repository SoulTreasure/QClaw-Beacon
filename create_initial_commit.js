// 为空仓库创建初始 commit（空仓库没有 HEAD，需要先建 ref 再建 commit）
const https = require('https');
const fs = require('fs');

const TOKEN  = JSON.parse(fs.readFileSync('C:/Users/78277/.qclaw/openclaw.json', 'utf8')).env.GITHUB_TOKEN;
const OWNER = 'SoulTreasure';
const REPO  = 'QClaw-Beacon';
const BRANCH = 'main';

function gh(path, method, body) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com', port: 443, path,
      method: method || 'GET',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent': 'QClaw-Publisher/1.0',
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', e => resolve({ status: 0, data: { message: e.message } }));
    if (body) req.write(body);
    req.end();
  });
}

function encode64(str) { return Buffer.from(str).toString('base64'); }

(async () => {
  const files = {
    'README.md':        fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/README.md',        'utf8'),
    'ARCHITECTURE.md':  fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/ARCHITECTURE.md',  'utf8'),
    'QUICKSTART.md':    fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/QUICKSTART.md',    'utf8'),
    'MVP_MODE.md':      fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/MVP_MODE.md',      'utf8'),
    'CHANGELOG.md':     fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/CHANGELOG.md',     'utf8'),
    'config.example.js':fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/config.example.js','utf8'),
    'feishu_relay.js':  fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/feishu_relay.js',  'utf8'),
    'LICENSE':          fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/LICENSE',          'utf8'),
    'publish.js':       fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/publish.js',       'utf8'),
  };

  console.log('准备推送', Object.keys(files).length, '个文件到', OWNER + '/' + REPO);

  // Step 1: 为每个文件创建 blob，获取 SHA
  const blobs = {};
  for (const [name, content] of Object.entries(files)) {
    const r = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', JSON.stringify({
      content,
      encoding: 'utf-8',
    }));
    blobs[name] = r.data.sha;
    console.log('  blob:', name, '→', r.data.sha?.slice(0, 8), r.status === 201 ? '✅' : '❌ ' + JSON.stringify(r.data).slice(0, 80));
    if (!r.data.sha) { console.log('  停止，blob 创建失败'); return; }
  }

  // Step 2: 创建 tree
  const treeItems = Object.entries(blobs).map(([path, sha]) => ({ path, mode: '100644', type: 'blob', sha }));
  const treeR = await gh(`/repos/${OWNER}/${REPO}/git/trees`, 'POST', JSON.stringify({
    base_tree: null,
    tree: treeItems,
  }));
  console.log('\nTree 创建:', treeR.status, treeR.data.sha?.slice(0, 8), treeR.status === 201 ? '✅' : '❌');
  if (!treeR.data.sha) { console.log(JSON.stringify(treeR.data).slice(0, 200)); return; }

  // Step 3: 创建 commit
  const commitR = await gh(`/repos/${OWNER}/${REPO}/git/commits`, 'POST', JSON.stringify({
    message: 'feat: QClaw-Beacon 烽火台 MVP v0.1.0\n\n- 中英双语 README\n- 完整架构文档\n- feishu_relay.js v8 核心引擎\n- MVP_MODE / QUICKSTART 使用手册\n- 微信联系方式：wxid_qakb4voa8iyn12',
    tree: treeR.data.sha,
    parents: [],
  }));
  console.log('Commit 创建:', commitR.status, commitR.data.sha?.slice(0, 8), commitR.status === 201 ? '✅' : '❌');
  if (!commitR.data.sha) { console.log(JSON.stringify(commitR.data).slice(0, 200)); return; }

  // Step 4: 更新 refs/heads/main
  const refR = await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, 'PATCH', JSON.stringify({
    sha: commitR.data.sha,
    force: false,
  }));
  console.log('Branch refs 更新:', refR.status, refR.data.object?.sha?.slice(0, 8), refR.status === 200 ? '✅' : '❌');

  if (refR.status === 200) {
    console.log('\n🎉 全部推送成功！');
    console.log('仓库地址: https://github.com/' + OWNER + '/' + REPO);
  } else {
    console.log('refs 更新失败:', JSON.stringify(refR.data).slice(0, 200));
  }
})();
