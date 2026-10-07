/**
 * 酒席提醒 —— 基于 Capacitor LocalNotifications
 *
 * 设计要点：
 * 1. Web 环境下插件不可用，降级为「应用内提醒条」，不报错、不弹框
 * 2. 提前量可配（0 ~ 2880 分钟），默认提前 60 分钟
 * 3. 提醒 id 固定规则，重排不会重复创建
 * 4. 已提醒过的记录打标，重启后不重复弹
 */

import type { GiftRecord, DB } from './types';

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

type NotifPlugin = {
  checkPermissions(): Promise<{ display: string }>;
  requestPermissions(): Promise<{ display: string }>;
  schedule(opts: unknown): Promise<unknown>;
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
    pluginCache = mod.LocalNotifications as NotifPlugin;
  } catch {
    pluginCache = null;
  }
  return pluginCache;
}

/** 当前环境是否支持系统通知 */
export async function canNotify(): Promise<boolean> {
  return (await getPlugin()) !== null;
}

/** 申请通知权限，返回是否已授权 */
export async function ensurePermission(): Promise<boolean> {
  const p = await getPlugin();
  if (!p) return false;
  try {
    const cur = await p.checkPermissions();
    if (cur.display === 'granted') return true;
    const req = await p.requestPermissions();
    return req.display === 'granted';
  } catch {
    return false;
  }
}

/** 单条排期 */
export async function scheduleOne(
  r: GiftRecord,
  nameOf: (id: string) => string,
  leadMin: number,
): Promise<boolean> {
  const p = await getPlugin();
  if (!p || !r.remindAt) return false;
  const when = fireAt(r.remindAt, leadMin);
  if (!when || when.getTime() <= Date.now()) return false; // 已过期就不排

  const { title, body } = reminderText(r, nameOf);
  try {
    await p.cancel({ notifications: [{ id: notifIdOf(r.id) }] });
    await p.schedule({
      notifications: [{
        id: notifIdOf(r.id),
        title,
        body,
        schedule: { at: when, allowWhileIdle: true },
        extra: { recordId: r.id },
      }],
    });
    return true;
  } catch {
    return false;
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

/** 全量重排：以 DB 为准，先清未排期再排 */
export async function rescheduleAll(
  db: DB,
  nameOf: (id: string) => string,
  leadMin: number,
): Promise<{ ok: boolean; scheduled: number; native: boolean }> {
  const p = await getPlugin();
  if (!p) return { ok: false, scheduled: 0, native: false };
  try {
    const pending = await p.getPending();
    if (pending.notifications?.length) {
      await p.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }
  } catch { /* 忽略清理失败 */ }

  let n = 0;
  for (const r of db.records) {
    if (!r.remindAt) continue;
    const ok = await scheduleOne(r, nameOf, leadMin);
    if (ok) n++;
  }
  return { ok: true, scheduled: n, native: true };
}

/**
 * 应用启动时调用：把过期的标记为已提醒，返回待提醒的记录
 * （供应用内提醒条使用，同时兼容 Web 无插件场景）
 */
export function dueReminders(db: DB, now = new Date()): GiftRecord[] {
  return db.records.filter((r) => {
    if (!r.remindAt || r.reminded) return false;
    const at = fireAt(r.remindAt, db.settings.remindLeadMin ?? 60);
    // 当天及之后都算「待提醒」，让用户进门就能看到
    if (!at) return false;
    return at.getTime() < now.getTime() + 24 * 3600 * 1000;
  });
}

export const LEAD_OPTIONS = [
  { v: 0, label: '准点' },
  { v: 30, label: '提前 30 分' },
  { v: 60, label: '提前 1 小时' },
  { v: 180, label: '提前 3 小时' },
  { v: 1440, label: '提前 1 天' },
  { v: 2880, label: '提前 2 天' },
];
