/**
 * 端到端演示（重新梳理后的工作流）：
 *   1) index.js 渲染忠实聊天截图（朋友头像/箭头均已修复）
 *   2) record.js 写入本地 Excel（新增"识别后内容"列；"输入原始内容"=用户原始输入）
 *
 * 输入语义（按用户要求）：
 *   输入原始内容 = 用户直接给的图片（未经识别）
 *   识别后内容   = 经识别得到的文字内容
 *   生成的聊天文本 = 渲染进截图的聊天（忠实，不自由发挥）
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { addRecord } = require('../lib/record');

const skillDir = path.resolve(__dirname, '..');
const chatFile = path.join(__dirname, 'chat-final.txt');
const output = path.join(skillDir, '微信截图_面试文宣岗_最终.png');

// 1) 渲染截图
console.log('📸 渲染截图...');
const args = [
  'index.js', '--input', chatFile, '--long',
  '--output', output, '--avatar-style', 'avataaars',
  '--other-side', '康师傅', '--silent',
];
execFileSync('node', args, { cwd: skillDir, stdio: 'inherit' });

if (!fs.existsSync(output)) { console.error('❌ 截图未生成'); process.exit(1); }
console.log(`✅ 截图: ${output} (${(fs.statSync(output).size/1024).toFixed(1)} KB)`);

// 2) 写入本地 Excel（语义正确）
const recognized = '陪老板面试一个很重要的文宣岗位，小姑娘都挺好的，老板已经默认了。' +
  '见微知著，真招进来指不定能有多折腾。' +
  '结果结束的时候，小姑娘莫名其妙来了句"老天奶"，然后工作就没了。';
const chatText = fs.readFileSync(chatFile, 'utf-8');

const rowNum = addRecord({
  date: new Date(),
  inputType: 'image',
  rawInput: '图片: affd9233361db776c177cbc763d26daa.png（用户提供的"面试文宣岗位"吐槽截图）',
  recognizedContent: recognized,
  chatText,
  screenshotPath: output,
});
console.log(`✅ 本地 Excel 已写入第 ${rowNum} 行: ${require('../lib/record').RECORDS_FILE}`);
console.log('🎉 工作流完成');
