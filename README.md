# 微信截图王 v4.4.2 (WeChat Shot)

> 智能微信聊天截图工具。支持图片 OCR / 文字输入，自动场景扩展，一键生成截图，本地 Excel 记录 + 腾讯文档同步。

[![npm](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 🆕 v4.0 新特性

| 特性 | 说明 |
|------|------|
| 🤖 **智能全流程** | 图片OCR / 文字输入 → 自动扩展场景 → 确认 → 截图 → 记录，一步到位 |
| 🎭 **场景自动生成** | 分析输入内容，自动创建贴合的角色名和对话（支持知乎/历史/技术/职场等场景） |
| 📊 **Excel 自动记录** | 每次使用自动写入 `wechat-shot-records.xlsx`，含截图嵌入 |
| ☁️ **腾讯文档同步** | 同步到腾讯文档同名智能表格 |

## 🪄 v4.1 新特性：去 AI 味，更自然

v4.0 的对话是模板填充，容易千篇一律（"啊？真的假的？""这剧情比电视剧还精彩🤣"）。
v4.1 重写了 `lib/expand.js` 对话引擎，并把"自然度"交给用户：

| 改进 | 说明 |
|------|------|
| 🎲 **大语料 + 随机采样** | 每个场景内置多套开场/反应/追问/收尾语料，每次运行都不重样 |
| 🔀 **不规则话轮** | 有人连发两条、有人只回一个"？"，不再机械轮流 |
| 💬 **口语化** | 语气词、网络用语、笑声变体（哈哈哈/2333/蚌）、稀松标点 |
| 🚫 **emoji 非强制** | 约一半消息不带 emoji，告别"每句都带😂"的 AI 感 |
| 🎚️ **自然度参数** | `--realism 0~1`（默认 0.7）；`--natural` / `--deai` 等价于 0.85 |
| 📋 **聊天透传** | 输入若已是 `**姓名**：` 格式的聊天记录，直接采用并轻度润色，不二次扩展 |
| 🧠 **最强自然度** | 在 AI 助手（WorkBuddy/CodeBuddy 等）里，让助手自己写对话再传入，效果最真 |

> **最佳实践**：想要"以假乱真"，让上层 AI 助手直接生成一段口语化聊天文本，
> 通过 `node auto.js --text "$(cat chat.txt)" --yes` 或 `node index.js --input chat.txt` 渲染即可。
> 模板引擎适合快速出图或没有 LLM 的场景。

## 🤖 v4.2 新特性：`--llm` 大模型生成，真正的"以假乱真"

v4.1 的去 AI 味仍是模板随机生成，内容偏"套路闲聊"。v4.2 新增 `--llm` 模式：直接调用大模型（OpenAI 兼容接口）把你的场景描述生成高度自然、贴合语境的微信对话，再由渲染器出图。

| 能力 | 说明 |
|------|------|
| 🧠 **大模型生成** | `--llm` 启用；通过环境变量 `LLM_API_KEY` 读取密钥，默认调用 `gpt-4o-mini` |
| 🎯 **场景/自然度透传** | `--scene` 映射为语境说明、`--realism` / `--deai` 映射为口语化程度，注入系统提示词 |
| 🔌 **OpenAI 兼容** | 支持任意 OpenAI 兼容端点，用 `LLM_BASE_URL` / `LLM_MODEL` / `--llm-model` / `--llm-temperature` 配置 |
| 🛡️ **安全兜底** | 密钥仅用于请求、绝不打印/落盘；`LLM_BASE_URL` 做 SSRF 防护；无 key 或调用失败自动回退模板模式 |
| 🔒 **内容合规（上线阻断级）** | 系统提示词硬拒指令/角色切换；LLM 输出做关键词（涉政/辱骂/诈骗/违法）+ 长度上限过滤，命中即回退；渲染前对文本做 HTML 转义，杜绝 XSS |

```bash
export LLM_API_KEY=sk-xxx
node auto.js --text "我妈看到我买的两千块的羽绒服直接沉默了" --llm --scene daily --deai
```

> 没配 `LLM_API_KEY` 也能用——会自动回退到 v4.1 的模板引擎，不影响出图。

## 🛠️ v4.3 修复与增强

基于真实使用反馈（知乎截图实测）修复了若干缺陷，并并入浏览器侧 SSRF 防护。

| 类别 | 修复 |
|------|------|
| 🔍 OCR 自动识别 | `auto.js` 不再写死技能目录/文件名，自动扫描并调用 `tencentcloud-ocr` 的 `scripts/main.py`；未安装或缺少密钥时给出醒目提示并回退「通用随机话题」，避免生成与图片无关的内容 |
| 🔁 内容去重 | `lib/expand.js` 新增去重采样，同一对话内不再出现重复发言（压测 4000 次 0 重复）；知乎场景语料扩充至 8/12/11/11/8 |
| 🛡️ 浏览器侧 SSRF | 渲染期对图片请求做内网/环回/云元数据地址拦截，可选 `WS_IMAGE_ALLOWLIST` 严格白名单模式（详见 `test/ssrf-policy.test.js`，PASS 51/FAIL 0） |

## 🆕 v4.4.1 新特性：状态栏全面可调

之前状态栏时间永远固定 `12:02`、且无法切换网络类型。v4.4.1 修复：

| 能力 | 说明 |
|------|------|
| 🕐 **时间可调** | `--time 10:29` 指定；不传则默认当前真实时间（不再写死 12:02） |
| 📶 **网络类型切换** | 新增 `--network wifi`（默认，保留 WiFi 弧形图标）/ `cellular`（蜂窝数据，状态栏显示「5G」） |
| 🔋 **电量/信号可调** | `--battery 88` / `--signal 3`，渲染后通过 DOM patch 强制生效 |
| 🔗 **双入口通用** | `auto.js` 补齐 `--battery` / `--signal` / `--network` 透传，`auto.js` 与 `index.js` 参数一致 |

## 🆕 v4.4.2 新特性：腾讯文档同步 + 两天互动对话

### ☁️ 同步到腾讯文档（`--sync-tencent-docs`）
生成截图后自动：
1. 产出「导入就绪」本地腾讯文档（自包含 HTML，内嵌截图 + 对话原文）；
2. 产出结构化 payload（`<截图名>.tencent-docs.json`，含标题/图片路径/对话原文）；
3. 若连接了腾讯文档连接器（左侧面板一键授权）或配置了 `TENCENT_DOCS_OPEN_TOKEN`，自动推送云端。

```bash
node index.js --input chat.txt --long --sync-tencent-docs
```

> 说明：真正的云端推送依赖腾讯文档账号授权。未连接时，会生成本地「导入就绪」文档，连接后重跑即可自动推送。

### 💬 两天互动对话
聊天文本用 `**【日期 时间】**` 标记时间节点即可跨天，配合 `--contact` 渲染多日、有来有往的双向对话（避免单向留言）。

## 🆕 v4.4 新特性：PaddleOCR 本地 OCR 后端（无需 API Key）

v4.3 的 OCR 依赖腾讯云 `tencentcloud-ocr`（需配置 `TENCENTCLOUD_SECRET_ID/KEY`）。v4.4 在 OCR 链路新增第二优先级 **PaddleOCR 本地引擎**，无需任何密钥、纯离线运行。

| 能力 | 说明 |
|------|------|
| 🔡 **本地 OCR** | 自动探测 Python 环境 → 调用 `scripts/paddle_ocr.py`，离线识别图片文字 |
| 🔑 **零密钥** | 不再强依赖云 OCR 密钥；云 OCR 不可用时自动降级到本地 PaddleOCR |
| 🪟 **Windows 适配** | 已验证 Python 3.13 + `paddleocr==2.7.3` + `paddlepaddle==3.3.1`，7 层兼容性补丁修复首字乱码/方块 |

```bash
# 安装 PaddleOCR（离线 OCR 后端，可选）
pip install paddleocr==2.7.3 paddlepaddle==3.3.1
```

> 优先级：腾讯云 OCR（有密钥）→ PaddleOCR（本地）→ 通用随机话题兜底。

## 功能特性

| 功能 | 说明 |
|------|------|
| 🤖 智能全流程 | `auto.js` — 图片/文字 → 场景扩展 → 确认 → 截图 → 记录 |
| 📝 多消息类型 | 文字、图片、红包、转账、语音、时间节点 |
| 😀 Emoji 真实渲染 | 使用 Twemoji CDN 将 emoji 渲染为彩色 SVG 图标，告别 ⊠ 豆腐块 |
| 🎨 头像自动生成 | 集成 DiceBear 免费 API，按人物姓名生成专属头像 |
| 🔧 红包/转账修复 | 纯 CSS 绘制红包和转账图标，彻底解决 headless 环境下的显示问题 |
| 📱 外观自定义 | 手机时间、电量、信号、群聊名称、气泡颜色 |
| 📐 高清输出 | 1125×2436 PNG 截图 |
| 📜 长截图 | 一键生成完整聊天记录长图 |
| 📊 自动记录 | Excel 本地记录 + 腾讯文档同步 |
| 🌍 通用兼容 | 支持任何 Linux 环境（WorkBuddy / CodeBuddy / OpenClaw / Docker 等） |

## 安装方式

```bash
# 克隆仓库
git clone https://github.com/planover/wechat-shot.git
cd wechat-shot

# 安装依赖
npm install

# 验证安装
node index.js --help
```

### 依赖要求

- Node.js ≥ 18
- Puppeteer（安装时会自动下载 Chromium）
- 网络访问（用于加载页面、DiceBear API 和 Twemoji CDN）

## 快速开始

### 🆕 智能模式 (v4.1 推荐)

```bash
# 从文字描述生成（自动扩展场景，默认自然度 0.7）
node auto.js --text "知乎上有一个离谱的历史回答"

# 从图片生成（自动 OCR 识别）
node auto.js --image ./screenshot.png

# 去 AI 味：最大化自然度
node auto.js --text "老板在群里发火" --deai

# 指定场景 + 自定义自然度
node auto.js --text "讨论项目方案" --scene work --realism 0.9

# 跳过确认，直接生成
node auto.js --text "老板在群里发火" --yes

# 自定义群名和时间
node auto.js --text "讨论项目方案" --contact "工作群(5)" --time "14:30"
```

### auto.js 专用参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--realism <0-1>` | 自然度，越高越随意（语气词/ slang / 省略标点越多） | `0.7` |
| `--natural` / `--deai` | 等价于 `--realism 0.85`，最大化"去 AI 味" | — |
| `--scene <key>` | 强制场景：`daily` / `funny` / `work` / `tech` / `finance` / `academic` / `history` / `zhihu` | 自动推断 |
| `--text "..."` | 文字描述；若内容已是 `**姓名**：` 聊天记录则直接采用 | — |

> 其余参数（`--image` / `--output` / `--yes` / `--no-record` / `--contact` / `--time` / `--avatar-style` / `--verbose`）与 v4.0 一致。

### 传统模式（手动编写聊天文本）

```bash
# 1. 使用内置示例生成截图
node index.js

# 2. 从文件导入聊天记录
node index.js --input chat.txt

# 3. 生成长截图（完整聊天记录）
node index.js --input chat.txt --long

# 4. 查看帮助
node index.js --help
```

## 参数说明

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--input` | `-i` | 聊天记录文本文件路径 | 使用内置示例 |
| `--output` | `-o` | 输出图片路径 | `./微信聊天记录_{类型}_{时间戳}.png` |
| `--long` | `-l` | 生成长截图 | `false` |
| `--time` | — | 手机时间 `HH:MM` | `12:02` |
| `--contact` | — | 聊天标题/群聊名称 | 默认 |
| `--battery` | — | 电量百分比 0-100 | `60` |
| `--signal` | — | 信号格数 1-4 | `4` |
| `--unread` | — | 未读消息数 | `1` |
| `--self-color` | — | 自己气泡色 | `#95ec69` |
| `--other-color` | — | 他人气泡色 | `#ffffff` |
| `--avatar-style` | — | 全局头像风格 | `avataaars` |
| `--avatar-map` | — | 按角色指定风格 | — |
| `--verbose` | `-v` | 显示详细日志 | `false` |
| `--help` | `-h` | 显示帮助 | — |

## 头像生成

### 工作原理

使用 [DiceBear](https://www.dicebear.com/) 免费 API，基于人物姓名（seed）生成确定性头像：
- 相同姓名 → 永远生成相同头像
- 免费、无需 API Key
- PNG 格式，色彩丰富

### 可用风格

| 风格 | 说明 | 适合场景 |
|------|------|---------|
| `avataaars` | 🎨 扁平彩色卡通 | 通用/日常聊天（**默认**） |
| `lorelei` | 卡通人物 | 日常聊天 |
| `bottts` | 🤖 机器人风格 | 科技/AI 角色 |
| `identicon` | 抽象几何图形 | 技术/理性角色 |
| `pixel-art` | 👾 像素风 | 游戏/娱乐 |
| `thumbs` | ✏️ 手绘风 | 文艺/创意 |
| `notionists` | 黑白素描 | 极简/商务 |
| `shapes` | 彩色形状 | 简单几何 |
| `none` | 不使用头像生成 | 使用页面默认头像 |

### 两种使用方式

**方式一：全局统一风格**

```bash
# 所有角色使用相同的卡通风格
node index.js --input chat.txt --avatar-style lorelei

# 所有角色使用机器人风格
node index.js --input chat.txt --avatar-style bottts
```

**方式二：按角色指定不同风格（推荐）**

```bash
# 王经理（商务人士）用黑白素描，小李（技术人员）用机器人风格
node index.js --input chat.txt --avatar-map "王经理:notionists,小李:bottts"
```

## 聊天文本格式

```
**【3月1日 14:32】**

**张三**：你好，在忙不？
**李四**：不忙，怎么了？
**张三**：[图片]https://example.com/photo.jpg
**李四**：[红包]恭喜发财
**张三**：[转账]200:饭钱
**李四**：[语音]5
**张三**：哈哈哈哈太搞笑了🤣😂
```

### 格式规则

| 元素 | 格式 | 示例 |
|------|------|------|
| 时间节点 | `**【时间】**` | `**【3月1日 14:32】**` |
| 普通消息 | `**姓名**：内容` | `**张三**：你好` |
| 图片消息 | `[图片]URL` | `[图片]https://example.com/a.jpg` |
| 图片消息（自动） | `[图片]` | 自动填充随机照片 |
| 红包消息 | `[红包]备注` | `[红包]恭喜发财` |
| 转账消息 | `[转账]金额:备注` | `[转账]200:饭钱` |
| 语音消息 | `[语音]秒数` | `[语音]5` |

> **注意**：
> - 姓名必须用 `**` 包围，后面跟中文冒号 `：` 或英文冒号 `:`
> - `[图片]` 不写 URL 会自动填充随机真实照片
> - Emoji 会自动渲染为彩色 Twemoji 图标 😀🔥👍❤️

## 使用示例

### 示例 1：基本截图

```bash
node index.js --input chat.txt --output screenshot.png
```

### 示例 2：长截图 + 自定义外观

```bash
node index.js --input chat.txt --long \
  --time "14:30" --contact "项目群" \
  --battery 80 --signal 3 --unread 5
```

### 示例 3：按角色性格生成头像

```bash
node index.js --input chat.txt \
  --avatar-style avataaars \
  --avatar-map "王经理:notionists,小李:bottts,赵老师:thumbs"
```

### 示例 4：自定义气泡颜色

```bash
node index.js --input chat.txt \
  --self-color "#95ec69" --other-color "#ffffff"
```

### 示例 5：在其他 AI 平台中使用

```bash
# OpenClaw / CodeBuddy / 任何支持命令执行的 AI 平台
git clone https://github.com/planover/wechat-shot.git
cd wechat-shot && npm install

# 创建聊天内容文件
cat > chat.txt << 'EOF'
**【10:23】**
**小明**：今天的方案不错啊👍
**小红**：谢谢！我们继续加油🔥
EOF

# 生成截图
node index.js --input chat.txt --long --contact "工作群"
```

## 技术原理

### 截图流程 (v3.3)

```
预生成头像 → 加载页面 → 填入文本 → 解析导入 → 应用设置
→ 纯CSS图标注入 → Twemoji渲染 → 替换头像 → html-to-image 截图 → 保存
```

### 红包/转账图标修复

在 headless Chromium (Linux) 下，系统缺少 emoji 字体，`🧧`(U+1F9E7) 和 `💰`(U+1F4B0) 渲染为 ⊠ 方块。

**v3.3 方案**：用纯 HTML/CSS DOM 元素替换 `.wc-rp-icon` 内容：
- 红包：90×90 红色渐变方块 + 金色圆形 + "福"字
- 转账：90×90 橙色渐变方块 + ¥ 符号 + "转账"文字

### Emoji 真实渲染 (v3.3 新增)

文本中的 emoji（如 🤣😂🔥👍❤️）在无字体环境下也无法正常显示。v3.3 使用 **Twemoji CDN**：

1. 用 Unicode 正则匹配文本中的 emoji 字符
2. 提取 code point → 拼接 Twemoji SVG URL
3. 替换为 `<img>` 标签
4. `html-to-image` 能正确捕获 `<img>` 标签中的图片

```
🤣 → https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/1f923.svg
😂 → https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/1f602.svg
```

Twemoji 是 Twitter 开源的 emoji 图标集，通过 jsDelivr CDN 全球加速。

### 截图引擎

使用 `html-to-image` 库的 `toCanvas()` 方法，以 1125×2436 分辨率渲染。如果失败则回退到 `html2canvas`。

## 常见问题

### Q: 红包/转账图标还是方块？

v3.3 已用纯 CSS 重绘图标。确认版本：`node index.js --help` 应显示 v3.3。

### Q: Emoji 还是显示为 ⊠？

v3.3 新增了 Twemoji 渲染。确认网络能访问 `cdn.jsdelivr.net`。如果仍有问题，请提交 issue。

### Q: 头像生成失败？

网络问题可能导致 DiceBear API 调用超时。失败时会回退到页面默认头像。使用 `--avatar-style none` 可跳过头像生成。

### Q: 支持群聊吗？

支持。只需在聊天文本中使用不同的人名即可。

### Q: 如何安装到其他 AI 平台？

```bash
git clone https://github.com/planover/wechat-shot.git
cd wechat-shot
npm install
node index.js --help
```

完全独立，不依赖任何特定平台。

---

## License

MIT

## 致谢

- [微信对话生成器](https://gaopengbin.github.io/wechat-dialog-generator/) — 原始网页项目
- [DiceBear](https://www.dicebear.com/) — 免费头像生成 API
- [Twemoji](https://github.com/twitter/twemoji) — Twitter 开源 emoji 图标
- [html-to-image](https://github.com/bubkoo/html-to-image) — DOM 截图库
