const https = require('https');
const fs = require('fs');

const TOKEN  = JSON.parse(fs.readFileSync('C:/Users/78277/.qclaw/openclaw.json', 'utf8')).env.GITHUB_TOKEN;
const OWNER = 'SoulTreasure';
const REPO  = 'QClaw-Beacon';
const BRANCH = 'main';

function gh(apiPath, method, body) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      port: 443,
      path: apiPath,
      method: method || 'GET',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent': 'QClaw-Publisher/1.0',
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
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

(async () => {
  const contentPath = `/${OWNER}/${REPO}/contents/README.md?ref=${BRANCH}`;

  // Step 1: GET README SHA
  const existing = await gh(contentPath, 'GET', null);
  const sha = existing.status === 200 ? existing.data.sha : null;
  console.log('Step1 - GET README:', existing.status, '| SHA:', sha ? sha.slice(0,8)+'...' : '无');

  // Step 2: PUT README
  const readme = fs.readFileSync('C:/Users/78277/AppData/Local/Temp/openclaw-feishu-beacon/README.md', 'utf8');
  const payload = JSON.stringify({
    message: 'docs: 中英双语 README + 微信联系方式 v1.1',
    content: Buffer.from(readme).toString('base64'),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  });

  const pushed = await gh(contentPath, 'PUT', payload);
  console.log('Step2 - PUT README:', pushed.status, pushed.status === 200 || pushed.status === 201 ? '✅ 成功' : '❌ 失败');
  if (pushed.status !== 200 && pushed.status !== 201) {
    console.log('错误详情:', JSON.stringify(pushed.data).slice(0, 300));
  } else {
    console.log('commit SHA:', pushed.data.commit?.sha?.slice(0, 8));
    console.log('文件URL:', pushed.data.content?.download_url);
  }
})();
