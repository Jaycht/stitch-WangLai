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

import React, { useEffect, useState, useCallback } from 'react';
import { Bell, ChevronRight, Check } from 'lucide-react';
import {
  checkPerms, ensurePermission, type PermStatus,
} from './notify';
import { ensurePermission as calEnsurePermission, canUseCalendar } from './calendar';
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

const INITIAL: PermCardState = {
  show: false, perms: null,
  notifOk: false, exactOk: false, calendarOk: false, allReady: false,
};

/**
 * 权限检测 + 申请。所有入口共用，保证逻辑一致。
 *
 * @param dismissed 用户是否点过「不再提示」
 */
export function usePermGuide(dismissed?: boolean) {
  const { db, dispatch } = useApp();
  const [st, setSt] = useState<PermCardState>(INITIAL);

  const refresh = useCallback(async () => {
    const [perms, calNative, calGranted] = await Promise.all([
      checkPerms(),
      canUseCalendar(),
      // 日历权限状态借calendarAsked 记录的用户选择，避免重复弹窗
      Promise.resolve(db.settings.calendarAsked === true),
    ]);
    const notifOk = perms.canPost;
    const exactOk = perms.canExact;
    const calendarOk = calGranted;
    // 注意：dismissed 只影响**首页横幅**。
    // 设置页是常驻入口，用户跳过后仍要能回来开，所以这里不传 dismissed。
    setSt({
      show: !(notifOk && calendarOk),
      perms,
      notifOk, exactOk, calendarOk,
      allReady: notifOk && calendarOk,
    });
  }, [db.settings.calendarAsked]);

  useEffect(() => { void refresh(); }, [refresh]);

  /**
   * 首页横幅专用：在 dismissed 之外再叠一层判断。
   * 设置页不传这个参数，所以常驻显示。
   */
  const showBanner = dismissed ? false : st.show;

  /** 申请通知权限（含精确闹钟，走系统自动弹窗） */
  const askNotify = useCallback(async () => {
    const r = await ensurePermission();
    await refresh();
    return r;
  }, [refresh]);

  /** 申请日历写入权限（另一套系统授权流程） */
  const askCalendar = useCallback(async () => {
    const ok = await calEnsurePermission();
    if (ok) dispatch({ t: 'settings', s: { calendarAsked: true } });
    await refresh();
    return ok;
  }, [dispatch, refresh]);

  /** 一键全开，按可靠性从高到低 */
  const askAll = useCallback(async () => {
    await askCalendar();
    await askNotify();
  }, [askCalendar, askNotify]);

  /** 用户主动隐藏，不再打扰（设置页可重新打开） */
  const dismiss = useCallback(() => {
    dispatch({ t: 'settings', s: { notifHintDismissed: true } });
    setSt((s) => ({ ...s, show: false }));
  }, [dispatch]);

  /** 重新打开引导（设置页里给用户一个反悔入口） */
  const restore = useCallback(() => {
    dispatch({ t: 'settings', s: { notifHintDismissed: false } });
  }, [dispatch]);

  return { ...st, showBanner, refresh, askNotify, askCalendar, askAll, dismiss, restore };
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
  st, onAskNotify, onAskCalendar, onAskAll, onDismiss, onRefresh, compact,
}: {
  st: PermCardState;
  onAskNotify: () => void;
  onAskCalendar: () => void;
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
            onClick={onAskNotify}
          />
        )}
      </div>

      <div className="flex gap-1.5 mt-2">
        <button className="btn flex-1" onClick={onAskAll}>全部开启</button>
        <button className="btn-ghost flex-1" onClick={onDismiss}>不再提示</button>
      </div>
    </div>
  );
}
