---
name: wechat-shot
description: "微信截图王 — 生成逼真的微信聊天截图。支持文字/图片(OCR)/红包/转账/语音/长截图，自动头像生成，纯CSS图标。v4.1 起支持 --realism/--deai 去AI味自然度；v4.2 起支持 --llm 大模型生成模式（OpenAI 兼容，密钥零泄露+SSRF防护）；v4.3 修复 OCR 技能自动识别（不再写死技能ID）与生成内容去重，并并入浏览器端 SSRF 请求拦截；v4.4.1 新增状态栏全面可调（时间默认当前真实时间、--network 切换 WiFi/蜂窝 5G、--battery/--signal 渲染后强制生效）；v4.4.2 新增腾讯文档同步（--sync-tencent-docs，生成后追加一行到腾讯文档智能表格 wechat-shot-records，列：日期时间/输入类型/输入原始内容/生成的聊天文本/截图）与两天互动对话渲染；v4.4.3 修复第三方解析器默认把所有气泡放右侧的硬伤——新增 --other-side 参数，按「说话人序列」把指定他人气泡强制搬回左侧（白色+专属头像），实现真正的双向排版；v4.4.4 修复泡泡错位根因（改父元素 justify-content 而非子元素 margin auto），腾讯文档截图与输入图片改为 image 字段类型（云端可直接打开），不再使用本地 C:\ 路径；v4.4.5 重构 patchBubbleSides 减少重复代码、更新过期注释、清理调试探针文件；v4.4 新增 PaddleOCR 本地 OCR 后端（无需 API Key，离线运行）。当用户需要制作微信对话截图、聊天记录长图、模拟微信聊天界面时使用。"
description_zh: "微信聊天截图生成器"
version: 4.4.5
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
display_name: "微信截图王"
visibility: "public"
---

# 微信截图王 v4.4.5 (WeChat Shot)

> 智能微信聊天截图工具。图片/文字输入 → 自动场景扩展（去 AI 味）→ 确认 → 长截图 → Excel记录 + 腾讯文档同步。

## v4.4.4 更新要点

- **泡泡错位根因修复（CRITICAL）**：v4.4.3 的 `patchBubbleSides` 只改子元素 `.wc-body` 的 `margin: auto`，但父元素 `.wc-dialog` 仍是 `justify-content: flex-end`（该第三方页面所有消息默认都是 `wc-dialog-right`），导致子元素 margin auto 被忽略，所有气泡全部挤在右侧。重写为**直接改父元素 `.wc-dialog` 的 `justify-content`**（他人 `flex-start` → 推到左边，自己 `flex-end` → 保持右侧），从根本上解决排版失效。
- **腾讯文档截图与输入图片改为云端可访问**：此前智能表格「截图」字段为 url 类型填本地 `C:\` 路径，云端无法打开。新增「截图预览」(image) 和「输入图片」(image) 两个字段，用 `upload_image` 上传缩略图得到 image_id，云端直接显示为 HTTPS 图片链接，点击即可打开。
- **头像按侧别注入**：`patchBubbleSides` 中 `injectAvatar` 确保他人头像在左侧、自己头像在右侧，两人头像不同。

## v4.4.3 更新要点

- **双向对话真正排版（修复硬伤）**：第三方解析器 `gaopengbin/wechat-dialog-generator` 默认把所有气泡放右侧（把所有人都当「自己」）。新增 `--other-side <姓名>` 参数（`index.js` / `auto.js` 双入口均支持），按「说话人序列」把指定他人（如「康师傅」）的气泡强制搬回左侧（白色背景 + DiceBear 专属头像 + 箭头朝左），实现真正的微信双向排版。原理：渲染后 DOM patch，将 `.wc-body` 改为 `fit-content + max-width:85% + margin-right:auto` 推到对话区左侧，并按「第 i 个气泡 ↔ 第 i 条消息说话人」逐一匹配归属（不依赖气泡文本，避免漏判）。

## v4.4.2 更新要点

- **腾讯文档同步（修正 · `--sync-tencent-docs`）**：每次生成后，Agent 把一条记录**追加到腾讯文档智能表格 `wechat-shot-records`**（file_id: `ekdjtgzmvpMB`，sheet_id: `t00i2h`；find-or-create；列：`日期时间 / 输入类型 / 输入原始内容 / 生成的聊天文本 / 截图`）。**注意：是往「智能表格」里追加一行，不是创建独立的 HTML/图片文档**（早期错误做法已废弃）。截图以云端链接（url 字段）填入「截图」列。连接器连通后由 Agent 调用 smartsheet 工具（`add_fields` 建字段 + `add_records` 追加行）自动完成。`index.js` / `auto.js` 双入口均支持该参数。
- **两天互动对话渲染（新增）**：用 `**【日期 时间】**` 时间节点语法支持跨天双向对话（如「7月6日 15:30」「7月7日 09:12」），截图覆盖完整的来回互动而非单向留言。
- **状态栏全面可调（v4.4.1）**：手机时间默认改为当前真实时间（不再固定 12:02）；新增 `--network` 参数（`wifi` 默认 / `cellular` 蜂窝数据，状态栏显示「5G」）；`--battery` / `--signal` 在渲染后通过 DOM patch 强制生效；`auto.js` 补齐 `--battery` / `--signal` / `--network` 透传，两条入口参数通用。
- **PaddleOCR 本地 OCR 后端（v4.4 · 无需 API Key）**：OCR 链路在腾讯云 `tencentcloud-ocr` 之后新增第二优先级 `tryPaddleOcr()` → `scripts/paddle_ocr.py`，本地离线识别图片文字；Windows + Python 3.13 已验证，首字乱码/方块通过 7 层兼容性补丁修复。
- **OCR 自动识别修复**（v4.3）：不再写死技能目录/文件名，自动扫描并调用 `tencentcloud-ocr` 技能的 `scripts/main.py`；未安装或缺少密钥时给出醒目提示并回退「通用随机话题」。
- **生成内容去重**（v4.3）：同一对话内不再出现重复发言（压测 2400 次生成 0 重复）。
- **浏览器端 SSRF 拦截**（v4.3）：渲染期对图片请求做内网/环回/云元数据地址拦截，可选 `WS_IMAGE_ALLOWLIST` 严格白名单模式。

## 核心能力

| 能力 | 说明 |
|------|------|
| 🤖 智能全流程 | `auto.js` — 图片OCR/文字输入 → 场景扩展 → 确认 → 截图 → 记录 |
| 📝 多消息类型 | 文字、图片、红包、转账、语音、时间节点 |
| 😀 Emoji 渲染 | Twemoji CDN，真实彩色 emoji 图标 |
| 🎨 头像生成 | DiceBear API，按姓名生成专属 PNG 头像 |
| 🔧 图标修复 | 纯 CSS 红包/转账图标，无字体依赖 |
| 📊 自动记录 | Excel 本地记录 + 腾讯文档同步 |
| 📜 长截图 | 完整聊天记录一键导出 |

## 安装

```bash
git clone https://github.com/planover/wechat-shot.git
cd wechat-shot
npm install
```

- Node.js ≥ 18
- Puppeteer（自动安装 Chromium）
- 网络访问（DiceBear + Twemoji CDN）

## 快速使用

### 智能模式 (v4.2)

```bash
# 文字描述 → 自动扩展场景 → 截图（默认自然度 0.7）
node auto.js --text "知乎上有一个离谱的历史回答"

# 图片 → OCR → 场景扩展 → 截图
node auto.js --image ./screenshot.png

# 去 AI 味：最大化自然度
node auto.js --text "老板在群里发火" --deai

# 指定场景 + 自定义自然度
node auto.js --text "讨论项目方案" --scene work --realism 0.9

# 跳过确认
node auto.js --text "老板在群里发火" --yes
```

### 🤖 大模型生成模式 (v4.2)

需要 OpenAI 兼容的大模型接口，密钥通过环境变量 `LLM_API_KEY` 提供（仅用于请求，绝不打印/落盘）：

```bash
export LLM_API_KEY=sk-xxx
node auto.js --text "我妈看到我买的两千块的羽绒服直接沉默了" --llm --scene daily --deai
# 可选：--llm-model gpt-4o  /  --llm-temperature 0.95  /  LLM_BASE_URL 自定义端点
```

未设置 `LLM_API_KEY` 或调用失败时，自动回退到模板引擎，不影响出图。

### 🪄 去 AI 味（自然度）

- `--realism 0~1`：越高越随意（语气词 / 网络用语 / 省略标点越多），默认 `0.7`
- `--natural` / `--deai`：等价于 `--realism 0.85`
- `--scene <key>`：强制场景 `daily/funny/work/tech/finance/academic/history/zhihu`
- 若 `--text` 内容已是 `**姓名**：` 聊天记录，则直接采用并轻度润色，不二次扩展
- **最强自然度**：在 AI 助手（WorkBuddy/CodeBuddy 等）中，让助手直接写出口语化对话再传入，效果最真

### 传统模式

```bash
node index.js --input chat.txt --long --contact "群名"
```

## 聊天格式

```
**【10:23】**
**小明**：你好啊🤣
**小红**：[图片]
**小明**：[红包]恭喜
**小红**：[转账]8.88:收到
```

## 技术栈

Puppeteer + html-to-image + DiceBear + Twemoji + xlsx

## License

MIT
