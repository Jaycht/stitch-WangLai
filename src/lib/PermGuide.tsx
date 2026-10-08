/**
 * 提醒权限引导（v2.13.1）
 *
 * 设计依据（涛哥 2026-10-08 拍板）：
 *   - 首页顶部横幅（B 方案），不弹窗遮挡页面
 *   - 设置页保留常驻入口，跳过的用户随时能回来开
 *
 * 为什么需要它：
 *   国产 ROM（小米等）会把非商店渠道 APK 判为「敏感应用」，
 *   **安装时就硬性拒绝敏感权限**，系统的首次权限询问窗口根本不会出现。
 *   所以不能指望 `requestPermissions()` 弹窗，必须主动检测 + 引导手动开启。
 *
 * 三层通道（按可靠性，不按时间长度）：
 *   系统日历（主，跨重启/跨杀进程）→ 系统通知（辅，自动降级仍响）→ 无兜底
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Bell, ChevronRight, Check } from 'lucide-react';
import {
  checkPerms, ensurePermission, type PermStatus,
} from './notify';
import { ensurePermission as calEnsurePermission, canUseCalendar } from './calendar';
import {
  openAppDetails, openNotificationSettings, openExactAlarmSettings,
  checkCalendarSystemPermission, onAppResume,
} from './appSettings';
import { useApp } from './store';
import { cn } from './utils';

/** 权限卡片整体状态 */
export interface PermCardState {
  /** 是否要展示卡片（缺权限且用户没选择「不再提示」） */
  show: boolean;
  perms: PermStatus | null;
  /** 逐项状态 */
  notifOk: boolean;
  exactOk: boolean;
  calendarOk: boolean;
  /** 是否已完成全部（用于显示「已就绪」） */
  allReady: boolean;
}

/** 单项探测超时（毫秒）。国产 ROM 上插件可能不响应，必须兜住 */
const PROBE_TIMEOUT = 2500;

/** 给任意 Promise 加超时保护，避免一个卡住拖死整条链 */
function probeTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((r) => setTimeout(() => r(fallback), PROBE_TIMEOUT)),
  ]);
}

const INITIAL: PermCardState = {
  show: false, perms: null,
  notifOk: false, exactOk: false, calendarOk: false, allReady: false,
};

/**
 * 权限检测 + 申请。所有入口共用，保证逻辑一致。
 *
 * ⚠️ v2.13.1-hotfix：绝不能用单个 `Promise.all` 包所有探测。
 * 国产 ROM 上 `import()` 插件或权限查询可能**永不 resolve**，
 * Promise.all 会一起挂起 → 状态永远停在 show:false → 卡片永不显示。
 * 每项独立超时 + 兜底值，保证「最差也能显示卡片引导用户」。
 *
 * @param dismissed 用户是否点过「不再提示」（只影响首页横幅）
 */
export function usePermGuide(dismissed?: boolean) {
  const { db, dispatch } = useApp();
  const [st, setSt] = useState<PermCardState>(INITIAL);

  // 用 ref 读calendarAsked，避免它作为依赖导致 effect 反复触发
  const calAskedRef = useRef(db.settings.calendarAsked);
  calAskedRef.current = db.settings.calendarAsked;

  const refresh = useCallback(async () => {
    // 三项各自独立超时，互不拖累
    const [perms, calGranted] = await Promise.all([
      probeTimeout(checkPerms(), null),
      // ★v2.13.3：日历权限改读**系统真实状态**，
      //   之前用 calendarAsked（我们记在 localStorage 的「用户点过开启」），
      //   那是历史选择不是当前状态 —— 用户去设置里改完回来我们并不知道。
      probeTimeout(checkCalendarSystemPermission(), null),
    ]);

    // 通知权限拿不到时一律按「未开启」处理 —— 宁可多提示，不可漏提示
    const notifOk = perms?.canPost === true;
    const exactOk = perms?.canExact === true;
    // null（探测失败）时按未开启，保证卡片还会显示
    const calendarOk = calGranted === true;
    // perms 为 null（探测超时）时也要显示卡片，否则等于没引导
    const show = !(notifOk && calendarOk);
    setSt({
      show,
      perms: perms ?? { available: true, display: 'denied', exactAlarm: 'denied', canPost: false, canExact: false },
      notifOk, exactOk, calendarOk,
      allReady: notifOk && calendarOk,
    });
  }, []);

  // 只在挂载时跑一次；后续靠 refresh() / onAppResume 触发
  useEffect(() => { void refresh(); }, [refresh]);

  // ★v2.13.3：用户从系统设置页返回时自动重新检测。
  // 否则用户手动开了权限回来，卡片还显示「未开启」，等于白引导。
  useEffect(() => {
    let h: { remove: () => void } | null = null;
    void onAppResume(() => { void refresh(); }).then((r) => { h = r; });
    return () => { h?.remove(); };
  }, [refresh]);

  /**
   * 首页横幅专用：在 dismissed 之外再叠一层判断。
   * 设置页不传这个参数，所以常驻显示。
   */
  const showBanner = dismissed ? false : st.show;

  /**
   * ★v2.13.3 核心改动★
   *
   * 之前：点「去开启」只调 `requestPermissions()`。
   * 小米把非商店 APK 判为「敏感应用」并在**安装时硬性拒绝**，
   * 系统权限询问窗口根本不出现 → 直接返回 denied，
   * **什么都没发生**（涛哥真机反馈：点了没反应，只有「不再提示」管用）。
   *
   * 现在：
   *   1. 先试应用内申请（原生安装、用户没拒过的场景有效）
   *   2. **一旦拿不到，直接跳系统设置页** —— 安装时被拒后唯一的出路
   *   3. 拿到结果明确告诉用户，不做静默失败
   */
  const askNotify = useCallback(async (): Promise<boolean> => {
    const r = await ensurePermission();
    if (r.canPost) {
      await refresh();
      return true;
    }
    // 拿不到 → 跳系统设置页（通知权限在应用详情页里）
    await openNotificationSettings();
    await refresh();
    return false;
  }, [refresh]);

  /**
   * 精确闹钟权限**不在应用详情页**，在系统「闹钟和提醒」页，
   * 必须用 ACTION_REQUEST_SCHEDULE_EXACT_ALARM（Android 12+）。
   */
  const askExactAlarm = useCallback(async (): Promise<boolean> => {
    const ok = await openExactAlarmSettings();
    await refresh();
    return ok;
  }, [refresh]);

  /** 申请日历写入权限（日历走的是另一套系统授权流程） */
  const askCalendar = useCallback(async () => {
    const ok = await calEnsurePermission();
    if (ok) {
      dispatch({ t: 'settings', s: { calendarAsked: true } });
    } else {
      // 日历授权在应用详情页也能找到，一并跳过去
      await openAppDetails();
    }
    await refresh();
    return ok;
  }, [dispatch, refresh]);

  /**
   * 一键全开。
   * 注意：系统页一次 Intent 只到一个地方，所以优先用应用内申请，
   * 申请不到的再跳设置页。
   */
  const askAll = useCallback(async () => {
    await askNotify();
  }, [askNotify]);

  /**
   * 用户从系统设置页返回 App 时调用，重新检测真实系统状态。
   * （之前用 calendarAsked 这种「用户点过开启」的历史选择当状态，
   *   用户去设置里改完回来我们并不知道，必须问系统。）
   */
  const recheck = useCallback(async () => {
    await refresh();
  }, [refresh]);

  /** 用户主动隐藏，不再打扰（设置页可重新打开） */
  const dismiss = useCallback(() => {
    dispatch({ t: 'settings', s: { notifHintDismissed: true } });
    setSt((s) => ({ ...s, show: false }));
  }, [dispatch]);

  /** 重新打开引导（设置页里给用户一个反悔入口） */
  const restore = useCallback(() => {
    dispatch({ t: 'settings', s: { notifHintDismissed: false } });
  }, [dispatch]);

  return {
    ...st, showBanner, refresh,
    askNotify, askExactAlarm, askCalendar, askAll,
    dismiss, restore, recheck,
  };
}

/* ---------------- 组件 ---------------- */

/** 缺权限时的一句话说明 */
function adviceOf(st: PermCardState): string | null {
  if (!st.perms?.available) return null;
  if (!st.notifOk) return '未获得通知权限，手机到点不会弹提醒。';
  if (!st.exactOk) return '未获精确闹钟权限，提醒可能延迟几分钟；准点提醒请用手机自带「时钟」另设闹钟。';
  return null;
}

/** 单条权限行 */
function PermRow({
  title, desc, onClick, done,
}: {
  title: string;
  desc: string;
  onClick: () => void;
  done?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-paper/70 active:opacity-70 text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[var(--f-sm)] text-ink-2 flex items-center gap-1">
          {done
            ? <Check size={12} strokeWidth={2.4} className="text-out shrink-0" />
            : <span className="w-3 shrink-0" />}
          <span>{title}</span>
        </div>
        <div className="text-[var(--f-xs)] text-ink-3 mt-0.5 leading-snug">{desc}</div>
      </div>
      {!done && (
        <>
          <span className="text-[var(--f-xs)] text-accent shrink-0">去开启</span>
          <ChevronRight size={14} strokeWidth={1.8} className="text-ink-3 shrink-0" />
        </>
      )}
    </button>
  );
}

/**
 * 权限引导卡片。首页与设置页共用同一套逻辑，只是尺寸略有差别。
 *
 * @param compact 首页用（更紧凑，单行说明）
 */
export function PermGuideCard({
  st, onAskNotify, onAskCalendar, onAskExactAlarm, onAskAll, onDismiss, onRefresh, compact,
}: {
  st: PermCardState;
  onAskNotify: () => void;
  onAskCalendar: () => void;
  onAskExactAlarm: () => void;
  onAskAll: () => void;
  onDismiss: () => void;
  onRefresh: () => void;
  compact?: boolean;
}) {
  const advice = adviceOf(st);

  // 已就绪：一行确认，点一下可重新检测
  if (st.allReady) {
    return (
      <button
        onClick={onRefresh}
        className="w-full text-left text-[var(--f-xs)] text-ink-3 px-1 py-0.5"
      >
        提醒已就绪：系统通知 + 系统日历双通道
      </button>
    );
  }

  if (!st.show) return null;

  return (
    <div className={cn(
      'rounded-lg border border-accent-line bg-accent-soft/60',
      compact ? 'px-3 py-2.5' : 'px-3 py-2.5',
    )}>
      <div className="flex items-center gap-1.5 mb-1">
        <Bell size={14} strokeWidth={2} className="text-accent" />
        <span className="text-[var(--f-sm)] font-medium text-ink-2">
          开启提醒，到点手机才会响
        </span>
      </div>
      <p className="text-[var(--f-xs)] text-ink-3 leading-relaxed mb-2">
        {advice ?? '部分国产手机会把非商店安装的应用判为「敏感应用」，并自动屏蔽权限询问弹窗。这类提示无法关闭，但权限可以在这里手动开启。'}
      </p>

      <div className="space-y-1.5">
        {!st.notifOk && (
          <PermRow
            title="通知权限"
            desc="到点弹出提醒横幅"
            onClick={onAskNotify}
          />
        )}
        {!st.calendarOk && (
          <PermRow
            title="系统日历写入"
            desc="提醒写进日历，手机重启也不丢"
            onClick={onAskCalendar}
          />
        )}
        {st.notifOk && !st.exactOk && (
          <PermRow
            title="精确闹钟"
            desc="未开启时提醒可能延迟几分钟；准点提醒请用手机自带「时钟」另设闹钟"
            onClick={onAskExactAlarm}
          />
        )}
      </div>

      <p className="text-[var(--f-xs)] text-ink-3 mt-1.5 leading-snug">
        点「去开启」会跳转手机系统设置，找不到的可在设置里搜索本应用名称。
      </p>

      <div className="flex gap-1.5 mt-2">
        <button className="btn flex-1" onClick={onAskAll}>全部开启</button>
        <button className="btn-ghost flex-1" onClick={onDismiss}>不再提示</button>
      </div>
    </div>
  );
}
