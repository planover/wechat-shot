---
name: wechat-shot
description: "微信截图王 — 生成逼真的微信聊天截图。支持文字/图片(OCR)/红包/转账/语音/长截图，自动头像生成，纯CSS图标。v4.1 起支持 --realism/--deai 去AI味自然度；v4.2 起支持 --llm 大模型生成模式（OpenAI 兼容，密钥零泄露+SSRF防护）；v4.3 修复 OCR 技能自动识别（不再写死技能ID）与生成内容去重，并并入浏览器端 SSRF 请求拦截。当用户需要制作微信对话截图、聊天记录长图、模拟微信聊天界面时使用。"
description_zh: "微信聊天截图生成器"
version: 4.3.0
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
display_name: "微信截图王"
visibility: "public"
---

# 微信截图王 v4.3 (WeChat Shot)

> 智能微信聊天截图工具。图片/文字输入 → 自动场景扩展（去 AI 味）→ 确认 → 长截图 → Excel记录 + 腾讯文档同步。

## v4.3 更新要点

- **OCR 自动识别修复**：不再写死技能目录/文件名，自动扫描并调用 `tencentcloud-ocr` 技能的 `scripts/main.py`；未安装或缺少密钥时给出醒目提示并回退「通用随机话题」，避免生成与图片无关的内容。
- **生成内容去重**：同一对话内不再出现重复发言（压测 2400 次生成 0 重复）。
- **浏览器端 SSRF 拦截**：渲染期对图片请求做内网/环回/云元数据地址拦截，可选 `WS_IMAGE_ALLOWLIST` 严格白名单模式。

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
