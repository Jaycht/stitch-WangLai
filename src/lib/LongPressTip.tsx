/**
 * 操作提示条 —— 告诉用户「短按」和「长按」分别做什么。
 *
 * 手势定义（依据 Material Design 规范）：
 *   短按 = 打开详情/编辑
 *   长按 = 选中该条并进入多选模式（不弹菜单）
 *   标题栏「全选」= 一键进入多选并选中全部
 *
 * 设计取舍：
 * - **只在首次进入时出现一次**，之后永久不再打扰（存 localStorage）。
 *   老用户不需要看，新用户第一次不知道手势，白做等于埋没功能。
 * - 不用弹窗、不阻断操作，放在列表上方，3 秒后自动淡出。
 * - 文案直白说结果，不说术语：「长按可多选删除」而不是「长按手势」。
 */

import React, { useEffect, useState } from 'react';
import { Hand, MousePointerClick } from 'lucide-react';
import { cn } from './utils';

const KEY = 'wanglai.tips.longpress.v2';

function alreadyShown(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function markShown() {
  try {
    localStorage.setItem(KEY, '1');
  } catch { /* 隐私模式忽略 */ }
}

export function useTipOnce(key: string) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let t: number | undefined;
    try {
      if (localStorage.getItem(`${KEY}.${key}`) === '1') return;
    } catch { /* 读不到就当没看过 */ }
    setShow(true);
    try {
      localStorage.setItem(`${KEY}.${key}`, '1');
    } catch { /* ignore */ }
    // 4.5 秒后自动消失，不长期占屏
    t = window.setTimeout(() => setShow(false), 4500);
    return () => { if (t) window.clearTimeout(t); };
  }, [key]);
  return { show, dismiss: () => setShow(false) };
}

export function LongPressTip({
  show,
  role,
  onClose,
}: {
  show: boolean;
  role: '记录' | '人员';
  onClose: () => void;
}) {
  // 淡出动画
  const [mounted, setMounted] = useState(show);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    if (show) {
      setMounted(true);
      // 下一帧再开淡入，保证 transition 生效
      const r = requestAnimationFrame(() => setFade(false));
      return () => cancelAnimationFrame(r);
    }
    if (!mounted) return;
    setFade(true);
    const t = window.setTimeout(() => setMounted(false), 260);
    return () => window.clearTimeout(t);
  }, [show, mounted]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        'card px-3 py-2.5 flex items-start gap-2.5 transition-opacity duration-200',
        fade ? 'opacity-0' : 'opacity-100',
      )}
      role="note"
    >
      <Hand size={17} strokeWidth={1.8} className="text-accent shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 text-[var(--f-sm)] leading-relaxed">
        <div className="flex items-center gap-1.5 flex-wrap">
          <MousePointerClick size={12} strokeWidth={2} className="text-ink-3" />
          <span>短按</span>
          <span className="text-ink-3">打开详情</span>
          <span className="text-ink-3 mx-0.5">·</span>
          <Hand size={12} strokeWidth={2.2} className="text-accent" />
          <span>长按</span>
          <span className="text-ink-3">可多选、批量删除</span>
        </div>
        <div className="text-[var(--f-xs)] text-ink-3 mt-1">
          长按半秒左右选中这条，之后可继续点选其它条目批量处理。
          顶部有「全选」可一键选中全部。滑动列表不会误触发。
        </div>
      </div>
      <button
        onClick={onClose}
        className="shrink-0 text-[var(--f-xs)] text-ink-3 px-1"
        aria-label="知道了"
      >知道了</button>
    </div>
  );
}

/** 清掉提示记录（设置页「重置提示」可用） */
export function resetTips() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(KEY))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}