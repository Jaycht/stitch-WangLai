/**
 * 系统日历集成 —— 解决「提醒重启后丢失」的根问题
 *
 * 为什么需要它：
 *   LocalNotifications 的定时任务是进程级的，手机重启 / 应用被系统杀掉就消失。
 *   写进系统日历后，事件由系统应用（日历/日历服务）持有，
 *   重启不影响、到点由系统响铃，还能在手机日历 App 里直接看到，误不误都心里有数。
 *
 * 双通道设计：
 *   系统日历（primary）—— 持久、跨重启、用户可见
 *   系统通知（secondary）—— 见 notify.ts，到点弹横幅，两者互为补充
 *
 * v2.13.1：不再有「应用内提醒条」兜底（实测使用时长短、价值低），
 * 改为通知 + 日历双通道，两者都不可用时如实告知用户，不再假装能提醒。
 *
 * 插件：@ebarooni/capacitor-calendar (MIT, ebarooni)
 */

import type { GiftRecord, Todo, DB } from './types';

/* ---------------- 插件类型（懒加载，Web 环境下不存在） ---------------- */

interface CalEvent {
  id: string;
  calendarId: string | null;
  title: string;
  location: string | null;
  description: string | null;
  startDate: number;
  endDate: number;
  alerts: number[];
}

type CalPlugin = {
  checkPermission(o: { scope: string }): Promise<{ result: string }>;
  requestWriteOnlyCalendarAccess(): Promise<{ result: string }>;
  getDefaultCalendar(): Promise<{ result: { id: string | null } | null }>;
  createEvent(o: Record<string, unknown>): Promise<{ result: string }>;
  modifyEvent(o: Record<string, unknown>): Promise<{ result: string }>;
  deleteEventsById(o: { eventIds: string[] }): Promise<unknown>;
  listEventsInRange(o: { from: number; to: number }): Promise<{ result: CalEvent[] }>;
};

let pluginCache: CalPlugin | null | undefined;

async function getPlugin(): Promise<CalPlugin | null> {
  if (pluginCache !== undefined) return pluginCache;
  try {
    const cap = (globalThis as any).Capacitor;
    if (!cap?.isNativePlatform?.()) {
      pluginCache = null;
      return null;
    }
    const mod = await import('@ebarooni/capacitor-calendar');
    pluginCache = (mod as any).CapacitorCalendar as CalPlugin;
  } catch {
    pluginCache = null;
  }
  return pluginCache;
}

/** 当前环境是否支持写日历 */
export async function canUseCalendar(): Promise<boolean> {
  return (await getPlugin()) !== null;
}

/** 申请日历写权限（只需要写入，读权限不必要） */
export async function ensurePermission(): Promise<boolean> {
  const p = await getPlugin();
  if (!p) return false;
  try {
    const cur = await p.checkPermission({ scope: 'writeOnly' });
    if (cur.result === 'granted') return true;
    const req = await p.requestWriteOnlyCalendarAccess();
    return req.result === 'granted';
  } catch {
    return false;
  }
}

/* ---------------- 事件标识 ---------------- */

/**
 * 用标题前缀标记本应用创建的事件。
 * 这样listEventsInRange 拉回来能认得出哪些是我们的，不误删用户自己的日程。
 */
const TAG = '[礼记]';

export const eventTitleOf = (kind: 'record' | 'todo', subject: string) =>
  `${TAG}${kind === 'record' ? '酒席' : '待办'}· ${subject}`;

/* ---------------- 写入 ---------------- */

export interface WriteResult {
  ok: boolean;
  /** 事件 id，保存下来后续可改/删 */
  eventId?: string;
  message: string;
  native: boolean;
}

function atOf(s: string): number | null {
  const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, hh, mi] = m;
  const dt = new Date(+y, +mo - 1, +d, hh ? +hh : 9, mi ? +mi : 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt.getTime();
}

/** 写一条酒席提醒到系统日历 */
export async function putRecord(
  r: GiftRecord,
  nameOf: (id: string) => string,
  leadMin: number,
): Promise<WriteResult> {
  const p = await getPlugin();
  if (!p) return { ok: false, message: '当前环境不支持系统日历', native: false };
  if (!r.remindAt) return { ok: false, message: '未设提醒时间', native: false };

  const start = atOf(r.remindAt);
  if (start === null) return { ok: false, message: '提醒时间格式不对', native: false };
  if (start <= Date.now()) return { ok: false, message: '时间已过', native: false };

  const who = nameOf(r.personId) || '';
  const title = eventTitleOf('record', who || '酒席');
  const evDate = r.received?.date ?? r.remindAt.slice(0, 10);

  try {
    // 已经写过就改，没有就建。避免重复创建。
    const existing = await findByTitle(title, evDate);
    const body = {
      title,
      location: r.received?.place ?? null,
      description: [
        who ? `对方：${who}` : '',
        r.remark ? `备注：${r.remark}` : '',
        '（由往来礼记写入）',
      ].filter(Boolean).join('\n'),
      startDate: start,
      endDate: start + 3600000,
      alerts: leadMin > 0 ? [leadMin] : [],
      isAllDay: false,
    };
    if (existing) {
      await p.modifyEvent({ ...body, id: existing.id });
      return { ok: true, eventId: existing.id, message: '已更新日历事件', native: true };
    }
    const { result } = await p.createEvent(body);
    return { ok: true, eventId: result, message: '已写入系统日历', native: true };
  } catch (e: any) {
    return { ok: false, message: '写日历失败：' + (e?.message ?? e), native: true };
  }
}

/** 写一条待办到系统日历。v2.13.1：填了 dueTime 就按时刻，否则退回提前 1 天 */
export async function putTodo(t: Todo, personName: string): Promise<WriteResult> {
  const p = await getPlugin();
  if (!p) return { ok: false, message: '当前环境不支持系统日历', native: false };
  if (!t.due) return { ok: false, message: '未设截止日期', native: false };

  const hasTime = !!t.dueTime;
  const start = hasTime
    ? atOf(`${t.due}T${t.dueTime}`)
    : atOf(`${t.due}T09:00`);
  if (start === null) return { ok: false, message: '日期格式不对', native: false };

  const subject = personName ? `${t.title}（${personName}）` : t.title;
  const title = eventTitleOf('todo', subject);
  // 有时刻用用户设的提前量，没有就沿用「提前 1 天」
  const alertMin = hasTime ? (t.leadMin ?? 60) : 1440;

  try {
    const existing = await findByTitle(title, t.due);
    const body = {
      title,
      location: null,
      description: [
        t.note ?? '',
        personName ? `相关人员：${personName}` : '',
        '（由往来礼记写入）',
      ].filter(Boolean).join('\n'),
      startDate: start,
      endDate: start + 3600000,
      alerts: alertMin > 0 ? [alertMin] : [],
      isAllDay: false,
    };
    if (existing) {
      await p.modifyEvent({ ...body, id: existing.id });
      return { ok: true, eventId: existing.id, message: '已更新日历事件', native: true };
    }
    const { result } = await p.createEvent(body);
    return { ok: true, eventId: result, message: '已写入系统日历', native: true };
  } catch (e: any) {
    return { ok: false, message: '写日历失败：' + (e?.message ?? e), native: true };
  }
}

/** 按标题+日期查已有事件（用于去重） */
async function findByTitle(title: string, day: string): Promise<CalEvent | null> {
  const p = await getPlugin();
  if (!p) return null;
  try {
    const from = atOf(`${day}T00:00`) ?? Date.now() - 86400000;
    const to = atOf(`${day}T23:59`) ?? from + 86400000;
    const { result } = await p.listEventsInRange({ from, to });
    return result?.find((e) => e.title === title) ?? null;
  } catch {
    return null;
  }
}

/* ---------------- 删除 ---------------- */

export async function removeByTitle(title: string): Promise<boolean> {
  const p = await getPlugin();
  if (!p) return false;
  try {
    const from = Date.now() - 400 * 86400000;   // 往前一年
    const to = Date.now() + 400 * 86400000;     // 往后一年
    const { result } = await p.listEventsInRange({ from, to });
    const hit = result?.filter((e) => e.title === title) ?? [];
    if (!hit.length) return false;
    await p.deleteEventsById({ eventIds: hit.map((e) => e.id) });
    return true;
  } catch {
    return false;
  }
}

/* ---------------- 全量同步 ---------------- */

export interface SyncResult {
  ok: boolean;
  native: boolean;
  records: number;
  todos: number;
  message: string;
}

/**
 * 以 DB 为准重建所有日历事件。
 * 先删掉本应用写的旧事件（按 TAG 前缀识别），再重建。
 * 只在用户主动点「同步到日历」或首次授权后调用，别每次启动都跑。
 */
export async function syncAll(
  db: DB,
  nameOf: (id: string) => string,
): Promise<SyncResult> {
  const p = await getPlugin();
  if (!p) {
    return { ok: false, native: false, records: 0, todos: 0, message: '当前环境不支持系统日历' };
  }
  const granted = await ensurePermission();
  if (!granted) {
    return { ok: false, native: true, records: 0, todos: 0, message: '未获得日历权限' };
  }

  // 清掉旧的（只清带 TAG 的，绝不碰用户自己的日程）
  try {
    const from = Date.now() - 400 * 86400000;
    const to = Date.now() + 400 * 86400000;
    const { result } = await p.listEventsInRange({ from, to });
    const mine = result?.filter((e) => e.title.startsWith(TAG)) ?? [];
    if (mine.length) await p.deleteEventsById({ eventIds: mine.map((e) => e.id) });
  } catch { /* 清理失败不阻塞重建 */ }

  let n1 = 0;
  const lead = db.settings.remindLeadMin ?? 60;
  for (const r of db.records) {
    if (!r.remindAt) continue;
    const res = await putRecord(r, nameOf, lead);
    if (res.ok) n1++;
  }

  let n2 = 0;
  for (const t of db.todos) {
    if (t.done || !t.due) continue;
    const res = await putTodo(t, t.personId ? nameOf(t.personId) : '');
    if (res.ok) n2++;
  }

  return {
    ok: true, native: true, records: n1, todos: n2,
    message: `已同步 ${n1} 个酒席提醒${n2 ? `、${n2} 条待办` : ''}到系统日历`,
  };
}

/** 打开系统日历 App */
export async function openCalendarApp(): Promise<boolean> {
  const p = await getPlugin() as any;
  if (!p?.openCalendar) return false;
  try {
    await p.openCalendar();
    return true;
  } catch {
    return false;
  }
}

export { TAG as CALENDAR_TAG };
