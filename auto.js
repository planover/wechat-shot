#!/usr/bin/env node
/**
 * 微信截图王 v4.4.2 — 智能全流程自动化（含 --llm 大模型生成）
 *
 * 用法:
 *   node auto.js --image ./photo.png              # 图片OCR → 扩展 → 确认 → 截图 → 记录
 *   node auto.js --text "清朝地主为什么不进口黑奴"  # 文字描述 → 扩展 → 确认 → 截图 → 记录
 *   node auto.js --text "..." --yes                # 跳过确认，直接生成
 *   node auto.js --image ./photo.png --no-record   # 不写Excel记录
 *
 * 流程:
 *   Step 0: 读取输入（图片路径 或 文字描述）
 *   Step 1: 图片 → OCR 提取文字 / 文字 → 直接作为场景描述
 *   Step 2: 生成微信聊天文本（--llm 调大模型 / 否则模板引擎 / 或聊天记录透传）
 *   Step 3: 展示聊天文本，等待用户确认
 *   Step 4: 确认后调用 index.js 生成长截图
 *   Step 5: 写入本地 Excel (wechat-shot-records.xlsx)
 *   Step 6: 输出腾讯文档同步指令
 */

const { expandToChat, looksLikeChat, humanize } = require('./lib/expand');
const { generateChatViaLLM, escapeHtml, applyComplianceFilter } = require('./lib/llm');
const { addRecord, syncToTencentDocs } = require('./lib/record');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// ═══════════════════════════════════════════
//  参数解析
// ═══════════════════════════════════════════
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    image: null,
    text: null,
    output: null,
    yes: false,
    noConfirm: false,
    noRecord: false,
    verbose: false,
    contact: '',
    time: null,
    battery: undefined,
    signal: undefined,
    network: 'wifi',
    syncTencentDocs: false,
    avatarStyle: 'avataaars',
    realism: 0.7,
    scene: null,
    llm: false,
    llmProvider: 'openai',
    llmModel: null,
    llmTemperature: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case '--image': opts.image = next; i++; break;
      case '--text': opts.text = next; i++; break;
      case '--output': case '-o': opts.output = next; i++; break;
      case '--yes': case '-y': opts.yes = true; break;
      case '--no-confirm': opts.noConfirm = true; break;
      case '--no-record': opts.noRecord = true; break;
      case '--verbose': case '-v': opts.verbose = true; break;
      case '--contact': opts.contact = next; i++; break;
      case '--time': opts.time = next; i++; break;
      case '--battery': opts.battery = parseInt(next, 10); i++; break;
      case '--signal': opts.signal = parseInt(next, 10); i++; break;
      case '--network': opts.network = (next || 'wifi').toLowerCase(); i++; break;
      case '--sync-tencent-docs': opts.syncTencentDocs = true; break;
      case '--avatar-style': opts.avatarStyle = next; i++; break;
      case '--realism': opts.realism = parseFloat(next); i++; break;
      case '--scene': opts.scene = next; i++; break;
      case '--natural': case '--deai': opts.realism = 0.85; break;
      case '--llm': opts.llm = true; break;
      case '--llm-provider': opts.llmProvider = next; i++; break;
      case '--llm-model': opts.llmModel = next; i++; break;
      case '--llm-temperature': opts.llmTemperature = parseFloat(next); i++; break;
      case '--help': case '-h': printHelp(); process.exit(0);
    }
  }

  if (!opts.image && !opts.text) {
    console.error('❌ 请提供 --image 或 --text 参数');
    console.error('   node auto.js --image ./photo.png');
    console.error('   node auto.js --text "场景描述"');
    console.error('   node auto.js --help 查看帮助');
    process.exit(1);
  }

  return opts;
}

function printHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║       微信截图王 v4.4.2 — 智能全流程自动化 (Auto)          ║
╚══════════════════════════════════════════════════════════╝

用法: node auto.js [选项]

输入方式（二选一）:
  --image <path>        图片文件路径（自动OCR识别）
  --text <string>       文字场景描述；或已经写好的聊天记录（含 **姓名**：格式时直接采用）

选项:
  -o, --output <path>   截图输出路径
  -y, --yes             自动确认，跳过交互
  --no-confirm          不显示确认提示，直接生成
  --no-record           不写入 Excel 记录
  --contact <name>      群聊名称（自动推断时可不填）
  --time <HH:MM>        手机时间（默认当前真实时间，不再卡 12:02）
  --battery <0-100>     电量百分比（默认 60）
  --signal <1-4>        信号格数（默认 4）
  --network <wifi|cellular>  状态栏网络类型：wifi(默认) 或 蜂窝数据(显示 5G)
  --avatar-style <style> 头像风格（默认 avataaars）
  --realism <0-1>       自然度 0=干净 1=很随意（默认 0.7）
  --natural / --deai    等价于 --realism 0.85，最大化"去AI味"
  --scene <key>         强制场景: daily/funny/work/tech/finance/academic/history/zhihu
  --llm               启用大模型生成对话（需 LLM_API_KEY，缺失则自动回退模板）
  --llm-model <m>     覆盖模型（默认读环境变量 LLM_MODEL，否则 gpt-4o-mini）
  --llm-temperature <0-1> 覆盖采样温度（默认 0.9，越高越发散）
  --llm-provider <p>  预留字段（默认 openai；使用 OpenAI 兼容 /chat/completions 接口）
  -v, --verbose         显示详细日志
  -h, --help            显示帮助

示例:
  # 从图片生成（去AI味）
  node auto.js --image ./screenshot.png --deai

  # 从文字描述生成
  node auto.js --text "知乎上有一个离谱的历史回答"

  # 指定场景 + 高自然度
  node auto.js --text "老板在群里发火" --scene work --realism 0.9

  # 直接给一段写好的聊天记录，仅做人味润色
  node auto.js --text "$(cat chat.txt)" --yes

  # 调用大模型生成"以假乱真"的对话（需先 export LLM_API_KEY=...）
  export LLM_API_KEY=sk-xxx
  node auto.js --text "我妈看到我买的两千块的羽绒服直接沉默了" --llm --scene daily --deai
  node auto.js --text "老板在群里发火说要裁员" --llm --llm-model gpt-4o --scene work
`);
}

// ═══════════════════════════════════════════
//  交互确认
// ═══════════════════════════════════════════
function askUser(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes' || answer.trim() === '');
    });
  });
}

// ═══════════════════════════════════════════
//  OCR 识别（调用 tencentcloud-ocr skill 的 scripts/main.py）
// ═══════════════════════════════════════════
// 定位 tencentcloud-ocr 技能的 main.py：向上一层即 <skills> 目录，按 SKILL.md 内容识别，避免写死技能 ID
function findOcrMainPy() {
  const skillsDir = path.join(__dirname, '..');
  const known = path.join(skillsDir, 'skill_2059984237344256000', 'scripts', 'main.py');
  if (fs.existsSync(known)) return known;
  try {
    for (const name of fs.readdirSync(skillsDir)) {
      const py = path.join(skillsDir, name, 'scripts', 'main.py');
      if (!fs.existsSync(py)) continue;
      const sk = path.join(skillsDir, name, 'SKILL.md');
      if (fs.existsSync(sk) && /tencentcloud-ocr|通用文字识别|GeneralAccurateOCR/i.test(fs.readFileSync(sk, 'utf-8'))) {
        return py;
      }
    }
  } catch { /* ignore */ }
  return null;
}

// ═══════════════════════════════════════════
//  PaddleOCR 本地识别（无需密钥，纯本地推理）
// ═══════════════════════════════════════════
// 定位 venv python（优先 managed venv，其次系统 python）
function findPaddleOcrPython() {
  // 1. managed venv
  const venvPy = path.join(os.homedir(), '.workbuddy', 'binaries', 'python', 'envs', 'default', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPy)) return venvPy;
  // 2. 系统 python（用户可能全局装了 paddleocr）
  const sysBin = process.platform === 'win32' ? 'python' : 'python3';
  try {
    execSync(`"${sysBin}" -c "import paddleocr"`, { stdio: 'pipe', timeout: 5000 });
    return sysBin;
  } catch { /* not installed globally */ }
  return null;
}

// 调用 scripts/paddle_ocr.py 做本地 OCR
function tryPaddleOcr(imagePath) {
  const pyBin = findPaddleOcrPython();
  if (!pyBin) return null;
  const script = path.join(__dirname, 'scripts', 'paddle_ocr.py');
  if (!fs.existsSync(script)) return null;
  try {
    const result = execSync(`"${pyBin}" "${script}" --image "${imagePath}"`, {
      encoding: 'utf-8',
      timeout: 120000, // 首次运行需下载模型，给足时间
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024,
    });
    const parsed = JSON.parse(result);
    const text = (parsed.raw_text || '').trim();
    if (text) return text;
    console.warn('⚠️ PaddleOCR 返回为空（图片中可能没有文字）');
  } catch (e) {
    console.warn(`⚠️ PaddleOCR 执行失败: ${e.message}`);
  }
  return null;
}

async function ocrImage(imagePath) {
  console.log('🔍 正在进行 OCR 识别...');

  if (!fs.existsSync(imagePath)) {
    throw new Error(`图片文件不存在: ${imagePath}`);
  }

  try {
    const ocrPy = findOcrMainPy();
    const hasKeys = process.env.TENCENTCLOUD_SECRET_ID && process.env.TENCENTCLOUD_SECRET_KEY;
    const pyBin = process.platform === 'win32' ? 'python' : 'python3';

    // 仅当技能存在且已配置腾讯云密钥时才真正调用 OCR
    if (ocrPy && hasKeys) {
      const result = execSync(`"${pyBin}" "${ocrPy}" --image-base64 "${imagePath}"`, {
        encoding: 'utf-8',
        timeout: 90000,
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
      });
      try {
        const parsed = JSON.parse(result);
        const text = (parsed.raw_text || parsed.text || parsed.content || '').trim();
        if (text) return text;
        console.warn('⚠️ OCR 返回为空（图片中可能没有文字）');
      } catch {
        if (result.trim()) return result.trim();
      }
    } else if (ocrPy && !hasKeys) {
      console.warn('⚠️ 未配置 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY，跳过 OCR');
    }
  } catch (e) {
    console.warn(`⚠️ OCR 执行失败: ${e.message}`);
  }

  // ── 第二优先级：PaddleOCR 本地识别（无需密钥）──
  console.log('🔄 尝试 PaddleOCR 本地识别...');
  const paddleText = tryPaddleOcr(imagePath);
  if (paddleText) {
    console.log('✅ PaddleOCR 识别成功');
    return paddleText;
  }

  // ── 回落：未安装 OCR 技能 / 缺少密钥 / 执行失败 ──
  console.log('');
  console.log('🔴 OCR 未启用：未找到 tencentcloud-ocr 技能或缺少密钥，已改用「通用随机话题」生成。');
  console.log('   ⚠️ 生成内容仅风格/场景相关，与图片本身无关。');
  console.log('   💡 如需贴合图片，请用 --text "图片里的文字或描述" 手动输入。');
  console.log('');
  return `[图片: ${path.basename(imagePath)}]`;
}

// ═══════════════════════════════════════════
//  对已写好的聊天记录做轻度人味润色（保留原意）
// ═══════════════════════════════════════════
function humanizeChat(text, realism) {
  return text.split('\n').map((line) => {
    const m = line.match(/^(\s*\*?\*?.+?\*?\*?\s*[：:])\s*(.*)$/);
    if (m && m[2]) {
      return `${m[1]} ${humanize(m[2].trim(), Math.random, realism)}`;
    }
    return line;
  }).join('\n');
}

// ═══════════════════════════════════════════
//  生成长截图（调用 index.js）
// ═══════════════════════════════════════════
async function generateScreenshot(chatText, opts) {
  console.log('\n📸 正在生成长截图...');
  
  // 写入临时文件
  const tmpFile = path.join(process.cwd(), '.wechat-chat-tmp.txt');
  fs.writeFileSync(tmpFile, chatText, 'utf-8');
  
  // 确定输出路径
  const outputPath = opts.output || path.join(
    fs.existsSync('/workspace') ? '/workspace' : process.cwd(),
    `微信聊天记录_长截图_${Date.now()}.png`
  );
  
  // 构建 index.js 参数
  const indexArgs = [
    '--input', tmpFile,
    '--long',
    '--output', outputPath,
    '--avatar-style', opts.avatarStyle,
    '--silent',
  ];
  
  if (opts.contact) {
    indexArgs.push('--contact', opts.contact);
  }
  if (opts.time) {
    indexArgs.push('--time', opts.time);
  }
  if (opts.battery !== undefined && !isNaN(opts.battery)) {
    indexArgs.push('--battery', String(opts.battery));
  }
  if (opts.signal !== undefined && !isNaN(opts.signal)) {
    indexArgs.push('--signal', String(opts.signal));
  }
  if (opts.network) {
    indexArgs.push('--network', opts.network);
  }
  if (opts.syncTencentDocs) {
    indexArgs.push('--sync-tencent-docs');
  }

  // 调用 index.js
  const indexScript = path.join(__dirname, 'index.js');
  
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [indexScript, ...indexArgs], {
      stdio: opts.verbose ? 'inherit' : ['pipe', 'pipe', 'pipe'],
    });
    
    let stdout = '';
    let stderr = '';
    
    if (!opts.verbose) {
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
    }
    
    proc.on('close', (code) => {
      // 清理临时文件
      try { fs.unlinkSync(tmpFile); } catch {}
      
      if (code === 0 && fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        console.log(`✅ 截图已生成: ${outputPath}`);
        console.log(`📐 尺寸: ${stat.size > 0 ? 'OK' : 'EMPTY'}`);
        console.log(`📏 文件大小: ${(stat.size / 1024).toFixed(1)} KB`);
        resolve(outputPath);
      } else {
        // 尝试从 stdout 中提取输出路径
        const match = stdout.match(/截图已保存:\s*(.+)/);
        if (match && fs.existsSync(match[1].trim())) {
          resolve(match[1].trim());
        } else {
          reject(new Error(`截图生成失败 (exit=${code}): ${stderr || stdout}`));
        }
      }
    });
    
    proc.on('error', (err) => {
      try { fs.unlinkSync(tmpFile); } catch {}
      reject(err);
    });
  });
}

// ═══════════════════════════════════════════
//  主流程
// ═══════════════════════════════════════════
async function main() {
  const opts = parseArgs();
  
  console.log('🚀 微信截图王 v4.4.2 — 智能全流程自动化');
  console.log('═'.repeat(50));
  
  // ── Step 0-1: 读取输入 ──
  let rawContent = '';
  let inputType = 'text';
  
  if (opts.image) {
    inputType = 'image';
    console.log(`📷 输入: 图片 → ${opts.image}`);
    rawContent = await ocrImage(opts.image);
    console.log(`📝 OCR 结果: ${rawContent.substring(0, 100)}${rawContent.length > 100 ? '...' : ''}`);
  } else if (opts.text) {
    inputType = 'text';
    console.log(`📝 输入: 文字描述 → "${opts.text.substring(0, 80)}${opts.text.length > 80 ? '...' : ''}"`);
    rawContent = opts.text;
  }
  
  // ── Step 2: 生成聊天文本 ──
  console.log('\n🎭 正在生成聊天场景...');
  let chatText;
  if (opts.llm) {
    // 大模型模式：直接请求 LLM 生成自然对话；失败/无 key 时自动回退模板
    console.log('🤖 启用大模型生成（--llm）');
    chatText = await generateChatViaLLM(rawContent, {
      realism: opts.realism,
      scene: opts.scene,
      model: opts.llmModel,
      temperature: opts.llmTemperature,
    });
  } else if (looksLikeChat(rawContent)) {
    // 已经是聊天记录：仅做轻度人味润色，保持原意
    console.log('🔎 检测到已有聊天记录，直接采用并轻度润色');
    chatText = humanizeChat(rawContent, opts.realism);
  } else {
    chatText = expandToChat(rawContent, { realism: opts.realism, scene: opts.scene });
  }
  console.log(`🪄 自然度 realism=${opts.realism}${opts.llm ? ' · 来源=大模型' : ''}`);

  // ── 统一合规出口（上线阻断级）──
  // 单点过滤：用户 --text / OCR 原文 / 模板 / LLM 输出 全部经此处后再展示/渲染/持久化/外发，
  // 保证"任何不当内容都不持久化(Excel)或外发(腾讯文档同步)"，且覆盖 XSS 转义前的所有来源。
  const rc = applyComplianceFilter(rawContent);
  rawContent = rc.ok ? rc.text : '[用户输入含受限内容，已过滤]';
  const cc = applyComplianceFilter(chatText);
  if (!cc.ok) {
    console.warn(`⚠️ 聊天内容命中安全词(${cc.reason})，回退模板生成`);
    chatText = expandToChat(rawContent, { realism: opts.realism, scene: opts.scene });
  } else {
    chatText = cc.text;
  }
  
  // ── Step 3: 展示并确认 ──
  console.log('\n' + '─'.repeat(50));
  console.log('📝 生成的聊天内容:');
  console.log('─'.repeat(50));
  console.log(chatText);
  console.log('─'.repeat(50));
  
  if (!opts.yes && !opts.noConfirm) {
    const confirmed = await askUser('\n✅ 确认生成截图？(Y/n) ');
    if (!confirmed) {
      console.log('❌ 已取消');
      process.exit(0);
    }
  }
  
  // ── Step 4: 生成长截图 ──
  // 渲染前对聊天文本做 HTML 转义，杜绝 index.js 渲染期 innerHTML 注入（XSS，防 <img onerror=...>）
  let outputPath;
  try {
    outputPath = await generateScreenshot(escapeHtml(chatText), opts);
  } catch (err) {
    console.error(`❌ 截图失败: ${err.message}`);
    process.exit(1);
  }
  
  // ── Step 5: 写入 Excel 记录 ──
  if (!opts.noRecord) {
    console.log('\n📊 正在写入记录...');
    try {
      const rowNum = addRecord({
        date: new Date(),
        inputType,
        rawContent,
        chatText,
        screenshotPath: outputPath,
      });
      console.log(`✅ 记录已写入第 ${rowNum} 行`);
    } catch (err) {
      console.warn(`⚠️ Excel 写入失败: ${err.message}`);
    }
    
    // ── Step 6: 腾讯文档同步指令 ──
    try {
      const syncResult = await syncToTencentDocs({
        date: new Date(),
        inputType,
        rawContent,
        chatText,
        screenshotPath: outputPath,
      });
      
      if (syncResult.needsSync) {
        console.log('\n📋 腾讯文档同步指令:');
        console.log(`   表格名: ${syncResult.tableName}`);
        console.log(`   请使用 tencent-docs MCP 同步以下记录:`);
        console.log(`   - 日期时间: ${syncResult.record['日期时间']}`);
        console.log(`   - 输入类型: ${syncResult.record['输入类型']}`);
        console.log(`   - 输入内容: ${syncResult.record['输入原始内容'].substring(0, 50)}...`);
        console.log(`   - 截图路径: ${syncResult.record['截图路径']}`);
      }
    } catch (err) {
      // 腾讯文档同步失败不影响主流程
      if (opts.verbose) console.warn(`⚠️ 腾讯文档同步: ${err.message}`);
    }
  }
  
  console.log('\n' + '═'.repeat(50));
  console.log('🎉 全流程完成!');
  console.log(`📸 截图: ${outputPath}`);
  if (!opts.noRecord) {
    console.log(`📊 记录: ${path.join(process.cwd(), 'wechat-shot-records.xlsx')}`);
  }
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
    console.error(err.stack);
  }
  process.exit(1);
});
