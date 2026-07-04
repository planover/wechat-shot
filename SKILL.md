# 微信截图王 v3.3 (WeChat Shot)

> 通用 CLI 工具，一键生成逼真微信聊天截图。在任何 Linux 环境下 `git clone && npm install` 即可使用。

## 核心能力

| 能力 | 说明 |
|------|------|
| 📝 多消息类型 | 文字、图片、红包、转账、语音、时间节点 |
| 😀 Emoji 渲染 | Twemoji CDN，真实彩色 emoji 图标 |
| 🎨 头像生成 | DiceBear API，按姓名生成专属 PNG 头像 |
| 🔧 图标修复 | 纯 CSS 红包/转账图标，无字体依赖 |
| 📱 外观自定义 | 时间、电量、信号、群名、气泡色 |
| 📜 长截图 | 完整聊天记录一键导出 |

## 安装

```bash
git clone https://github.com/planover/wechat-shot.git
cd wechat-shot
npm install
node index.js --help
```

- Node.js ≥ 18
- Puppeteer（自动安装 Chromium）
- 网络访问（DiceBear + Twemoji CDN）

## 快速使用

```bash
# 内置示例
node index.js

# 从文件导入
node index.js --input chat.txt

# 长截图 + 自定义群名
node index.js --input chat.txt --long --contact "历史吃瓜群(3)" --time "10:42"

# 详细日志
node index.js --input chat.txt --verbose
```

## 聊天格式

```
**【10:23】**
**小明**：你好啊🤣
**小红**：[图片]
**小明**：[红包]恭喜
**小红**：[转账]8.88:收到
```

- `[图片]` 无 URL 自动填充随机图
- `[红包]备注` / `[转账]金额:备注` / `[语音]秒数`
- Emoji 自动转为 Twemoji 图标

## 参数

| 参数 | 说明 | 默认 |
|------|------|------|
| `--input` | 聊天文本文件 | 内置示例 |
| `--output` | 输出路径 | `./微信聊天记录_*.png` |
| `--long` | 长截图 | false |
| `--time` | 时间 HH:MM | 12:02 |
| `--contact` | 群聊名称 | 默认 |
| `--avatar-style` | 头像风格 | avataaars |
| `--avatar-map` | 按角色指定 `"名:风格,名:风格"` | — |

## 头像风格

`avataaars`(默认) `lorelei` `bottts` `identicon` `pixel-art` `thumbs` `notionists` `shapes` `none`

## 技术栈

Puppeteer + html-to-image + DiceBear + Twemoji

## License

MIT
