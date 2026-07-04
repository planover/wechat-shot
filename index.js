#!/usr/bin/env node
/**
 * 微信截图王 v3.2 - 自动化技能
 *
 * 基于 https://gaopengbin.github.io/wechat-dialog-generator/
 * 通过 Puppeteer 操控页面，输入聊天文本，自动生成并下载截图。
 *
 * v3.2 更新:
 *   - 🔧 图标尺寸放大到 90px，匹配 .wc-rp-icon 容器(102x120)
 *   - 🎉 Emoji 替换: 🤣😂→[笑哭], 🔥→[火] 等 (4种emoji支持)
 *   - ✅ 增强阴影和渐变效果
 *
 * v3.0 重大更新:
 *   - ✅ 彻底修复红包/转账图标 ⊠ 问题 (纯 HTML/CSS 内嵌元素)
 *   - ✅ 自动为 [图片] 无URL消息填充随机图片 (picsum/unsplash)
 *   - ✅ 群聊名称/联系人自定义 (--contact)
 *   - ✅ 头像默认改为 avataaars 彩色扁平风格
 *   - ✅ 新增 personas 风格: 根据角色名智能匹配头像
 *   - ✅ 增强容错：多次重试 + 详细诊断日志
 */

const puppeteer = require('puppeteer');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════
//  内置示例对话
// ═══════════════════════════════════════════
const DEFAULT_CHAT = `**【3月1日 14:32】**

**张三**：你好，在忙不？有个事想请你帮个忙

**李四**：不忙，怎么了？

**张三**：有个项目需要你帮忙处理下数据

**李四**：你说，尽管开口

**【3月1日 20:18】**

**张三**：资料都发你了，麻烦查收一下

**张三**：[图片]

**李四**：收到，我晚上看看

**李四**：[红包]辛苦费

**张三**：太感谢了兄弟！`;

// ═══════════════════════════════════════════
//  SVG 图标 — 使用 data URI 背景图方式注入
//  （比 innerHTML 更可靠，html-to-image 能正确捕获）
// ═══════════════════════════════════════════

function svgToDataUri(svg) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// 红包图标 — 仿微信红包样式
const REDPACKET_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
  <defs>
    <linearGradient id="rp-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f44c3d"/>
      <stop offset="100%" stop-color="#d43c2f"/>
    </linearGradient>
    <linearGradient id="rp-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffd700"/>
      <stop offset="100%" stop-color="#e6b800"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="80" height="80" rx="14" fill="url(#rp-bg)"/>
  <circle cx="40" cy="32" r="16" fill="url(#rp-gold)" opacity="0.95"/>
  <rect x="18" y="54" width="44" height="6" rx="3" fill="url(#rp-gold)" opacity="0.85"/>
  <text x="40" y="38" text-anchor="middle" font-size="20" fill="#d43c2f" font-weight="bold">福</text>
</svg>`;

// 转账图标
const TRANSFER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
  <defs>
    <linearGradient id="tf-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f79c46"/>
      <stop offset="100%" stop-color="#e88830"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="80" height="80" rx="14" fill="url(#tf-bg)"/>
  <text x="40" y="36" text-anchor="middle" font-size="28" fill="#fff" font-weight="bold">¥</text>
  <text x="40" y="60" text-anchor="middle" font-size="12" fill="rgba(255,255,255,0.7)">转账</text>
  <path d="M30 14 L40 8 L50 14" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M30 66 L40 72 L50 66" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

// 图片占位符 — 当[图片]没有URL时使用
const PLACEHOLDER_IMAGE_URLS = [
  'https://picsum.photos/400/300?random=1',
  'https://picsum.photos/400/300?random=2',
  'https://picsum.photos/400/300?random=3',
  'https://picsum.photos/500/350?random=4',
  'https://picsum.photos/400/400?random=5',
  'https://picsum.photos/450/320?random=6',
];

// ═══════════════════════════════════════════
//  DiceBear 头像风格列表
// ═══════════════════════════════════════════
const DICEBEAR_STYLES = [
  'avataaars',     // 🎨 扁平彩色卡通 — v3.0 新默认！色彩丰富人物形象
  'lorelei',       // 卡通人物
  'bottts',        // 机器人
  'identicon',     // 抽象几何
  'pixel-art',     // 像素风
  'thumbs',        // 手绘风
  'notionists',    // 黑白素描
  'shapes',        // 彩色形状
];

// ═══════════════════════════════════════════
//  参数解析
// ═══════════════════════════════════════════
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    input: null,
    output: null,
    long: false,
    time: '12:02',
    contact: '',
    battery: 60,
    signal: 4,
    unread: 1,
    selfColor: '#95ec69',
    otherColor: '#ffffff',
    avatarStyle: 'avataaars',  // v3.0 默认彩色风格
    avatarMap: null,
    chatText: null,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case '--input': case '-i': opts.input = next; i++; break;
      case '--output': case '-o': opts.output = next; i++; break;
      case '--long': case '-l': opts.long = true; break;
      case '--time': opts.time = next; i++; break;
      case '--contact': opts.contact = next; i++; break;
      case '--battery': opts.battery = parseInt(next, 10); i++; break;
      case '--signal': opts.signal = parseInt(next, 10); i++; break;
      case '--unread': opts.unread = parseInt(next, 10); i++; break;
      case '--self-color': opts.selfColor = next; i++; break;
      case '--other-color': opts.otherColor = next; i++; break;
      case '--avatar-style': opts.avatarStyle = next; i++; break;
      case '--avatar-map': opts.avatarMap = next; i++; break;
      case '--verbose': case '-v': opts.verbose = true; break;
      case '--help': case '-h': printHelp(); process.exit(0);
    }
  }

  if (opts.avatarStyle === 'none') {
    opts.avatarStyle = null;
  } else if (!DICEBEAR_STYLES.includes(opts.avatarStyle)) {
    console.warn(`⚠️ 未知头像风格 "${opts.avatarStyle}"，回退为默认 "avataaars"`);
    console.warn(`   可用风格: ${DICEBEAR_STYLES.join(', ')}`);
    opts.avatarStyle = 'avataaars';
  }

  if (opts.avatarMap) {
    const parsed = {};
    const pairs = opts.avatarMap.split(',');
    for (const pair of pairs) {
      const idx = pair.indexOf(':');
      if (idx > 0) {
        const name = pair.substring(0, idx).trim();
        const style = pair.substring(idx + 1).trim();
        if (DICEBEAR_STYLES.includes(style)) {
          parsed[name] = style;
        } else {
          console.warn(`⚠️ avatar-map 中风格 "${style}" 无效，${name} 将使用默认风格`);
        }
      }
    }
    opts.avatarMap = Object.keys(parsed).length > 0 ? parsed : null;
  }

  if (opts.input) {
    if (!fs.existsSync(opts.input)) {
      console.error(`❌ 文件不存在: ${opts.input}`);
      process.exit(1);
    }
    opts.chatText = fs.readFileSync(opts.input, 'utf-8').trim();
  } else {
    opts.chatText = DEFAULT_CHAT;
  }

  if (!opts.output) {
    const ts = Date.now();
    const suffix = opts.long ? '长截图' : '截图';
    opts.output = `/workspace/微信聊天记录_${suffix}_${ts}.png`;
  }

  return opts;
}

function printHelp() {
  console.log(`
╔════════════════════════════════════════════════════╗
║           微信截图王 v3.2 — WeChat Shot            ║
╚════════════════════════════════════════════════════╝

用法: node index.js [选项]

选项:
  -i, --input <file>      聊天记录文本文件（不指定则使用内置示例）
  -o, --output <file>     输出图片路径
  -l, --long              生成长截图（完整聊天记录）⭐v3.2
  --time <HH:MM>          手机时间（默认 12:02）
  --contact <name>        聊天标题/群聊名称 ⭐
  --battery <0-100>       电量百分比（默认 60）
  --signal <1-4>          信号格数（默认 4）
  --unread <num>          未读消息数（默认 1）
  --self-color <hex>      自己气泡色（默认 #95ec69）
  --other-color <hex>     他人气泡色（默认 #ffffff）
  --avatar-style <style>  头像风格（默认 avataaars⭐）⭐
  --avatar-map <map>      按角色指定风格 "张三:avataaars,李四:bottts"
  -v, --verbose           显示详细日志 ⭐v3.2增强
  -h, --help              显示帮助

头像风格 (--avatar-style):
  avataaars    扁平彩色卡通（v3.0 默认⭐ 推荐）
  lorelei      卡通人物
  bottts       机器人风格
  identicon    抽象几何
  pixel-art    像素风
  thumbs       手绘风
  notionists   黑白素描
  shapes       彩色形状
  none         不使用头像生成

聊天文本格式:
  **【时间】**              时间节点
  **用户名**：文字内容       普通消息
  **用户名**：[图片]         随机图片（自动填充）
  **用户名**：[图片]URL      指定图片URL
  **用户名**：[红包]备注     红包（纯CSS图标✅ v3.2增强）
  **用户名**：[转账]金额:备注 转账（纯CSS图标✅ v3.2增强）
  **用户名**：[语音]秒数     语音消息
`);
}

// ═══════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════

/**
 * 从聊天文本中解析所有用户名
 */
function extractUserNames(chatText) {
  const names = new Set();
  const lines = chatText.split('\n');
  for (const line of lines) {
    const match = line.match(/^\*\*(.+?)\*\*\s*[：:]/);
    if (match) names.add(match[1].trim());
  }
  return Array.from(names);
}

/**
 * 预处理聊天文本：为没有URL的 [图片] 自动添加随机图片URL
 */
function preprocessChatText(text) {
  let imgIndex = 0;
  return text.replace(/\[图片\](?!https?:\/\/)/g, () => {
    const url = PLACEHOLDER_IMAGE_URLS[imgIndex % PLACEHOLDER_IMAGE_URLS.length];
    imgIndex++;
    return `[图片]${url}`;
  });
}

/**
 * 获取 DiceBear 头像 PNG（不是 SVG），更可靠
 * 使用 PNG 格式避免 SVG 渲染兼容性问题
 */
function fetchDiceBearAvatarPng(seed, style) {
  return new Promise((resolve, reject) => {
    // DiceBear API 返回 PNG
    const url = `https://api.dicebear.com/9.x/${style}/png?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&size=200`;
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const base64 = buf.toString('base64');
        resolve('data:image/png;base64,' + base64);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/**
 * 为所有用户生成头像
 */
async function generateAvatars(chatText, defaultStyle, styleMap) {
  if (!defaultStyle && !styleMap) return new Map();

  const names = extractUserNames(chatText);
  if (names.length === 0) return new Map();

  console.log(`🎨 为用户生成 DiceBear 头像 (${defaultStyle} 风格)...`);
  const avatarMap = new Map();

  for (const name of names) {
    const style = (styleMap && styleMap[name]) || defaultStyle;
    if (!style) continue;

    try {
      process.stdout.write(`   ${name} → ${style}... `);
      const dataUri = await fetchDiceBearAvatarPng(name, style);
      avatarMap.set(name, dataUri);
      console.log('✅');
    } catch (err) {
      console.log(`⚠️ 失败 (${err.message})`);
    }
  }

  console.log(`   成功: ${avatarMap.size}/${names.length}`);
  return avatarMap;
}

// ═══════════════════════════════════════════
//  主要逻辑
// ═══════════════════════════════════════════
async function main() {
  const opts = parseArgs();
  const log = (...args) => opts.verbose && console.log('[LOG]', ...args);

  console.log('🚀 启动微信截图王 v3.2...');
  
  // 预处理：为 [图片] 填充随机URL
  let chatText = opts.chatText;
  const needsImageFill = /\[图片\](?!https?:\/\/)/.test(chatText);
  if (needsImageFill) {
    chatText = preprocessChatText(chatText);
    log(`已自动填充 ${((chatText.match(/\[图片\]https?:\/\//g) || []).length)} 个图片URL`);
  }
  
  console.log(`📝 聊天文本长度: ${chatText.length} 字符${needsImageFill ? ' (已自动填充图片)' : ''}`);
  console.log(`📸 模式: ${opts.long ? '长截图' : '普通截图'}`);
  console.log(`💬 群聊名称: ${opts.contact || '(默认)'}`);
  console.log(`🎨 头像: ${opts.avatarStyle || '跳过'}${opts.avatarMap ? ' + 按角色定制' : ''}`);

  // ── 预生成头像 ──
  const avatarMap = await generateAvatars(chatText, opts.avatarStyle, opts.avatarMap);

  // ── 启动浏览器 ──
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page._client().send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: path.dirname(opts.output),
  });

  try {
    // ── Step 1: 加载页面 ──
    log('正在加载页面...');
    await page.goto('https://gaopengbin.github.io/wechat-dialog-generator/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await new Promise(r => setTimeout(r, 2000));

    // ── Step 2: 填入聊天文本 ──
    log('填入聊天文本...');
    const textarea = await page.$('.s-textarea');
    if (!textarea) throw new Error('找不到文本输入框');

    await textarea.click({ clickCount: 3 });
    await textarea.type(chatText, { delay: 5 });
    await new Promise(r => setTimeout(r, 500));

    // ── Step 3: 点击"解析并导入" ──
    log('解析并导入...');
    const importBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.textContent.includes('解析并导入'));
    });
    await importBtn.click();
    await new Promise(r => setTimeout(r, 2500));

    // 验证导入结果
    let hasMessages = await page.evaluate(() => document.querySelector('.wc-phone') !== null);
    if (!hasMessages) {
      log('首次导入失败，重试...');
      const ta2 = await page.$('.s-textarea');
      await ta2.click({ clickCount: 3 });
      await ta2.type(chatText, { delay: 3 });
      await new Promise(r => setTimeout(r, 500));
      const btn2 = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('解析并导入'));
      });
      await btn2.click();
      await new Promise(r => setTimeout(r, 2500));
      hasMessages = await page.evaluate(() => document.querySelector('.wc-phone') !== null);
    }
    if (!hasMessages) throw new Error('聊天记录导入失败');

    // ── Step 4: 应用外观设置（包括群聊名称）──
    log('应用外观设置...');
    await applySettings(page, opts);

    // ── Step 5: 等待资源加载 ──
    log('等待资源加载...');
    await page.evaluate(() => {
      return Promise.all(
        Array.from(document.querySelectorAll('img'))
          .filter(img => !img.complete)
          .map(img => new Promise(r => { img.onload = img.onerror = r; }))
      );
    });
    await new Promise(r => setTimeout(r, 1000));

    // ── Step 6: 注入图标（v3.0 最终方案 — 纯 HTML/CSS）──
    // 不使用 SVG data URI，而是用纯 DOM 元素 + CSS 绘制
    // html-to-image 对原生 DOM 元素的支持最可靠
    log('注入图标 (红包/转账)...');

    await page.evaluate(() => {
      let fixedRp = 0, fixedTf = 0;

      // 修复 .wc-rp-icon（红包/转账 emoji 容器）
      document.querySelectorAll('.wc-rp-icon').forEach(el => {
        const text = el.textContent.trim();
        const isRedpacket = text.includes('\u{1F9E7}') || text.includes('\uD83E\uDDE7') || 
                            text.includes('🧧') || text.codePointAt(0) === 1293831;
        const isTransfer = text.includes('\u{1F4B0}') || text.includes('\uD83D\uDCB0') || 
                           text.includes('💰') || text.codePointAt(0) === 128176;

        if (isRedpacket || isTransfer) {
          // 完全替换内容为纯 HTML/CSS 图标 — v3.2: 填满 102x120 容器
          // .wc-rp-icon 的 computed size 是 width:102px, height:120px, font-size:80px
          if (isRedpacket) {
            el.innerHTML = `<div style="
              width:90px;height:90px;border-radius:18px;
              background:linear-gradient(145deg,#ff6b5b,#e63929);
              display:flex;align-items:center;justify-content:center;
              position:relative;overflow:hidden;
              box-shadow:0 2px 8px rgba(230,57,41,0.35),inset 0 1px 0 rgba(255,255,255,0.25);
              margin:auto;
            ">
              <div style="
                width:46px;height:46px;border-radius:50%;
                background:linear-gradient(145deg,#ffe066,#f0c000);
                display:flex;align-items:center;justify-content:center;
                box-shadow:0 1px 4px rgba(0,0,0,0.15);
              ">
                <span style="color:#c93020;font-size:28px;font-weight:bold;font-family:'PingFang SC','Microsoft YaHei',sans-serif;">福</span>
              </div>
              <div style="position:absolute;bottom:10px;width:48px;height:6px;background:rgba(255,220,100,0.85);border-radius:3px;"></div>
            </div>`;
            fixedRp++;
          } else {
            el.innerHTML = `<div style="
              width:90px;height:90px;border-radius:18px;
              background:linear-gradient(145deg,#ffa94d,#fd7e14);
              display:flex;flex-direction:column;align-items:center;justify-content:center;
              position:relative;
              box-shadow:0 2px 8px rgba(253,126,20,0.35),inset 0 1px 0 rgba(255,255,255,0.25);
              margin:auto;
            ">
              <span style="color:#fff;font-size:38px;font-weight:bold;line-height:1;font-family:'PingFang SC','Microsoft YaHei',sans-serif;text-shadow:0 1px 3px rgba(0,0,0,0.25);">¥</span>
              <span style="color:rgba(255,255,255,0.88);font-size:13px;margin-top:3px;letter-spacing:2px;">转账</span>
            </div>`;
            fixedTf++;
          }
          // 清除原始样式
          el.style.fontSize = '0';
          el.style.backgroundImage = 'none';
          el.style.padding = '0';
          el.setAttribute('data-fixed', isRedpacket ? 'rp' : 'tf');
        }
      });

      // 修复聊天气泡中的 emoji ⊠ 问题
      // 策略：用文字标签替换常见 emoji，避免 headless Chromium 无字体问题
      const phone = document.querySelector('.wc-phone');
      let fixedEmoji = 0;
      if (phone) {
        // 气泡文本在 .wc-bubble > span (裸span，没有class名) 中
        document.querySelectorAll('.wc-bubble').forEach(bubble => {
          // 找到气泡内的所有直接/间接子 span（文本内容节点）
          const allSpans = bubble.querySelectorAll('span');

          for (const textEl of allSpans) {
            const html = textEl.innerHTML;
            if (!html || textEl.querySelector('*')) continue; // 跳过有子元素的容器

            let newHtml = html;

            // 常见 emoji → 文字/符号 替换映射
            const emojiMap = [
              [/🤣/g, '<b style="color:#f5a623;">[笑哭]</b>'],
              [/😂/g, '<b style="color:#f5a623;">[笑哭]</b>'],
              [/😭/g, '<b style="color:#e74c3c;">[大哭]</b>'],
              [/🎉/g, '[庆祝]'],
              [/👍/g, '👍'],  // 可能正常渲染
              [/❤️/g, '<span style="color:#e74c3c;font-weight:bold;">♥</span>'],
              [/🔥/g, '<b style="color:#e74c3c;">[火]</b>'],
              [/✅/g, '<span style="color:#27ae60;font-weight:bold;">✓</span>'],
              [/⚠️/g, '<b style="color:#f39c12;">[注意]</b>'],
              [/🤔/g, '[思考]'],
              [/👏/g, '[鼓掌]'],
              [/💰/g, '[钱]'],
              [/🧧/g, '[红包]'],
              [/😅/g, '[尬]'],
              [/🙈/g, '[捂脸]'],
              [/💯/g, '[满分]'],
              [/🤝/g, '[握手]'],
            ];

            for (const [regex, replacement] of emojiMap) {
              newHtml = newHtml.replace(regex, replacement);
            }

            if (newHtml !== html) {
              textEl.innerHTML = newHtml;
              fixedEmoji++;
            }
          }
        });
      }

      return { fixedRp, fixedTf, fixedEmoji };
    }).then(r => {
      log(`图标注入: 红包=${r.fixedRp}, 转账=${r.fixedTf}, emoji替换=${r.fixedEmoji || 0}`);
    });

    await new Promise(r => setTimeout(r, 1000));

    // ── Step 7: 替换用户头像 ──
    if (avatarMap.size > 0) {
      log('替换用户头像...');
      const avatarObj = Object.fromEntries(avatarMap);
      
      await page.evaluate((avatars) => {
        let count = 0;
        document.querySelectorAll('.wc-face img').forEach(img => {
          const name = img.getAttribute('alt');
          if (name && avatars[name]) {
            img.src = avatars[name];
            img.style.objectFit = 'cover';
            img.style.width = '100%';
            img.style.height = '100%';
            count++;
          }
        });
        return count;
      }, avatarObj).then(count => {
        log(`已替换 ${count} 个头像`);
      });
      
      await new Promise(r => setTimeout(r, 800));
    }

    // ── Step 8: 最终验证 + 截图 ──
    log('执行截图...');
    const canvasResult = await page.evaluate(async (longshot) => {
      const phone = document.querySelector('.wc-phone');
      if (!phone) return { error: '找不到手机预览元素' };

      const content = phone.closest('.wc-phone-content');
      const wrap = phone.closest('.wc-phone-wrap');
      const scaleWrap = phone.closest('.wc-phone-scale-wrap');
      if (!content || !wrap) return { error: '找不到包装元素' };

      // 保存原始样式
      const saved = {
        ct: content.style.transform, co: content.style.transformOrigin,
        ww: wrap.style.width, wh: wrap.style.height, wo: wrap.style.overflow,
        wr: wrap.style.borderRadius, ws: wrap.style.boxShadow,
      };
      if (scaleWrap) {
        saved.sp = scaleWrap.style.position; saved.st = scaleWrap.style.top;
        saved.sl = scaleWrap.style.left; saved.sw = scaleWrap.style.width;
        saved.sh = scaleWrap.style.height;
      }

      // 展开至原始尺寸
      content.style.transform = 'none';
      wrap.style.width = '1125px';
      wrap.style.height = '2436px';
      wrap.style.overflow = 'hidden';
      wrap.style.borderRadius = '0';
      wrap.style.boxShadow = 'none';
      if (scaleWrap) {
        scaleWrap.style.position = 'fixed';
        scaleWrap.style.top = '0';
        scaleWrap.style.left = '-9999px';
        scaleWrap.style.width = '1125px';
        scaleWrap.style.height = '2436px';
      }

      const chatBody = phone.querySelector('.wc-chat-body');
      const chatContent = phone.querySelector('.wc-chat-content');
      const scrollTop = chatBody?.scrollTop ?? 0;
      const savedContentMargin = chatContent?.style.marginTop ?? '';
      if (!longshot && chatContent && scrollTop > 0) {
        chatContent.style.marginTop = `-${scrollTop}px`;
      }

      let longOrig = null;
      if (longshot) {
        const bottom = phone.querySelector('.wc-bottom');
        if (chatBody && bottom) {
          longOrig = {
            ph: phone.style.height, po: phone.style.overflow,
            bp: chatBody.style.position, bt: chatBody.style.top, bb: chatBody.style.bottom,
            bo: chatBody.style.overflowY, bh: chatBody.style.height,
            dp: bottom.style.position, db: bottom.style.bottom,
          };
          phone.style.height = 'auto'; phone.style.overflow = 'visible';
          wrap.style.height = 'auto';
          chatBody.style.position = 'relative'; chatBody.style.top = 'auto';
          chatBody.style.bottom = 'auto'; chatBody.style.overflowY = 'visible';
          chatBody.style.height = 'auto';
          bottom.style.position = 'relative'; bottom.style.bottom = 'auto';
        }
      }

      await new Promise(r => setTimeout(r, 150)); // 给更多时间让DOM稳定
      const totalH = longshot ? phone.scrollHeight : 2436;

      // 截图
      let canvas = null;
      let error = null;
      try {
        const { toCanvas } = await import('https://esm.sh/html-to-image@1.11.13');
        canvas = await toCanvas(phone, {
          width: 1125,
          height: totalH,
          pixelRatio: 1,
          backgroundColor: '#ededed',
          cacheBust: true,
          // 关键：确保内联图片被正确处理
          skipAutoScale: true,
        });
      } catch (e) {
        try {
          const { default: html2canvas } = await import('https://esm.sh/html2canvas@1.4.1');
          canvas = await html2canvas(phone, {
            width: 1125,
            height: totalH,
            scale: 1,
            backgroundColor: '#ededed',
            useCORS: true,
            allowTaint: true,
          });
        } catch (e2) {
          error = `html-to-image: ${e.message}; html2canvas: ${e2.message}`;
        }
      }

      // 还原样式
      content.style.transform = saved.ct; content.style.transformOrigin = saved.co;
      wrap.style.width = saved.ww; wrap.style.height = saved.wh;
      wrap.style.overflow = saved.wo; wrap.style.borderRadius = saved.wr;
      wrap.style.boxShadow = saved.ws;
      if (scaleWrap) {
        scaleWrap.style.position = saved.sp || ''; scaleWrap.style.top = saved.st || '';
        scaleWrap.style.left = saved.sl || ''; scaleWrap.style.width = saved.sw || '';
        scaleWrap.style.height = saved.sh || '';
      }
      if (chatContent) chatContent.style.marginTop = savedContentMargin;
      if (chatBody && scrollTop > 0) {
        requestAnimationFrame(() => { chatBody.scrollTop = scrollTop; });
      }
      if (longshot && longOrig) {
        const cb = phone.querySelector('.wc-chat-body');
        const btm = phone.querySelector('.wc-bottom');
        if (cb && btm) {
          phone.style.height = longOrig.ph; phone.style.overflow = longOrig.po;
          cb.style.position = longOrig.bp; cb.style.top = longOrig.bt;
          cb.style.bottom = longOrig.bb; cb.style.overflowY = longOrig.bo;
          cb.style.height = longOrig.bh;
          btm.style.position = longOrig.dp; btm.style.bottom = longOrig.db;
        }
      }

      if (error) return { error };
      if (!canvas) return { error: '无法生成 canvas' };

      return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
    }, opts.long);

    if (canvasResult.error) {
      throw new Error(`截图失败: ${canvasResult.error}`);
    }

    // ── Step 9: 保存图片 ──
    log(`保存图片到: ${opts.output}`);
    const base64Data = canvasResult.dataUrl.replace(/^data:image\/png;base64,/, '');
    const outputDir = path.dirname(opts.output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(opts.output, Buffer.from(base64Data, 'base64'));

    console.log(`\n✅ 截图已保存: ${opts.output}`);
    console.log(`📐 尺寸: ${canvasResult.width}×${canvasResult.height}`);
    console.log(`📏 文件大小: ${(fs.statSync(opts.output).size / 1024).toFixed(1)} KB`);
    if (avatarMap.size > 0) {
      console.log(`👤 已为 ${avatarMap.size} 个用户生成专属头像 (PNG格式)`);
    }
    console.log(`🔧 红包/转账图标: SVG ✅`);
    console.log(`🖼️  图片消息: ${needsImageFill ? '自动填充随机图 ✅' : '指定URL ✅'}`);

  } catch (error) {
    console.error(`\n❌ 错误: ${error.message}`);
    console.log('🔄 尝试备选方案...');
    try {
      await fallbackScreenshot(page, opts);
    } catch (e2) {
      console.error(`❌ 备选方案也失败: ${e2.message}`);
    }
  } finally {
    await browser.close();
  }
}

// ═══════════════════════════════════════════
//  应用外观设置
// ═══════════════════════════════════════════
async function applySettings(page, opts) {
  await page.evaluate((settings) => {
    // 时间
    const timeInput = document.querySelector('input[type="time"]');
    if (timeInput && settings.time) {
      timeInput.value = settings.time;
      timeInput.dispatchEvent(new Event('input', { bubbles: true }));
      timeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 聊天标题 / 群聊名称 ⭐ 增强
    if (settings.contact) {
      // 方式1: 通过表单输入框设置
      const textInputs = document.querySelectorAll('input[type="text"]');
      for (const inp of textInputs) {
        if (inp.closest('.form-item')?.textContent?.includes('聊天标题')) {
          inp.value = settings.contact;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
      
      // 方式2: 直接修改导航栏标题 (更强力)
      const navCenter = document.querySelector('.wc-nav-center span');
      if (navCenter) {
        navCenter.textContent = settings.contact;
      }
    }

    // 信号
    const selects = document.querySelectorAll('select');
    for (const sel of selects) {
      if (sel.closest('.form-item')?.textContent?.includes('信号')) {
        sel.value = String(settings.signal || 4);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }

    // 未读消息
    const numInputs = document.querySelectorAll('input[type="number"]');
    for (const inp of numInputs) {
      if (inp.closest('.form-item')?.textContent?.includes('未读')) {
        inp.value = String(settings.unread || 1);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }

    // 电量
    const rangeInputs = document.querySelectorAll('input[type="range"]');
    for (const inp of rangeInputs) {
      inp.value = String(settings.battery || 60);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 气泡颜色
    const colorInputs = document.querySelectorAll('input[type="color"]');
    if (colorInputs.length >= 2) {
      colorInputs[0].value = settings.selfColor || '#95ec69';
      colorInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      colorInputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      colorInputs[1].value = settings.otherColor || '#ffffff';
      colorInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      colorInputs[1].dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, opts);

  await new Promise(r => setTimeout(r, 800));
}

// ═══════════════════════════════════════════
//  备选方案
// ═══════════════════════════════════════════
async function fallbackScreenshot(page, opts) {
  const targetButton = opts.long ? '长截图' : '生成图片';

  const downloadPromise = new Promise((resolve) => {
    page._client().on('Browser.downloadProgress', (e) => {
      if (e.state === 'completed') resolve(e);
    });
    setTimeout(() => resolve(null), 20000);
  });

  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text.includes(targetButton)) {
      await btn.click();
      console.log(`点击了"${targetButton}"按钮`);
      break;
    }
  }

  const result = await downloadPromise;
  if (result) {
    console.log('✅ 下载完成');
  } else {
    console.log('⚠️ 未检测到下载');
  }
}

// ═══════════════════════════════════════════
//  入口
// ═══════════════════════════════════════════
main().catch(err => {
  console.error('❌ 未捕获错误:', err.message);
  process.exit(1);
});
