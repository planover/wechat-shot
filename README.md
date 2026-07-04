# 微信截图王 v3.3 (WeChat Shot)

> 一键生成逼真微信聊天截图的命令行工具。输入对话文本，自动生成高清截图或长截图，自带头像生成、红包/转账图标修复和 Emoji 真实渲染。

[![npm](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 📝 多消息类型 | 文字、图片、红包、转账、语音、时间节点 |
| 😀 Emoji 真实渲染 | 使用 Twemoji CDN 将 emoji 渲染为彩色 SVG 图标，告别 ⊠ 豆腐块 |
| 🎨 头像自动生成 | 集成 DiceBear 免费 API，按人物姓名生成专属头像，支持按角色指定不同风格 |
| 🔧 红包/转账修复 | 纯 CSS 绘制红包和转账图标，彻底解决 headless 环境下的显示问题 |
| 📱 外观自定义 | 手机时间、电量、信号、群聊名称、气泡颜色 |
| 📐 高清输出 | 1125×2436 PNG 截图 |
| 📜 长截图 | 一键生成完整聊天记录长图 |
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
