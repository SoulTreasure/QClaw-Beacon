// 策略：先用 Contents API 创建一个 seed 文件（会自动建 commit）
// 然后用 Git Data API 追加其他文件
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

// 读取文件列表
const files = {
  'README.md':         fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/README.md',         'utf8'),
  'ARCHITECTURE.md':   fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/ARCHITECTURE.md',   'utf8'),
  'QUICKSTART.md':     fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/QUICKSTART.md',     'utf8'),
  'MVP_MODE.md':       fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/MVP_MODE.md',      'utf8'),
  'CHANGELOG.md':      fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/CHANGELOG.md',     'utf8'),
  'config.example.js': fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/config.example.js','utf8'),
  'feishu_relay.js':   fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/feishu_relay.js',  'utf8'),
  'LICENSE':           fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/LICENSE',         'utf8'),
  'publish.js':        fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/publish.js',       'utf8'),
};

(async () => {
  // Step 1: 用 Contents API 创建第一个文件（seed commit）
  const seedFile = 'README.md';
  const seedContent = files[seedFile];
  console.log('Step 1: 创建 seed commit（README.md）...');

  const seedR = await gh(
    `/${OWNER}/${REPO}/contents/${seedFile}`,
    'PUT',
    JSON.stringify({
      message: 'feat: QClaw-Beacon 烽火台 MVP v0.1.0',
      content: Buffer.from(seedContent).toString('base64'),
      branch: BRANCH,
    })
  );

  if (seedR.status !== 200 && seedR.status !== 201) {
    console.log('❌ Seed 失败:', JSON.stringify(seedR.data).slice(0, 200));
    return;
  }
  const baseTreeSha = seedR.data.commit.commit.tree.sha;
  console.log('✅ Seed commit:', seedR.data.commit.sha?.slice(0, 8), '| tree:', baseTreeSha?.slice(0, 8));

  // Step 2: 为其他 8 个文件创建 blob
  const blobs = {};
  for (const [name, content] of Object.entries(files)) {
    if (name === seedFile) continue;
    const r = await gh(`/${OWNER}/${REPO}/git/blobs`, 'POST', JSON.stringify({
      content,
      encoding: 'utf-8',
    }));
    blobs[name] = r.data.sha;
    console.log('  blob:', name, '→', r.status === 201 ? '✅ ' + r.data.sha?.slice(0, 8) : '❌ ' + JSON.stringify(r.data).slice(0, 60));
  }

  // Step 3: 创建新 tree（基于 seed commit 的 tree）
  const treeItems = Object.entries(blobs).map(([path, sha]) => ({ path, mode: '100644', type: 'blob', sha }));
  const treeR = await gh(`/${OWNER}/${REPO}/git/trees`, 'POST', JSON.stringify({
    base_tree: baseTreeSha,
    tree: treeItems,
  }));
  console.log('\nStep 3: Tree →', treeR.status, treeR.data.sha?.slice(0, 8), treeR.status === 201 ? '✅' : '❌');
  if (treeR.status !== 201) { console.log(JSON.stringify(treeR.data).slice(0, 200)); return; }

  // Step 4: 创建 commit
  const commitR = await gh(`/${OWNER}/${REPO}/git/commits`, 'POST', JSON.stringify({
    message: 'feat: 完整文件集 v0.1.0\n\n- 中英双语 README\n- 架构文档 / ARCHITECTURE.md\n- 使用手册 MVP_MODE / QUICKSTART\n- feishu_relay.js v8\n- config.example.js\n- CHANGELOG.md\n- publish.js 发布脚本\n- 微信联系方式：wxid_qakb4voa8iyn12',
    tree: treeR.data.sha,
    parents: [seedR.data.commit.sha],
  }));
  console.log('Step 4: Commit →', commitR.status, commitR.data.sha?.slice(0, 8), commitR.status === 201 ? '✅' : '❌');
  if (commitR.status !== 201) { console.log(JSON.stringify(commitR.data).slice(0, 200)); return; }

  // Step 5: 更新 branch refs
  const refR = await gh(`/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, 'PATCH', JSON.stringify({
    sha: commitR.data.sha,
  }));
  console.log('Step 5: Branch →', refR.status, refR.data.object?.sha?.slice(0, 8), refR.status === 200 ? '✅' : '❌');

  if (refR.status === 200) {
    console.log('\n🎉 全部推送成功！');
    console.log('📦 仓库地址: https://github.com/' + OWNER + '/' + REPO);
    console.log('📝 README: https://github.com/' + OWNER + '/' + REPO + '/blob/main/README.md');
  }
})();
