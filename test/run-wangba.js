/**
 * run-wangba.js — 端到端流程：网吧吐槽截图 + 本地Excel记录
 * 
 * 复盘测试 v3（修复所有已知 bug）：
 *   Bug1 fix: m.speaker（不是 m.name）— parseMessages 返回 {speaker,text}
 *   Bug2 fix: html-to-image 截图（不是 element.screenshot fullPage）
 *   Bug3 fix: generateAvatars(speakers, 'avataaars') — 需传风格参数
 *   Bug4 fix: 必须通过 textarea + 按钮触发渲染（不能只靠 URL hash）
 */
const path = require('path');
const fs = require('fs');

const SKILL_DIR = path.resolve(__dirname, '..');
const INDEX_JS = path.join(SKILL_DIR, 'index.js');
const RECORD_JS = path.join(SKILL_DIR, 'lib', 'record.js');
const { generateAvatars, parseMessages, patchBubbleSides } = require(INDEX_JS);
const { addRecord } = require(RECORD_JS);

const CHAT_FILE = path.join(__dirname, 'chat-wangba.txt');
const OUTPUT_PATH = path.join(SKILL_DIR, '微信截图_网吧吐槽.png');

// 用户原始输入（按修正后的语义）
const RAW_INPUT = '图片: Clipboard_Screenshot.png（用户提供的网吧吐槽截图）';
const RECOGNIZED_TEXT = `老子去网吧是网瘾上来了，不是色瘾上来了，现在网吧一天到晚整一堆蹿了凳的JK服务员擦边，叫服务员还得点选谁。我点台来了吗。整那多花里胡哨的干嘛？环境好房间干净点电脑好点比啥都强，老子狗头600q真想一斧砸死你们这群没有电竞之魂的东西`;

async function main() {
  console.log('=== wechat-shot v4.4.3 复盘端到端测试 v3 ===\n');

  // 1) 读对话文本
  const chatText = fs.readFileSync(CHAT_FILE, 'utf-8').trim();
  console.log(`[1] 对话文本: ${chatText.length} 字符\n`);

  // 2) 解析消息 —— parseMessages 返回 { speaker, text }
  const messages = parseMessages(chatText);
  const speakers = messages.map(m => m.speaker).filter(Boolean);
  console.log(`[2] 解析: ${messages.length} 条消息, 说话人: [${speakers.join(', ')}]`);

  // 3) 生成头像（传入预提取名字数组 + 风格）
  let avatarMap;
  if (speakers.length > 0) {
    avatarMap = await generateAvatars(speakers, 'avataaars');
    console.log(`[3] 头像: ${avatarMap.size} 个 (${[...avatarMap.keys()].join(', ')})`);
  } else {
    avatarMap = new Map();
    console.log(`[3] 头像: 跳过`);
  }

  // 4) Puppeteer —— 完全对齐正式代码流程（textarea → 按钮 → 渲染）
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  // Step A: 打开页面（不带 hash！）
  console.log(`\n[4A] 打开页面...`);
  await page.goto('https://gaopengbin.github.io/wechat-dialog-generator/', {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });
  await new Promise(r => setTimeout(r, 2000));

  // Step B: 填入聊天文本
  console.log(`[4B] 填入聊天文本...`);
  const textarea = await page.$('.s-textarea');
  if (!textarea) throw new Error('找不到 .s-textarea 输入框');
  await textarea.click({ clickCount: 3 }); // 全选已有内容
  await textarea.type(chatText, { delay: 5 });
  await new Promise(r => setTimeout(r, 500));

  // Step C: 点击「解析并导入」
  console.log(`[4C] 点击"解析并导入"...`);
  const importBtn = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('解析并导入'));
  });
  if (!importBtn) throw new Error('找不到"解析并导入"按钮');
  await importBtn.click();
  await new Promise(r => setTimeout(r, 3000));

  // 等待渲染结果出现
  let hasPhone = await page.evaluate(() => !!document.querySelector('.wc-phone'));
  if (!hasPhone) {
    console.log(`    首次导入未出结果，重试...`);
    const ta2 = await page.$('.s-textarea');
    await ta2.click({ clickCount: 3 });
    await ta2.type(chatText, { delay: 3 });
    await new Promise(r => setTimeout(r, 500));
    const btn2 = await page.evaluateHandle(() =>
      Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('解析并导入'))
    );
    await btn2.click();
    await new Promise(r => setTimeout(r, 3000));
    hasPhone = await page.evaluate(() => !!document.querySelector('.wc-phone'));
  }
  if (!hasPhone) throw new Error('聊天记录导入失败（.wc-phone 未出现）');
  console.log(`    ✅ .wc-phone 已出现`);

  // 5) 应用双向排版修复
  const otherSide = '阿强';
  console.log(`[5] patchBubbleSides(他人=${otherSide})...`);
  if (speakers.length > 0 && avatarMap.size > 0) {
    await patchBubbleSides(page, otherSide, speakers, avatarMap);
  } else {
    console.log(`    跳过（无说话人或无头像）`);
  }
  await new Promise(r => setTimeout(r, 500));

  // 6) 截图（html-to-image，与正式代码一致）
  console.log(`[6] 截图(html-to-image)...`);
  try {
    const canvasResult = await page.evaluate(async () => {
      const el = document.querySelector('.wc-phone') || document.querySelector('#app') || document.body;
      if (!el) return { error: '找不到截图容器' };

      const { toCanvas } = await import('https://esm.sh/html-to-image@1.11.13');
      const scrollH = Math.max(el.scrollHeight || 2436, 2436);
      const canvas = await toCanvas(el, {
        width: 1125,
        height: scrollH,
        pixelRatio: 1,
        backgroundColor: '#ededed',
        cacheBust: true,
        skipAutoScale: true,
      });
      return { dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
    });

    if (canvasResult.error) throw new Error(canvasResult.error);

    const base64Data = canvasResult.dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(OUTPUT_PATH, Buffer.from(base64Data, 'base64'));
    const stat = fs.statSync(OUTPUT_PATH);
    console.log(`    ✅ ${path.basename(OUTPUT_PATH)} (${(stat.size/1024).toFixed(1)} KB, ${canvasResult.w}×${canvasResult.h})`);
  } catch (e) {
    console.error(`    ⚠️ html-to-image 失败: ${e.message}, 回退 page.screenshot()`);
    await page.screenshot({ path: OUTPUT_PATH, fullPage: true, type: 'png' });
    const stat = fs.statSync(OUTPUT_PATH);
    console.log(`    ✅ (回退) ${path.basename(OUTPUT_PATH)} (${(stat.size/1024).toFixed(1)} KB)`);
  }

  // 7) DOM 校验
  console.log('\n--- DOM 校验 ---');
  const report = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.wc-body')).map((body, i) => ({
      idx: i,
      bg: (body.querySelector('.wc-bubble') && getComputedStyle(body.querySelector('.wc-bubble')).backgroundColor) || null,
      arrowBg: (body.querySelector('.wc-arrow') && getComputedStyle(body.querySelector('.wc-arrow')).backgroundColor) || null,
      hasAvatar: !!body.querySelector('img.avatar-injected'),
      avatarW: (() => { const img = body.querySelector('img.avatar-injected'); return img ? getComputedStyle(img).width : null; })(),
      avatarSrcLen: (() => { const img = body.querySelector('img.avatar-injected'); return img?.src?.length || 0; })(),
    }));
  });

  report.forEach(r => {
    console.log(`  气泡${r.idx}: bg=${r.bg?r.bg.slice(0,25)+'...':'N/A'}, arrowBg=${r.arrowBg?r.arrowBg.slice(0,25)+'...':'N/A'}, avatar=${r.hasAvatar?r.avatarW+'x(srcLen='+r.avatarSrcLen+')':'无'}`);
  });

  const errors = [];
  const srcLens = report.filter(r=>r.hasAvatar).map(r=>r.avatarSrcLen);
  const distinctAvatars = new Set(srcLens);
  const uniqueSpeakers = [...new Set(speakers)];
  if (distinctAvatars.size < uniqueSpeakers.length && uniqueSpeakers.length > 0)
    errors.push(`头像未区分: distinct=[${[...distinctAvatars].join(',')}] 期望>=${uniqueSpeakers.length}(唯一说话人)`);
  for (const r of report) {
    if (r.bg && r.bg.includes('255') && r.arrowBg && !r.arrowBg.includes('255'))
      errors.push(`气泡${r.idx}: 白气泡+非白箭头(绿框bug!)`);
  }
  if (report.filter(r=>r.hasAvatar).length < report.length && report.length > 0)
    errors.push(`${report.length - report.filter(r=>r.hasAvatar).length} 个气泡缺头像`);

  if (!errors.length) {
    console.log('\n✅ 全部校验通过!');
  } else {
    console.log('\n❌ 校验失败:');
    errors.forEach(e => console.log(`   - ${e}`));
  }

  await browser.close();

  // 8) 写入本地 Excel
  console.log('\n[7] 写入本地 Excel...');
  try {
    const rowNum = addRecord({
      date: new Date(), inputType: 'image', rawInput: RAW_INPUT,
      recognizedContent: RECOGNIZED_TEXT,
      chatText: chatText.replace(/\n/g, ' ⏎ '), screenshotPath: OUTPUT_PATH,
    });
    console.log(`   ✅ Excel 第 ${rowNum} 行已写入`);
  } catch (err) {
    console.error(`   ❌ Excel 失败: ${err.message}`);
  }

  console.log('\n=== 完成 ===');
  return { ok: !errors.length, errors, output: OUTPUT_PATH };
}

if (require.main === module) {
  main().then(r => process.exit(r.ok ? 0 : 1)).catch(e => { console.error('FATAL:', e); process.exit(1); });
}
module.exports = { main };
