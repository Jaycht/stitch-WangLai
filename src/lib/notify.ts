/**
 * 提醒排期 —— 基于 Capacitor LocalNotifications
 *
 * 设计要点：
 * 1. Web 环境下插件不可用，降级为静默失败，不报错、不弹框
 * 2. 提前量可配（0 ~ 2880 分钟），默认提前 60 分钟
 * 3. 提醒 id 固定规则，重排不会重复创建
 * 4. **排期失败不再静默**：返回结构化原因，由调用方提示用户
 *
 * 关于权限（v2.13.1 起）：
 *   插件有 display（通知权限）与 exact_alarm（精确闹钟）两个独立权限。
 *   schedule() 时系统会自动弹「闹钟和提醒」授权页；用户拒绝则自动降级为
 *   非精确闹钟（仍会响，可能延迟几分钟），并回填 warning。
 *   所以这里不主动跳外部App，全交给系统。
 */

import type { GiftRecord, Todo, DB } from './types';

export interface Reminder {
  id: number;
  recordId: string;
  title: string;
  body: string;
  /** ISO 本地时间 'YYYY-MM-DDTHH:mm' */
  at: string;
}

/** 把 'YYYY-MM-DDTHH:mm' 解析为 Date，解析失败返回 null */
export function parseRemind(at: string): Date | null {
  const m = at.match(/(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, hh, mi] = m;
  const dt = new Date(+y, +mo - 1, +d, +hh, +mi, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** 从提醒时间倒推触发时刻 */
export function fireAt(remindAt: string, leadMin: number): Date | null {
  const base = parseRemind(remindAt);
  if (!base) return null;
  return new Date(base.getTime() - leadMin * 60000);
}

/** 通知 id：用记录 id 派生，保证同一条记录只有 1 个提醒 */
export function notifIdOf(recordId: string): number {
  let h = 0;
  for (let i = 0; i < recordId.length; i++) {
    h = (h * 31 + recordId.charCodeAt(i)) & 0x7fffffff;
  }
  // 避开 0，Capacitor 用 0 表示无效
  return (h % 200000) + 1;
}

/** 取一条记录要显示的提醒文案 */
export function reminderText(r: GiftRecord, nameOf: (id: string) => string): { title: string; body: string } {
  const who = nameOf(r.personId) || '有人';
  const date = r.received?.date ?? '';
  return {
    title: `${date} ${who} 的事`,
    body: '别忘了提前准备礼金，今天该随份子了',
  };
}

/* ---------------- 平台适配 ---------------- */

type PermState = 'granted' | 'denied' | 'prompt';

type NotifPlugin = {
  checkPermissions(): Promise<{ display: PermState; exact_alarm: PermState }>;
  requestPermissions(): Promise<{ display: PermState; exact_alarm: PermState }>;
  schedule(opts: unknown): Promise<{ notifications?: { id: number; warning?: string }[] }>;
  cancel(opts: { notifications: { id: number }[] }): Promise<unknown>;
  getPending(): Promise<{ notifications: { id: number }[] }>;
};

let pluginCache: NotifPlugin | null | undefined;

async function getPlugin(): Promise<NotifPlugin | null> {
  if (pluginCache !== undefined) return pluginCache;
  try {
    const cap = (globalThis as any).Capacitor;
    if (!cap?.isNativePlatform?.()) {
      pluginCache = null;
      return null;
    }
    const mod = await import('@capacitor/local-notifications');
    // 官方 PermissionStatus 类型未声明 exact_alarm，实际运行时存在，这里放宽
    pluginCache = mod.LocalNotifications as unknown as NotifPlugin;
  } catch {
    pluginCache = null;
  }
  return pluginCache;
}

/** 当前环境是否支持系统通知 */
export async function canNotify(): Promise<boolean> {
  return (await getPlugin()) !== null;
}

/* ---------------- 权限状态 ---------------- */

export interface PermStatus {
  /** 插件是否可用（非原生环境为 false） */
  available: boolean;
  /** 通知权限：Android 13+ 需要 */
  display: PermState;
  /** 精确闹钟权限：没有它通知会延迟几分钟 */
  exactAlarm: PermState;
  /** 能否真正弹通知 */
  canPost: boolean;
  /** 能否准点 */
  canExact: boolean;
}

const UNKNOWN: PermStatus = {
  available: false, display: 'denied', exactAlarm: 'denied',
  canPost: false, canExact: false,
};

/** 只查询，不申请 —— 供启动检测与提示逻辑使用 */
export async function checkPerms(): Promise<PermStatus> {
  const p = await getPlugin();
  if (!p) return UNKNOWN;
  try {
    const r = await p.checkPermissions();
    const display = (r.display ?? 'denied') as PermState;
    const exact = (r.exact_alarm ?? 'denied') as PermState;
    return {
      available: true,
      display,
      exactAlarm: exact,
      canPost: display === 'granted',
      canExact: exact === 'granted',
    };
  } catch {
    return { ...UNKNOWN, available: true };
  }
}

/**
 * 申请通知权限。
 *
 * 说明：系统弹窗能否出现由厂商 ROM 决定（小米对非商店渠道 APK 可能压制）。
 * 被压制时这里会直接拿到 denied，不会崩溃、也不会卡住。
 * 调用方应根据返回值决定是否引导用户去系统设置手动开启。
 */
export async function ensurePermission(): Promise<PermStatus> {
  const p = await getPlugin();
  if (!p) return UNKNOWN;
  try {
    const cur = await p.checkPermissions();
    let display = (cur.display ?? 'denied') as PermState;
    if (display === 'prompt') {
      const req = await p.requestPermissions();
      display = (req.display ?? 'denied') as PermState;
    }
    const exact = (cur.exact_alarm ?? 'denied') as PermState;
    return {
      available: true,
      display,
      exactAlarm: exact,
      canPost: display === 'granted',
      canExact: exact === 'granted',
    };
  } catch {
    return { ...UNKNOWN, available: true };
  }
}

/** 用一句话说明当前权限状况，供界面直接展示 */
export function permAdvice(s: PermStatus, needExact: boolean): string | null {
  if (!s.available) return null;
  if (!s.canPost) {
    return '未获得通知权限，手机不会弹提醒。已改为只写入系统日历，日历里能看到。';
  }
  if (needExact && !s.canExact) {
    return '未获得精确闹钟权限，提醒可能延迟几分钟。需要准点的话，请到手机自带的「时钟」里另设一个闹钟。';
  }
  return null;
}

/** 排期结果 —— 不再是简单 boolean，要能说明「为什么没排上」 */
export interface ScheduleOutcome {
  ok: boolean;
  /** 失败原因，供界面提示 */
  reason?: 'no-time' | 'past' | 'no-permission' | 'error';
  /** 成功但系统降级为非精确闹钟 */
  inexact?: boolean;
}

const OK: ScheduleOutcome = { ok: true };

/** 单条酒席排期 */
export async function scheduleOne(
  r: GiftRecord,
  nameOf: (id: string) => string,
  leadMin: number,
): Promise<ScheduleOutcome> {
  const p = await getPlugin();
  if (!p) return { ok: false, reason: 'no-permission' };
  if (!r.remindAt) return { ok: false, reason: 'no-time' };
  const when = fireAt(r.remindAt, leadMin);
  if (!when) return { ok: false, reason: 'no-time' };
  // 已过期就明确告知，不再静默丢弃（v2.13.1 修复）
  if (when.getTime() <= Date.now()) return { ok: false, reason: 'past' };

  const { title, body } = reminderText(r, nameOf);
  const id = notifIdOf(r.id);
  try {
    await p.cancel({ notifications: [{ id }] });
    const res = await p.schedule({
      notifications: [{
        id,
        title,
        body,
        schedule: { at: when, allowWhileIdle: true },
        extra: { recordId: r.id, kind: 'record' },
      }],
    });
    const warned = res?.notifications?.[0]?.warning;
    return warned ? { ok: true, inexact: true } : OK;
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** 单条待办排期：有dueTime 就按时刻，否则退回「提前 1 天」 */
export async function scheduleTodo(
  t: Todo,
  nameOf: (id: string) => string,
  defaultLeadMin: number,
): Promise<ScheduleOutcome> {
  const p = await getPlugin();
  if (!p) return { ok: false, reason: 'no-permission' };
  if (t.done || !t.due) return { ok: false, reason: 'no-time' };

  // 触发时刻：有具体时刻就用时刻，否则沿用旧的提前 1 天
  const when = t.dueTime
    ? (() => {
        const m = t.due!.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        const hm = t.dueTime.match(/^(\d{1,2}):(\d{2})$/);
        if (!m || !hm) return null;
        const dt = new Date(+m[1], +m[2] - 1, +m[3], +hm[1], +hm[2], 0, 0);
        const lead = (t.leadMin ?? defaultLeadMin) * 60000;
        return new Date(dt.getTime() - lead);
      })()
    : (() => {
        const m = t.due!.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (!m) return null;
        const dt = new Date(+m[1], +m[2] - 1, +m[3], 9, 0, 0, 0);
        return new Date(dt.getTime() - 1440 * 60000);
      })();

  if (!when) return { ok: false, reason: 'no-time' };
  if (when.getTime() <= Date.now()) return { ok: false, reason: 'past' };

  const who = t.personId ? nameOf(t.personId) : '';
  const title = `待办：${t.title}${who ? `（${who}）` : ''}`;
  const id = notifIdOf('todo-' + t.id);
  try {
    await p.cancel({ notifications: [{ id }] });
    const res = await p.schedule({
      notifications: [{
        id,
        title,
        body: t.note || '到点了该办了',
        schedule: { at: when, allowWhileIdle: true },
        extra: { todoId: t.id, kind: 'todo' },
      }],
    });
    const warned = res?.notifications?.[0]?.warning;
    return warned ? { ok: true, inexact: true } : OK;
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** 取消一条 */
export async function cancelOne(recordId: string): Promise<void> {
  const p = await getPlugin();
  if (!p) return;
  try {
    await p.cancel({ notifications: [{ id: notifIdOf(recordId) }] });
  } catch { /* 忽略 */ }
}

/** 取消一条待办的排期 */
export async function cancelTodo(todoId: string): Promise<void> {
  const p = await getPlugin();
  if (!p) return;
  try {
    await p.cancel({ notifications: [{ id: notifIdOf('todo-' + todoId) }] });
  } catch { /* 忽略 */ }
}

/** 全量重排：以 DB 为准，先清未排期再排。v2.13.1 起同时排酒席与待办 */
export interface RescheduleReport {
  native: boolean;
  records: number;
  todos: number;
  /** 因「时间已过」被跳过的条数 */
  skipped: number;
  /** 因权限不足未排的条数 */
  noPerm: number;
  /** 系统降级为非精确闹钟（会延迟） */
  inexact: number;
}

export async function rescheduleAll(
  db: DB,
  nameOf: (id: string) => string,
  leadMin: number,
): Promise<RescheduleReport> {
  const p = await getPlugin();
  if (!p) return { native: false, records: 0, todos: 0, skipped: 0, noPerm: 0, inexact: 0 };
  try {
    const pending = await p.getPending();
    if (pending.notifications?.length) {
      await p.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }
  } catch { /* 忽略清理失败 */ }

  let n1 = 0, n2 = 0, skipped = 0, noPerm = 0, inexact = 0;

  for (const r of db.records) {
    if (!r.remindAt) continue;
    const res = await scheduleOne(r, nameOf, leadMin);
    if (res.ok) { n1++; if (res.inexact) inexact++; }
    else if (res.reason === 'past') skipped++;
    else if (res.reason === 'no-permission') noPerm++;
  }

  for (const t of db.todos) {
    if (t.done || !t.due) continue;
    const res = await scheduleTodo(t, nameOf, leadMin);
    if (res.ok) { n2++; if (res.inexact) inexact++; }
    else if (res.reason === 'past') skipped++;
    else if (res.reason === 'no-permission') noPerm++;
  }

  return { native: true, records: n1, todos: n2, skipped, noPerm, inexact };
}

/** 把排期结果翻译成给用户看的一句话 */
export function explainReport(r: RescheduleReport): string {
  if (!r.native) return '当前环境不支持系统通知，提醒已写入系统日历';
  const parts: string[] = [];
  parts.push(`已排 ${r.records} 条酒席提醒`);
  if (r.todos) parts.push(`${r.todos} 条待办`);
  if (r.inexact) parts.push(`${r.inexact} 条未获精确闹钟权限，可能延迟几分钟`);
  if (r.skipped) parts.push(`${r.skipped} 条因时间已过未排`);
  if (r.noPerm) parts.push(`${r.noPerm} 条因无通知权限未排（已写入系统日历）`);
  return parts.join('，');
}

export const LEAD_OPTIONS = [
  { v: 0, label: '准点' },
  { v: 30, label: '提前 30 分' },
  { v: 60, label: '提前 1 小时' },
  { v: 180, label: '提前 3 小时' },
  { v: 1440, label: '提前 1 天' },
  { v: 2880, label: '提前 2 天' },
];

/**
 * 判断某条提醒是否需要「准点」权限。
 * 提前量为 0（准点）且未获精确闹钟权限时，必须提醒用户可能延迟，
 * 由用户自己去手机自带时钟另设闹钟（v2.13.1 方案 B）。
 */
export function needExactWarn(leadMin: number, perms: PermStatus): boolean {
  return leadMin === 0 && perms.canPost && !perms.canExact;
}
