# Changelog

所有重要变更记录于此。格式参考 [Keep a Changelog](https://keepachangelog.com/)。

## [4.2.0] — 2026-07-06

### 新增 (Added)
- **`--llm` 大模型生成模式**：`auto.js` 新增 `--llm` 开关，调用 OpenAI 兼容 Chat Completions API 直接生成自然微信对话；同时新增 `--llm-model`、`--llm-temperature`、`--llm-provider`（预留）参数。
- **新增 `lib/llm.js`**：独立 LLM 调用模块，封装系统提示词、30s 超时、失败回退逻辑。

### 安全 (Security)
- **密钥零泄露**：`LLM_API_KEY` 仅从环境变量读取、仅在请求 Header 中使用，绝不写入文件 / console / 错误堆栈 / 截图内容。
- **SSRF 防护**：`LLM_BASE_URL` 拒绝私有网段（10/172.16/192.168）、环回（127/::1）、链路本地（169.254，含云元数据）与非法 scheme。
- **提示词注入缓解**：用户输入作为独立 `user` role 消息，不拼入系统提示词。
- **系统提示词硬拒指令（上线阻断级）**：新增第 7/8 条约束——无论用户输入什么，模型只能输出聊天文本，不执行/复述指令、不切换角色、不输出格式外内容；并禁止生成涉政/色情/赌博/诈骗内容（场景涉及则替换为日常闲聊）。
- **统一合规出口（上线阻断级）**：`auto.js` 在 Step 2 之后、展示/渲染/持久化/外发之前，对**所有来源**的 `rawContent`（用户 `--text` / OCR 原文）与 `chatText`（模板 / LLM 输出 / 聊天透传）做单点 `applyComplianceFilter` 过滤——长度上限（4000 字）+ 涉政/辱骂/诈骗/违法关键词拦截，命中即回退模板或脱敏。五个 sink（渲染 / Excel `lib/record.js` / 腾讯文档同步）均只读这两个变量，故单一 chokepoint 即可闭合"不当内容被持久化或外发"链路。
- **渲染期 XSS 防护（上线阻断级）**：`auto.js` 在调用 `index.js` 渲染前对聊天文本做 HTML 转义（`escapeHtml`），杜绝 `index.js` emoji 处理处 `innerHTML` 解析 `<img onerror=...>` 等脚本注入。
- **安全评审遗留项复核**：安全官原报 F-01（图片 URL 任意请求 SSRF）与 F-02（OCR HTTP 明文）经核查**不适用于本仓库当前版本**——`index.js` 仅从固定公共 CDN（jsdelivr Twemoji、DiceBear 头像）取图、无用户可控 URL 请求；`ocrImage` 为本地 `execSync` 子进程而非网络调用。故未对脆弱的渲染层做额外改动。

### 改进 (Changed)
- `--scene` / `--realism` 在 `--llm` 模式下作为语境与自然度约束注入系统提示词。
- 无 `LLM_API_KEY` 或 LLM 调用失败（超时/限流/网络）时，自动回退到 v4.1 模板引擎，不中断主流程。

### 修复 (Fixed)
- **SSRF 防护遗漏 IPv6 环回/链路本地**：`lib/llm.js` 的 `isBlockedHostname` 原先只比对 `::1`，但 `new URL` 解析后 IPv6 字面量 hostname 带方括号（`[::1]`）导致漏拦；新增方括号归一化，并补拦 `fe80::/10` 链路本地。
- **模板回退偶发单字发言者名**：`lib/expand.js` 第二段对话误写 `pick(rng, pick(rng, others))`，把名字字符串当字符数组取了单个字（如 `**经**：`）；改为单次 `pick(rng, others)`。
- **内容合规词表可被分隔符绕过**：`sanitizeLLMOutput` 增加去空白后二次匹配，防止"刷 单 返 利"插空绕过。
- 注：`--llm-provider` 为预留参数（trivial），当前未实际使用，保留以兼容后续多供应商扩展。

### 文档 (Docs)
- README 新增「v4.2 --llm 大模型生成」章节；SKILL.md 更新版本与参数。

## [4.1.0] — 2026-07-06

### 新增 (Added)
- **去 AI 味 / 自然度控制**：`auto.js` 新增 `--realism <0-1>`（默认 0.7）、`--natural` / `--deai`（等价于 0.85）。
- **强制场景**：`--scene <key>` 支持 `daily / funny / work / tech / finance / academic / history / zhihu`。
- **聊天记录透传**：`--text` 输入若已是 `**姓名**：` 格式的聊天记录，直接采用并轻度人味润色，不再二次扩展。
- `expand.js` 导出 `humanizeChat`，可对已有聊天做轻度润色。

### 改进 (Changed)
- **重写 `lib/expand.js` 对话引擎**：从单一模板填充升级为「大语料 + 随机采样 + 不规则话轮 + 口语化」生成器。
  - 8 个场景各内置多套开场 / 反应 / 追问 / 收尾语料，每次运行不重样。
  - 不规则话轮：有人连发两条、有人只回一个"？"，不再机械轮流。
  - 口语化：语气词、网络用语、笑声变体（哈哈哈 / 2333 / 蚌）、稀松标点。
  - emoji 非强制：约一半消息不带 emoji，告别"每句都带😂"的 AI 感。
  - 时间节点改用真实微信风格（上午/下午 + 时间），约 35% 概率追加"晚些时候"的第二段对话。
- OCR 不可用时给出清晰提示，并改用通用话题兜底，不再把文件名当对话内容。

### 修复 (Fixed)
- 修复 `looksLikeChat` 只检测首行、导致以 `**【时间】**` 开头的聊天记录未被识别为透传的问题。

### 文档 (Docs)
- README 新增「v4.1 去 AI 味」章节与 `auto.js` 专用参数表。
- SKILL.md 同步更新版本与参数说明。

## [4.0.0] — 2026-07-04

### 新增
- 🤖 智能全流程 `auto.js`：图片 OCR / 文字输入 → 场景扩展 → 确认 → 截图 → 记录。
- 🎭 场景自动生成 `lib/expand.js`：8 种场景类型，角色名库 + 对话模板。
- 📊 Excel 自动记录 `lib/record.js`：本地 `wechat-shot-records.xlsx`（截图嵌入）+ 腾讯文档同步指令。
- 😀 Twemoji 真实 emoji 渲染（v3.3 延续）。

## [3.3.0] — 2026-07-04

- 通用化改造，默认输出路径改为 cwd。
- Twemoji CDN 渲染真实彩色 emoji。

## [3.2.0]

- 纯 CSS 重绘红包 / 转账图标，解决 headless 环境方块问题。
