/**
 * 公务员上岸段子 — 端到端验证流程（对齐正式代码路径）
 * 
 * 流程：打开页面 → 填入文本 → 点按钮触发渲染 → 生成头像 → patchBubbleSides → html-to-image截图 → 本地Excel → DOM校验
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// 从 index.js 导出函数
const {
  parseMessages,
  generateAvatars,
  patchBubbleSides,
  parseOtherSideList,
} = require('../index');

const { addRecord } = require('../lib/record');

// ── 配置 ──
const CHAT_FILE = path.join(__dirname, 'chat-gongwuyuan.txt');
const OUTPUT_PATH = path.join(__dirname, '..', '微信截图_公务员.png');
const OTHER_SIDE = '大刘';
const INPUT_TYPE = 'image';
const RAW_INPUT = '图片: Clipboard_Screenshot.png（用户提供的公务员上岸慰问盲人吐槽截图）';
const RECOGNIZED_CONTENT = '朋友公务员上岸，逢年过节要去慰问残障人士，她去帮人家盲人把房间给收拾的整整齐齐。关键当时在场所有人没品出有啥不对来';

(async () => {
  console.log('=== 公务员段子 端到端流程 ===\n');

  // ── [1] 读取对话文本 ──
  const chatText = fs.readFileSync(CHAT_FILE, 'utf-8').trim();
  console.log(`[1] 对话文本: ${chatText.substring(0, 80)}... (${chatText.length}字符)`);

  // ── [2] 解析消息 ──
  const messages = parseMessages(chatText);
  console.log(`[2] 消息数: ${messages.length}`);
  const speakers = messages.filter(m => m.speaker).map(m => m.speaker);
  console.log(`    说话人: [${speakers.join(', ')}]`);
  if (speakers.length === 0) {
    console.error('❌ 无有效说话人，退出');
    process.exit(1);
  }

  // ── [3] 启动浏览器 & 打开页面（无hash！必须通过UI操作） ──
  console.log('[3] 启动浏览器...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  const baseUrl = 'https://gaopengbin.github.io/wechat-dialog-generator/';
  console.log(`    打开页面: ${baseUrl}`);
  await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // ── [4A] 找文本框并填入对话文本 ──
  console.log('[4A] 查找文本框...');
  const textareaSelector = '.s-textarea';
  let textarea = await page.$(textareaSelector);
  
  if (!textarea) {
    // 备选：任何 textarea 或 contenteditable
    console.log('    .s-textarea 未找到，尝试备选...');
    textarea = await page.$('textarea') || await page.$('[contenteditable="true"]');
  }
  
  if (!textarea) {
    // 最终备选：evaluate 直接操作
    console.log('    通过 evaluate 注入...');
    await page.evaluate((text) => {
      const el = document.querySelector('.s-textarea') || document.querySelector('textarea') || document.querySelector('[contenteditable="true"]');
      if (el) {
        el.focus();
        el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, chatText);
  } else {
    console.log('    找到文本框，点击聚焦...');
    await textarea.click({ clickCount: 3 });
    await new Promise(r => setTimeout(r, 300));
    console.log('    输入对话文本...');
    await textarea.type(chatText, { delay: 5 });
  }

  await new Promise(r => setTimeout(r, 500));

  // ── [4B] 点击「解析并导入」（与正式代码完全一致：evaluateHandle + 句柄点击）──
  console.log('[4B] 点击「解析并导入」...');

  // 第一次尝试（与 index.js Step 3 完全一致）
  const importBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => b.textContent.includes('解析并导入'));
  });
  
  if (importBtn) {
    console.log('    找到按钮，通过句柄点击...');
    await importBtn.click();
  } else {
    console.log('    按钮未找到，通过 evaluate 直接点击...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.textContent.includes('解析并导入'));
      if (btn) btn.click();
    });
  }

  await new Promise(r => setTimeout(r, 2500));

  // ── [5] 等待渲染完成（含重试，与正式代码一致）──
  console.log('[5] 等待渲染...');
  
  let hasMessages = await page.evaluate(() => document.querySelector('.wc-phone') !== null);
  
  if (!hasMessages) {
    console.log('    首次导入失败，重试...');
    const ta2 = await page.$('.s-textarea');
    if (ta2) {
      await ta2.click({ clickCount: 3 });
      await ta2.type(chatText, { delay: 3 });
      await new Promise(r => setTimeout(r, 500));
      const btn2 = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('解析并导入'));
      });
      if (btn2) await btn2.click();
      await new Promise(r => setTimeout(r, 2500));
    }
    hasMessages = await page.evaluate(() => document.querySelector('.wc-phone') !== null);
  }
  
  if (!hasMessages) {
    console.error('❌ 聊天记录导入失败（重试后仍无 .wc-phone）');
    
    // 输出调试信息
    const debugInfo = await page.evaluate(() => ({
      bodyLen: document.body.innerHTML.length,
      title: document.title,
      wcClasses: [...document.querySelectorAll('[class]')]
        .map(e => e.className)
        .filter(c => typeof c === 'string' && c.toString().includes('wc'))
        .slice(0, 20),
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()),
    }));
    console.error('    调试:', JSON.stringify(debugInfo));
    await browser.close();
    process.exit(1);
  } else {
    console.log('    ✅ .wc-phone 已出现');
  }

  // 额外等待确保 JS 渲染完成
  await new Promise(r => setTimeout(r, 2000));
  
  // 检查气泡数
  const bubbleCount = await page.evaluate(() => document.querySelectorAll('.wc-bubble').length);
  console.log(`    气泡数: ${bubbleCount}`);

  if (bubbleCount === 0) {
    console.error('❌ 无气泡渲染，页面可能未正确响应');
    
    // 输出调试信息
    const debugInfo = await page.evaluate(() => ({
      bodyLen: document.body.innerHTML.length,
      title: document.title,
      wcClasses: [...document.querySelectorAll('[class]')]
        .map(e => e.className)
        .filter(c => typeof c === 'string' && c.toString().includes('wc'))
        .slice(0, 20),
    }));
    console.error('    调试:', JSON.stringify(debugInfo));
    await browser.close();
    process.exit(1);
  }

  // ── [6] 生成头像 ──
  console.log('[6] 生成头像...');
  let avatarMap;
  if (speakers.length > 0) {
    avatarMap = await generateAvatars(chatText, 'avataaars', null, speakers);
    console.log(`    头像: ${avatarMap.size} 个 (${[...avatarMap.keys()].join(', ')})`);
  } else {
    avatarMap = new Map();
  }

  // ── [7] patchBubbleSides（双向排版 + 头像注入 + 箭头颜色）──
  if (OTHER_SIDE && messages.length > 0) {
    console.log('[7] patchBubbleSides...');
    await patchBubbleSides(page, OTHER_SIDE, speakers, avatarMap);
    console.log('    双向排版完成');
  }

  await new Promise(r => setTimeout(r, 500));

  // ── [8] DOM 校验 ──
  console.log('[8] DOM 校验...');
  const report = await page.evaluate(() => {
    const bubbles = Array.from(document.querySelectorAll('.wc-bubble'));
    return bubbles.map((bubble, i) => {
      const body = bubble.closest('.wc-body') || bubble.parentElement;
      const arrow = bubble.querySelector ? bubble.querySelector('.wc-arrow') : null;
      const avatar = body ? (body.querySelector ? body.querySelector('img.avatar-injected') : null) : null;

      const arrowStyle = arrow ? window.getComputedStyle(arrow) : null;
      const bubbleStyle = window.getComputedStyle(bubble);

      return {
        idx: i,
        bg: bubbleStyle.background.substring(0, 30),
        hasArrow: !!arrow,
        arrowBg: arrowStyle ? arrowStyle.background.substring(0, 20) : null,
        arrowTransform: arrowStyle ? arrowStyle.transform : null,
        hasAvatar: !!avatar,
        avatarW: avatar ? avatar.width : 0,
        avatarH: avatar ? avatar.height : 0,
        avatarSrcLen: avatar ? (avatar.src || '').length : 0,
      };
    });
  });

  const errors = [];
  const distinctAvatars = new Set(report.map(r => r.avatarSrcLen).filter(Boolean));

  report.forEach(r => {
    // 白气泡箭头不能是绿色
    if (r.bg.includes('255,255,255') && r.arrowBg && !r.arrowBg.includes('255,255,255')) {
      errors.push(`气泡${r.idx}: 白气泡但箭头颜色=${r.arrowBg}（应为白）`);
    }
    // 头像大小检查
    if (r.hasAvatar && (r.avatarW < 30 || r.avatarH < 30)) {
      errors.push(`气泡${r.idx}: 头像过小 ${r.avatarW}x${r.avatarH}`);
    }
  });

  if (distinctAvatars.size < 2 && speakers.length > 1) {
    errors.push(`头像未区分: distinctSrcLens=[${[...distinctAvatars].join(',')}] 期望>=2`);
  }

  console.log(`    气泡数: ${report.length}, 有头像: ${report.filter(r => r.hasAvatar).length}`);
  report.forEach(r => {
    console.log(`    气泡${r.idx}: bg=${r.bg.substring(0,20)} arrow=${r.arrowBg||'-'} avatar=${r.avatarW}x${r.avatarH} srcLen=${r.avatarSrcLen}`);
  });
  
  if (errors.length > 0) {
    console.error('    ❌ 校验错误:');
    errors.forEach(e => console.error(`       ${e}`));
  } else {
    console.log('    ✅ 全部校验通过');
  }

  // ── [9] 截图（html-to-image，与正式代码一致）──
  console.log('[9] 截图(html-to-image)...');

  // 用 html-to-image 截图（与 index.js 正式路径一致）
  let screenshotDataUrl = null;
  let screenshotBuf = null;

  try {
    const canvasResult = await page.evaluate(async () => {
      const el = document.querySelector('#app') || document.querySelector('.wc-phone') || document.body;
      if (!el) return { error: '找不到根容器' };

      try {
        const { toCanvas } = await import('https://esm.sh/html-to-image@1.11.13');
        const scrollH = el.scrollHeight || 2436;
        const canvas = await toCanvas(el, {
          width: 1125,
          height: Math.max(scrollH, 2436),
          pixelRatio: 1,
          backgroundColor: '#ededed',
          cacheBust: true,
          skipAutoScale: true,
        });
        return { dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
      } catch (e) {
        return { error: e.message, stack: e.stack };
      }
    });

    if (canvasResult.error) {
      throw new Error(`html-to-image 错误: ${canvasResult.error}`);
    }

    screenshotDataUrl = canvasResult.dataUrl;
    console.log(`    画布尺寸: ${canvasResult.w}x${canvasResult.h}`);

    // dataURL → buffer → 文件
    const base64 = screenshotDataUrl.split(',')[1];
    screenshotBuf = Buffer.from(base64, 'base64');
    fs.writeFileSync(OUTPUT_PATH, screenshotBuf);
    console.log(`    ✅ 截图已保存: ${OUTPUT_PATH} (${(screenshotBuf.length / 1024).toFixed(1)}KB)`);

  } catch (e) {
    console.error(`    ⚠️ html-to-image 失败: ${e.message}`);
    console.log('    回退：Puppeteer 页面截图...');

    // 回退到 Puppeteer 全页截图
    screenshotBuf = await page.screenshot({
      type: 'png',
      fullPage: true,
    });
    fs.writeFileSync(OUTPUT_PATH, screenshotBuf);
    console.log(`    ✅ 回退截图已保存: ${OUTPUT_PATH} (${(screenshotBuf.length / 1024).toFixed(1)}KB)`);
  }

  // ── [10] 写本地 Excel ──
  console.log('[10] 写本地 Excel...');
  try {
    addRecord({
      date: new Date(),
      inputType: INPUT_TYPE,
      rawInput: RAW_INPUT,
      recognizedContent: RECOGNIZED_CONTENT,
      chatText,
      screenshotPath: OUTPUT_PATH,
    });
    console.log('    ✅ Excel 记录已写入');
  } catch (e) {
    console.warn(`    ⚠️ Excel 写入失败: ${e.message}`);
  }

  // ── 完成 ──
  await browser.close();

  console.log('\n=== 完成 ===');
  console.log(`截图: ${OUTPUT_PATH}`);
  console.log(`Excel: wechat-shot-records.xlsx`);

  if (errors.length > 0) {
    console.log(`\n⚠️ 存在 ${errors.length} 个校验问题`);
    process.exit(1);
  }

  process.exit(0);
})();
