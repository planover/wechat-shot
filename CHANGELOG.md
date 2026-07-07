# Changelog

所有重要变更记录于此。格式参考 [Keep a Changelog](https://keepachangelog.com/)。

## [4.4.2] — 2026-07-07

### 新增 (Added)
- **腾讯文档同步（--sync-tencent-docs）**：生成截图后自动产出「导入就绪」本地腾讯文档（自包含 HTML，内嵌截图 + 对话原文）与结构化 payload（`.tencent-docs.json`）；连接腾讯文档连接器或配置 `TENCENT_DOCS_OPEN_TOKEN` 后自动推送云端。
- **两天互动对话渲染**：聊天文本支持跨天 `**【日期 时间】**` 时间节点，配合 `--contact` 可渲染多日、有来有往的双向对话。

### 修复 (Fixed)
- `index.js` / `auto.js` 新增 `--sync-tencent-docs` 参数解析与透传。

## [4.4.1] — 2026-07-07

### 新增 (Added)
- **状态栏全面可调**：手机时间默认改为当前真实时间（不再固定 `12:02`），`--time` 可覆盖；新增 `--network` 参数（`wifi` / `cellular`，蜂窝模式状态栏显示「5G」）；`--battery` / `--signal` 在渲染后通过 DOM patch 强制生效。
- `auto.js` 补齐 `--battery` / `--signal` / `--network` 参数解析与转发，`auto.js` 与 `index.js` 入口参数完全通用。

### 修复 (Fixed)
- 修复状态栏时间永远为默认 `12:02`、网络类型不可切换的问题（`index.js` 旧 `applySettings` 选择器已对改版后的网页失效，改为渲染后直接操作 DOM）。

## [4.4.0] — 2026-07-07

### 新增 (Added)
- **PaddleOCR 本地 OCR 后端（无需 API Key）**：`auto.js` 的 OCR 链路在腾讯云 `tencentcloud-ocr` 之后新增第二优先级 `tryPaddleOcr()` → `scripts/paddle_ocr.py`，本地离线识别图片文字，彻底摆脱对云 OCR 密钥的强依赖。Windows + Python 3.13 已验证（`paddleocr==2.7.3` + `paddlepaddle==3.3.1`），首字乱码/方块问题通过 7 层兼容性补丁修复（imghdr 垫片、np.sctypes 垫片、ASCII 模型目录、cv2.imdecode、`create_predictor` monkeypatch、safe-delete 绕过）。
- 同步用户级技能 `paddleocr-windows-py313`，沉淀可复用的 Windows+Py3.13 PaddleOCR 安装与排错配方。

### 文档 (Docs)
- 版本升至 4.4.0；README / README_EN / SKILL.md 新增 PaddleOCR 本地后端说明；本 CHANGELOG 新增 [4.4.0] 段。

## [4.3.0] — 2026-07-06

### 修复 (Fixed)
- **OCR 路径写死导致永远失效（CRITICAL-1）**：`auto.js` 原写死 `skill_2059984237344256000/ocr.js`（目录深度与文件名均错，真实技能入口为 `scripts/main.py`），导致 OCR 永远失败、生成内容与图片无关（如知乎截图却生成"猫会自己开门"）。改为 `findOcrMainPy()` 动态扫描 `<skills>/<name>/scripts/main.py` 并按 SKILL.md 内容识别 `tencentcloud-ocr`；仅当技能存在且已配置 `TENCENTCLOUD_SECRET_ID`/`TENCENTCLOUD_SECRET_KEY` 时才调用，否则显示 🔴 醒目警告并回退「通用随机话题」，引导用 `--text` 手动输入。
- **生成内容重复（CRITICAL-2）**：`lib/expand.js` 新增 `pickUnique(rng, arr, used)` + 共享 `used` 集合 + `GENERIC_FILLERS` 兜底池，所有发言 / 短回应 / 红包 / 转账 / 图片 / 语音均去重；同一对话内不再出现相同句子。压测 2400 次生成 0 重复。
- **知乎场景语料池过小（MAJOR-4）**：`zhihu` 场景 open/react/question/comment/close 由 6/5/5/5/4 扩充至 8/12/11/11/8，新增角色「吃瓜群众」「理性派」，进一步降低重复率、提升多样性。
- **OCR 缺失回退 UX（MAJOR-3）**：未启用 OCR 时输出醒目 🔴 提示，明确告知"生成内容仅风格/场景相关，与图片本身无关"，并引导用 `--text` 手动输入贴合内容。

### 安全 (Security)
- **P2 浏览器端 SSRF 白名单并入**：`index.js` 引入 `page.setRequestInterception(true)` + `onRequest`，调用共享 `lib/ssrf.js` 的 `isBlockedHostname` 拦截 `[图片]URL` 触发的内部 / 环回 / 链路本地（含云元数据 169.254）/ IPv4-mapped IPv6 地址请求；可选 `WS_IMAGE_ALLOWLIST` 严格模式 + 固定 CDN 集合（`cdn.jsdelivr.net` / `picsum.photos` / `gaopengbin.github.io` / `esm.sh`）。`decideImageRequest` 已导出供单测（见 `test/ssrf-policy.test.js`，PASS 51/FAIL 0）。
- **已知残余（非阻断 · 纵深防御）**：默认模式存在 DNS 重绑定 TOCTOU（决策期 DNS 解析到的公网地址与 Chromium 实际 fetch 时解析可能不同），代码注释已明确标注为"降低风险、非完全消除"。在需要最强保证的场景，设置 `WS_IMAGE_ALLOWLIST` 启用严格白名单模式即可彻底闭环。

### 文档 (Docs)
- SKILL.md 版本升至 4.3.0，新增「v4.3 更新要点」；本 CHANGELOG 新增 [4.3.0] 段。

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
- **安全评审遗留项复核（F-01 / F-02 不适用，附证据）**：安全官原报 F-01（图片 URL 任意请求 SSRF，指 index.js:610/620/627）与 F-02（OCR HTTP 明文，指 auto.js:170/187）。经逐行核查**不适用于本仓库当前版本**：
  - `index.js` 全文仅两处取图：line 518 Twemoji SVG（固定 `cdn.jsdelivr.net`）、line 566 DiceBear 头像（固定公共域名）；**无任何用户可控 URL 的 fetch/request**，故 F-01 不成立。
  - `auto.js` 的 `ocrImage`（line 155-197）为本地 `execSync('node ocr.js ...')` 子进程，非网络调用，故 F-02（HTTP 明文）不成立。
  - 本仓库唯一网络出口是受 `assertSafeBaseUrl` 守卫的 LLM API 调用（已含 IPv4/IPv6/链路本地/元数据全封堵）。故未对脆弱的渲染层做额外改动。

### 改进 (Changed)
- `--scene` / `--realism` 在 `--llm` 模式下作为语境与自然度约束注入系统提示词。
- 无 `LLM_API_KEY` 或 LLM 调用失败（超时/限流/网络）时，自动回退到 v4.1 模板引擎，不中断主流程。

### 修复 (Fixed)
- **SSRF 防护遗漏 IPv6 环回/链路本地 + IPv4-mapped（含十六进制形态）**：`lib/llm.js` 的 `isBlockedHostname` 改用 `net.isIP` 判定，并解码 IPv4-mapped **两种形态**——点分十进制 `::ffff:A.B.C.D` 与 **Node `new URL()` 归一化后的十六进制 `::ffff:a9fe:a9fe`**（真实入口形态），二者皆拦；覆盖环回 `::1`/`::`、链路本地 `fe80::/10`、IPv4 全私网段，公网 IPv4/IPv6 正常放行。**经真实 `assertSafeBaseUrl` → `new URL()` 入口复测 5/5 通过**（`[::ffff:169.254.169.254]`/`[::ffff:127.0.0.1]` 均 BLOCK，`[::ffff:8.8.8.8]` 公网 ALLOW）。
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
