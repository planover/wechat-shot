'use strict';
/**
 * sync-tencent-docs.js — 微信截图王「同步到腾讯文档」模块
 * ─────────────────────────────────────────────────────
 * 本模块运行在 Node 子进程内，无法直接调用 WorkBuddy 的腾讯文档 MCP 工具，
 * 因此负责三件事：
 *
 *   1) 生成「导入就绪」的本地腾讯文档（自包含 HTML：内嵌截图 + 对话原文），
 *      用户可直接在腾讯文档里「导入/上传」该文件，或把其中的截图、文字粘贴进去。
 *   2) 输出结构化 payload（<截图名>.tencent-docs.json），含标题/图片路径/对话原文，
 *      供 Agent 侧腾讯文档 MCP 工具在连接器连通时一键创建云端文档。
 *   3) 若设置了环境变量 TENCENT_DOCS_OPEN_TOKEN（腾讯文档开放平台应用令牌），
 *      则 best-effort 调用开放平台导入 API 直推云端（需用户自行在
 *      https://docs.qq.com/open 注册应用；无令牌时跳过，不报错）。
 *
 * 返回：{ ok, mode:'local'|'cloud', target, message }
 */

const fs = require('fs');
const path = require('path');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildTencentDocHtml(title, imgDataUri, transcriptHtml) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; background: #f2f3f5; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1a1a1a; }
  .doc { max-width: 840px; margin: 24px auto; background: #fff; padding: 48px 56px; box-shadow: 0 1px 8px rgba(0,0,0,.08); border-radius: 4px; }
  h1 { font-size: 24px; font-weight: 700; margin: 0 0 24px; line-height: 1.4; }
  img.shot { width: 100%; border: 1px solid #e5e5e5; border-radius: 8px; display: block; margin: 0 0 28px; }
  .sec-title { font-size: 15px; font-weight: 600; color: #576b95; margin: 24px 0 10px; }
  .transcript p { margin: 0; padding: 4px 0; font-size: 14px; line-height: 1.9; white-space: pre-wrap; color: #2b2b2b; }
  .footer { margin-top: 36px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
</style>
</head>
<body>
  <div class="doc">
    <h1>${escapeHtml(title)}</h1>
    <img class="shot" src="${imgDataUri}" alt="微信聊天截图">
    <div class="sec-title">对话原文</div>
    <div class="transcript">${transcriptHtml}</div>
    <div class="footer">由「微信截图王」生成 · 可导入/上传至腾讯文档</div>
  </div>
</body>
</html>`;
}

/**
 * 云端推送（best-effort）。需用户在 https://docs.qq.com/open 注册应用并配置：
 *   TENCENT_DOCS_OPEN_TOKEN  — 开放平台 access_token
 *   TENCENT_DOCS_OPEN_APPID  — 应用 appid（可选，用于部分接口）
 * 腾讯文档开放平台对「图片直接进文档」无单一简单接口，此处走「导入文件」思路：
 * 把截图作为附件上传，并创建一篇承载对话原文的文档。具体端点以开放平台最新文档为准。
 */
async function pushViaOpenApi({ token, pngPath, transcript, title }) {
  // 真实云端导入依赖开放平台应用与 OAuth，超出本地可验证范围。
  // 这里仅做结构占位：有令牌时尝试上传图片，失败则抛出由上层回退到本地文档。
  const https = require('https');
  return new Promise((resolve, reject) => {
    const boundary = '----wbtd' + Date.now();
    const fileData = fs.readFileSync(pngPath);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(pngPath)}"\r\nContent-Type: image/png\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const req = https.request({
      hostname: 'docs.qq.com',
      path: '/openapi/v2/upload?type=file',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, url: '', message: `云端上传返回 ${res.statusCode}` });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${b.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function syncToTencentDocs({ pngPath, transcript, title, contact }) {
  const result = { ok: false, mode: 'local', target: '', message: '' };
  try {
    if (!pngPath || !fs.existsSync(pngPath)) {
      result.message = '未找到截图文件，跳过同步';
      return result;
    }
    const outDir = path.dirname(pngPath);
    const base = path.basename(pngPath, path.extname(pngPath));
    const docTitle = title || contact || '微信聊天截图';

    // 1) 本地「导入就绪」腾讯文档（自包含 HTML，内嵌截图 + 对话原文）
    const imgB64 = fs.readFileSync(pngPath).toString('base64');
    const imgDataUri = `data:image/png;base64,${imgB64}`;
    const transcriptHtml = (transcript || '')
      .split('\n')
      .map((l) => `<p>${escapeHtml(l) || '&nbsp;'}</p>`)
      .join('\n');
    const html = buildTencentDocHtml(docTitle, imgDataUri, transcriptHtml);
    const htmlPath = path.join(outDir, `腾讯文档_导入就绪_${base}.html`);
    fs.writeFileSync(htmlPath, html, 'utf8');

    // 2) 结构化 payload（供 Agent 侧 MCP 在连接器连通时使用）
    const payload = {
      title: docTitle,
      imagePath: pngPath,
      transcript: transcript || '',
      createdAt: new Date().toISOString(),
      importReadyHtml: htmlPath,
    };
    const payloadPath = path.join(outDir, `${base}.tencent-docs.json`);
    fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2), 'utf8');
    result.target = payloadPath;

    // 3) 若配置了开放平台令牌，尝试真正的云端导入（best-effort）
    const token = process.env.TENCENT_DOCS_OPEN_TOKEN;
    if (token) {
      try {
        const apiResult = await pushViaOpenApi({ token, pngPath, transcript, title: docTitle });
        result.mode = 'cloud';
        result.ok = apiResult.ok;
        result.message = `已推送云端: ${apiResult.message}`;
        return result;
      } catch (e) {
        result.message = `云端导入失败（已生成本地导入就绪文档）: ${e.message}`;
      }
    } else {
      result.message =
        '已生成「导入就绪」本地腾讯文档 + 结构化 payload；连接腾讯文档连接器或设置 TENCENT_DOCS_OPEN_TOKEN 后可自动推送云端';
    }
    result.ok = true;
    return result;
  } catch (e) {
    result.message = `同步失败: ${e.message}`;
    return result;
  }
}

module.exports = { syncToTencentDocs };
