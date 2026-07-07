# wechat-shot v4.3 — 独立 QA 验证报告

- **验证人**：gstack-qa-lead（独立视角，未参与改动实现）
- **仓库**：`C:\Users\姓名\.workbuddy\skills\wechat-shot\`
- **日期**：2025-07-07
- **方法**：仅通过源码阅读 + 真实运行脚本验证，未调用任何 LLM API

## 结论总览

| 验证项 | 结论 | 关键证据 |
|--------|------|----------|
| ① 去重（CRITICAL-2 + MAJOR-4） | ✅ **GO** | 4000 个对话，0 处重复 |
| ② OCR 路径修复（CRITICAL-1） | ✅ **GO** | 解析路径 = 预期且 `fs.existsSync` 为真；OCR 输出契约 (`--image-base64` + `raw_text`) 与 `auto.js` 解析一致 |
| ③ P2 SSRF 白名单（复验） | ✅ **GO** | `test/ssrf-policy.test.js` 运行 **PASS 51 / FAIL 0**；`onRequest`/`decideImageRequest` 代码审查 7 项全过 |
| ④ 回归风险 | ✅ **GO** | 6 个模块 `node --check` 全 OK；`auto.js` 三条主路径（`--text/--image/--llm`）结构完整；`lib/llm.js` 关键导出均在 |

**总体：GO（可放行）。未发现阻断级缺陷。** 一项已知残余（SSRF DNS 重绑定的 TOCTOU）已在代码中显式标注为纵深防御，非阻断。

---

## ① 去重验证（必做 · 真实跑）

**脚本**：复刻任务给定片段，`realism:0.85`，覆盖 8 个场景，每场景 500 次（共 4000 个对话），对每个对话按 `**：` 切分消息内容并查重。

**实测数字**：
- 对话总数 = **4000**
- 单对话最大消息行数 = **19**（远低于任一语料池容量，兜底 `GENERIC_FILLERS` / 回退 `arr` 的极端分支在 4000 次内从未触发）
- 含重复的对话数 = **0**

```
RESULT: PASS (0 重复)
```

**代码核对（`lib/expand.js`）**：
- 新增 `pickUnique(rng, arr, used)`（L55-62）+ 共享 `used` 集合（L542，每次 `expandToChat` 调用内新建，不跨对话污染）。
- 所有 `emit*/open/question/comment/react/close/红包/转账/图片/语音` 均经 `pickUnique`；`emitShort` 复用 `SHORTS` 去重池。
- `GENERIC_FILLERS` 兜底池（L48-52）仅在所有专用池 + 兜底池均耗尽时才允许重复（`pickUnique` 末路 `avail = arr`，代码注释明确"极端情况"）。
- `zhihu` 场景各语料池已从 4~6 条扩到 8~12 条（open 11 / react 12 / question 11 / comment 11 / close 8），与 MAJOR-4 描述一致。

**结论**：GO。同一对话内"重复同一句话"问题已彻底消除，且超额覆盖 realistic 真实路径。

---

## ② OCR 路径验证（必做 · 真实跑）

**脚本**：独立复刻 `auto.js` 的 `findOcrMainPy()` 逻辑（不 `require` auto.js，因其底部无条件 `main()` 会触发 CLI 退出），断言返回路径 == 预期且存在。

**实测数字**：
```
computed path = C:\Users\姓名\.workbuddy\skills\skill_2059984237344256000\scripts\main.py
expected path  = C:\Users\姓名\.workbuddy\skills\skill_2059984237344256000\scripts\main.py
matches expected = true
fs.existsSync   = true
RESULT: PASS (OCR 路径正确且存在)
```

**契约核对（证明"改动真的有效"，非假设）**：
- OCR 技能 `SKILL.md` 含 `tencentcloud-ocr` / `通用文字识别` / `GeneralAccurateOCR`，正则 `auto.js` L168 可命中识别。
- `scripts/main.py` 接受 `--image-base64 <base64_or_filepath>`（L10/L178，注释明确可为文件路径）；与 `auto.js` 调用 `"python" "...main.py" --image-base64 "<imagePath>"` 完全吻合。
- `main.py` 输出 `print(json.dumps(result, ...))` 且 `result["raw_text"]` 为拼接后的识别文本（L84/L146）；`auto.js` L197-199 解析 `parsed.raw_text || parsed.text || parsed.content`，契约一致。
- 缺 `TENCENTCLOUD_SECRET_ID/KEY` 或技能时，`auto.js` L204-217 打印醒目 🔴 提示并回落 `[图片: <basename>]`（即"通用随机话题"），行为与任务描述一致。

**限制说明**：完整端到端 OCR 需腾讯云密钥 + `tencentcloud-sdk-python` + `python`，本环境未配置，故本次为"路径解析正确 + 输出契约匹配 + 静态代码核对"验证，而非真实 API 调用。路径层缺陷（旧代码 `path.join(__dirname,'..','..','skill_xxx','ocr.js')` 多一层且误用 ocr.js）已确认消除。

**结论**：GO。

---

## ③ P2 SSRF 白名单复验（必做 · 真实跑 + 代码审查）

### 3.1 真实跑结果
`test/ssrf-policy.test.js`（纯 Node，无框架/无浏览器）：

```
PASS 51 / FAIL 0
```

- **(A) `isBlockedHostname` 矩阵**（17 个阻断 + 4 个放行，全部符合任务指定清单）：
  - 阻断：`127.0.0.1` / `10.1.2.3` / `172.16.5.5` / `192.168.0.1` / `169.254.169.254` / `0.0.0.0` / `localhost` / `a.local` / `metadata` / `x.metadata` / `x.internal` / `::1` / `::` / `fe80::1` / `::ffff:10.0.0.5`（十进制 mapped）/ `::ffff:169.254.169.254`（十进制 mapped）/ `::ffff:a9fe:a9fe`（十六进制 mapped）。
  - 放行：`8.8.8.8` / `93.184.216.34` / `example.com` / `openai.com`。
- **(B) `decideImageRequest` 三种模式**：默认模式（含 data/blob 放行、固定 CDN 放行、公网图放行、12 个内网/危险 scheme 拦截）、DNS 重绑定模拟（解析到内网 → abort，解析到公网 → continue）、严格白名单模式（`WS_IMAGE_ALLOWLIST` 限定 `images.unsplash.com`，其余 abort）全部符合预期。

### 3.2 `index.js` 代码审查（`onRequest` L422-452 / `decideImageRequest` L344-396 / 启用 L550-551）

逐项核对：

| # | 审查点 | 位置 | 结论 |
|---|--------|------|------|
| ① | `data:/blob:` → `continue` | L349-350 | ✅ |
| ② | 非 http/https（file:/ftp:/gopher:）→ `abort`（非法 URL 也 abort） | L353-363 | ✅ |
| ③ | `isBlockedHostname` 命中 → `abort` | L369-370 | ✅ |
| ④ | 严格白名单：非白名单且非固定 CDN → `abort` | L374-379 | ✅ |
| ⑤ | 默认模式 DNS 复核：公网主机名解析到内网 → `abort` | L381-392 | ✅ |
| ⑥ | 每个请求恰好一次 `continue`/`abort`；`safeContinue/safeAbort` 用 `req.isInterceptResolutionHandled()` 前置守卫 + `.catch(()=>{})`，catch 分支仅兜底 `continue`，无"Request is already handled"风险 | L423-451 | ✅ |
| ⑦ | `safeAbort` 用 `req.abort('failed')`，`<img>` 走 `onerror` 不卡死 | L427-429 | ✅ |

**启用确认**：`index.js` L27 `require('dns')`、L28 `require('./lib/ssrf')`；L550 `await page.setRequestInterception(true)` → L551 `page.on('request', onRequest)`。导出 `module.exports = { decideImageRequest, onRequest }`（L1039），且 `require.main === module` 守卫（L1030）保证 `require('../index')` 在测试中安全加载、不触发 CLI。

**已知残余（非阻断）**：默认模式存在 DNS 重绑定 TOCTOU（决策期解析的公网地址与 Chromium 实际 fetch 时解析可能不同），代码注释（L320-321、L389）已明确标注为"降低风险、非完全消除"。启用 `WS_IMAGE_ALLOWLIST` 严格白名单可彻底闭环。属 P2 合理纵深防御姿态。

**结论**：GO。

---

## ④ 回归风险（必做）

**`auto.js` 三条主路径（Read 核对，未被破坏）**：
- `--text`（L327-331）：直达 `expandToChat` 或 `looksLikeChat` → `humanizeChat`；合规出口 `applyComplianceFilter` 单点过滤（L357-365）保留；渲染前 `escapeHtml`（L386）保留。
- `--image`（L322-326）：经 `ocrImage()`（已修复为 `findOcrMainPy`）；无密钥/无技能时回落随机话题，仍产出对话，未中断主流程。
- `--llm`（L336-344）：仍调用 `generateChatViaLLM`，失败/无 key 自动回退模板，行为不变。

**`lib/llm.js` 导出（grep `module.exports` 确认，L199）**：
```
{ generateChatViaLLM, isBlockedHostname, assertSafeBaseUrl, buildSystemPrompt, escapeHtml, sanitizeLLMOutput, applyComplianceFilter, COMPLIANCE_BLOCKLIST }
```
→ `generateChatViaLLM` / `escapeHtml` / `applyComplianceFilter` **均在**；`isBlockedHostname` / `assertSafeBaseUrl` 自 `./ssrf` re-export，与 P2 设计一致。

**模块完好性**：`node --check` 对 `auto.js` / `lib/expand.js` / `lib/ssrf.js` / `lib/llm.js` / `lib/record.js` / `index.js` 全部 OK；运行时 `require('./lib/expand')` `require('./lib/llm')` `require('./lib/record')` 均成功，`record.js` 导出 `addRecord` / `syncToTencentDocs`（auto.js 依赖项）存在。

**结论**：GO。无回归。

---

## 发现的问题

无阻断级 / 严重问题。

- **(已知残余 · 建议跟踪)** SSRF 默认模式 DNS 重绑定 TOCTOU，建议在需要最强保证的场景默认启用 `WS_IMAGE_ALLOWLIST`，或在文档/CHANGELOG 中提示该取舍。非本版本阻断项。
- **(环境限制 · 非缺陷)** 端到端 OCR 无法在本环境实跑（缺密钥/Python SDK），已用"路径解析 + 契约匹配 + 静态核对"替代，证据充分。

## 行动项（按优先级）

1. （P3，可选）在 CHANGELOG/README 注明 SSRF 严格白名单 `WS_IMAGE_ALLOWLIST` 的使用场景与 TOCTOU 取舍 —— 由 lead 统一收口文档。
2. 无其余行动项。

---

## 交付物

- `test/ssrf-policy.test.js` —— 真实可跑，**PASS 51 / FAIL 0**（已存在于仓库，复验通过；覆盖 `isBlockedHostname` 矩阵 + `decideImageRequest` 三模式）。
- 本报告 `test/QA-REPORT-v43.md`。
