#!/usr/bin/env node
/**
 * 微信截图王 v3.3 - 通用聊天截图工具
 *
 * 基于 https://gaopengbin.github.io/wechat-dialog-generator/
 * 通过 Puppeteer 操控页面，输入聊天文本，自动生成并下载截图。
 *
 * v3.3 更新:
 *   - 🌍 通用化: 去掉平台专属路径, git clone 即可用 (OpenClaw 等)
 *   - 😀 Twemoji 渲染: emoji 显示为真实彩色图标 (非 [笑哭] 文字)
 *   - 📦 标准 npm 包结构
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
const dns = require('dns');
const { isBlockedHostname } = require('./lib/ssrf');

// ── 浏览器侧 SSRF 防护配置 ──
// 可选严格白名单：WS_IMAGE_ALLOWLIST 设为逗号分隔主机名时，仅放行白名单 + 固定 CDN 集合；
// 未设置时放行所有非阻断的公网 http(s) 请求（保留用户自定义图片 URL 功能，仅拦内网）。
const IMAGE_ALLOWLIST = (() => {
  const raw = process.env.WS_IMAGE_ALLOWLIST;
  if (!raw) return null;
  const set = new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  return set.size ? set : null;
})();
// 工具自身运行所依赖的固定 CDN（非用户可控，始终放行；含渲染库 esm.sh）。
// 注意：esm.sh 是 html-to-image / html2canvas 动态 import 的来源，必须放行否则截图完全失败。
const FIXED_CDN_HOSTS = new Set([
  'cdn.jsdelivr.net',     // Twemoji SVG
  'picsum.photos',        // [图片] 占位随机图
  'gaopengbin.github.io', // 渲染器页面本体
  'esm.sh',               // 截图库 html-to-image / html2canvas 动态 import
]);
// 单次运行内 DNS 解析结果缓存（仅记录是否命中内网），减少重复 lookup 的延迟
const dnsCache = new Map();

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
    time: getCurrentHHMM(),   // 默认用当前真实时间，避免永远卡在 12:02
    contact: '',
    battery: 60,
    signal: 4,
    network: 'wifi',   // 'wifi' | 'cellular'(蜂窝数据/5G)
    unread: 1,
    selfColor: '#95ec69',
    otherColor: '#ffffff',
    avatarStyle: 'avataaars',  // v3.0 默认彩色风格
    avatarMap: null,
    chatText: null,
    verbose: false,
    silent: false,  // v4.0: 静默模式，供 auto.js 调用
    syncTencentDocs: false,  // v4.4.1+: 生成后同步到腾讯文档
    otherSide: null,  // v4.4.3+: 指定"他人"姓名(逗号分隔)，将其气泡搬回左侧
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
      case '--network': opts.network = (next || 'wifi').toLowerCase(); i++; break;
      case '--unread': opts.unread = parseInt(next, 10); i++; break;
      case '--self-color': opts.selfColor = next; i++; break;
      case '--other-color': opts.otherColor = next; i++; break;
      case '--avatar-style': opts.avatarStyle = next; i++; break;
      case '--avatar-map': opts.avatarMap = next; i++; break;
      case '--verbose': case '-v': opts.verbose = true; break;
      case '--silent': opts.silent = true; break;  // v4.0: 静默模式
      case '--sync-tencent-docs': opts.syncTencentDocs = true; break;
      case '--other-side': opts.otherSide = next; i++; break;
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
    // 通用路径: 优先当前目录，其次 /workspace (容器环境)
    const outDir = fs.existsSync('/workspace') ? '/workspace' : process.cwd();
    opts.output = path.join(outDir, `微信聊天记录_${suffix}_${ts}.png`);
  }

  return opts;
}

function printHelp() {
  console.log(`
╔════════════════════════════════════════════════════╗
║           微信截图王 v3.3 — WeChat Shot            ║
╚════════════════════════════════════════════════════╝

用法: node index.js [选项]

选项:
  -i, --input <file>      聊天记录文本文件（不指定则使用内置示例）
  -o, --output <file>     输出图片路径
  -l, --long              生成长截图（完整聊天记录）⭐v3.3
  --time <HH:MM>          手机时间（默认：当前真实时间，不再卡 12:02）
  --contact <name>        聊天标题/群聊名称 ⭐
  --battery <0-100>       电量百分比（默认 60）
  --signal <1-4>          信号格数（默认 4）
  --network <wifi|cellular>  状态栏网络类型：wifi(默认) 或 蜂窝数据(显示 5G)
  --unread <num>          未读消息数（默认 1）
  --self-color <hex>      自己气泡色（默认 #95ec69）
  --other-color <hex>     他人气泡色（默认 #ffffff）
  --avatar-style <style>  头像风格（默认 avataaars⭐）⭐
  --avatar-map <map>      按角色指定风格 "张三:avataaars,李四:bottts"
  --sync-tencent-docs     生成后同步到腾讯文档（导入就绪文档 + 结构化 payload；连接器连通后自动推送云端）
  --other-side <names>    指定"他人"姓名(逗号分隔，如 康师傅,小李)，将其气泡强制搬回左侧(白色+头像)；解决第三方解析器默认全部靠右的问题
  -v, --verbose           显示详细日志 ⭐v3.3
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
  **用户名**：[红包]备注     红包（纯CSS图标✅ v3.3）
  **用户名**：[转账]金额:备注 转账（纯CSS图标✅ v3.3）
  **用户名**：[语音]秒数     语音消息
  **用户名**：文字😀🤣🔥     任意文本（emoji 自动转为 Twemoji 图标✅ v3.3）
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
 * 浏览器侧 SSRF 守卫：拦截 headless Chromium 发起的请求。
 *
 * 触发入口：聊天文本中的 [图片]URL 会让渲染器把其作为 <img src> 让 Chromium fetch，
 * 攻击者可借此访问内网 / 云元数据（如 [图片]http://169.254.169.254/latest/meta-data/）。
 *
 * 判定顺序：
 *  1. data:/blob: → 直接放行（注入头像/图标用，无需拦截）
 *  2. 非 http/https scheme（file:/ftp:/gopher: 等）→ abort
 *  3. isBlockedHostname → abort（内网/环回/链路本地/云元数据/IPv4-mapped IPv6）
 *  4. 若设置了 WS_IMAGE_ALLOWLIST：仅放行白名单或固定 CDN 集合，否则 abort
 *  5. 否则（默认）：对公网主机名做一次 DNS 解析，解析到内网 IP 则 abort（缓解 DNS 重绑定，
 *     存在 TOCTOU，仅降低风险）；解析失败则保守放行，避免阻塞截图流程
 *  6. 其余 → continue
 *
 * 健壮性：每个请求恰好调用一次 continue/abort；用 try/catch + isInterceptResolutionHandled
 * 兜底，避免 "Request is already handled" 异常导致整页崩溃。被 abort 的请求使用 'failed'
 * 错误码，确保 <img> 触发 onerror（Step 5 的 img.complete/onerror 等待逻辑不会永久挂起）。
 */
/**
 * 纯函数：判定一个图片请求应当 continue 还是 abort。
 * 从 onRequest 中提取，便于测试注入假 DNS 解析器（模拟 DNS 重绑定）做独立验证。
 *
 * options:
 *   allowlist?: Set<string> | null  —— 严格白名单模式；为 null/undefined 时走默认（仅拦内网 + DNS 复核）
 *   resolveDns?: (host) => Promise<Array<{address, family}>> —— 注入假解析器；缺省用真实 dns.promises.lookup（3s 超时 + dnsCache 缓存）
 *
 * 判定顺序（与原 onRequest 行为完全一致）：
 *   1. data:/blob: → continue（注入头像/图标用）
 *   2. 非法 URL / 非 http(s) scheme（file:/ftp:/gopher: 等）→ abort
 *   3. isBlockedHostname（内网/环回/链路本地/云元数据/IPv4-mapped IPv6）→ abort
 *   4. 严格白名单：非白名单且非固定 CDN → abort，否则 continue
 *   5. 默认：固定 CDN 直接 continue；其余公网主机名做 DNS 复核，解析到内网则 abort
 *   6. 其余 → continue
 */
async function decideImageRequest(urlString, options = {}) {
  const allowlist = (options.allowlist !== undefined) ? options.allowlist : IMAGE_ALLOWLIST;
  const resolveDns = options.resolveDns || realResolveDns;

  // 1. 注入用 data/blob（如 DiceBear 头像、SVG 图标）直接放行
  if (typeof urlString === 'string' && (urlString.startsWith('data:') || urlString.startsWith('blob:'))) {
    return 'continue';
  }

  // 2. 解析 URL；非法 URL 直接拦截
  let u;
  try {
    u = new URL(urlString);
  } catch {
    return 'abort';
  }

  // 3. 仅允许 http/https；拦 file:/ftp:/gopher: 等危险 scheme
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return 'abort';
  }

  const host = u.hostname.toLowerCase();

  // 4. 阻断内网/环回/链路本地（含 IPv4-mapped IPv6）
  if (isBlockedHostname(u.hostname)) {
    return 'abort';
  }

  // 5. 可选严格白名单模式
  if (allowlist) {
    if (!allowlist.has(host) && !FIXED_CDN_HOSTS.has(host)) {
      return 'abort';
    }
    return 'continue';
  }

  // 6. 默认模式：固定 CDN 直接放行；其余公网主机名做 DNS 解析复核，缓解 DNS 重绑定
  if (!FIXED_CDN_HOSTS.has(host)) {
    let addrs = [];
    try {
      addrs = await resolveDns(host);
    } catch {
      addrs = [];
    }
    if (Array.isArray(addrs) && addrs.some((a) => isBlockedHostname(a && a.address))) {
      return 'abort';
    }
  }

  // 7. 放行
  return 'continue';
}

// 真实 DNS 解析（带 3s 超时 + 进程内缓存）。返回地址数组；失败/超时返回 []（保守放行，不阻塞截图）。
async function realResolveDns(host) {
  const cached = dnsCache.get(host);
  if (cached !== undefined) return cached;
  let addrs = [];
  try {
    const { lookup } = dns.promises;
    const resolved = await Promise.race([
      lookup(host, { all: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('dns-timeout')), 3000)),
    ]);
    addrs = Array.isArray(resolved) ? resolved : [resolved];
  } catch {
    addrs = [];
  }
  dnsCache.set(host, addrs);
  return addrs;
}

/**
 * 浏览器侧 SSRF 守卫（薄包装）：拦截 headless Chromium 发起的请求。
 * 判定逻辑全部在 decideImageRequest 中，本函数只负责执行 continue/abort 并保证每个请求恰好处理一次。
 * 被 abort 的请求使用 'failed' 错误码，确保 <img> 触发 onerror（Step 5 的 img.onerror 等待不会永久挂起）。
 */
async function onRequest(req) {
  const safeContinue = () => {
    if (req.isInterceptResolutionHandled && req.isInterceptResolutionHandled()) return;
    req.continue().catch(() => {});
  };
  const safeAbort = () => {
    if (req.isInterceptResolutionHandled && req.isInterceptResolutionHandled()) return;
    req.abort('failed').catch(() => {});
  };
  try {
    const decision = await decideImageRequest(req.url());
    if (decision === 'abort') {
      try {
        const u = new URL(req.url());
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          console.warn('⚠️ 拦截图片请求(SSRF/白名单):', u.hostname);
        } else {
          console.warn('⚠️ 拦截非 http(s) 图片请求:', u.protocol);
        }
      } catch {
        console.warn('⚠️ 拦截非法图片请求URL:', String(req.url()).slice(0, 80));
      }
      safeAbort();
    } else {
      safeContinue();
    }
  } catch (err) {
    // 兜底：任何异常都尝试继续请求，避免整页请求挂起导致截图失败
    try { safeContinue(); } catch {}
  }
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
/**
 * 为聊天中的每个用户生成 DiceBear 头像
 *
 * 支持两种调用方式：
 *   1) generateAvatars(chatText, style, styleMap)  — 传入完整文本，内部自动 extractUserNames
 *   2) generateAvatars(names[], style, styleMap)    — 传入已提取的名字数组（names 必须是 string[]）
 *
 * @param {string|string[]} chatTextOrNames 聊天文本 或 预提取的用户名数组
 * @param {string} [defaultStyle]            头如 'avataaars'（不传则返回空 Map）
 * @param {object} [styleMap]                 按名字指定风格 { '张三': 'bottts' }
 */
async function generateAvatars(chatTextOrNames, defaultStyle, styleMap) {
  if (!defaultStyle && !styleMap) return new Map();

  // 兼容两种输入：字符串(文本) 或 数组(已提取的名字)
  let names;
  if (Array.isArray(chatTextOrNames)) {
    names = [...new Set(chatTextOrNames.filter(n => typeof n === 'string' && n.trim()))];
  } else {
    names = extractUserNames(String(chatTextOrNames || ''));
  }
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
  const log = (...args) => (opts.verbose && !opts.silent) && console.log('[LOG]', ...args);
  // silent 模式下用 info() 输出关键信息，verbose 用 log()
  const info = (...args) => !opts.silent && console.log(...args);

  if (!opts.silent) console.log('🚀 微信截图王 v4.0...');
  
  // 预处理：为 [图片] 填充随机URL
  let chatText = opts.chatText;
  const needsImageFill = /\[图片\](?!https?:\/\/)/.test(chatText);
  if (needsImageFill) {
    chatText = preprocessChatText(chatText);
    log(`已自动填充 ${((chatText.match(/\[图片\]https?:\/\//g) || []).length)} 个图片URL`);
  }
  
  info(`📝 聊天文本长度: ${chatText.length} 字符${needsImageFill ? ' (已自动填充图片)' : ''}`);
  info(`📸 模式: ${opts.long ? '长截图' : '普通截图'}`);
  info(`💬 群聊名称: ${opts.contact || '(默认)'}`);
  info(`🎨 头像: ${opts.avatarStyle || '跳过'}${opts.avatarMap ? ' + 按角色定制' : ''}`);

  // ── 预生成头像 ──
  const avatarMap = await generateAvatars(chatText, opts.avatarStyle, opts.avatarMap);

  // ── 启动浏览器 ──
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // ── SSRF 防护：浏览器侧请求拦截 ──
  // 拦截 headless Chromium 发起的所有请求，阻断对内网/环回/云元数据/非白名单地址的访问
  // （用户可在聊天文本写入 [图片]http://169.254.169.254/... 等触发 SSRF）。
  await page.setRequestInterception(true);
  page.on('request', onRequest);

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

    // ── Step 4.5: 直接修补渲染后的状态栏（时间/电量/信号/网络）──
    log('修补状态栏 (时间/电量/信号/网络)...');
    await patchStatusBar(page, opts);

    // ── Step 4.6: 修补气泡左右分布（外网第三方解析器默认把所有人放右侧）──
    // 通过 --other-side 指定"他人"姓名（支持多个，逗号分隔），将他们的气泡强制搬回左侧
    if (opts.otherSide) {
      log('修补气泡左右分布...');
      const msgs = parseMessages(chatText);
      const speakers = msgs.map((m) => m.speaker);
      await patchBubbleSides(page, opts.otherSide, speakers, avatarMap);
    }

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

      // ── v3.3: Twemoji 真实渲染 ──
      // 把文本中的 emoji 替换为 Twemoji CDN 的 SVG <img> 标签
      // 比文字替换 ([笑哭]) 更美观，html-to-image 对 <img> 支持好
      let fixedEmoji = 0;

      function twemojiReplacer(match) {
        // 提取第一个 codepoint 作为文件名
        const cp = match.codePointAt(0);
        if (!cp) return match;
        const hex = cp.toString(16);
        // 跳过 ASCII 范围的非 emoji
        if (cp < 256) return match;
        // 使用 Twemoji SVG CDN
        return `<img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${hex}.svg"
          alt="${match}" style="width:1.25em;height:1.25em;display:inline-block;vertical-align:-0.25em;">`;
      }

      // emoji 范围的正则 (覆盖大部分常用 emoji)
      // U+1F000-U+1FFFF, U+2600-U+27BF, U+2300-U+23FF, U+2B50, U+2700-U+27BF, U+FE4E5-U+FE4EE 等
      const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{FE4E5}-\u{FE4EE}\u{3297}\u{3299}\u{3030}\u{303D}\u{00A9}\u{00AE}\u{2122}\u{2139}\u{2328}\u{23CF}\u{24C2}\u{25AA}-\u{25FE}\u{260E}\u{2614}\u{2615}\u{2618}\u{261D}\u{2620}\u{2622}\u{2623}\u{2626}\u{262A}\u{262E}\u{262F}\u{2638}-\u{263A}\u{2640}\u{2642}\u{2648}-\u{2653}\u{265F}\u{2660}\u{2663}\u{2665}\u{2666}\u{2668}\u{267B}\u{267E}\u{267F}\u{2692}-\u{2697}\u{2699}\u{269B}\u{269C}\u{26A0}\u{26A1}\u{26A7}\u{26AA}\u{26AB}\u{26B0}\u{26B1}\u{26BD}\u{26BE}\u{26C4}\u{26C5}\u{26C8}\u{26CE}\u{26CF}\u{26D1}\u{26D3}\u{26D4}\u{26E9}\u{26EA}\u{26F0}-\u{26F5}\u{26F7}-\u{26FA}\u{26FD}]+/gu;

      document.querySelectorAll('.wc-bubble').forEach(bubble => {
        // 遍历所有裸 span 文本节点（不在 .wc-rp-icon 内）
        const spans = bubble.querySelectorAll('span');
        for (const span of spans) {
          // 跳过红包/转账相关的特殊元素
          if (span.closest('.wc-rp-icon') || span.closest('.wc-rp-content') ||
              span.closest('.wc-rp-bottom') || span.closest('.wc-rp-info')) continue;
          
          const html = span.innerHTML;
          if (!html || span.querySelector('*')) continue; // 跳过有子元素的

          // 检测是否含 emoji
          if (EMOJI_RE.test(html)) {
            EMOJI_RE.lastIndex = 0; // reset regex state
            const newHtml = html.replace(EMOJI_RE, twemojiReplacer);
            if (newHtml !== html) {
              span.innerHTML = newHtml;
              fixedEmoji++;
            }
          }
        }
      });

      return { fixedRp, fixedTf, fixedEmoji };
    }).then(r => {
      log(`图标注入: 红包=${r.fixedRp}, 转账=${r.fixedTf}, emoji(Twemoji)=${r.fixedEmoji || 0}`);
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

    info(`\n✅ 截图已保存: ${opts.output}`);
    info(`📐 尺寸: ${canvasResult.width}×${canvasResult.height}`);
    info(`📏 文件大小: ${(fs.statSync(opts.output).size / 1024).toFixed(1)} KB`);
    if (avatarMap.size > 0) {
      info(`👤 已为 ${avatarMap.size} 个用户生成专属头像 (PNG格式)`);
    }
    info(`🔧 红包/转账图标: SVG ✅`);
    info(`🖼️  图片消息: ${needsImageFill ? '自动填充随机图 ✅' : '指定URL ✅'}`);

    // ── Step 9.5: 同步到腾讯文档 ──
    if (opts.syncTencentDocs) {
      try {
        const { syncToTencentDocs } = require('./lib/sync-tencent-docs.js');
        const sr = await syncToTencentDocs({
          pngPath: opts.output,
          transcript: chatText,
          title: opts.contact || '微信聊天截图',
          contact: opts.contact,
        });
        if (sr.ok) {
          info(`\n☁️  腾讯文档同步: ${sr.mode === 'cloud' ? '已推送云端' : '已生成导入就绪文档'}`);
          info(`   📄 payload: ${sr.target}`);
          info(`   ℹ️  ${sr.message}`);
          if (sr.mode !== 'cloud') {
            info(`   💡 连接腾讯文档连接器（左侧面板一键授权）后重跑本命令即可自动推送云端。`);
          }
        } else {
          info(`\n⚠️  腾讯文档同步未完成: ${sr.message}`);
        }
      } catch (e) {
        info(`\n⚠️  腾讯文档同步异常: ${e.message}`);
      }
    }

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
//  当前时间 HH:MM（用于状态栏默认时间）
// ═══════════════════════════════════════════
function getCurrentHHMM() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ═══════════════════════════════════════════
//  直接修补渲染后的状态栏 DOM
//  绕过网页自身的事件绑定，确保时间/电量/信号/网络类型
//  一定生效（旧 applySettings 依赖的表单控件在改版后不稳定）
// ═══════════════════════════════════════════
async function patchStatusBar(page, opts) {
  const network = netSafe(opts.network);
  await page.evaluate((settings) => {
    const time = settings.time || '';
    const battery = Math.max(0, Math.min(100, Number(settings.battery) || 60));
    const signal = Math.max(0, Math.min(4, Number(settings.signal) || 4));
    const net = (settings.network || 'wifi').toLowerCase();

    // 1) 时间
    const timeEl = document.querySelector('.wc-time');
    if (timeEl && time) timeEl.textContent = time;

    // 2) 电量（视觉条 + 百分比文本）
    const batteryEl = document.querySelector('.wc-battery-inner');
    if (batteryEl) batteryEl.style.width = battery + '%';
    // 电量百分比文本：状态栏里匹配纯数字的文本节点
    const statusBar = document.querySelector('.wc-status-bar');
    if (statusBar) {
      const walker = document.createTreeWalker(statusBar, NodeFilter.SHOW_TEXT, null);
      while (walker.nextNode()) {
        if (/^\d{1,3}$/.test(walker.currentNode.textContent.trim())) {
          walker.currentNode.textContent = String(battery);
          break;
        }
      }
    }

    // 3) 信号格（4 个 rect，按 x 升序；左侧(矮)的 signal 个为高亮）
    const group = document.querySelector('.wc-signal-group');
    if (group) {
      const svg = group.querySelector('svg');
      if (svg) {
        const rects = Array.from(svg.querySelectorAll('rect'))
          .sort((a, b) => parseFloat(a.getAttribute('x')) - parseFloat(b.getAttribute('x')));
        const activeCount = Math.max(0, Math.min(rects.length, signal));
        rects.forEach((r, idx) => {
          const active = idx < activeCount;
          r.setAttribute('fill', active ? '#000' : '#c8c8c8');
        });
      }

      // 4) 网络类型：wifi 保留弧形 svg；cellular 把 WiFi svg 换成 "5G" 文本
      const svgs = group.querySelectorAll('svg');
      if (net === 'cellular' && svgs.length >= 2) {
        const wifiSvg = svgs[1];
        const span = document.createElement('span');
        span.textContent = '5G';
        span.style.cssText = 'font-size:15px;font-weight:700;color:#000;' +
          'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;margin-left:1px;';
        if (wifiSvg.parentNode) wifiSvg.parentNode.replaceChild(span, wifiSvg);
      }
    }
  }, { time: opts.time, battery: opts.battery, signal: opts.signal, network });
  await new Promise(r => setTimeout(r, 300));
}

function netSafe(v) {
  return (v || 'wifi').toLowerCase() === 'cellular' ? 'cellular' : 'wifi';
}

/**
 * 解析 --other-side 字符串：支持 "姓名1,姓名2,姓名3" 或单名
 * 用于告诉 patchBubbleSides 哪些名字应该出现在左侧
 */
function parseOtherSideList(v) {
  if (!v) return [];
  return String(v)
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 解析聊天文本为消息序列 [{speaker, text}]，用于按「说话人」而非「文本」判定左右
 * 跳过时间节点行（**【...】**）
 */
function parseMessages(chatText) {
  const lines = String(chatText || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const msgs = [];
  const re = /^\*\*([^*]+)\*\*\s*[:：]\s*(.*)$/;
  for (const line of lines) {
    if (/^\*\*【.*】\*\*$/.test(line)) continue; // 时间节点
    const m = line.match(re);
    if (m) {
      msgs.push({ speaker: m[1].trim(), text: m[2].trim() });
    } else {
      msgs.push({ speaker: null, text: line });
    }
  }
  return msgs;
}

/**
 * 修补气泡左右分布 + 统一头像 + 修复箭头颜色
 *
 * 第三方页面 gaopengbin/wechat-dialog-generator 把每条消息都按「自己」渲染
 * （右对齐 + 绿色气泡 rgb(149,236,105) + 无头像），故渲染后气泡内无说话人名字，
 * 只能用「第 i 个气泡 ↔ 第 i 条消息的说话人」逐一匹配归属。
 *
 * 本函数统一处理「自己」与「他人」两侧：
 *  - 自己：右对齐 + 绿色气泡 + 绿色箭头 + 头像在右
 *  - 他人：左对齐 + 白色气泡 + 白色箭头 + 头像在左
 *  - 两侧均注入各自 DiceBear 头像（seed=说话人名字，确保不同人头像不同），统一尺寸
 *
 * @param {object} page          puppeteer page
 * @param {string} otherSideSpec --other-side 值，逗号分隔的他人姓名
 * @param {string[]} speakers    与 .wc-bubble 顺序一致的说话人序列
 * @param {Map}    avatarMap     generateAvatars 返回的 姓名->dataUri
 */
async function patchBubbleSides(page, otherSideSpec, speakers, avatarMap) {
  const others = parseOtherSideList(otherSideSpec);
  if (!speakers || speakers.length === 0) return;

  // 取出【所有说话人】的头像（不仅是 others），确保「我」和「他人」都用各自 seed 的头像
  const avatarData = {};
  if (avatarMap && typeof avatarMap.get === 'function') {
    speakers.forEach((name) => {
      const d = avatarMap.get(name);
      if (d) avatarData[name] = d;
    });
  }

  const SELF_GREEN = 'rgb(149, 236, 105)';
  const AV_SIZE = 40;

  await page.evaluate(({ others, speakers, avatarData, SELF_GREEN, AV_SIZE }) => {
    const injectAvatar = (body, dataUri, side) => {
      if (!dataUri) return;
      let img = body.querySelector('img.avatar-injected');
      if (!img) {
        img = document.createElement('img');
        img.className = 'avatar-injected';
        img.style.width = AV_SIZE + 'px';
        img.style.height = AV_SIZE + 'px';
        img.style.flex = '0 0 ' + AV_SIZE + 'px';
        img.style.borderRadius = '6px';
        img.style.alignSelf = 'flex-start';
        img.style.objectFit = 'cover';
        img.style.display = 'block';
        if (side === 'left') {
          img.style.marginRight = '8px';
          body.insertBefore(img, body.firstChild);
        } else {
          img.style.marginLeft = '8px';
          body.appendChild(img);
        }
      }
      img.src = dataUri;
    };

    const bubbles = Array.from(document.querySelectorAll('.wc-bubble'));
    bubbles.forEach((bubble, i) => {
      const speaker = speakers[i];
      const isOther = speaker && others.includes(speaker);
      const body = bubble.closest('.wc-body') || bubble.parentElement;
      if (!body) return;
      // 让 body 成为横向 flex 容器：头像 + 气泡 并排
      body.style.display = 'flex';
      body.style.flexDirection = 'row';
      const arrow = bubble.querySelector('.wc-arrow');

      if (isOther) {
        // 他人：左对齐 + 白色气泡 + 白色箭头(翻转) + 头像在左
        body.style.width = 'fit-content';
        body.style.maxWidth = '85%';
        body.style.marginLeft = '12px';
        body.style.marginRight = 'auto';
        body.style.alignItems = 'flex-start';
        bubble.style.background = '#ffffff';
        bubble.style.color = '#1a1a1a';
        bubble.style.marginLeft = '8px';
        bubble.style.marginRight = '0';
        if (arrow) {
          // 箭头是 24x24 绿色方块旋转 45° 的菱形；他人侧翻白 + 镜像 + 改挂左侧
          arrow.style.background = '#ffffff';
          arrow.style.borderColor = '#ffffff';
          arrow.style.right = 'auto';
          arrow.style.left = '-10px';
          arrow.style.transform = 'rotate(45deg) scaleX(-1)';
        }
        injectAvatar(body, avatarData[speaker], 'left');
      } else {
        // 自己：右对齐 + 绿色气泡 + 绿色箭头 + 头像在右
        body.style.width = 'fit-content';
        body.style.maxWidth = '85%';
        body.style.marginLeft = 'auto';
        body.style.marginRight = '12px';
        body.style.alignItems = 'flex-end';
        bubble.style.background = SELF_GREEN;
        bubble.style.color = '#1a1a1a';
        bubble.style.marginLeft = '0';
        bubble.style.marginRight = '8px';
        if (arrow) {
          // 保留原始 45° 旋转，仅改色，挂右侧
          arrow.style.background = SELF_GREEN;
          arrow.style.borderColor = SELF_GREEN;
          arrow.style.left = 'auto';
          arrow.style.right = '-10px';
          arrow.style.transform = 'rotate(45deg)';
        }
        injectAvatar(body, avatarData[speaker], 'right');
      }
    });
  }, { others, speakers, avatarData, SELF_GREEN, AV_SIZE });

  await new Promise((r) => setTimeout(r, 300));
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
if (require.main === module) {
  main().catch(err => {
    console.error('❌ 未捕获错误:', err.message);
    process.exit(1);
  });
}

// 导出纯函数供测试（test/ssrf-policy.test.js）注入假 DNS 解析器做独立验证；
// 不影响 auto.js 通过子进程调用本文件（CLI 入口仍由 require.main === module 守卫）。
// 另导出 patchBubbleSides / generateAvatars / parseMessages 供 test/verify-render.js 在真实页面上做渲染校验。
module.exports = { decideImageRequest, onRequest, patchBubbleSides, generateAvatars, parseMessages };
