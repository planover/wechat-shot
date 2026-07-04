# 微信截图王 v2.0 (WeChat Shot)

> 一键生成逼真微信聊天截图的自动化技能。输入对话文本，自动生成高清截图或长截图，自带头像生成和图标修复。

## 目录

- [功能特性](#功能特性)
- [安装方式](#安装方式)
- [快速开始](#快速开始)
- [参数说明](#参数说明)
- [头像生成](#头像生成)
- [聊天文本格式](#聊天文本格式)
- [使用示例](#使用示例)
- [技术原理](#技术原理)
- [常见问题](#常见问题)

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 📝 多消息类型 | 文字、图片、红包、转账、语音、时间节点 |
| 🎨 头像自动生成 | 集成 DiceBear 免费 API，按人物姓名生成专属头像，支持按角色指定不同风格 |
| 🔧 图标修复 | 自动将 emoji 图标替换为 SVG，解决 headless 环境下红包/转账图标显示为 ⊠ 的问题 |
| 📱 外观自定义 | 手机时间、电量、信号、联系人名、气泡颜色 |
| 📐 高清输出 | 1125×2436 PNG 截图 |
| 📜 长截图 | 一键生成完整聊天记录长图 |

## 安装方式

### 方式一：直接安装（当前环境）

技能已安装在 `/root/.codebuddy/skills/wechat-shot/`，可直接使用。

### 方式二：从 .skill 包安装

```bash
# 将 wechat-shot.skill 包解压到技能目录
unzip wechat-shot.skill -d /root/.codebuddy/skills/

# 安装依赖
cd /root/.codebuddy/skills/wechat-shot
npm install puppeteer
```

### 依赖要求

- Node.js ≥ 18
- Puppeteer（随 Chrome 自动安装）
- 网络访问（用于加载页面和 DiceBear API）

## 快速开始

```bash
cd /root/.codebuddy/skills/wechat-shot

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
| `--output` | `-o` | 输出图片路径 | `/workspace/微信聊天记录_{类型}_{时间戳}.png` |
| `--long` | `-l` | 生成长截图 | `false` |
| `--time` | — | 手机时间 `HH:MM` | `12:02` |
| `--contact` | — | 聊天标题/联系人名 | 自动检测 |
| `--battery` | — | 电量百分比 0-100 | `60` |
| `--signal` | — | 信号格数 1-4 | `4` |
| `--unread` | — | 未读消息数 | `1` |
| `--self-color` | — | 自己气泡色 | `#95ec69` |
| `--other-color` | — | 他人气泡色 | `#ffffff` |
| `--avatar-style` | — | 全局头像风格 | `lorelei` |
| `--avatar-map` | — | 按角色指定风格 | — |
| `--verbose` | `-v` | 显示详细日志 | `false` |
| `--help` | `-h` | 显示帮助 | — |

## 头像生成

### 工作原理

使用 [DiceBear](https://www.dicebear.com/) 免费 API，基于人物姓名（seed）生成确定性头像：
- 相同姓名 → 永远生成相同头像
- 免费、无需 API Key、无需认证
- 支持 SVG 格式，清晰度无损

### 可用风格

| 风格 | 说明 | 适合场景 |
|------|------|---------|
| `lorelei` | 彩色卡通人物 | 通用/日常聊天（默认） |
| `bottts` | 机器人风格 | 科技/AI 角色 |
| `identicon` | 抽象几何图形 | 技术/理性角色 |
| `pixel-art` | 像素风 | 游戏/娱乐 |
| `thumbs` | 手绘风 | 文艺/创意 |
| `avataaars` | 扁平卡通 | 另一种人物风格 |
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

> **按人物性格生成头像**：AI 调用此技能时，可先分析对话中每个角色的性格特征，然后通过 `--avatar-map` 为不同角色选择最合适的头像风格。未在 map 中指定的角色使用 `--avatar-style` 的全局默认风格。

## 聊天文本格式

```
**【3月1日 14:32】**

**张三**：你好，在忙不？
**李四**：不忙，怎么了？
**张三**：[图片]https://example.com/photo.jpg
**李四**：[红包]恭喜发财
**张三**：[转账]200:饭钱
**李四**：[语音]5
```

### 格式规则

| 元素 | 格式 | 示例 |
|------|------|------|
| 时间节点 | `**【时间】**` | `**【3月1日 14:32】**` |
| 消息 | `**姓名**：内容` | `**张三**：你好` |
| 图片消息 | `[图片]URL` | `[图片]https://example.com/a.jpg` |
| 红包消息 | `[红包]备注` | `[红包]恭喜发财` |
| 转账消息 | `[转账]金额:备注` | `[转账]200:饭钱` |
| 语音消息 | `[语音]秒数` | `[语音]5` |

> **注意**：姓名必须用 `**` 包围，后面跟中文冒号 `：` 或英文冒号 `:`。第一条消息的发送者会被识别为"自己"。

## 使用示例

### 示例 1：基本截图

```bash
node index.js --input chat.txt --output /workspace/screenshot.png
```

### 示例 2：长截图 + 自定义外观

```bash
node index.js --input chat.txt --long \
  --time "14:30" --contact "项目群" \
  --battery 80 --signal 3 --unread 5
```

### 示例 3：按角色性格生成头像

```bash
# 分析对话内容后为每个角色选择风格
node index.js --input chat.txt \
  --avatar-style lorelei \
  --avatar-map "王经理:notionists,小李:bottts,赵老师:thumbs"
```

### 示例 4：自定义气泡颜色

```bash
node index.js --input chat.txt \
  --self-color "#95ec69" --other-color "#ffffff"
```

## 技术原理

### 截图流程

```
预生成头像 → 加载页面 → 填入文本 → 解析导入 → 应用设置
    → 注入 SVG 图标 → 替换头像 → 截图保存
```

### 图标修复（v2.0 新增）

**问题**：在 headless Chromium (Linux) 环境下，系统缺少 emoji 字体，导致 `🧧`（红包）和 `💰`（转账）显示为 tofu 方块 ⊠。

**解决方案**：在截图前通过 DOM 操作，将 emoji 字符替换为内联 SVG 图标：
- 红包 `🧧` → 红色渐变背景 + 金色圆形装饰 + "福"字
- 转账 `💰` → 橙色背景 + ¥ 货币符号 + "转账"文字

完全不依赖系统字体，彻底解决 ⊠ 问题。

### 头像生成（v2.0 新增）

1. 从聊天文本中解析所有用户名
2. 调用 DiceBear API (`api.dicebear.com/9.x/{style}/svg?seed={name}`) 获取 SVG
3. 转为 data URI 注入页面 `<img>` 标签
4. 截图时头像随页面一起渲染

### 截图引擎

使用 `html-to-image` 库的 `toCanvas()` 方法，以 1125×2436 分辨率渲染。如果失败则回退到 `html2canvas`。

## 常见问题

### Q: 红包/转账图标还是显示不正常？

v2.0 已通过 SVG 注入修复。请确认使用的是最新版本（`node index.js --help` 应显示 v2.0）。如果仍有异常，请提交 issue。

### Q: 头像生成失败了怎么办？

网络问题可能导致 DiceBear API 调用超时。失败时会回退到页面默认头像，不影响截图生成。也可使用 `--avatar-style none` 跳过头像生成。

### Q: 如何生成没有头像的纯净截图？

```bash
node index.js --input chat.txt --avatar-style none
```

### Q: 支持群聊吗？

支持。只需在聊天文本中使用不同的人名即可，每个人名会自动分配头像。

### Q: 输出图片在哪里？

默认输出到 `/workspace/` 目录。可通过 `--output` 参数指定任意路径。

### Q: 如何查看详细运行日志？

添加 `--verbose` 参数：

```bash
node index.js --input chat.txt --verbose
```

---

## License

MIT

## 致谢

- [微信对话生成器](https://gaopengbin.github.io/wechat-dialog-generator/) — 原始网页项目
- [DiceBear](https://www.dicebear.com/) — 免费头像生成 API
- [html-to-image](https://github.com/bubkoo/html-to-image) — DOM 截图库
