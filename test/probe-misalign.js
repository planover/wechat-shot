/**
 * 排查泡泡错位根因：检查 .wc-body 父元素层级、CSS 优先级、margin auto 是否生效
 */
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  const chatText = '**我**：测试消息\n**大刘**：回复消息';

  // 完整走正式流程（textarea + 按钮）
  await page.goto('https://gaopengbin.github.io/wechat-dialog-generator/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  const textarea = await page.$('.s-textarea');
  await textarea.click({ clickCount: 3 });
  await textarea.type(chatText, { delay: 5 });
  await new Promise(r => setTimeout(r, 500));

  const importBtn = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('解析并导入'));
  });
  await importBtn.click();
  await new Promise(r => setTimeout(r, 3000));

  // === 探针1: patchBubbleSides 前的 DOM 结构 ===
  console.log('=== 探针1: patchBubbleSides 前的 DOM 结构 ===');
  const beforePatch = await page.evaluate(() => {
    const bubbles = Array.from(document.querySelectorAll('.wc-bubble'));
    return bubbles.map((bubble, i) => {
      const body = bubble.closest('.wc-body') || bubble.parentElement;
      // 查父链
      let parentChain = [];
      let el = body;
      for (let j = 0; j < 5 && el; j++) {
        const cs = window.getComputedStyle(el);
        parentChain.push({
          tag: el.tagName,
          class: (el.className || '').toString().substring(0, 40),
          display: cs.display,
          flexDirection: cs.flexDirection,
          width: cs.width,
          maxWidth: cs.maxWidth,
          justifyContent: cs.justifyContent,
          alignItems: cs.alignItems,
        });
        el = el.parentElement;
      }
      return { idx: i, parentChain };
    });
  });

  beforePatch.forEach(b => {
    console.log(`--- 气泡${b.idx} ---`);
    b.parentChain.forEach((p, j) => {
      console.log(`  [L${j}] ${p.tag}.${p.class} | display=${p.display} flexDir=${p.flexDirection} w=${p.width} maxW=${p.maxWidth} justify=${p.justifyContent}`);
    });
  });

  // === 探针2: patchBubbleSides 后的 DOM 样式（模拟）===
  console.log('\n=== 探针2: 模拟 patchBubbleSides 并检查结果 ===');
  const afterPatch = await page.evaluate(({ OTHER_SIDE }) => {
    const others = [OTHER_SIDE];
    const speakers = ['我', '大刘'];
    
    const bubbles = Array.from(document.querySelectorAll('.wc-bubble'));
    bubbles.forEach((bubble, i) => {
      const speaker = speakers[i];
      const isOther = speaker && others.includes(speaker);
      const body = bubble.closest('.wc-body') || bubble.parentElement;
      if (!body) return;

      // 应用与 patchBubbleSides 相同的样式
      body.style.display = 'flex';
      body.style.flexDirection = 'row';
      
      if (isOther) {
        body.style.width = 'fit-content';
        body.style.maxWidth = '85%';
        body.style.marginLeft = '12px';
        body.style.marginRight = 'auto';
        body.style.alignItems = 'flex-start';
        bubble.style.background = '#ffffff';
      } else {
        body.style.width = 'fit-content';
        body.style.maxWidth = '85%';
        body.style.marginLeft = 'auto';
        body.style.marginRight = '12px';
        body.style.alignItems = 'flex-end';
        bubble.style.background = 'rgb(149,236,105)';
      }
    });

    // 读回 computed styles
    return Array.from(document.querySelectorAll('.wc-bubble')).map((bubble, i) => {
      const body = bubble.closest('.wc-body') || bubble.parentElement;
      const bodyCS = window.getComputedStyle(body);
      const parent = body.parentElement;
      const parentCS = parent ? window.getComputedStyle(parent) : null;
      
      return {
        idx: i,
        speaker: speakers[i],
        bodyDisplay: bodyCS.display,
        bodyFlexDir: bodyCS.flexDirection,
        bodyW: bodyCS.width,
        bodyMarginLeft: bodyCS.marginLeft,
        bodyMarginRight: bodyCS.marginRight,
        bodyMaxW: bodyCS.maxWidth,
        // 关键：body 在父容器中的实际位置
        parentTag: parent ? parent.tagName : null,
        parentDisplay: parentCS ? parentCS.display : null,
        parentW: parentCS ? parentCS.width : null,
        // body 的 offsetLeft（相对定位父级）
        bodyOffsetLeft: body.offsetLeft,
        bodyOffsetWidth: body.offsetWidth,
        parentOffsetWidth: parent ? parent.offsetWidth : null,
        // 气泡背景色
        bubbleBg: window.getComputedStyle(bubble).background.substring(0, 25),
      };
    });
  }, { OTHER_SIDE: '大刘' });

  afterPatch.forEach(r => {
    console.log(`气泡${r.idx}(${r.speaker}): body.display=${r.bodyDisplay} dir=${r.bodyFlexDir}`);
    console.log(`  margin: L=${r.bodyMarginLeft} R=${r.bodyMarginRight} | maxW=${r.bodyMaxW}`);
    console.log(`  offsetLeft=${r.bodyOffsetLeft} / bodyW=${r.bodyOffsetWidth} / parentW=${r.parentOffsetWidth}`);
    console.log(`  parent=${r.parentTag}(display=${r.parentDisplay},w=${r.parentW})`);
    console.log(`  bg=${r.bubbleBg}`);
  });

  // === 探针3: 检查 .wc-body 是否有 CSS 规则覆盖 inline style ===
  console.log('\n=== 探针3: CSS 规则优先级 ===');
  const cssInfo = await page.evaluate(() => {
    const body = document.querySelector('.wc-body');
    if (!body) return { error: 'no .wc-body found' };
    
    // 检查所有应用到 .wc-body 的 CSS 规则
    const sheets = Array.from(document.styleSheets);
    const rules = [];
    try {
      sheets.forEach(sheet => {
        try {
          Array.from(sheet.cssRules || []).forEach(rule => {
            if (rule.selectorText && (
              rule.selectorText.includes('.wc-body') ||
              rule.selectorText.includes('.wc-chat') ||
              rule.selectorText.includes('.wc-phone')
            )) {
              rules.push({
                selector: rule.selectorText,
                display: rule.style.display || rule.style.getPropertyValue('display') || '(not set)',
                cssText: rule.style.cssText.substring(0, 120),
              });
            }
          });
        } catch (e) { /* cross-origin */ }
      });
    } catch (e) {}
    
    // 也检查 body 自身的 className 和 id
    return {
      bodyClassName: body.className,
      bodyTagName: body.tagName,
      parentId: body.parentElement ? body.parentElement.className : null,
      grandParentId: body.parentElement?.parentElement ? body.parentElement.parentElement.className : null,
      matchingRules: rules,
    };
  });

  console.log(JSON.stringify(cssInfo, null, 2));

  await browser.close();
})();
