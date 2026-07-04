# WeChat Shot v2.0

> An automated skill that generates realistic WeChat chat screenshots. Input dialogue text, automatically generate high-definition screenshots or long screenshots, with built-in avatar generation and icon fixing.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Parameters](#parameters)
- [Avatar Generation](#avatar-generation)
- [Chat Text Format](#chat-text-format)
- [Examples](#examples)
- [Technical Details](#technical-details)
- [FAQ](#faq)

---

## Features

| Feature | Description |
|---------|-------------|
| 📝 Multi-message types | Text, image, red packet, transfer, voice, time markers |
| 🎨 Auto avatar generation | Integrated DiceBear free API, generates unique avatars based on character names, supports per-character style |
| 🔧 Icon fix | Replaces emoji icons with SVG to fix the ⊠ (tofu) issue in headless environments |
| 📱 Appearance customization | Phone time, battery, signal, contact name, bubble colors |
| 📐 HD output | 1125×2436 PNG screenshot |
| 📜 Long screenshot | Generate full chat history in one image |

## Installation

### Option 1: Direct Installation (Current Environment)

The skill is installed at `/root/.codebuddy/skills/wechat-shot/` and ready to use.

### Option 2: From .skill Package

```bash
# Extract the .skill package to the skills directory
unzip wechat-shot.skill -d /root/.codebuddy/skills/

# Install dependencies
cd /root/.codebuddy/skills/wechat-shot
npm install puppeteer
```

### Requirements

- Node.js ≥ 18
- Puppeteer (auto-installed with Chrome)
- Network access (for loading the page and DiceBear API)

## Quick Start

```bash
cd /root/.codebuddy/skills/wechat-shot

# 1. Generate screenshot with built-in example
node index.js

# 2. Import chat record from file
node index.js --input chat.txt

# 3. Generate long screenshot (full chat history)
node index.js --input chat.txt --long

# 4. Show help
node index.js --help
```

## Parameters

| Parameter | Shorthand | Description | Default |
|-----------|-----------|-------------|---------|
| `--input` | `-i` | Chat record text file path | Built-in example |
| `--output` | `-o` | Output image path | `/workspace/wechat_chat_{type}_{timestamp}.png` |
| `--long` | `-l` | Generate long screenshot | `false` |
| `--time` | — | Phone time `HH:MM` | `12:02` |
| `--contact` | — | Chat title / contact name | Auto-detected |
| `--battery` | — | Battery percentage 0-100 | `60` |
| `--signal` | — | Signal bars 1-4 | `4` |
| `--unread` | — | Unread message count | `1` |
| `--self-color` | — | Self bubble color | `#95ec69` |
| `--other-color` | — | Other bubble color | `#ffffff` |
| `--avatar-style` | — | Global avatar style | `lorelei` |
| `--avatar-map` | — | Per-character style mapping | — |
| `--verbose` | `-v` | Show detailed logs | `false` |
| `--help` | `-h` | Show help | — |

## Avatar Generation

### How It Works

Uses the [DiceBear](https://www.dicebear.com/) free API to generate deterministic avatars based on character names (seed):
- Same name → always generates the same avatar
- Free, no API key required, no authentication
- SVG format for lossless clarity

### Available Styles

| Style | Description | Best For |
|-------|-------------|----------|
| `lorelei` | Colorful cartoon character | General/daily chat (default) |
| `bottts` | Robot style | Tech/AI characters |
| `identicon` | Abstract geometric | Technical/rational characters |
| `pixel-art` | Pixel art | Gaming/entertainment |
| `thumbs` | Hand-drawn style | Artistic/creative |
| `avataaars` | Flat cartoon | Alternative character style |
| `notionists` | Black & white sketch | Minimalist/business |
| `shapes` | Colorful shapes | Simple geometric |
| `none` | No avatar generation | Use page default avatars |

### Two Usage Modes

**Mode 1: Global Unified Style**

```bash
# All characters use the same cartoon style
node index.js --input chat.txt --avatar-style lorelei

# All characters use robot style
node index.js --input chat.txt --avatar-style bottts
```

**Mode 2: Per-Character Style Mapping (Recommended)**

```bash
# Manager (business) uses sketch, Xiao Li (tech) uses robot style
node index.js --input chat.txt --avatar-map "Manager:notionists,XiaoLi:bottts"
```

> **Personality-based avatars**: When AI calls this skill, it can first analyze each character's personality from the dialogue, then use `--avatar-map` to assign the most suitable avatar style. Characters not specified in the map will use the global `--avatar-style` default.

## Chat Text Format

```
**【March 1 14:32】**

**Zhang San**: Hey, are you busy?
**Li Si**: Not really, what's up?
**Zhang San**: [image]https://example.com/photo.jpg
**Li Si**: [redpacket]Good luck
**Zhang San**: [transfer]200:dinner money
**Li Si**: [voice]5
```

### Format Rules

| Element | Format | Example |
|---------|--------|---------|
| Time marker | `**【time】**` | `**【March 1 14:32】**` |
| Message | `**Name**: content` | `**Zhang San**: Hello` |
| Image | `[image]URL` | `[image]https://example.com/a.jpg` |
| Red packet | `[redpacket]note` | `[redpacket]Good luck` |
| Transfer | `[transfer]amount:note` | `[transfer]200:dinner` |
| Voice | `[voice]seconds` | `[voice]5` |

> **Note**: Names must be wrapped in `**`, followed by a colon `:`. The first message sender is identified as "self".

## Examples

### Example 1: Basic Screenshot

```bash
node index.js --input chat.txt --output /workspace/screenshot.png
```

### Example 2: Long Screenshot + Custom Appearance

```bash
node index.js --input chat.txt --long \
  --time "14:30" --contact "Project Group" \
  --battery 80 --signal 3 --unread 5
```

### Example 3: Personality-based Avatars

```bash
# Assign different styles per character after analyzing dialogue
node index.js --input chat.txt \
  --avatar-style lorelei \
  --avatar-map "Manager:notionists,XiaoLi:bottts,Teacher:thumbs"
```

### Example 4: Custom Bubble Colors

```bash
node index.js --input chat.txt \
  --self-color "#95ec69" --other-color "#ffffff"
```

## Technical Details

### Screenshot Pipeline

```
Pre-generate avatars → Load page → Fill text → Parse & import → Apply settings
    → Inject SVG icons → Replace avatars → Capture screenshot
```

### Icon Fix (v2.0)

**Problem**: In headless Chromium (Linux), the system lacks emoji fonts, causing `🧧` (red packet) and `💰` (transfer) to render as tofu squares ⊠.

**Solution**: Before screenshot capture, DOM operations replace emoji characters with inline SVG icons:
- Red packet `🧧` → Red gradient background + gold circle + "福" character
- Transfer `💰` → Orange background + ¥ currency symbol + "转账" text

This completely eliminates font dependency and the ⊠ issue.

### Avatar Generation (v2.0)

1. Parse all character names from chat text
2. Call DiceBear API (`api.dicebear.com/9.x/{style}/svg?seed={name}`) to get SVG
3. Convert to data URI and inject into page `<img>` tags
4. Avatars are rendered with the page during screenshot capture

### Screenshot Engine

Uses `html-to-image` library's `toCanvas()` method at 1125×2436 resolution. Falls back to `html2canvas` if the primary method fails.

## FAQ

### Q: The red packet/transfer icons still display incorrectly?

v2.0 fixes this via SVG injection. Make sure you're using the latest version (`node index.js --help` should show v2.0). If issues persist, please report.

### Q: What if avatar generation fails?

Network issues may cause DiceBear API timeouts. On failure, it falls back to the page's default avatars without affecting screenshot generation. Use `--avatar-style none` to skip avatar generation entirely.

### Q: How to generate a screenshot without avatars?

```bash
node index.js --input chat.txt --avatar-style none
```

### Q: Does it support group chats?

Yes. Simply use different names in the chat text. Each name automatically gets its own avatar.

### Q: Where are the output images saved?

Default output directory is `/workspace/`. Use `--output` to specify any path.

### Q: How to view detailed logs?

Add the `--verbose` flag:

```bash
node index.js --input chat.txt --verbose
```

---

## License

MIT

## Acknowledgments

- [WeChat Dialog Generator](https://gaopengbin.github.io/wechat-dialog-generator/) — Original web project
- [DiceBear](https://www.dicebear.com/) — Free avatar generation API
- [html-to-image](https://github.com/bubkoo/html-to-image) — DOM screenshot library
