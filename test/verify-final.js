const puppeteer = require('puppeteer');

const CHAT = `**【7月7日 16:30】**
**我**：陪老板面试一个很重要的文宣岗位，小姑娘都挺好的，老板已经默认了
**康师傅**：见微知著，真招进来指不定能有多折腾

**【7月8日 09:20】**
**我**：结果结束的时候，小姑娘莫名其妙来了句"老天奶"，然后工作就没了`;

const OTHERS = ['康师傅'];
const SPEAKERS = ['我', '康师傅', '我'];
const enc = (s) => encodeURIComponent(s);
const avatarUrl = (s) => `https://api.dicebear.com/9.x/avataaars/png?seed=${enc(s)}&backgroundColor=transparent&size=200`;

async function toDataUri(u) {
  const r = await fetch(u);
  const b = await r.arrayBuffer();
  return 'data:image/png;base64,' + Buffer.from(b).toString('base64');
}

(async () => {
  const AVATARS = {
    '我': await toDataUri(avatarUrl('我')),
    '康师傅': await toDataUri(avatarUrl('康师傅')),
  };

  const b = await puppeteer.launch();
  const p = await b.newPage();
  await p.setViewport({ width: 1125, height: 800 });
  await p.goto('https://gaopengbin.github.io/wechat-dialog-generator/', { waitUntil: 'networkidle2' });
  const ta = await p.$('.s-textarea');
  await ta.click({ clickCount: 3 });
  await ta.type(CHAT, { delay: 1 });
  await new Promise(r => setTimeout(r, 400));
  const btn = await p.evaluateHandle(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('解析并导入')));
  await btn.click();
  await new Promise(r => setTimeout(r, 2500));

  const SELF_GREEN = 'rgb(149, 236, 105)';
  const AV_SIZE = 40;
  await p.evaluate(({ others, speakers, avatarData, SELF_GREEN, AV_SIZE }) => {
    const injectAvatar = (body, dataUri, side) => {
      if (!dataUri) return;
      let img = body.querySelector('img.avatar-injected');
      if (!img) {
        img = document.createElement('img');
        img.className = 'avatar-injected';
        img.style.width = AV_SIZE + 'px';
        img.style.height = AV_SIZE + 'px';
        img.style.flex = '0 0 ' + AV_SIZE + 'px';
        img.style.borderRadius = '6px';
        img.style.alignSelf = 'flex-start';
        img.style.objectFit = 'cover';
        img.style.display = 'block';
        if (side === 'left') { img.style.marginRight = '8px'; body.insertBefore(img, body.firstChild); }
        else { img.style.marginLeft = '8px'; body.appendChild(img); }
      }
      img.src = dataUri;
    };
    const bubbles = Array.from(document.querySelectorAll('.wc-bubble'));
    bubbles.forEach((bubble, i) => {
      const speaker = speakers[i];
      const isOther = speaker && others.includes(speaker);
      const body = bubble.closest('.wc-body') || bubble.parentElement;
      if (!body) return;
      const arrow = body.querySelector('.wc-arrow');
      if (isOther) {
        body.style.width = 'fit-content'; body.style.maxWidth = '85%';
        body.style.marginLeft = '12px'; body.style.marginRight = 'auto'; body.style.alignItems = 'flex-start';
        bubble.style.background = '#ffffff'; bubble.style.color = '#1a1a1a';
        bubble.style.marginLeft = '8px'; bubble.style.marginRight = '0';
        if (arrow) { arrow.style.background = '#ffffff'; arrow.style.transform = 'scaleX(-1)'; }
        injectAvatar(body, avatarData[speaker], 'left');
      } else {
        body.style.width = 'fit-content'; body.style.maxWidth = '85%';
        body.style.marginLeft = 'auto'; body.style.marginRight = '12px'; body.style.alignItems = 'flex-end';
        bubble.style.background = SELF_GREEN; bubble.style.color = '#1a1a1a';
        bubble.style.marginLeft = '0'; bubble.style.marginRight = '8px';
        if (arrow) { arrow.style.background = SELF_GREEN; arrow.style.transform = 'none'; }
        injectAvatar(body, avatarData[speaker], 'right');
      }
    });
  }, { others: OTHERS, speakers: SPEAKERS, avatarData: AVATARS, SELF_GREEN, AV_SIZE });

  // 等待头像图片（data URI）加载完成再测量
  await p.evaluate(() => new Promise((resolve) => {
    const imgs = Array.from(document.querySelectorAll('img.avatar-injected'));
    let pending = imgs.length;
    if (pending === 0) return resolve();
    imgs.forEach((im) => {
      if (im.complete) { if (--pending === 0) resolve(); }
      else { im.onload = im.onerror = () => { if (--pending === 0) resolve(); }; }
    });
    setTimeout(resolve, 4000);
  }));

  const info = await p.evaluate(() => {
    const out = [];
    const srcs = [];
    document.querySelectorAll('.wc-body').forEach((body, i) => {
      const bubble = body.querySelector('.wc-bubble');
      const arrow = body.querySelector('.wc-arrow');
      const img = body.querySelector('img.avatar-injected');
      const src = img ? img.src : '';
      srcs.push(src);
      out.push({
        i,
        bubble_bg: getComputedStyle(bubble).backgroundColor,
        arrow_bg: arrow ? getComputedStyle(arrow).backgroundColor : '(none)',
        img_exists: !!img,
        img_w: img ? img.getBoundingClientRect().width.toFixed(0) : '',
        img_h: img ? img.getBoundingClientRect().height.toFixed(0) : '',
        img_src_head: src.slice(0, 24),
      });
    });
    return { rows: out, distinctAvatarCount: new Set(srcs.filter(Boolean)).size };
  });
  console.log(JSON.stringify(info, null, 2));
  await b.close();
})();
