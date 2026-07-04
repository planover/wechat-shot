#!/usr/bin/env node
/**
 * 微信截图王 v4.0 — 智能全流程自动化
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
 *   Step 2: 场景扩展 → 生成微信聊天文本
 *   Step 3: 展示聊天文本，等待用户确认
 *   Step 4: 确认后调用 index.js 生成长截图
 *   Step 5: 写入本地 Excel (wechat-shot-records.xlsx)
 *   Step 6: 输出腾讯文档同步指令
 */

const { expandToChat } = require('./lib/expand');
const { addRecord, syncToTencentDocs } = require('./lib/record');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
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
    avatarStyle: 'avataaars',
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
      case '--avatar-style': opts.avatarStyle = next; i++; break;
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
║       微信截图王 v4.0 — 智能全流程自动化 (Auto)          ║
╚══════════════════════════════════════════════════════════╝

用法: node auto.js [选项]

输入方式（二选一）:
  --image <path>        图片文件路径（自动OCR识别）
  --text <string>       文字场景描述

选项:
  -o, --output <path>   截图输出路径
  -y, --yes             自动确认，跳过交互
  --no-confirm          不显示确认提示，直接生成
  --no-record           不写入 Excel 记录
  --contact <name>      群聊名称（自动推断时可不填）
  --time <HH:MM>        手机时间（自动随机时可不填）
  --avatar-style <style> 头像风格（默认 avataaars）
  -v, --verbose         显示详细日志
  -h, --help            显示帮助

示例:
  # 从图片生成
  node auto.js --image ./screenshot.png

  # 从文字描述生成
  node auto.js --text "知乎上有一个离谱的历史回答"

  # 跳过确认
  node auto.js --text "老板在群里发火" --yes

  # 自定义群名
  node auto.js --text "讨论项目方案" --contact "工作群(5)"
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
//  OCR 识别（调用 tencentcloud-ocr skill）
// ═══════════════════════════════════════════
async function ocrImage(imagePath) {
  console.log('🔍 正在进行 OCR 识别...');
  
  if (!fs.existsSync(imagePath)) {
    throw new Error(`图片文件不存在: ${imagePath}`);
  }

  try {
    // 尝试使用本地 OCR 脚本
    const ocrScript = path.join(__dirname, '..', '..', 'skill_2059984237344256000', 'ocr.js');
    
    if (fs.existsSync(ocrScript)) {
      const result = execSync(`node "${ocrScript}" "${imagePath}"`, {
        encoding: 'utf-8',
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      // 尝试解析 OCR 结果
      try {
        const parsed = JSON.parse(result);
        if (parsed.text) return parsed.text;
        if (parsed.content) return parsed.content;
        return result.trim();
      } catch {
        return result.trim();
      }
    }
    
    // 如果没有 OCR 脚本，尝试用简单的图片信息提取
    console.log('⚠️ OCR 脚本不可用，使用图片路径作为输入');
    return `[图片: ${path.basename(imagePath)}]`;
    
  } catch (err) {
    console.warn(`⚠️ OCR 识别失败: ${err.message}`);
    console.log('使用图片文件名作为场景描述');
    return `[图片: ${path.basename(imagePath)}]`;
  }
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
  
  console.log('🚀 微信截图王 v4.0 — 智能全流程自动化');
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
  
  // ── Step 2: 场景扩展 → 生成聊天文本 ──
  console.log('\n🎭 正在生成聊天场景...');
  const chatText = expandToChat(rawContent);
  
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
  let outputPath;
  try {
    outputPath = await generateScreenshot(chatText, opts);
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
