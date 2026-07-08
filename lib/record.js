/**
 * 微信截图王 v4.0 — 记录模块
 *
 * 每次使用后自动记录到：
 * 1. 本地 Excel: ./wechat-shot-records.xlsx
 * 2. 腾讯文档智能表格: 同名 wechat-shot-records
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const RECORDS_FILE = path.join(process.cwd(), 'wechat-shot-records.xlsx');

// 列定义
//  日期时间        : 记录时间
//  输入类型        : 图片 / 音频 / 视频 / 文本 / 文件（用户【原始输入】的载体类型）
//  输入原始内容    : 用户【直接给的】原始输入（如"图片: xxx.png"或原始文本），未经识别
//  识别后内容      : 通过 OCR/语音识别/视频识别等方式从原始输入中识别出的文字内容
//  生成的聊天文本  : 最终渲染进截图的聊天文本
//  截图            : 生成的截图
const COLUMNS = ['日期时间', '输入类型', '输入原始内容', '识别后内容', '生成的聊天文本', '截图'];

// 输入类型 → 中文标签
function inputTypeLabel(t) {
  const map = { image: '图片', audio: '音频', video: '视频', text: '文本', file: '文件' };
  return map[t] || (typeof t === 'string' && t) || '文本';
}

// ═══════════════════════════════════════════
//  本地 Excel 操作
// ═══════════════════════════════════════════

/**
 * 读取或创建 Excel 工作簿
 */
function loadOrCreateWorkbook() {
  if (fs.existsSync(RECORDS_FILE)) {
    return XLSX.readFile(RECORDS_FILE);
  }
  
  // 创建新工作簿
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([COLUMNS]);
  
  // 设置列宽
  ws['!cols'] = [
    { wch: 20 },  // 日期时间
    { wch: 10 },  // 输入类型
    { wch: 40 },  // 输入原始内容
    { wch: 50 },  // 识别后内容
    { wch: 50 },  // 生成的聊天文本
    { wch: 30 },  // 截图
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, 'Records');
  return wb;
}

/**
 * 添加一条记录
 * @param {object} record
 * @param {Date}   record.date            记录时间
 * @param {string} record.inputType       'image'|'audio'|'video'|'text'|'file'（用户原始输入载体）
 * @param {string} record.rawInput        用户【直接给的】原始输入（图片文件名/音频/文本原文等），未经识别
 * @param {string} record.recognizedContent 经 OCR/识别 后得到的文字内容
 * @param {string} record.chatText        生成的聊天文本
 * @param {string} record.screenshotPath  截图文件路径
 */
function addRecord(record) {
  const wb = loadOrCreateWorkbook();
  const ws = wb.Sheets['Records'];
  
  // 获取当前行数
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:F1');
  const nextRow = range.e.r + 1;
  
  // 日期时间
  const dateStr = record.date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  
  XLSX.utils.sheet_add_aoa(ws, [[
    dateStr,
    inputTypeLabel(record.inputType),
    record.rawInput || '',
    record.recognizedContent || '',
    record.chatText || '',
    '', // 截图路径先写空，下面嵌入图片
  ]], { origin: -1 });
  
  // 嵌入截图图片到 F 列（第 6 列，索引 5）
  if (record.screenshotPath && fs.existsSync(record.screenshotPath)) {
    try {
      const imgBuf = fs.readFileSync(record.screenshotPath);
      const imgBase64 = imgBuf.toString('base64');
      const cellRef = XLSX.utils.encode_cell({ r: nextRow, c: 5 }); // F列
      
      // 设置行高来容纳图片（200pt ≈ 图片可见缩略图）
      if (!ws['!rows']) ws['!rows'] = [];
      ws['!rows'][nextRow] = { hpt: 200 };
      
      // 通过 !images 嵌入（使用 base64）
      if (!ws['!images']) ws['!images'] = [];
      
      ws['!images'].push({
        name: `screenshot_${nextRow}.png`,
        data: imgBase64,
        opts: { base64: true },
        position: {
          type: 'twoCellAnchor',
          attrs: { editAs: 'oneCell' },
          from: { col: 5, colOff: 0, row: nextRow, rowOff: 0 },
          to: { col: 6, colOff: 0, row: nextRow + 1, rowOff: 0 },
        },
      });
      
      // 在单元格中写文件名 + 路径
      ws[cellRef] = { t: 's', v: record.screenshotPath };
      
    } catch (err) {
      console.warn(`⚠️ 嵌入截图失败: ${err.message}`);
      // 降级：在单元格中写文件路径
      const cellRef = XLSX.utils.encode_cell({ r: nextRow, c: 5 });
      ws[cellRef] = { t: 's', v: record.screenshotPath };
    }
  }
  
  // 更新范围
  const newRange = XLSX.utils.decode_range(ws['!ref'] || 'A1:F1');
  newRange.e.r = nextRow;
  ws['!ref'] = XLSX.utils.encode_range(newRange);
  
  XLSX.writeFile(wb, RECORDS_FILE);
  console.log(`📊 记录已写入: ${RECORDS_FILE} (第 ${nextRow} 行)`);
  
  return nextRow;
}

/**
 * 列出所有记录
 */
function listRecords() {
  if (!fs.existsSync(RECORDS_FILE)) {
    console.log('📊 暂无记录文件');
    return [];
  }
  
  const wb = XLSX.readFile(RECORDS_FILE);
  const ws = wb.Sheets['Records'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  
  // 跳过表头
  return data.slice(1).map((row, i) => ({
    index: i + 1,
    date: row[0] || '',
    inputType: row[1] || '',
    rawInput: row[2] || '',
    recognizedContent: row[3] || '',
    chatText: row[4] || '',
    screenshot: row[5] || '',
  }));
}

// ═══════════════════════════════════════════
//  腾讯文档同步
// ═══════════════════════════════════════════

/**
 * 同步记录到腾讯文档智能表格
 *
 * 通过 tencent-docs MCP 的 smartsheet 能力实现。
 * 首次调用时创建同名智能表格，后续追加记录。
 *
 * 注意：此函数需要在支持 MCP 调用的环境中运行。
 * 在纯 Node.js 环境中，此函数返回一个待同步的指令。
 *
 * @returns {object} { synced: boolean, instruction: string }
 */
async function syncToTencentDocs(record) {
  // 返回同步指令，由上层（auto.js 或 AI agent）执行
  return {
    synced: false,
    needsSync: true,
    instruction: 'tencent_docs_sync',
    tableName: 'wechat-shot-records',
    record: {
      日期时间: record.date.toLocaleString('zh-CN'),
      输入类型: inputTypeLabel(record.inputType),
      输入原始内容: record.rawInput || '',
      识别后内容: record.recognizedContent || '',
      生成的聊天文本: record.chatText || '',
      截图路径: record.screenshotPath,
    },
  };
}

module.exports = {
  addRecord,
  listRecords,
  syncToTencentDocs,
  RECORDS_FILE,
  COLUMNS,
};
