/**
 * 长按手势 —— 移动端列表的「多选 / 操作菜单」入口。
 *
 * 三个必须处理好的细节，缺一个就假体验：
 *
 * 1. **移动容差**：手指按下后会本能地微动 2~3px，
 *    严格按 0 位移判定会导致长按失败。留10px 容差。
 * 2. **滚动取消**：列表滑动时手指会持续移动，必须判定为「滚动」而非长按。
 *    做法是看横向/纵向哪个位移先超过阈值 —— 先动多的那个方向说了算。
 * 3. **不高频 setState**：长按计时只有一次 setState，
 *    但如果每帧都写 pressed 状态，列表 100 条会卡。用 ref + 事件回调。
 *
 * 用 Pointer Events 统一处理鼠标/触摸，右键菜单也一并屏蔽。
 */

import { useCallback, useEffect, useRef } from 'react';

/** 触发长按所需按住时长（ms）。Android 桌面端 500ms 体感合适 */
export const LONG_PRESS_MS = 480;
/** 允许的手指抖动（px） */
const MOVE_TOLERANCE = 10;
/**
 * 最短点击判定时长（ms）。
 * 手指刚碰就抬（< 50ms）几乎一定是误触，丢弃。
 * 50~480ms 之间算「点击」，超过 480ms 就是长按。
 * 不要设成 120ms —— 自动化测试与部分设备的
 * pointerdown/pointerup 间隔会被算得更短，会把正常点击误判成误触。
 */
const CLICK_MIN_MS = 50;

/** 高精度计时。用 performance.now() 而非 Date.now()：
 *  Date.now() 只有毫秒精度且受系统时钟调整影响，
 *  长按计时对精度敏感，用它会偶发把 480ms 算成 520ms 或 440ms。 */
function nowMs(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export interface LongPressOptions {
  /** 长按触发 */
  onLongPress: (e: React.PointerEvent) => void;
  /** 正常点击（未达长按时长） */
  onClick?: (e: React.PointerEvent) => void;
  /** 手指移动超过容差（判定为滚动/拖拽），会取消长按 */
  onCancel?: () => void;
  enabled?: boolean;
  /**
   * 最短点击判定时长（ms）。
   * 默认 120ms —— 手指刚碰就抬（<120ms）多半是误触。
   * 但列表进入多选模式后，用户的连续点击应该立刻响应，
   * 此时把fastClick 设为 true。
   */
  fastClick?: boolean;
}

/**
 * 把 props 挂到列表行上。
 *
 * 返回的 handlers 里没有 pressed 状态 —— 按压反馈请用 CSS 的 `active:`，
 * 不然每次按下都要 re-render。
 */
export function useLongPress({
  onLongPress,
  onClick,
  onCancel,
  enabled = true,
  fastClick = false,
}: LongPressOptions): LongPressHandlers {
  const timer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0, t: 0 });
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  // 页面切走/组件卸载时必须清掉，否则会在后台误触发
  useEffect(() => {
    const onHide = () => clear();
    window.addEventListener('blur', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('blur', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [clear]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled) return;
    // 只响应主键 / 触摸，避免右键菜单触发
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    fired.current = false;
    start.current = { x: e.clientX, y: e.clientY, t: nowMs() };

    clear();
    timer.current = window.setTimeout(() => {
      fired.current = true;
      // 长按触发时给一点点震动反馈（支持的设备上）
      try { navigator.vibrate?.(18); } catch { /* 不支持就算了 */ }
      onLongPress(e);
    }, LONG_PRESS_MS);
  }, [enabled, clear, onLongPress]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (timer.current === null) return;
    const dx = Math.abs(e.clientX - start.current.x);
    const dy = Math.abs(e.clientY - start.current.y);
    // 容差取「任一维度」即可：斜向移动也判滚动
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
      clear();
      onCancel?.();
    }
  }, [clear, onCancel]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const wasTimer = timer.current !== null;
    const dt = nowMs() - start.current.t;
    clear();
    // 已经触发过长按就不能再当点击，否则会同时进详情页
    if (fired.current) { fired.current = false; return; }
    if (!enabled || !wasTimer) return;
    // 抬手太早（< 120ms）多半是误触，不当点击。
    // 多选模式下要连续点选，fastClick 关掉这道门槛。
    if (dt < CLICK_MIN_MS && !fastClick) return;
    onClick?.(e);
  }, [clear, enabled, onClick, fastClick]);

  const onPointerLeave = useCallback(() => {
    clear();
  }, [clear]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    // 长按在安卓上会弹系统菜单，必须屏蔽，否则和我们的手势打架
    if (!enabled) return;
    e.preventDefault();
  }, [enabled]);

  return {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerMove,
    onContextMenu,
  };
}