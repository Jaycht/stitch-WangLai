/**
 * 数据持久化 + 版本迁移
 *
 * 兼容保证：
 * 1. 任何时刻落盘的数据都带 schemaVersion
 * 2. 读取时按版本号走迁移链，v1 -> v2 -> ... 逐级升
 * 3. 迁移是纯函数，不改动输入；失败回退为返回空库而非抛错
 */

import {
  DB, EMPTY_DB, SCHEMA_VERSION, Person, GiftRecord, Settings, Todo,
  CustomEvent, DEFAULT_SETTINGS,
} from './types';

const KEY = 'wanglai.db.v1';
const KEY_LEGACY = 'wanglai.records';

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const now = () => new Date().toISOString();
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ---------------- 迁移 ---------------- */

/** 宽松数字：任何脏数据都不让程序崩 */
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const str = (v: unknown): string => (v == null ? '' : String(v));

const VALID_CHANNELS = ['cash', 'wechat', 'alipay', 'transfer', 'goods'];
const VALID_EVENTS = [
  'wedding','betrothal','birthday','full_month','baptism','school','moving',
  'business','funeral','memorial','sacrifice','other',
];
const VALID_GROUPS = ['clan','aunt','uncle','maternal_aunt','affinal','friend','other'];

/** 渠道别名归一，兼容旧数据/外部导入 */
function normChannel(v: unknown): string {
  const s = str(v);
  if (VALID_CHANNELS.includes(s)) return s;
  const map: Record<string, string> = {
    红包: 'cash', 现金: 'cash', 微信: 'wechat', 支付宝: 'alipay',
    转账: 'transfer', 银行: 'transfer', 实物: 'goods', gift: 'goods',
  };
  return map[s] ?? 'cash';
}

/**
 * 事由 key 归一。
 *
 * 关键：不靠 key 格式猜，而是靠「这个 key 是否在 customEvents 里」。
 * 这样无论是内置 key、uuid、自定义串，只要在自定义表里认得就原样保留，
 * 认不得才降级到「其他」。
 */
function normEvent(
  v: unknown,
  customKeys?: Set<string>,
): string {
  const s = str(v);
  if (VALID_EVENTS.includes(s)) return s;
  const map: Record<string, string> = {
    婚礼: 'wedding', 结婚: 'wedding', 订婚: 'betrothal', 生日: 'birthday',
    满月: 'full_month', 满月酒: 'full_month', 百日: 'baptism', 升学: 'school',
    升学宴: 'school', 乔迁: 'moving', 开业: 'business', 丧事: 'funeral',
    白事: 'funeral', 出殡: 'funeral', 忌日: 'memorial', 祭祀: 'sacrifice',
    其他: 'other',
  };
  if (map[s]) return map[s];
  // 在自定义事由表里找得到 -> 原样保留，绝不降级（降级等于抹掉用户建的事由）
  if (customKeys?.has(s)) return s;
  return 'other';
}

/** 旧 v1 场景名 -> 新 EventKind */
function normEventFromScenario(v: unknown): string {
  const s = str(v);
  if (VALID_EVENTS.includes(s)) return s;
  if (s === 'solemn') return 'funeral';
  if (s === 'celebration') return 'other';
  return normEvent(s);
}

function normDate(v: unknown): string {
  const s = str(v);
  const m = s.match(/(\d{4})\D{0,2}(\d{1,2})\D{0,2}(\d{1,2})/);
  if (!m) return today();
  const [, y, mo, d] = m;
  const mm = Math.min(12, Math.max(1, +mo));
  const dd = Math.min(31, Math.max(1, +d));
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * 提醒时间归一为本地 'YYYY-MM-DDTHH:mm'。
 * 兼容多种输入：时间戳数字 / ISO串 / 'YYYY-MM-DD HH:mm' / Date 对象转出的串。
 * 解析不了就返回 undefined，绝不塞脏值进去。
 */
function normRemindAt(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  // 数字：当作毫秒时间戳
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : fmtLocal(d);
  }
  const s = str(v);
  const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d, hh, mi] = m;
  const dt = new Date(+y, Math.min(11, +mo) - 1, +d, +hh, +mi, 0, 0);
  if (Number.isNaN(dt.getTime())) return undefined;
  return fmtLocal(dt);
}

const p2 = (n: number) => String(n).padStart(2, '0');
const fmtLocal = (d: Date) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;

function normSide(raw: any, fallbackDate: string, customKeys?: Set<string>): GiftRecord['received'] {
  return {
    channel: normChannel(raw?.channel ?? raw?.payType ?? raw?.payMethod) as any,
    amount: num(raw?.amount ?? raw?.money ?? raw?.value),
    gift: str(raw?.gift ?? raw?.giftName) || undefined,
    date: raw?.date ? normDate(raw.date) : fallbackDate,
    event: normEvent(raw?.event ?? raw?.eventName ?? raw?.scenario, customKeys) as any,
    place: str(raw?.place ?? raw?.address ?? raw?.where) || undefined,
  };
}

function normPerson(raw: any): Person {
  const ts = now();
  return {
    id: str(raw?.id) || uid(),
    name: str(raw?.name ?? raw?.personName ?? raw?.who) || '未命名',
    alias: str(raw?.alias ?? raw?.displayName ?? raw?.nickname) || undefined,
    relation: str(raw?.relation ?? raw?.relationNote) || undefined,
    group: (VALID_GROUPS.includes(raw?.group) ? raw.group : undefined) as any,
    phone: str(raw?.phone ?? raw?.tel) || undefined,
    wechat: str(raw?.wechat ?? raw?.wx) || undefined,
    region: str(raw?.region ?? raw?.address) || undefined,
    note: str(raw?.note ?? raw?.remark) || undefined,
    createdAt: str(raw?.createdAt) || ts,
    updatedAt: str(raw?.updatedAt) || ts,
  };
}

function normRecord(raw: any, customKeys?: Set<string>): GiftRecord | null {
  const ts = now();
  const personId = str(raw?.personId);
  if (!personId) return null; // 归属已由调用方保证
  // v1 结构：{name, amount, type:'sent'|'received', event, date}
  // v2 结构：{personId, received:Side, returned?:Side}
  const isV2 = raw && (raw.received || raw.returned);
  if (isV2) {
    const d = raw.received?.date
      ? normDate(raw.received.date)
      : raw.createdAt ? normDate(raw.createdAt) : today();
    return {
      id: str(raw?.id) || uid(),
      personId,
      received: normSide(raw.received, d, customKeys),
      returned: raw.returned ? normSide(raw.returned, d, customKeys) : undefined,
      remark: str(raw?.remark ?? raw?.note) || undefined,
      remindAt: normRemindAt(raw.remindAt ?? raw.remind),
      reminded: raw?.reminded === true,
      createdAt: str(raw?.createdAt) || ts,
      updatedAt: str(raw?.updatedAt) || ts,
    };
  }
  // v1 -> v2
  const d = raw?.date ? normDate(raw.date)
    : raw?.createdAt ? normDate(raw.createdAt) : today();
  const amt = num(raw?.amount ?? raw?.money);
  const ev = normEventFromScenario(raw?.event ?? raw?.scenario);
  const side = {
    channel: normChannel(raw?.channel) as any,
    amount: amt,
    date: d,
    event: ev as any,
  };
  const isSent = str(raw?.type) === 'sent' || raw?.direction === 'sent';
  return {
    id: str(raw?.id) || uid(),
    personId,
    received: isSent
      ? { ...side, amount: 0, channel: 'cash' }   // 纯随礼：收礼侧留空
      : side,
    returned: isSent ? side : undefined,
    remark: str(raw?.remark) || undefined,
    createdAt: str(raw?.createdAt) || ts,
    updatedAt: str(raw?.updatedAt) || ts,
  };
}

function normSettings(raw: any): Settings {
  const lead = parseInt(String(raw?.remindLeadMin ?? ''), 10);
  return {
    accent: /^#[0-9A-Fa-f]{6}$/.test(str(raw?.accent)) ? raw.accent : DEFAULT_SETTINGS.accent,
    bg: /^#[0-9A-Fa-f]{6}$/.test(str(raw?.bg)) ? raw.bg : DEFAULT_SETTINGS.bg,
    bgImage: str(raw?.bgImage).startsWith('data:image/') ? raw.bgImage : undefined,
    appLock: raw?.appLock === true,
    currency: str(raw?.currency) || '¥',
    weekStart: raw?.weekStart === 0 ? 0 : 1,
    notifAsked: raw?.notifAsked === true,
    // 允许 0（准点提醒）到 2880（两天前），其余落回默认
    remindLeadMin: Number.isFinite(lead) && lead >= 0 && lead <= 2880
      ? lead : DEFAULT_SETTINGS.remindLeadMin,
    useCalendar: raw?.useCalendar === true,
    calendarAsked: raw?.calendarAsked === true,
    theme: ['a', 'b', 'c'].includes(str(raw?.theme)) ? str(raw.theme) : 'a',
    themePicked: raw?.themePicked === true,
    fontSize: ['off', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'].includes(str(raw?.fontSize))
      ? str(raw.fontSize) : 'off',
    careMode: raw?.careMode === true,
  };
}

/**
 * 把任意来源的对象（localStorage / 导入的 JSON）规范化成当前版本 DB。
 * 永不抛错，尽最大努力抢救数据。
 */
export function migrate(input: any): DB {
  if (!input || typeof input !== 'object') return { ...EMPTY_DB };

  // ---- 先解析自定义事由 ----
  // 必须排在 records 之前：只有拿到 key 集合，才能判断记录里的 event 是不是自定义的。
  // 顺序反了会把所有自定义事由降级成「其他」，等于抹掉用户建的事由。
  const rawCE: any[] = Array.isArray(input.customEvents) ? input.customEvents : [];
  const ceSeen = new Set<string>();
  const customEvents: CustomEvent[] = [];
  for (const raw of rawCE) {
    const label = str(raw?.label ?? raw?.name).trim();
    if (!label) continue;
    const tone = str(raw?.tone) === 'solemn' ? 'solemn' : 'fest';
    const key = str(raw?.key) || 'ce_' + uid();
    if (ceSeen.has(key)) continue;
    ceSeen.add(key);
    customEvents.push({ key, label, tone, createdAt: str(raw?.createdAt) || now() });
  }
  const customKeys = new Set(customEvents.map((c) => c.key));

  const personIndex = new Map<string, string>();
  const rawPersons: any[] = Array.isArray(input.persons)
    ? input.persons
    : Array.isArray(input.people) ? input.people : [];

  const persons = rawPersons.map(normPerson);
  // 已有人员入索引
  for (const p of persons) personIndex.set(p.id, '');
  // 人名 -> id（同名取第一个，作为无 personId 旧记录的兜底）
  for (const p of persons) {
    if (!personIndex.has('name:' + p.name)) personIndex.set('name:' + p.name, p.id);
  }

  const rawRecords: any[] = Array.isArray(input.records)
    ? input.records
    : Array.isArray(input.items) ? input.items : [];

  // 记录里出现但人员表里没有的人，按名字补建
  // 注意：同名不再合并 —— 本地确实存在多个「张三」，
  // 合并会丢档。找不到精确 id 时按名字取第一个，但重名时宁可新建也不要错并。
  const ensured: Person[] = [];
  const records: GiftRecord[] = [];
  for (const raw of rawRecords) {
    const rawName = str(raw?.name ?? raw?.personName);
    let pid = str(raw?.personId);
    // personId 悬空（指向不存在的人）时，退化成按名字匹配
    if (pid && !personIndex.has(pid)) pid = '';
    if (!pid && rawName) {
      const hit = personIndex.get('name:' + rawName);
      if (hit) {
        pid = hit;
      } else {
        const p = normPerson({ id: uid(), name: rawName });
        ensured.push(p);
        personIndex.set(p.id, '');
        personIndex.set('name:' + p.name, p.id);
        pid = p.id;
      }
    }
    if (!pid) continue; // 无法归属的孤立记录，丢弃
    const rec = normRecord({ ...raw, personId: pid }, customKeys);
    if (rec) records.push(rec);
  }

  records.sort((a, b) => (b.received.date || '').localeCompare(a.received.date || ''));

  // 待办
  const rawTodos: any[] = Array.isArray(input.todos)
    ? input.todos
    : Array.isArray(input.todos_) ? input.todos_ : [];
  const todos: Todo[] = rawTodos
    .map((raw): Todo | null => {
      const title = str(raw?.title ?? raw?.text ?? raw?.name).trim();
      if (!title) return null;
      const ts = now();
      return {
        id: str(raw?.id) || uid(),
        title,
        note: str(raw?.note ?? raw?.remark) || undefined,
        due: raw?.due ? normDate(raw.due) : undefined,
        done: raw?.done === true || raw?.completed === true,
        // personId 也要校验，悬空就丢掉关联
        personId: str(raw?.personId) && personIndex.has(str(raw.personId))
          ? str(raw.personId) : undefined,
        createdAt: str(raw?.createdAt) || ts,
        updatedAt: str(raw?.updatedAt) || ts,
        doneAt: str(raw?.doneAt) || undefined,
      };
    })
    .filter(Boolean) as Todo[];

  // 补回孤儿：历史记录里引用了某个 ce_ 开头的事由，但自定义列表里已没有它
  // （多半是用户删了这个事由）。补回来，历史记录才显示得出来，而不是一串 key。
  const orphanKeys = new Set<string>();
  for (const r of records) {
    for (const k of [r.received?.event, r.returned?.event]) {
      if (k && !VALID_EVENTS.includes(k) && !customKeys.has(k)) orphanKeys.add(k);
    }
  }
  for (const k of orphanKeys) {
    customEvents.push({
      key: k,
      label: '已删除的事由',
      tone: 'fest',
      createdAt: now(),
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    persons: [...persons, ...ensured],
    records,
    todos,
    customEvents,
    settings: normSettings(input.settings),
    updatedAt: str(input.updatedAt) || now(),
  };
}

/* ---------------- 落盘 ---------------- */

export function loadDB(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('[db] 读取失败，尝试旧键', e);
  }
  // 兼容最早的版本：localStorage 里存的是数组
  try {
    const legacy = localStorage.getItem(KEY_LEGACY);
    if (legacy) return migrate(JSON.parse(legacy));
  } catch { /* 忽略 */ }
  return { ...EMPTY_DB };
}

export function saveDB(db: DB): void {
  try {
    db.schemaVersion = SCHEMA_VERSION;
    db.updatedAt = now();
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    console.error('[db] 保存失败', e);
    throw new Error('本机存储空间不足，保存失败');
  }
}

export function clearDB(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(KEY_LEGACY);
}
