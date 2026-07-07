# WeChat Shot v4.4

> A CLI tool that generates realistic WeChat chat screenshots. Image/OCR or text input → auto scene expansion (with de-AI naturalness) → confirmation → long screenshot → Excel log + Tencent Docs sync.

## v4.1 — De-AI, more natural

- Rewrote `lib/expand.js` dialogue engine: large phrase banks + random sampling + irregular turns + colloquial style.
- New `--realism 0~1` (default 0.7), `--natural` / `--deai` (= 0.85) for max naturalness.
- New `--scene <key>` to force a scene (daily/funny/work/tech/finance/academic/history/zhihu).
- Chat transcript passthrough: if `--text` is already `**Name**：` chat, it is adopted directly with light humanizing.
- Tip: for the most lifelike result, let your AI assistant write the dialogue, then render it.

## v4.4 — PaddleOCR local OCR backend (no API key)

- OCR chain now falls back to a local **PaddleOCR** engine (`scripts/paddle_ocr.py`) after Tencent Cloud OCR, so image input works fully offline with zero keys.
- Verified on Windows + Python 3.13 (`paddleocr==2.7.3` + `paddlepaddle==3.3.1`); a 7-layer compatibility patch fixes first-char mojibake / tofu boxes.

[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Features

| Feature | Description |
|---------|-------------|
| 📝 Multi-message types | Text, image, red packet, transfer, voice, time markers |
| 😀 Real Emoji Rendering | Renders emojis as colorful Twemoji SVG icons, no more ⊠ tofu blocks |
| 🎨 Auto avatar generation | DiceBear free API, generates unique avatars based on character names |
| 🔧 Icon fix | Pure CSS red packet & transfer icons, no font dependency |
| 📱 Customization | Phone time, battery, signal, contact name, bubble colors |
| 📐 HD output | 1125×2436 PNG screenshot |
| 📜 Long screenshot | Full chat history in one image |
| 🌍 Universal | Works on any Linux environment (WorkBuddy / CodeBuddy / OpenClaw / Docker) |

## Installation

```bash
# Clone the repo
git clone https://github.com/planover/wechat-shot.git
cd wechat-shot

# Install dependencies
npm install

# Verify
node index.js --help
```

### Requirements

- Node.js ≥ 18
- Puppeteer (auto-downloads Chromium)
- Network access (for page loading, DiceBear API, and Twemoji CDN)

## Quick Start

```bash
# 1. Generate screenshot with built-in example
node index.js

# 2. Import chat from file
node index.js --input chat.txt

# 3. Long screenshot (full history)
node index.js --input chat.txt --long

# 4. Show help
node index.js --help
```

## Parameters

| Parameter | Shorthand | Description | Default |
|-----------|-----------|-------------|---------|
| `--input` | `-i` | Chat text file path | Built-in example |
| `--output` | `-o` | Output image path | `./wechat_chat_{type}_{timestamp}.png` |
| `--long` | `-l` | Generate long screenshot | `false` |
| `--time` | — | Phone time `HH:MM` | `12:02` |
| `--contact` | — | Chat title / group name | Default |
| `--battery` | — | Battery 0-100 | `60` |
| `--signal` | — | Signal bars 1-4 | `4` |
| `--unread` | — | Unread messages | `1` |
| `--self-color` | — | Self bubble color | `#95ec69` |
| `--other-color` | — | Others' bubble color | `#ffffff` |
| `--avatar-style` | — | Global avatar style | `avataaars` |
| `--avatar-map` | — | Per-character style | — |
| `--verbose` | `-v` | Detailed logs | `false` |
| `--help` | `-h` | Show help | — |

## Avatar Generation

Uses [DiceBear](https://www.dicebear.com/) free API. Same name → same avatar. PNG format, colorful.

### Available Styles

| Style | Description | Best For |
|-------|-------------|----------|
| `avataaars` | 🎨 Flat colorful cartoon | General (**default**) |
| `lorelei` | Cartoon character | Daily chat |
| `bottts` | 🤖 Robot | Tech/AI characters |
| `identicon` | Abstract geometric | Technical/rational |
| `pixel-art` | 👾 Pixel art | Gaming |
| `thumbs` | ✏️ Hand-drawn | Artistic/creative |
| `notionists` | B&W sketch | Minimalist/business |
| `shapes` | Colorful shapes | Simple geometric |
| `none` | No generation | Use default |

### Per-Character Styles

```bash
node index.js --input chat.txt \
  --avatar-map "Manager:notionists,XiaoLi:bottts"
```

## Chat Text Format

```
**【March 1 14:32】**

**Zhang San**: Hey, are you busy?
**Li Si**: Not really, what's up?
**Zhang San**: [image]https://example.com/photo.jpg
**Li Si**: [redpacket]Good luck
**Zhang San**: [transfer]200:dinner
**Li Si**: [voice]5
**Zhang San**: LMAO this is hilarious 🤣😂
```

### Format Rules

| Element | Format | Example |
|---------|--------|---------|
| Time marker | `**【time】**` | `**【March 1 14:32】**` |
| Text message | `**Name**: content` | `**Zhang San**: Hello` |
| Image | `[image]URL` | `[image]https://example.com/a.jpg` |
| Auto image | `[image]` | Auto-fills random photo |
| Red packet | `[redpacket]note` | `[redpacket]Good luck` |
| Transfer | `[transfer]amount:note` | `[transfer]200:dinner` |
| Voice | `[voice]seconds` | `[voice]5` |

> Emojis in text are automatically rendered as Twemoji SVG icons 😀🔥👍❤️

## Examples

### Basic Screenshot

```bash
node index.js --input chat.txt --output screenshot.png
```

### Long Screenshot with Custom Appearance

```bash
node index.js --input chat.txt --long \
  --time "14:30" --contact "Project Group" \
  --battery 80 --signal 3
```

### On Any AI Platform (OpenClaw, CodeBuddy, etc.)

```bash
git clone https://github.com/planover/wechat-shot.git
cd wechat-shot && npm install
node index.js --input chat.txt --long --contact "Team Chat"
```

## Technical Details

### Screenshot Pipeline (v3.3)

```
Pre-generate avatars → Load page → Fill text → Parse & import → Apply settings
→ Pure CSS icons → Twemoji rendering → Replace avatars → html-to-image capture → Save
```

### Emoji Rendering (v3.3)

Text emojis (🤣😂🔥👍❤️ etc.) fail to render on headless Linux without emoji fonts. v3.3 uses **Twemoji CDN**:

1. Match emoji characters with Unicode regex
2. Extract code point → build Twemoji SVG URL
3. Replace with `<img>` tag

```
🤣 → https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/1f923.svg
😂 → https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/1f602.svg
```

Twemoji is Twitter's open-source emoji set, served via jsDelivr CDN.

### Icon Fix

Headless Chromium on Linux lacks emoji fonts. Pure HTML/CSS replaces the `.wc-rp-icon` element:
- Red packet: 90×90 red gradient block + gold circle + "福"
- Transfer: 90×90 orange gradient block + ¥ + "转账"

### Screenshot Engine

Uses `html-to-image`'s `toCanvas()` at 1125×2436. Falls back to `html2canvas`.

## FAQ

### Q: Emoji still shows ⊠?

v3.3 uses Twemoji rendering. Ensure network access to `cdn.jsdelivr.net`. Report issues if persistent.

### Q: Avatar generation fails?

Network timeout falls back to default avatars. Use `--avatar-style none` to skip.

### Q: How to install on other platforms?

```bash
git clone https://github.com/planover/wechat-shot.git
cd wechat-shot && npm install
```

Fully standalone, zero platform-specific dependencies.

---

## License

MIT

## Acknowledgments

- [WeChat Dialog Generator](https://gaopengbin.github.io/wechat-dialog-generator/)
- [DiceBear](https://www.dicebear.com/) — Free avatar API
- [Twemoji](https://github.com/twitter/twemoji) — Twitter emoji icons
- [html-to-image](https://github.com/bubkoo/html-to-image) — DOM screenshot library
