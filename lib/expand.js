'use strict';
/**
 * lib/expand.js — 场景扩展 / 对话生成引擎 (v4.1)
 *
 * 目标：去除"AI 味"，生成更自然、口语化、有"人味"的微信聊天。
 *  - 大语料 + 随机采样：杜绝每次都来一句"啊？真的假的？"
 *  - 不规则话轮：有人连发两条、有人只回一个"？"
 *  - 口语化：语气词、网络用语、笑声变体、稀松的标点
 *  - emoji 非强制：约一半消息不带 emoji，更像真人
 *  - realism 参数 [0,1]：越高越随意（越多 slang / 语气词 / 省略标点）
 *
 * 注意：渲染由外部微信对话生成器完成，本文件只负责"写什么"。
 * 支持的格式（必须与生成器兼容）：
 *   时间节点  **【10:23】**
 *   普通消息  **姓名**：内容
 *   图片      [图片] / [图片]URL
 *   红包      [红包]备注
 *   转账      [转账]金额:备注
 *   语音      [语音]秒数
 */

// ── 随机源（可注入 seed 以保证可复现）──
function makeRng(seed) {
  if (seed == null) return Math.random;
  let s = 2166136261 >>> 0;
  for (let i = 0; i < String(seed).length; i++) {
    s ^= String(seed).charCodeAt(i);
    s = Math.imul(s, 16777619) >>> 0;
  }
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const chance = (rng, p) => rng() < p;
function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── 口语化素材 ──
const FILLERS = ['讲真', '说起来', '不过', '其实吧', '额', '那个', '哎', '害', '怎么说呢', '我寻思', '有一说一', '不是', '你别说'];
const SLANGS = ['yyds', 'xswl', '草', '蚌埠住了', '麻了', '寄', 'awsl', '绝绝子', '栓Q', '尊嘟假嘟', '泰裤辣', 'emo', 'nb', '666', '离谱', '服了', '真香', '上头', '破防', '整活', '儿豁', '好家伙'];
const LAUGHS = ['哈哈哈', '哈哈哈哈哈', '2333', '噗', '笑死', '草（一种植物）', '哈哈', 'hhh', '🤣', '😂', '🤭', '笑不活了', '蚌'];
const SHORTS = ['？', '哈？', '牛', '真的？', '？？', '妙啊', '绝了', '离谱', '草', '蹲一个', 'mark', '收藏了', '学到了', '泪目', '破防了', '蹲', '绷不住了'];

// 每个场景：角色名池 + 专用语料
const SCENES = {
  daily: {
    names: ['小美', '阿强', '老王', '丽丽', '大壮', '婷婷', '胖虎', '阿杰', '小雨', '强子', '娜娜', '老李'],
    open: [
      (t) => `你们猜怎么着，${t}`,
      (t) => `刚刷到个事，${t}`,
      (t) => `跟你们说个离谱的，${t}`,
      (t) => `今天遇到${t}`,
      (t) => `我朋友刚跟我讲，${t}`,
      (t) => `中午吃饭时候看到${t}`,
    ],
    react: [
      '哈？还有这种事',
      '我靠真的假的',
      '不是，这也太离谱了',
      '草，离谱他妈给离谱开门',
      '竟然是这样？？',
      '我一开始还不信',
      '好家伙，世界真奇妙',
      '这我得见识见识',
      '听完我整个人都不好了',
      '你别骗我啊',
    ],
    question: [
      '然后呢然后呢',
      '那后来咋样了',
      '所以到底啥情况',
      '对方啥反应啊',
      '你咋不早说',
      '有图吗有图吗',
      '这是哪的事儿',
      '当事人知道不',
    ],
    comment: [
      '讲真我也遇到过类似的',
      '有一说一，挺常见的',
      '害，生活嘛就这样',
      '我寻思这也不算啥',
      '换个角度想也合理',
      '主要是心态得稳',
      '反正我是信了',
      '这种事吧，见怪不怪',
    ],
    close: [
      '行吧，当个乐子看',
      '回头细说，先忙了',
      '哈哈哈先到这',
      '记下了，改天聊',
      '这瓜我先吃为敬',
      '溜了溜了，下次见',
    ],
  },
  funny: {
    names: ['沙雕网友', '梗王', '二营长', '戏精本精', '快乐源泉', '嘴强王者', '柠檬精', '显眼包'],
    open: [
      (t) => `笑死，${t}`,
      (t) => `今日份快乐来了：${t}`,
      (t) => `救命，${t}`,
      (t) => `这个必须分享，${t}`,
      (t) => `谁能懂我的笑点，${t}`,
    ],
    react: [
      '哈哈哈哈哈救命',
      '草，笑不活了',
      '2333 你是懂的',
      '蚌埠住了家人们',
      '破防了属于是',
      '我笑出鹅叫',
      '已被笑死，抢救无效',
      '这届网友是真行',
    ],
    question: [
      '出处是哪啊求链接',
      '这是真的假的哈哈',
      '还有后续没',
      '原图发来康康',
      '谁懂啊笑死',
    ],
    comment: [
      '建议申遗',
      '已截图发给闺蜜',
      '这文案我可以',
      '转发到家族群了',
      '今天的快乐是你给的',
      '笑点太对了',
    ],
    close: [
      '先笑为敬',
      '收藏了，反复观看',
      '哈哈哈被你整破防',
      '溜了，去乐一乐',
    ],
  },
  work: {
    names: ['王经理', '小李', '张总', '陈姐', '老周', '产品经理', '前端小王', '实习生小赵'],
    open: [
      (t) => `跟大家同步下，${t}`,
      (t) => `刚开会说到${t}`,
      (t) => `老板又提了，${t}`,
      (t) => `群里都在聊${t}`,
      (t) => `需求又变了，${t}`,
    ],
    react: [
      '收到，我跟进一下',
      '这需求有点离谱啊',
      '收到，周一给方案',
      '行吧，又得加班了',
      '我这边没问题',
      '额，这个得排期',
      '收到，先评估工作量',
      '懂了，我同步给团队',
    ],
    question: [
      'deadline 啥时候',
      '这块谁负责',
      '预算够不',
      '老板啥意思啊',
      '要拉个会吗',
      '文档在哪',
    ],
    comment: [
      '讲真这活不好干',
      '有一说一，之前也搞过',
      '我这边资源紧张',
      '先对齐下目标吧',
      '问题不大，能推',
      '流程上还得走审批',
    ],
    close: [
      '行，那先这样',
      '会后我发纪要',
      '收到，辛苦各位',
      '明天对进度',
      '先忙，有事先说',
    ],
  },
  tech: {
    names: ['程序员老A', '运维胖子', '架构师K', '测试妹子', '后端老张', '前端小哥', '算法大佬', 'CTO'],
    open: [
      (t) => `刚踩了个坑，${t}`,
      (t) => `技术群里在聊${t}`,
      (t) => `线上又炸了，${t}`,
      (t) => `看到个骚操作，${t}`,
      (t) => `今天面试被人问${t}`,
    ],
    react: [
      '这 bug 我熟',
      '草，又是这个',
      '我之前也遇到过',
      '一看就是缓存问题',
      '建议直接重构',
      '日志打了没',
      '重启试试（狗头）',
      '这波属于是玄学',
    ],
    question: [
      '复现得了吗',
      '用的啥版本',
      '报错贴一下',
      '并发多少挂的',
      '你们监控咋没报警',
      '用的啥框架',
    ],
    comment: [
      '讲真这设计有问题',
      '有一说一，能跑就行',
      '我寻思加个锁就好',
      '建议上链路追踪',
      '这个得压测一下',
      '文档写清楚就行',
    ],
    close: [
      '先这样，改天细聊',
      '收到，我去提个 MR',
      '行，我记 bug 里了',
      '溜了，继续搬砖',
      '会后再对齐',
    ],
  },
  finance: {
    names: ['股神老刘', '理财小白', '基民阿强', '财经博主', '隔壁老王', '韭菜本韭', '分析师C'],
    open: [
      (t) => `最近盘面，${t}`,
      (t) => `跟大家说个事，${t}`,
      (t) => `群里在传${t}`,
      (t) => `刚看了下报表，${t}`,
      (t) => `财经号在聊${t}`,
    ],
    react: [
      '这走势有点东西',
      '草，我又被套了',
      '能不能格局大一点',
      '短期波动正常',
      '这消息真的假的',
      '我加仓了，别学我',
      '风险自负啊兄弟',
    ],
    question: [
      '你满仓没',
      '啥时候止盈',
      '这票还能拿不',
      '美联储咋看',
      '仓位多少合适',
    ],
    comment: [
      '讲真别 all in',
      '有一说一，分散点好',
      '我寻思定投最稳',
      '别听群里瞎喊',
      '长期持有就完事了',
    ],
    close: [
      '行，自己琢磨',
      '收到，我去看看',
      '溜了，盯盘去了',
      '先这样，盈亏自负',
    ],
  },
  academic: {
    names: ['师兄', '导师', '同门小王', '科研狗', '博士生阿May', '期刊审稿人', '实验室老李'],
    open: [
      (t) => `最近看论文，${t}`,
      (t) => `组会在聊${t}`,
      (t) => `导师又催了，${t}`,
      (t) => `审稿意见回来了，${t}`,
      (t) => `实验数据有点怪，${t}`,
    ],
    react: [
      '这结论我存疑',
      '样本量是不是太小',
      '方法学有点问题吧',
      '草，这也能发',
      '我师兄做过类似的',
      '复现了吗',
      '图看着就不对劲',
    ],
    question: [
      '你用啥对照',
      'p 值多少',
      '数据开源不',
      '审稿周期多久',
      '导师啥意见',
    ],
    comment: [
      '讲真得补实验',
      '有一说一，立意还行',
      '我寻思换个指标试试',
      '先投个水会吧',
      '这方向卷得很',
    ],
    close: [
      '行，我改改再投',
      '收到，回去跑代码',
      '溜了，赶 deadline',
      '先这样，文献发你',
    ],
  },
  history: {
    names: ['历史区up', '考据党', '三国迷', '历史课代表', '野史爱好者', '老学究'],
    open: [
      (t) => `翻史料看到${t}`,
      (t) => `历史圈在聊${t}`,
      (t) => `跟你们说个冷知识，${t}`,
      (t) => `看通鉴看到${t}`,
      (t) => `知乎有人问${t}`,
    ],
    react: [
      '这段正史没写啊',
      '草，野史更精彩',
      '出处是哪本',
      '我怎么记得不是这样',
      '这得看原始文献',
      '演义里可不是这么说的',
    ],
    question: [
      '有史料佐证不',
      '这是哪个朝代',
      '当事人后来咋样',
      '你信哪派说法',
      '考据过吗',
    ],
    comment: [
      '讲真得辩证看',
      '有一说一，演义当不得真',
      '我寻思时代背景不一样',
      '这事儿史学家也吵',
      '建议看原始奏折',
    ],
    close: [
      '行，回去翻书',
      '收到，长知识了',
      '溜了，继续啃史料',
      '先这样，改天细聊',
    ],
  },
  zhihu: {
    names: ['知乎答主', '杠精本精', '匿名用户', '高赞老哥', '路过群众', '相关专业人士'],
    open: [
      (t) => `刚看到个神回答，${t}`,
      (t) => `知乎热榜：${t}`,
      (t) => `有个问题挺有意思，${t}`,
      (t) => `高赞说${t}`,
      (t) => `评论区更精彩，${t}`,
    ],
    react: [
      '这回答我直接收藏',
      '草，说到心坎里',
      '评论区才是本体',
      '高赞也不一定对',
      '我之前也这么想',
      '这波格局打开了',
    ],
    question: [
      '你信哪条',
      '有专业人士解答不',
      '这是编的还是真的',
      '底下吵架没',
      '关注了答主没',
    ],
    comment: [
      '讲真看个乐就行',
      '有一说一，半真半假',
      '我寻思别太当真',
      '评论区人均大佬',
      '这题我会，略懂',
    ],
    close: [
      '行，去看原帖了',
      '收到，已三连',
      '溜了，继续刷',
      '先这样，下回分解',
    ],
  },
};

// ── 从输入里提炼"话题短语" ──
function extractTopic(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/\[图片[^\]]*\]/g, '').replace(/\[语音[^\]]*\]/g, '').trim();
  s = s.replace(/^\[图片:\s*[^]]*\]$/i, '').trim();
  if (!s) return '';
  // 取第一句（遇到句号/。/，/，截断），保留约 36 字
  const cut = s.split(/[。\.\n！!?？]/)[0];
  s = (cut || s).slice(0, 36);
  return s;
}

// ── 推断场景 ──
function inferScene(raw) {
  const t = String(raw || '');
  const map = [
    [/历史|朝代|皇帝|古代|史料|通鉴|三国|清|明|唐|宋/, 'history'],
    [/代码|bug|前端|后端|算法|程序|服务器|上线|接口|数据库|架构/, 'tech'],
    [/老板|工资|加班|需求|会议|同事|hr|绩效|离职|公司/, 'work'],
    [/基金|股票|理财|投资|涨跌|盘面|收益率|美联储|币/, 'finance'],
    [/论文|研究|实验|导师|学术|文献|期刊|研究生|博士/, 'academic'],
    [/知乎|回答|热榜|高赞|问题/, 'zhihu'],
    [/搞笑|笑死|沙雕|梗|段子|沙比|神回复/, 'funny'],
  ];
  for (const [re, sc] of map) if (re.test(t)) return sc;
  return 'daily';
}

// ── 单行"人味"处理 ──
function humanize(text, rng, realism) {
  let t = String(text);

  // 偶尔加语气词（不每次都加）
  if (chance(rng, realism * 0.22)) {
    const f = pick(rng, FILLERS);
    if (!/^(讲真|说起来|其实吧|有一说一)/.test(t)) t = `${f}，${t}`;
  }
  // 偶尔夹网络用语
  if (chance(rng, realism * 0.18)) {
    t = `${t} ${pick(rng, SLANGS)}`;
  }
  // 处理结尾标点：口语里常常没句号
  t = t.replace(/[。.]+$/g, '');
  if (chance(rng, realism * 0.5)) {
    // 陈述句偶尔省掉标点，显得更随意
    t = t.replace(/[~～]+$/g, '');
  } else if (chance(rng, 0.3)) {
    t += pick(rng, ['~', '～', '…', '...']);
  }
  // 笑声变体（仅在像在笑的语境里）
  if (/笑|哈|草|蚌|233|乐|整活/.test(t) && chance(rng, 0.4)) {
    t = `${t} ${pick(rng, LAUGHS)}`;
  }
  return t.trim();
}

// 是否给本句加 emoji（约一半概率不加）
function maybeEmoji(rng, realism) {
  if (!chance(rng, 0.5 - realism * 0.1)) return '';
  const pool = ['😂', '🤣', '😅', '🤔', '👍', '🔥', '💀', '😭', '😏', '🥲', '✨', '🙃', '😱', '🤯', '👀'];
  return ` ${pick(rng, pool)}`;
}

// 对一段已有的聊天记录做轻度人味润色（保留原意）
function humanizeChat(text, realism) {
  return String(text).split('\n').map((line) => {
    const m = line.match(/^(\s*\*?.+?\*\*\s*[：:])\s*(.*)$/);
    if (m && m[2]) return `${m[1]} ${humanize(m[2].trim(), Math.random, realism)}`;
    return line;
  }).join('\n');
}

function randomTime(rng, baseHour) {
  const h = (baseHour + Math.floor(rng() * 3)) % 24;
  const m = Math.floor(rng() * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function buildTimeNode(rng, hour) {
  // 真实微信风格：上午/下午 + 时间，偶尔纯时间
  const h = hour % 24;
  let label;
  if (chance(rng, 0.5)) {
    const ap = h < 12 ? '上午' : (h < 18 ? '下午' : '晚上');
    label = `${ap} ${String(h % 12 === 0 ? 12 : h % 12)}:${String(Math.floor(rng() * 60)).padStart(2, '0')}`;
  } else {
    label = `${String(h).padStart(2, '0')}:${String(Math.floor(rng() * 60)).padStart(2, '0')}`;
  }
  return `**【${label}】**`;
}

// ── 主入口 ──
function expandToChat(rawContent, opts = {}) {
  const realism = Math.max(0, Math.min(1, opts.realism != null ? Number(opts.realism) : 0.7));
  // 如果输入本身就是聊天记录，直接轻度人味处理，避免重复扩展
  if (looksLikeChat(rawContent)) return humanizeChat(rawContent, realism);
  const rng = makeRng(opts.seed);
  const sceneKey = opts.scene && SCENES[opts.scene] ? opts.scene : inferScene(rawContent);
  const scene = SCENES[sceneKey];

  const topic = extractTopic(rawContent);
  const fallbackTopics = ['隔壁邻居养的猫会自己开门', '楼下奶茶店第二杯半价暗号', '公司电梯又坏了', '我妈让我穿秋裤', '周末去露营遇上下雨'];
  const effectiveTopic = topic || pick(rng, fallbackTopics);

  // 选 2~3 个角色
  const names = shuffle(rng, scene.names).slice(0, chance(rng, 0.35) ? 3 : 2);
  const [A, B, C] = names;
  const others = names.slice(1);

  const lines = [];
  let hour = 9 + Math.floor(rng() * 3);
  lines.push(buildTimeNode(rng, hour));

  const emit = (who, msg) => {
    const m = humanize(msg, rng, realism) + (chance(rng, 0.5) ? maybeEmoji(rng, realism) : '');
    lines.push(`**${who}**：${m}`);
  };
  const emitShort = (who) => emit(who, pick(rng, SHORTS));
  const emitImg = (who) => lines.push(`**${who}**：[图片]`);
  const emitVoice = (who) => lines.push(`**${who}**：[语音]${1 + Math.floor(rng() * 20)}`);

  // 开场
  emit(A, pick(rng, scene.open)(effectiveTopic));

  // 反应轮（1~2 人）
  const reactors = shuffle(rng, others).slice(0, 1 + (chance(rng, 0.6) ? 1 : 0));
  for (const who of reactors) {
    emit(who, pick(rng, scene.react));
    if (chance(rng, 0.25)) emitShort(who); // 偶尔补一句短回应
  }

  // 主体：追问 / 评论 / 插科打诨 交织
  const bodyRounds = 3 + Math.floor(rng() * 4); // 3~6 轮
  for (let i = 0; i < bodyRounds; i++) {
    const who = pick(rng, names);
    const roll = rng();
    if (roll < 0.34) {
      emit(who, pick(rng, scene.question));
    } else if (roll < 0.7) {
      emit(who, pick(rng, scene.comment));
    } else if (roll < 0.82) {
      emitShort(who);
    } else if (roll < 0.9) {
      emitImg(who);
    } else {
      emitVoice(who);
    }
    // 偶尔同一个人连发两句（更真实）
    if (chance(rng, 0.2)) {
      const who2 = pick(rng, names);
      emit(who2, pick(rng, scene.comment));
    }
    // 偶尔自然插入红包/转账（仅在合适场景）
    if (chance(rng, 0.12)) {
      lines.push(`**${pick(rng, others)}**：[红包]${pick(rng, ['恭喜发财', '新年快乐', '请喝奶茶', '接好运', '群发福利'])}`);
    }
    if (chance(rng, 0.08)) {
      const amt = pick(rng, ['8.88', '5.20', '66.66', '13.14', '1.00', '52.00']);
      lines.push(`**${pick(rng, others)}**：[转账]${amt}:${pick(rng, ['收到', '奶茶钱', '饭费', '谢啦', '回礼'])}`);
    }
  }

  // 收尾
  emit(pick(rng, names), pick(rng, scene.close));

  // 约 35% 概率再来一段"晚些时候"的对话，增加真实感
  if (chance(rng, 0.35)) {
    hour = (hour + 3 + Math.floor(rng() * 4)) % 24;
    lines.push('');
    lines.push(buildTimeNode(rng, hour));
    emit(pick(rng, names), pick(rng, ['话说回来，' + effectiveTopic + '这事儿还有后续']));
    emit(pick(rng, others), pick(rng, scene.react));
    emitShort(pick(rng, names));
  }

  return lines.join('\n');
}

// 判断输入是否已经是一段"聊天记录"（含 **姓名**：消息 或 **【时间】** 分隔）
function looksLikeChat(text) {
  return String(text).split('\n').some((l) =>
    /^\s*\*?.+?\*\*\s*[：:]/.test(l) || /^\s*\*\*【.+?】\*\*\s*$/.test(l)
  );
}

module.exports = { expandToChat, looksLikeChat, humanize, humanizeChat, SCENES, inferScene };
