/**
 * 渲染校验（真实页面）：导入聊天 → 生成头像 → patchBubbleSides → 读取 DOM 客观证据
 * 验证 4 件事：
 *   1) 每个说话人都有头像（body 内含 img.avatar-injected）
 *   2) 不同说话人头像不同（dataUri 的 seed 不同 → 不同 PNG）
 *   3) 头像尺寸统一 40px（computed）
 *   4) 他人侧气泡白、箭头白；自己侧气泡绿、箭头绿；箭头保留 45° 旋转
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { patchBubbleSides, generateAvatars, parseMessages } = require('../index.js');

const chat = fs.readFileSync(path.join(__dirname, 'chat-final.txt'), 'utf-8');
const OTHER = '康师傅';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'], headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('https://gaopengbin.github.io/wechat-dialog-generator/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  const ta = await page.$('.s-textarea');
  await ta.click({ clickCount: 3 });
  await ta.type(chat, { delay: 5 });
  await new Promise(r => setTimeout(r, 500));
  const btn = await page.evaluateHandle(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('解析并导入')));
  await btn.click();
  await new Promise(r => setTimeout(r, 2500));

  const avatarMap = await generateAvatars(chat, 'avataaars', null);
  const msgs = parseMessages(chat);
  const speakers = msgs.map(m => m.speaker);
  await patchBubbleSides(page, OTHER, speakers, avatarMap);
  await new Promise(r => setTimeout(r, 600));

  const report = await page.evaluate(() => {
    const bodies = Array.from(document.querySelectorAll('.wc-body'));
    const rows = bodies.map((body, i) => {
      const bubble = body.querySelector('.wc-bubble');
      const arrow = bubble ? bubble.querySelector('.wc-arrow') : null;
      const img = body.querySelector('img.avatar-injected');
      const cs = (el) => el ? getComputedStyle(el) : null;
      const is = (el) => el ? getComputedStyle(el) : null;
      return {
        idx: i,
        hasAvatar: !!img,
        avatarW: img ? is(img).width : null,
        avatarH: img ? is(img).height : null,
        avatarSrcLen: img ? (img.src || '').length : 0,
        avatarSeed: img ? (img.src.match(/seed=([^&]+)/) || [])[1] : null,
        bubbleBg: bubble ? cs(bubble).backgroundColor : null,
        arrowBg: arrow ? cs(arrow).backgroundColor : null,
        arrowTransform: arrow ? cs(arrow).transform : null,
        arrowRight: arrow ? cs(arrow).right : null,
        arrowLeft: arrow ? cs(arrow).left : null,
      };
    });
    const seeds = rows.map(r => r.avatarSeed).filter(Boolean);
    // 头像是 base64 data URI（非 URL），用 src 长度区分不同说话人
    const avatarLens = rows.map(r => r.avatarSrcLen);
    const distinctSeeds = Array.from(new Set(avatarLens));
    const sizes = rows.filter(r => r.hasAvatar).map(r => `${r.avatarW}x${r.avatarH}`);
    const distinctSizes = Array.from(new Set(sizes));
    return { rows, distinctSeeds, distinctSizes, avatarCount: rows.filter(r=>r.hasAvatar).length, total: rows.length };
  });

  console.log(JSON.stringify(report, null, 2));

  // 断言
  const errors = [];
  if (report.avatarCount !== report.total) errors.push(`头像缺失: 有头像 ${report.avatarCount}/${report.total}`);
  if (report.distinctSeeds.length < 2) errors.push(`头像未区分说话人: distinctSeeds=${report.distinctSeeds.length}`);
  // 不同说话人头像数据长度应不同（我 vs 康师傅 不同 seed）
  const selfLens = report.rows.filter(r => r.bubbleBg === 'rgb(149, 236, 105)').map(r => r.avatarSrcLen);
  const otherLens = report.rows.filter(r => r.bubbleBg === 'rgb(255, 255, 255)').map(r => r.avatarSrcLen);
  if (selfLens.length && otherLens.length && selfLens[0] === otherLens[0]) errors.push(`自己与他人头像数据相同(长度一致): ${selfLens[0]}`);
  if (report.distinctSizes.length !== 1 || report.distinctSizes[0] !== '40pxx40px') errors.push(`头像尺寸不一致: ${JSON.stringify(report.distinctSizes)}`);
  report.rows.forEach(r => {
    if (r.bubbleBg === 'rgb(149, 236, 105)' && r.arrowBg !== 'rgb(149, 236, 105)') errors.push(`第${r.idx}行 自己侧箭头非绿`);
    if (r.bubbleBg === 'rgb(255, 255, 255)' && r.arrowBg !== 'rgb(255, 255, 255)') errors.push(`第${r.idx}行 他人侧箭头非白(绿框!)`);
    // 箭头应保留 45° 旋转矩阵（不再被设成 none / scaleX 裸用）
    if (r.arrowTransform === 'none' || r.arrowTransform === 'matrix(-1, 0, 0, 1, 0, 0)') errors.push(`第${r.idx}行 箭头旋转被破坏: ${r.arrowTransform}`);
  });

  console.log('\n=== 校验结果 ===');
  if (errors.length) { console.log('❌ 失败:\n - ' + errors.join('\n - ')); }
  else { console.log('✅ 全部通过: 头像齐全/不同/均40px，箭头随气泡配色且保留45°旋转'); }

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('VERIFY ERROR:', e.message); process.exit(2); });
