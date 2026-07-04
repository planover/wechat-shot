---
name: wechat-shot
description: "微信截图王 v3.2 — 一键生成逼真微信聊天截图。输入对话文本，自动生成高清聊天截图或长截图，支持文字/图片/红包/转账/语音等多种消息类型。v3.2 彻底修复红包⊠、图片占位符、emoji豆腐块等4大缺陷，支持群聊名称自定义、角色头像彩色生成。"
license: MIT
allowed-tools: Bash
metadata:
  version: "3.2.0"
  display_name: "微信截图王"
  display_name_en: "WeChat Shot"
  visibility: "public"
---

# 微信截图王 v3.2 (WeChat Shot)

基于 [微信对话生成器](https://gaopengbin.github.io/wechat-dialog-generator/) 的自动化技能。通过 Puppeteer 操控页面，输入聊天文本，自动生成并下载高清截图或长截图。

## v3.2 更新 (2025)

### 🔥 4 大缺陷全面修复

| # | 问题 | v2.0 状态 | v3.2 方案 |
|---|------|-----------|-----------|
| 1 | **红包/转账图标 ⊠** | emoji 无字体显示为方块 | **纯 HTML/CSS 绘制** (90px 渐变方块+文字) |
| 2 | **[图片] 显示"点击上传图片"** | 无URL时显示占位文本 | **自动填充 picsum 随机真实照片** |
| 3 | **群聊名/昵称固定不变** | 每次都是默认值 | **`--contact` 自定义 + DOM 双重写入** |
| 4 | **头像黑白简笔画** | lorelei 默认风格单调 | **默认 avataaars 彩色扁平 + PNG格式** |

### 🆕 新增能力

- **Emoji 自动替换**: 聊天中的 🤣😂🔥❤️ 等 emoji 自动转为文字标签 `[笑哭]`/`[火]`, 避免 ⊠
- **增强视觉效果**: 图标带阴影、渐变、圆角, 接近真实微信样式
- **详细诊断日志**: `--verbose` 可查看每步执行详情

## 能力矩阵

| 能力 | 说明 | 状态 |
|------|------|------|
| 📝 **多消息类型** | 文字、图片、红包、转账、语音、时间节点 | ✅ |
| 🎨 **头像自动生成** | DiceBear API，按姓名生成专属 PNG 头像 | ✅ 彩色 |
| 🔧 **图标修复** | 纯 CSS 绘制红包/转账图标, 零字体依赖 | ✅ v3.2 |
| 😀 **Emoji 替换** | 常见 emoji → 文字标签, 避免 ⊠ | ✅ v3.2 |
| 🖼️ **图片自动填充** | `[图片]` 无URL时自动补全随机图 | ✅ v3.2 |
| 📱 **外观自定义** | 时间、电量、信号、联系人名、气泡颜色 | ✅ 增强 |
| 📐 **高清输出** | 1125×2436+ PNG 截图 | ✅ |
| 📜 **长截图** | 一键生成完整聊天记录 | ✅ |

## 使用方法

### 基本用法

```bash
cd /root/.codebuddy/skills/wechat-shot

# 使用默认示例生成截图
node index.js

# 从文件导入聊天记录
node index.js --input /path/to/chat.txt

# 指定输出路径
node index.js --input chat.txt --output /workspace/result.png

# 生成长截图 (完整聊天记录)
node index.js --input chat.txt --long

# 自定义外观
node index.js --input chat.txt --time "14:30" --contact "产品群(5)" --battery 80 --signal 3

# 详细日志模式
node index.js --input chat.txt --verbose
```

### 头像生成

v3.2 默认使用 **avataaars 彩色卡通风格** (PNG 格式)，为对话中每个角色自动创建专属头像：

```bash
# 默认 avataaars 彩色卡通（所有角色统一风格）
node index.js --input chat.txt

# 切换全局头像风格
node index.js --input chat.txt --avatar-style bottts     # 机器人风格
node index.js --input chat.txt --avatar-style pixel-art   # 像素风
node index.js --input chat.txt --avatar-style thumbs      # 手绘风

# 按角色指定不同风格（符合人物性格）
node index.js --input chat.txt --avatar-map "王经理:notionists,小李:bottts"

# 不使用头像生成（用页面默认头像）
node index.js --input chat.txt --avatar-style none
```

> **AI 场景适配建议**：调用此技能时，可根据对话场景选择头像风格：
> - 日常群聊 → `avataaars` (默认, 彩色卡通)
> - 技术/AI 角色 → `bottts`
> - 商务人士 → `notionists`
> - 文艺青年 → `thumbs`
> - 游戏/娱乐 → `pixel-art`

### 聊天文本格式

```
**【10:23】**

**历史迷小王**：你们看这个知乎回答了吗？太搞笑了🤣
**知乎达人老李**：看到了！那个逻辑离谱
**吃瓜群众阿强**：怎么说？
**历史迷小王**：[图片]
**知乎达人老李**：哈哈哈哈哈这什么神逻辑！
**吃瓜群众阿强**：等等，他是在说黑奴吃得比地主还好？？
**历史迷小王**：[红包] 新年快乐！
**知乎达人老李**：[转账] 8.88:收到！

**【10:35】**
**历史迷小王**：话说回来，这个回答热度不低啊
```

> **注意**：
> - `**姓名**：` 必须使用中文冒号 `：` 或英文冒号 `:`
> - `[图片]` 不写 URL 会**自动填充随机照片**
> - 角色昵称**建议贴合场景**, 不要总是张三李四

## 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-i, --input` | 聊天记录文本文件路径 | 使用内置示例 |
| `-o, --output` | 输出图片路径 | `/workspace/微信聊天记录_{类型}_{timestamp}.png` |
| `-l, --long` | 生成长截图 | `false` |
| `--time` | 手机时间 `HH:MM` | `12:02` |
| `--contact` | 聊天标题/群聊名称 ⭐ | 默认 |
| `--battery` | 电量 0-100 | `60` |
| `--signal` | 信号格数 1-4 | `4` |
| `--unread` | 未读消息数 | `1` |
| `--self-color` | 自己气泡色 | `#95ec69` |
| `--other-color` | 他人气泡色 | `#ffffff` |
| `--avatar-style` | DiceBear 头像风格 ⭐ | `avataaars` |
| `--avatar-map` | 按角色指定风格 `"名:风格,名:风格"` | — |
| `-v, --verbose` | 详细日志 ⭐ | `false` |
| `-h, --help` | 显示帮助 | — |

## 可用头像风格

| 风格 | 预览 | 适合场景 | v3.2推荐 |
|------|------|---------|----------|
| `avataaars` | 🎨 扁平彩色卡通 | 通用/日常聊天 | ⭐ **默认** |
| `lorelei` | 卡通人物 | 日常聊天 | |
| `bottts` | 🤖 机器人 | 科技/AI 角色 | |
| `identicon` | 抽象几何图形 | 技术/理性 | |
| `pixel-art` | 👾 像素风 | 游戏/娱乐 | |
| `thumbs` | ✏️ 手绘风 | 文艺/创意 | |
| `notionists` | 黑白素描 | 极简/商务 | |
| `shapes` | 彩色形状 | 简单几何 | |

> DiceBear 是免费开源的头像生成服务，相同姓名永远产生相同头像，无需 API Key。详见 https://www.dicebear.com/

## 技术原理

### 截图流程 (v3.2)

```
加载页面 → 填入文本 → 解析导入 → 应用设置(含群聊名) → 等待资源加载
→ Step6 注入纯CSS图标(红包90px/转账90px) → Step7 Emoji替换 → Step8 替换PNG头像 → html-to-image 截图 → 保存
```

### 图标修复原理 (v3.2)

在 headless Chromium (Linux) 下，系统缺少 emoji 字体，`.wc-rp-icon` 中的 `🧧`(U+1F9E7) 和 `💰`(U+1F4B0) 在 `font-size:80px` 时渲染为 ⊠。

**v3.2 方案**：用纯 HTML/CSS DOM 元素完全替换 `.wc-rp-icon` 的 innerHTML:
- **红包**: 90×90 红色渐变圆角矩形 + 金色圆形 + "福"字 (28px bold)
- **转账**: 90×90 橙色渐变圆角矩形 + ¥符号 (38px) + "转账"文字

此方案比 SVG data URI 更可靠，因为 `html-to-image` 对原生 DOM 元素的渲染支持最好。

### Emoji 替换原理

遍历 `.wc-bubble > span` 文本节点，用正则匹配常见 emoji 并替换为 `<b>` 标签包裹的文字。

## FAQ

**Q: 红包/转账图标还是方块？**
A: v3.2 已用纯 HTML/CSS 重绘图标。确认版本: `node index.js --help` 应显示 v3.2。

**Q: 聊天里的表情还是 ⊠？**
A: v3.2 新增了 emoji→文字替换功能。目前支持 🤣😂😭🎉👍❤️🔥✅⚠️ 等18种常见emoji。

**Q: [图片] 显示"点击上传图片"？**
A: v3.2 会自动为没有 URL 的 `[图片]` 填充 picsum.photos 随机图片。

**Q: 如何让每次生成的群聊名和昵称都不同？**
A: 使用 `--contact` 参数指定群聊名，并在聊天文本中使用贴合场景的角色名。

**Q: 头像生成失败？**
A: 网络超时会回退到页面默认头像。可用 `--avatar-style none` 跳过头像生成。

## 依赖

- Node.js ≥ 18
- Puppeteer（自动随 Chrome 安装）

## 版本历史

- **v3.2** (当前) — 图标放大至90px, 新增emoji替换, 增强阴影渐变效果
- **v3.0** — 纯HTML/CSS图标方案, 图片自动填充, 群聊名自定义, avataaars默认头像
- **v2.0** — SVG图标注入, DiceBear头像, 长截图支持
