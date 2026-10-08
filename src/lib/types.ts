/**
 * 数据模型定义
 *
 * 设计原则：一次录入 = 一个人 + 一对「收/回」双向流水。
 * 人情往来是成对发生的，只记单边必然算不清，所以 Receipt / Return 同级。
 */

export const SCHEMA_VERSION = 3;

/** 礼金渠道 */
export type PayChannel = 'cash' | 'wechat' | 'alipay' | 'transfer' | 'goods';

export const CHANNELS: { key: PayChannel; label: string }[] = [
  { key: 'cash', label: '现金' },
  { key: 'wechat', label: '微信' },
  { key: 'alipay', label: '支付宝' },
  { key: 'transfer', label: '转账' },
  { key: 'goods', label: '实物折现' },
];

/** 事由分类 tone：fest=喜事（红） / solemn=丧事（黑白） */
export type EventTone = 'fest' | 'solemn';

/** 内置事由 key（自定义事由用 uuid 作key） */
export type EventKind = string;

export interface EventDef {
  key: string;
  label: string;
  tone: EventTone;
  /** 内置不可删 */
  builtin?: boolean;
  /**
   * 备注框的动态提示词。
   *
   * 为什么放在数据层而不是页面里：提示词是**事由的属性**，
   * 换页面/换入口都要一致，散在组件里迟早漏。
   *
   * 丧事系（solemn）一律不给提示词 —— 白事场合不该提示
   * 「与逝者关系」这类字眼，涛哥明确要求。
   */
  hint?: string;
}

/** 内置事由：喜事（红） */
export const FEST_EVENTS: EventDef[] = [
  { key: 'wedding', label: '结婚', tone: 'fest', builtin: true,
    hint: '如：张三、李四（新人姓名）' },
  { key: 'betrothal', label: '订婚', tone: 'fest', builtin: true,
    hint: '如：双方姓名' },
  { key: 'birthday', label: '生日', tone: 'fest', builtin: true,
    hint: '如：寿星姓名' },
  { key: 'full_month', label: '满月', tone: 'fest', builtin: true,
    hint: '如：宝宝小名' },
  { key: 'baptism', label: '百日', tone: 'fest', builtin: true,
    hint: '如：宝宝小名' },
  { key: 'school', label: '升学', tone: 'fest', builtin: true,
    hint: '如：录取学校与专业' },
  { key: 'moving', label: '乔迁', tone: 'fest', builtin: true,
    hint: '如：新房地址或小区' },
  { key: 'business', label: '开业', tone: 'fest', builtin: true,
    hint: '如：新店名称与地址' },
  { key: 'other', label: '其他', tone: 'fest', builtin: true,
    hint: '如：随礼事项' },
];

/** 内置事由：丧事（黑白） */
export const SOLEMN_EVENTS: EventDef[] = [
  { key: 'funeral', label: '丧事', tone: 'solemn', builtin: true },
  { key: 'memorial', label: '忌日', tone: 'solemn', builtin: true },
  { key: 'sacrifice', label: '祭祀', tone: 'solemn', builtin: true },
];

export const BUILTIN_EVENTS: EventDef[] = [...FEST_EVENTS, ...SOLEMN_EVENTS];

/**
 * 取全部事由（内置 + 自定义）。自定义按tone 分组追加。
 * customEvents 存于 DB，永久保存直到用户删除。
 */
export function allEvents(custom: CustomEvent[] = []): EventDef[] {
  return [...BUILTIN_EVENTS, ...custom];
}

/** 查事由名称。找不到时返回 key 本身（不吞信息） */
export function eventLabel(k: string, custom: CustomEvent[] = []): string {
  return makeEventLookup(custom)(k).label;
}

export function eventsByTone(custom: CustomEvent[] = []): Record<EventTone, EventDef[]> {
  const all = allEvents(custom);
  return {
    fest: all.filter((e) => e.tone === 'fest'),
    solemn: all.filter((e) => e.tone === 'solemn'),
  };
}

/** 用户自定义事由 */
export interface CustomEvent {
  key: string;
  label: string;
  tone: EventTone;
  createdAt: string;
}

/** 由 DB 提供的查找函数 */
export function makeEventLookup(custom: CustomEvent[]) {
  const map = new Map<string, EventDef>();
  for (const e of BUILTIN_EVENTS) map.set(e.key, e);
  for (const e of custom) map.set(e.key, e);
  return (k: string): EventDef =>
    map.get(k) ?? { key: k, label: k || '其他', tone: 'fest' };
}

export const eventTone = (k: string, custom: CustomEvent[] = []): EventTone =>
  makeEventLookup(custom)(k).tone;

/** 亲属关系分组（宗亲/姑姻/舅眷/姨姻/其它姻亲） */
export type RelationGroup =
  | 'clan'    // 宗亲
  | 'aunt'    // 姑姻
  | 'uncle'   // 舅眷
  | 'maternal_aunt' // 姨姻
  | 'affinal' // 其它姻亲
  | 'friend'  // 朋友
  | 'other';

export const RELATION_GROUPS: { key: RelationGroup; label: string; desc: string }[] = [
  { key: 'clan', label: '宗亲', desc: '同姓本家，父系直系与兄弟后代，血亲同姓。' },
  { key: 'aunt', label: '姑姻', desc: '姑姑这一支的姻亲，如姑父及姑父家人。' },
  { key: 'uncle', label: '舅眷', desc: '舅舅一脉眷属，母系血亲与舅妈姻亲。' },
  { key: 'maternal_aunt', label: '姨姻', desc: '姨妈这一支的姻亲，如姨父及姨父家人。' },
  { key: 'affinal', label: '其它姻亲', desc: '岳父母、公婆、连襟、妯娌、嫂子、姐夫等。' },
  { key: 'friend', label: '朋友', desc: '非亲属关系的朋友、同事、同学。' },
  { key: 'other', label: '未归类', desc: '暂未归入以上分组。' },
];

/**
 * 人员档案
 *
 * 重名区分方案（本地常见同名很多，靠这些字段区分）：
 *   alias  —— 首选，手动起的区分名，如「建国·南麻」「张三(2)」
 *   relation / region —— 次选，从关系或地区自动生成区分后缀
 *   三者都空时，列表自动加序号兜底
 */
export interface Person {
  id: string;
  name: string;
  /** 区分名，同名时用于显示，如「建国·南麻」 */
  alias?: string;
  /** 关系备注，如「表弟」「同事」 */
  relation?: string;
  /** 关系分组，用于统计与称呼 */
  group?: RelationGroup;
  phone?: string;
  wechat?: string;
  /** 所在地区/村 */
  region?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** 单边流水（收礼或回礼） */
export interface Side {
  /** 渠道 */
  channel: PayChannel;
  /** 金额（元），实物折现时才用 */
  amount: number;
  /** 礼物描述，可空 */
  gift?: string;
  /** 日期 YYYY-MM-DD */
  date: string;
  /** 事由 */
  event: EventKind;
  /** 地点/办方，如「女方家·沂源县城」 */
  place?: string;
}

/**
 * 一条人情记录 = 对方 + 收到的礼 + 回给对方的礼
 * 任何一边都可为空（纯收礼 / 纯随礼），但日期事由必填
 */
export interface GiftRecord {
  id: string;
  personId: string;
  /** 对方办的事（我收礼） */
  received: Side;
  /** 我方办的事（我随礼），可空 */
  returned?: Side;
  remark?: string;
  /**
   * v2.14.0：**已废弃**（原「提醒时间」字段）。
   *
   * 决策（涛哥 2026-10-08）：本应用**不再提供提醒服务**，
   * 只做登记，提醒请用手机自带闹钟。
   *
   * 为什么保留这个字段声明而不是直接删：
   * 用户的旧备份里**存在**这个字段，migrate 读旧数据时会碰到它。
   * 留着类型声明并在 migrate 里显式丢弃，比让它变成"未知字段"
   * 更可控（万一将来要恢复提醒，字段名不用重新设计）。
   */
  remindAt?: string;
  /** v2.14.0：已废弃，原「提醒已触发」标记，不再使用 */
  reminded?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 待办事项 */
export interface Todo {
  id: string;
  title: string;
  note?: string;
  /** 截止日期 YYYY-MM-DD，可空。**只做登记，不提醒** */
  due?: string;
  /** 截止时刻 HH:mm，可空。**只做登记，不提醒** */
  dueTime?: string;
  /** v2.14.0：已废弃，原「提前多少分钟提醒」 */
  leadMin?: number;
  done: boolean;
  /** 关联到某个人，可空 */
  personId?: string;
  createdAt: string;
  updatedAt: string;
  doneAt?: string;
}

/** 设置项 */
export interface Settings {
  /** 主题色 */
  accent: string;
  /** 背景色 */
  bg: string;
  /** 自定义背景图（dataURL） */
  bgImage?: string;
  /** 锁屏密码启用 */
  appLock: boolean;
  /** 货币符号 */
  currency: string;
  /** 月份起始日 */
  weekStart: 0 | 1;
  /**
   * v2.14.0 以下字段全部**废弃**（原提醒/权限/日历相关）。
   * 保留声明是为了让 migrate 能读懂旧备份，读到后显式丢弃。
   *
   * 决策依据：涛哥 2026-10-08「不提供提醒服务，提醒请用手机自带闹钟」，
   * 并要求**零权限申请**（国行 ROM 才不会判我们是敏感应用）。
   */
  /** 已废弃：通知是否已授权 */
  notifAsked?: boolean;
  /** 已废弃：用户已处理过通知权限提示 */
  notifHintDismissed?: boolean;
  /** 已废弃：提醒提前分钟数 */
  remindLeadMin?: number;
  /** 已废弃：是否同步到系统日历 */
  useCalendar?: boolean;
  /** 已废弃：日历权限是否已授予 */
  calendarAsked?: boolean;
  /** 已废弃：已放弃通知只走日历 */
  notifyFallbackOnly?: boolean;
  /** 界面风格：a 青瓷扁平 / b 柔光玻璃 / c 澎湃卡片 */
  theme?: string;
  /** 用户是否手动选过风格（选过就不再自动覆盖） */
  themePicked?: boolean;
  /** 关怀模式字号档：off / xs / sm / md / lg / xl / xxl */
  fontSize?: string;
  /** 关怀模式开关（开启时强制扁平主题） */
  careMode?: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  accent: '#2F6B4F',
  bg: '#F4F2EE',
  appLock: false,
  currency: '¥',
  weekStart: 1,
  theme: 'a',
  themePicked: false,
  fontSize: 'off',
  careMode: false,
};

/** 关怀模式档位（依据 Material Design 3 规范，最大 200%+） */
export const FONT_SCALES: { key: string; label: string; mult: string; desc: string }[] = [
  { key: 'auto', label: '跟随系统', mult: 'auto', desc: '用手机「设置 → 显示与亮度 → 字体大小」的值，本应用不再额外放大' },
  { key: 'off', label: '标准', mult: '1.0×', desc: '默认字号，系统设置照常生效' },
  { key: 'xs', label: '大', mult: '1.12×', desc: '略大，看得清一点' },
  { key: 'sm', label: '更大', mult: '1.28×', desc: '中等偏大' },
  { key: 'md', label: '特大', mult: '1.45×', desc: '长时间看账不累' },
  { key: 'lg', label: '超大', mult: '1.65×', desc: '视力不佳推荐' },
  { key: 'xl', label: '超大+', mult: '1.85×', desc: '接近系统大字体' },
  { key: 'xxl', label: '最大', mult: '2.10×', desc: '超过 WCAG 200% 要求' },
];

/** 整个数据库的形状 */
export interface DB {
  schemaVersion: number;
  persons: Person[];
  records: GiftRecord[];
  /** 待办事项 */
  todos: Todo[];
  /** 用户自定义事由，永久保存 */
  customEvents: CustomEvent[];
  settings: Settings;
  updatedAt: string;
}

export const EMPTY_DB: DB = {
  schemaVersion: SCHEMA_VERSION,
  persons: [],
  records: [],
  todos: [],
  customEvents: [],
  settings: DEFAULT_SETTINGS,
  updatedAt: '',
};

/* ---------------- 重名区分 ---------------- */

/**
 * 生成人员的显示名。
 *
 * 优先级：
 *   1. alias  —— 用户手动设的区分名，最高优先
 *   2. relation/region —— 有则作为后缀，如「张三（表弟·南麻）」
 *   3. 序号   —— 都没有时用同姓第几个兜底，如「张三（2）」
 *
 * 只有同名的才会加后缀，独有姓名直接返回原名，不啰嗦。
 */
export function resolveDisplayName(
  p: Person | undefined,
  sameNameCount: number,
  indexAmongSameName?: number,
): string {
  if (!p) return '（未命名）';
  if (sameNameCount <= 1) return p.name;

  const alias = p.alias?.trim();
  if (alias) return alias;

  const bits = [p.relation?.trim(), p.region?.trim()].filter(Boolean).join('·');
  if (bits) return `${p.name}（${bits}）`;

  const n = indexAmongSameName ?? 0;
  return `${p.name}（${n + 1}）`;
}

/** 统计每个姓名出现次数 */
export function nameCounts(persons: Person[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of persons) m.set(p.name, (m.get(p.name) ?? 0) + 1);
  return m;
}

/** 查某姓名的所有人 */
export function findSameName(persons: Person[], name: string, exceptId?: string): Person[] {
  return persons.filter((p) => p.name === name && p.id !== exceptId);
}

/** 待办按未完成/完成分组 */
export function splitTodos(todos: Todo[]): { open: Todo[]; done: Todo[] } {
  const open = todos.filter((t) => !t.done)
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  const done = todos.filter((t) => t.done)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  return { open, done };
}

/* ---------------- 计算辅助 ---------------- */

/** 收礼总额 */
export const sumReceived = (rs: GiftRecord[]) =>
  rs.reduce((s, r) => s + (Number(r.received?.amount) || 0), 0);

/** 回礼总额 */
export const sumReturned = (rs: GiftRecord[]) =>
  rs.reduce((s, r) => s + (Number(r.returned?.amount) || 0), 0);

/** 人情净差：收 - 回。正数=人家给得多，负数=自己多随了 */
export const netBalance = (rs: GiftRecord[]) => sumReceived(rs) - sumReturned(rs);

/** 按人聚合 */
export interface PersonStat {
  person: Person;
  records: GiftRecord[];
  received: number;
  returned: number;
  net: number;
  count: number;
}

export function aggregateByPerson(db: DB): PersonStat[] {
  const map = new Map<string, GiftRecord[]>();
  for (const r of db.records) {
    const arr = map.get(r.personId) ?? [];
    arr.push(r);
    map.set(r.personId, arr);
  }
  const out: PersonStat[] = [];
  for (const p of db.persons) {
    const recs = map.get(p.id) ?? [];
    const received = sumReceived(recs);
    const returned = sumReturned(recs);
    out.push({
      person: p,
      records: recs,
      received,
      returned,
      net: received - returned,
      count: recs.length,
    });
  }
  return out.sort((a, b) => b.net - a.net);
}

/** 渠道分布统计 */
export function channelBreakdown(rs: GiftRecord[]): { channel: PayChannel; amount: number }[] {
  const acc = new Map<PayChannel, number>();
  for (const r of rs) {
    const a = Number(r.received?.amount) || 0;
    const b = Number(r.returned?.amount) || 0;
    if (a) acc.set(r.received.channel, (acc.get(r.received.channel) ?? 0) + a);
    if (b && r.returned) acc.set(r.returned.channel, (acc.get(r.returned.channel) ?? 0) + b);
  }
  return [...acc.entries()].map(([channel, amount]) => ({ channel, amount }))
    .sort((a, b) => b.amount - a.amount);
}
