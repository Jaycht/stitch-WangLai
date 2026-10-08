/**
 * 跳系统设置页（v2.13.3新增）
 *
 * ★为什么要这个文件★
 *
 * 涛哥真机截图显示：小米把非商店渠道 APK 判为「敏感应用」，
 * 系统提示「已阻止其获取任何权限」。后果是：
 *   1. 首次权限询问窗口根本不出现
 *   2. `requestPermissions()` 直接返回 denied，连弹窗都不弹
 *   3. **用户在 App 内点「去开启」，什么都不会发生**
 *
 * 结论：**只要权限是安装时被拒的，App 内就再也申请不到了**，
 * 唯一出路是把用户送到系统设置页，由他手动打开。
 *
 * ⚠️ 官方依据：
 *   Settings.ACTION_APPLICATION_DETAILS_SETTINGS   —— 应用详情页（通知权限）
 *   Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM   —— 闹钟和提醒页（精确闹钟，Android 12+）
 *   Settings.ACTION_APP_NOTIFICATION_SETTINGS      —— 直接跳通知页（Android 8+）
 */

import { registerPlugin, Capacitor } from '@capacitor/core';

interface AppSettingsPlugin {
  openAppDetails(): Promise<{ ok: boolean; where: string }>;
  openNotificationSettings(): Promise<{ ok: boolean; where: string }>;
  openExactAlarmSettings(): Promise<{ ok: boolean; where: string }>;
  hasPermission(o: { name: string }): Promise<{ granted: boolean }>;
  /** App 回到前台（原生 onResume 发出），用户从系统设置返回时触发 */
  addListener(event: 'appResume', cb: (d: { fromSettings: boolean }) => void): Promise<{ remove: () => void }>;
}

let pluginCache: AppSettingsPlugin | null | undefined;

async function getPlugin(): Promise<AppSettingsPlugin | null> {
  if (pluginCache !== undefined) return pluginCache;
  try {
    const cap = (globalThis as any).Capacitor;
    if (!cap?.isNativePlatform?.()) {
      pluginCache = null;
      return null;
    }
    pluginCache = registerPlugin<AppSettingsPlugin>('AppSettings');
  } catch {
    pluginCache = null;
  }
  return pluginCache;
}

/** 当前环境是否支持跳设置页（非原生环境返回 false） */
export async function canOpenSettings(): Promise<boolean> {
  return (await getPlugin()) !== null;
}

/**
 * 跳到本应用详情页（通知权限在这里）。
 * 路径：设置 → 应用管理 → 往来礼记 → 通知
 */
export async function openAppDetails(): Promise<boolean> {
  const p = await getPlugin();
  if (!p) return false;
  try {
    await p.openAppDetails();
    return true;
  } catch {
    return false;
  }
}

/** 跳到通知设置页（Android 8+ 有效，命中率更高） */
export async function openNotificationSettings(): Promise<boolean> {
  const p = await getPlugin();
  if (!p) return false;
  try {
    await p.openNotificationSettings();
    return true;
  } catch {
    return openAppDetails();
  }
}

/**
 * 跳到「闹钟和提醒」页—— **精确闹钟权限不在应用详情页里**，
 * 必须用 ACTION_REQUEST_SCHEDULE_EXACT_ALARM（Android 12+）。
 */
export async function openExactAlarmSettings(): Promise<boolean> {
  const p = await getPlugin();
  if (!p) return false;
  try {
    await p.openExactAlarmSettings();
    return true;
  } catch {
    return openAppDetails();
  }
}

/**
 * 读权限的真实系统状态。
 *
 * ★为什么要专门读系统状态★
 * 之前日历权限用的是 `calendarAsked`（我们记在 localStorage 里的
 * 「用户点过开启」），那是**用户的历史选择**，不是系统实际状态。
 * 用户去设置里改完再回来，我们并不知道 —— 必须问系统。
 */
export async function checkSystemPermission(
  name = 'android.permission.POST_NOTIFICATIONS',
): Promise<boolean | null> {
  const p = await getPlugin();
  if (!p) return null;
  try {
    const r = await p.hasPermission({ name });
    return r.granted;
  } catch {
    return null;
  }
}

/** 检查日历读写权限的真实状态 */
export async function checkCalendarSystemPermission(): Promise<boolean | null> {
  const r = await checkSystemPermission('android.permission.WRITE_CALENDAR');
  return r;
}

/**
 * 用户从系统设置页返回 App 时通知调用方重新检测。
 * 由原生 AppSettingsPlugin.handleOnResume() 发出（onResume 每次
 * 从其他 Activity 返回都会触发，正好覆盖这个场景）。
 */
export async function onAppResume(
  cb: () => void,
): Promise<{ remove: () => void } | null> {
  const p = await getPlugin();
  if (!p || !p.addListener) return null;
  try {
    return await p.addListener('appResume', () => cb());
  } catch {
    return null;
  }
}
