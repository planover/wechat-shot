/**
 * 微信截图王 v4.0 — 场景扩展模块
 *
 * 基于输入内容（OCR文字或文字描述）自动生成微信聊天场景。
 * 分析主题 → 创建角色 → 编写对话 → 返回标准聊天格式文本。
 */

// ═══════════════════════════════════════════
//  角色名模板库（按场景类型分类）
// ═══════════════════════════════════════════
const ROLE_POOLS = {
  // 日常闲聊
  casual: ['小明', '小红', '阿强', '小美', '老王', '小李', '阿花', '大壮'],
  // 职场/工作
  work: ['王总', '李经理', '小张', '陈工', '赵姐', '刘总监', '周主管', '吴老师'],
  // 技术/科技
  tech: ['码农小王', '架构师老李', '产品经理阿强', '前端小美', '后端大刘', '测试老赵'],
  // 学术/教育
  academic: ['学霸小明', '教授老张', '学渣阿强', '辅导员王姐', '研究生小李'],
  // 历史/文化
  history: ['历史迷小王', '知乎达人老李', '吃瓜群众阿强', '文化人老张', '段子手小陈'],
  // 搞笑/娱乐
  funny: ['段子手老王', '捧哏小李', '毒舌阿美', '吃瓜群众', '气氛组小刘'],
  // 财经/商业
  business: ['投资人大刘', '创业者小王', '分析师老赵', '韭菜小李', '股神阿强'],
};

// ═══════════════════════════════════════════
//  时间模板
// ═══════════════════════════════════════════
function randomTime() {
  const h = 8 + Math.floor(Math.random() * 15); // 8:00 - 23:00
  const m = Math.floor(Math.random() * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════
//  Emoji 库
// ═══════════════════════════════════════════
const EMOJIS = {
  laugh: ['🤣', '😂', '哈哈', '笑死'],
  surprise: ['😱', '🤯', '天哪', '离谱'],
  think: ['🤔', '怎么说呢', 'emmm'],
  agree: ['👍', '确实', '没错', '同意'],
  fire: ['🔥', '太强了', '牛'],
  cry: ['😭', '哭了', '太难了'],
  love: ['❤️', '爱了', '太棒了'],
  wow: ['💯', '满分', '绝了'],
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ═══════════════════════════════════════════
//  主题分析
// ═══════════════════════════════════════════
function analyzeTopic(content) {
  const text = content.toLowerCase();
  
  if (/知乎|回答|问题|讨论/.test(text)) return 'zhihu';
  if (/历史|清朝|明朝|古代|皇帝|战争/.test(text)) return 'history';
  if (/代码|bug|编程|前端|后端|api|服务器/.test(text)) return 'tech';
  if (/老板|工资|加班|开会|项目|kpi|年终/.test(text)) return 'work';
  if (/股票|基金|投资|涨|跌|赚钱|亏/.test(text)) return 'business';
  if (/学校|考试|作业|老师|成绩|毕业/.test(text)) return 'academic';
  if (/搞笑|段子|笑话|离谱|神逻辑/.test(text)) return 'funny';
  
  return 'casual';
}

// ═══════════════════════════════════════════
//  场景生成器
// ═══════════════════════════════════════════
function pickRoles(topic, count = 3) {
  const poolKey = {
    zhihu: 'history', history: 'history', tech: 'tech',
    work: 'work', business: 'business', academic: 'academic',
    funny: 'funny',
  }[topic] || 'casual';
  
  const pool = ROLE_POOLS[poolKey];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ═══════════════════════════════════════════
//  场景生成器 — 各主题的对话模板
// ═══════════════════════════════════════════
function generateZhihuChat(content, roles) {
  const [a, b, c] = roles;
  const time1 = randomTime();
  const time2 = randomTime();
  const topic = extractKeyPhrase(content);
  
  return `**【${time1}】**

**${a}**：你们看这个知乎回答了吗？${topic}${pick(EMOJIS.laugh)}
**${b}**：看到了！那个回答太离谱了吧${pick(EMOJIS.laugh)}
**${c}**：怎么说？
**${a}**：[图片]
**${b}**：哈哈哈哈哈这什么神逻辑！${pick(EMOJIS.surprise)}
**${c}**：等等，他这逻辑不对劲吧？？
**${a}**：重点来了——${pick(['这人一本正经地胡说八道','关键是他自己还信了','最离谱的是下面的评论还一片叫好'])}${pick(EMOJIS.laugh)}
**${b}**：合着${pick(['这波操作下来','这么一分析','仔细一想'])}……全是在扯淡啊？
**${c}**：最离谱的是${pick(['他那个结论','那个数据来源','那个推理过程'])}……
**${a}**：而且他还说${pick(['这个结论早就有人提过','这是常识','这是公理'])}😂
**${b}**：结论就是${pick(['完全在鬼扯','一本正经的胡说八道','逻辑鬼才'])}🤣
**${c}**：所以${pick(['这人是来搞笑的吧','知乎现在的回答都这样了','我居然看完了'])}？
**${a}**：[红包] ${pick(['新年快乐','恭喜发财','大吉大利'])}！
**${b}**：[转账] 8.88:${pick(['辛苦费','茶钱','瓜钱'])}
**${c}**：哈哈哈哈 你们俩够了

**【${time2}】**

**${a}**：话说回来，这个回答热度不低啊
**${b}**：毕竟是${pick(['一本正经地','认真严肃地','旁征博引地'])}胡说八道了
**${c}**：建议下次问"${pick(['这个答主什么时候出书','知乎什么时候开脱口秀','这个逻辑能拿诺贝尔奖吗'])}"
**${a}**：因为${pick(['这个回答实在太精彩了','大家都被逗乐了','这届网友太有才了'])}！这是常识！
**${b}**：${pick(EMOJIS.laugh)}${pick(EMOJIS.laugh)}${pick(EMOJIS.laugh)} 今天的快乐源泉有了`;
}

function generateHistoryChat(content, roles) {
  const [a, b, c] = roles;
  const time1 = randomTime();
  const time2 = randomTime();
  const topic = extractKeyPhrase(content);
  
  return `**【${time1}】**

**${a}**：你们看这个${topic}了吗？笑死我了${pick(EMOJIS.laugh)}
**${b}**：看到了！那个说法太离谱了吧${pick(EMOJIS.laugh)}
**${c}**：什么情况？
**${a}**：[图片]
**${b}**：哈哈哈哈哈这${pick(['历史观','脑回路','逻辑'])}太清奇了！
**${c}**：等等，他是在说真的还是开玩笑？
**${a}**：重点来了——${pick(['这段分析简直绝了','他引用的那个文献根本不存在','这推理能力我给满分'])}${pick(EMOJIS.laugh)}
**${b}**：合着${pick(['历史是这么解读的','教科书都白学了','我历史老师要气活了'])}？
**${c}**：最离谱的是${pick(['那个数据','那段描述','那个结论'])}……
**${a}**：而且他还一本正经地说${pick(['这是史学界的共识','很多学者都这么认为','这个观点早就被证实了'])}😂
**${b}**：结论就是${pick(['这位是个段子手','历史是门艺术','我们都被骗了'])}🤣
**${c}**：所以${pick(['清朝地主其实很有钱','古代人比我们想象的要聪明','历史就是任人打扮的小姑娘'])}？
**${a}**：[红包] ${pick(['新年快乐','恭喜发财'])}！虽然${pick(['历史观不太正','逻辑有点问题','但这波不亏'])}
**${b}**：[转账] 8.88:${pick(['瓜钱','茶钱'])}
**${c}**：哈哈哈哈 你们俩够了

**【${time2}】**

**${a}**：话说回来，这个话题热度不低啊
**${b}**：毕竟是${pick(['一本正经地','认真严肃地','旁征博引地'])}胡说八道了
**${c}**：建议下次讨论"${pick(['如果秦始皇有互联网','如果郑和发现了美洲','如果宋朝有蒸汽机'])}"
**${a}**：因为${pick(['历史没有如果','想象力才是第一生产力','我们都是事后诸葛亮'])}！这是常识！
**${b}**：${pick(EMOJIS.laugh)}${pick(EMOJIS.laugh)}${pick(EMOJIS.laugh)} 今天的快乐源泉有了`;
}

function generateTechChat(content, roles) {
  const [a, b, c] = roles;
  const time1 = randomTime();
  
  return `**【${time1}】**

**${a}**：兄弟们，这个${extractKeyPhrase(content)}你们怎么看？${pick(EMOJIS.think)}
**${b}**：${pick(['这个方案我之前想过','这个坑我踩过','这个问题我遇到过'])}……
**${c}**：详细说说？
**${a}**：[图片]
**${b}**：${pick(['这个架构有问题啊','这个代码写得不错','这个设计可以优化'])}${pick(EMOJIS.fire)}
**${c}**：${pick(['展开讲讲','不太理解','能举个栗子吗'])}？
**${a}**：主要问题是${pick(['性能瓶颈','兼容性','可维护性'])}，你想想看……
**${b}**：对！我之前就遇到过类似的情况，后来用了${pick(['微服务','分布式','缓存'])}方案
**${c}**：那${pick(['为什么不直接用现成的','这个方案有什么缺点','部署起来麻烦吗'])}？
**${a}**：因为${pick(['业务场景不同','技术栈不匹配','团队不熟悉'])}啊${pick(EMOJIS.laugh)}
**${b}**：[红包] ${pick(['辛苦费','加班费','咖啡钱'])}
**${c}**：${pick(EMOJIS.agree)}${pick(EMOJIS.fire)} 学到了学到了`;
}

function generateWorkChat(content, roles) {
  const [a, b, c] = roles;
  const time1 = randomTime();
  
  return `**【${time1}】**

**${a}**：大家注意下，${extractKeyPhrase(content)}这个事要重视起来
**${b}**：收到，我这边已经在跟进了${pick(EMOJIS.agree)}
**${c}**：具体什么要求？
**${a}**：${pick(['老板刚才开会说了','上面刚下的通知','客户那边提了新需求'])}，必须${pick(['本周内完成','月底前上线','尽快落实'])}
**${b}**：${pick(['这个时间有点紧啊','人手不太够','技术上有些难度'])}${pick(EMOJIS.think)}
**${c}**：${pick(['我可以帮忙','我这边有现成的方案','之前做过类似的'])}
**${a}**：好！那就${pick(['分下工','安排一下','开个会讨论'])}。${pick(EMOJIS.fire)}
**${b}**：${pick(['我去拉个群','我来写方案','我负责对接'])}${pick(EMOJIS.agree)}
**${c}**：${pick(['没问题','交给我','保证完成'])}！${pick(EMOJIS.wow)}`;
}

function generateFunnyChat(content, roles) {
  const [a, b, c] = roles;
  const time1 = randomTime();
  const time2 = randomTime();
  
  return `**【${time1}】**

**${a}**：哈哈哈哈你们看这个${pick(EMOJIS.laugh)}
**${b}**：什么东西这么好笑？
**${a}**：[图片]
**${c}**：${pick(EMOJIS.surprise)} 这什么鬼啊哈哈哈哈
**${b}**：${pick(['这脑回路我服了','这人是个天才','笑不活了'])}${pick(EMOJIS.laugh)}
**${a}**：重点看${pick(['第二段','那个结论','那个表情'])}！简直绝了
**${c}**：${pick(['我要是这人我都不敢出门','这回答值得一个诺贝尔搞笑奖','建议写入教科书'])}🤣
**${b}**：${pick(['你们别笑了我肚子疼','这个月的快乐就靠这个了','我已经转发给所有人了'])}${pick(EMOJIS.laugh)}
**${a}**：[红包] ${pick(['快乐基金','笑果费','开心钱'])}
**${b}**：[转账] 6.66:${pick(['瓜钱','奶茶钱','快乐水'])}
**${c}**：${pick(EMOJIS.laugh)}${pick(EMOJIS.laugh)}${pick(EMOJIS.laugh)} 你们够了

**【${time2}】**

**${a}**：说真的，${extractKeyPhrase(content)}这个事……
**${b}**：${pick(['已经成为经典了','可以载入史册了','这辈子忘不了'])}${pick(EMOJIS.fire)}
**${c}**：建议下次${pick(['开个专题讨论','出本书','拍个纪录片'])}`;
}

function generateCasualChat(content, roles) {
  const [a, b, c] = roles;
  const time1 = randomTime();
  const time2 = randomTime();
  
  return `**【${time1}】**

**${a}**：你们知道吗？${extractKeyPhrase(content)}${pick(EMOJIS.think)}
**${b}**：啊？真的假的？
**${a}**：[图片]
**${c}**：${pick(EMOJIS.surprise)} 这也太……
**${b}**：${pick(['不会吧','我不信','让我看看'])}${pick(EMOJIS.laugh)}
**${a}**：千真万确！${pick(['我亲眼看到的','网上都传疯了','官方都承认了'])}
**${c}**：那${pick(['这到底是怎么回事','为什么会这样','接下来怎么办'])}？
**${b}**：${pick(['这剧情比电视剧还精彩','我这辈子都没见过这种事','我要发朋友圈'])}🤣
**${a}**：所以说啊，${pick(['活久见','世界之大无奇不有','今天又学到了'])}${pick(EMOJIS.fire)}
**${c}**：${pick(['你们说的我都想去看看了','我要把这个转发给所有人','这个月最佳话题就是它了'])}
**${b}**：[红包] ${pick(['信息费','科普费'])}
**${a}**：[转账] 5.20:${pick(['辛苦费','奶茶钱'])}
**${c}**：${pick(EMOJIS.laugh)}${pick(EMOJIS.laugh)} 你们太会了

**【${time2}】**

**${a}**：话说回来，这事热度越来越高了
**${b}**：毕竟${pick(['太戏剧性了','太有意思了','太离谱了'])}，大家都想八卦一下
**${c}**：${pick(['我赌五毛这事还有后续','期待第二季','坐等反转'])}${pick(EMOJIS.fire)}`;
}

// ═══════════════════════════════════════════
//  提取关键词
// ═══════════════════════════════════════════
function extractKeyPhrase(content) {
  // 提取前30个字符作为关键词
  const cleaned = content.replace(/[\n\r\t]+/g, ' ').trim();
  if (cleaned.length <= 30) return cleaned;
  return cleaned.substring(0, 30) + '...';
}

// ═══════════════════════════════════════════
//  主入口
// ═══════════════════════════════════════════
/**
 * @param {string} content - 输入内容（OCR提取的文字或文字描述）
 * @param {object} options - 选项
 * @param {string} options.topic - 强制指定主题类型
 * @param {number} options.roleCount - 角色数量 (默认3)
 * @returns {string} 标准微信聊天格式文本
 */
function expandToChat(content, options = {}) {
  const topic = options.topic || analyzeTopic(content);
  const roleCount = options.roleCount || 3;
  const roles = pickRoles(topic, roleCount);
  
  const generators = {
    zhihu: generateZhihuChat,
    history: generateHistoryChat,
    tech: generateTechChat,
    work: generateWorkChat,
    business: generateWorkChat,  // 复用职场模板
    academic: generateCasualChat,
    funny: generateFunnyChat,
    casual: generateCasualChat,
  };
  
  const generator = generators[topic] || generateCasualChat;
  return generator(content, roles);
}

module.exports = { expandToChat, analyzeTopic, pickRoles, extractKeyPhrase };
