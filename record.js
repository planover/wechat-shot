/**
 * 微信截图王 v4.0 — 记录模块
 *
 * 每次使用后自动记录到：
 * 1. 本地 Excel: ./wechat-shot-records.xlsx
 * 2. 腾讯文档在线表格: 同名 wechat-shot-records（Agent 调用 sheet 工具 find-or-create 并追加一行）
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const RECORDS_FILE = path.join(process.cwd(), 'wechat-shot-records.xlsx');

// 列定义
const COLUMNS = ['日期时间', '输入类型', '输入原始内容', '生成的聊天文本', '截图'];

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
    { wch: 50 },  // 输入原始内容
    { wch: 60 },  // 生成的聊天文本
    { wch: 30 },  // 截图
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, 'Records');
  return wb;
}

/**
 * 添加一条记录
 * @param {object} record
 * @param {Date} record.date
 * @param {string} record.inputType - 'image' | 'text'
 * @param {string} record.rawContent - 输入原始内容
 * @param {string} record.chatText - 生成的聊天文本
 * @param {string} record.screenshotPath - 截图文件路径
 */
function addRecord(record) {
  const wb = loadOrCreateWorkbook();
  const ws = wb.Sheets['Records'];
  
  // 获取当前行数
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:E1');
  const nextRow = range.e.r + 1;
  
  // 日期时间
  const dateStr = record.date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  
  XLSX.utils.sheet_add_aoa(ws, [[
    dateStr,
    record.inputType === 'image' ? '图片' : '文字',
    record.rawContent,
    record.chatText,
    '', // 截图路径先写空，下面嵌入图片
  ]], { origin: -1 });
  
  // 嵌入截图图片到 E 列
  if (record.screenshotPath && fs.existsSync(record.screenshotPath)) {
    try {
      const imgBuf = fs.readFileSync(record.screenshotPath);
      const imgBase64 = imgBuf.toString('base64');
      const cellRef = XLSX.utils.encode_cell({ r: nextRow, c: 4 }); // E列
      
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
          from: { col: 4, colOff: 0, row: nextRow, rowOff: 0 },
          to: { col: 5, colOff: 0, row: nextRow + 1, rowOff: 0 },
        },
      });
      
      // 在单元格中写文件名 + 路径
      ws[cellRef] = { t: 's', v: record.screenshotPath };
      
    } catch (err) {
      console.warn(`⚠️ 嵌入截图失败: ${err.message}`);
      // 降级：在单元格中写文件路径
      const cellRef = XLSX.utils.encode_cell({ r: nextRow, c: 4 });
      ws[cellRef] = { t: 's', v: record.screenshotPath };
    }
  }
  
  // 更新范围
  const newRange = XLSX.utils.decode_range(ws['!ref'] || 'A1:E1');
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
    rawContent: row[2] || '',
    chatText: row[3] || '',
    screenshot: row[4] || '',
  }));
}

// ═══════════════════════════════════════════
//  腾讯文档同步
// ═══════════════════════════════════════════

/**
 * 同步记录到腾讯文档在线表格
 *
 * 通过 tencent-docs MCP 的 sheet 能力实现：
 * Agent 先 find-or-create 名为 `wechat-shot-records` 的在线表格，
 * 写入表头（日期时间/输入类型/输入原始内容/生成的聊天文本/截图），
 * 再追加一行本记录。截图列填云端链接（或本地路径）。
 *
 * 注意：此函数运行在 Node 子进程中，无法直接调用 MCP 工具，
 * 因此返回一个待同步的指令，由上层（auto.js 或 AI agent）执行 sheet 工具调用。
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
      输入类型: record.inputType === 'image' ? '图片' : '文字',
      输入原始内容: record.rawContent,
      生成的聊天文本: record.chatText,
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
