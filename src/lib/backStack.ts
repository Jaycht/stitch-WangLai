/* ---------------- 统一返回栈中枢 ----------------
 *
 * 为什么需要这个（涛哥 12 条问题里的第 9、11 条）：
 *
 * Android 的返回有**三个来源**，行为必须一致：
 *   1. 手势导航：从屏幕边缘侧滑
 *   2. 三键导航：底部返回键（导航栏中间那个）
 *   3. 键盘：Esc / 模拟器上的返回映射
 *
 * 我原来的 Sheet 只在 document 上监听 `keydown Escape`，
 * 在 **PC 模拟器**上能测到，但真机上：
 *   - 三键导航 → WebView 根本收不到 Escape，**直接退出应用**
 *   - 侧滑返回 → 同样穿透，**直接退出应用**
 * 这就是涛哥反馈的「侧滑全都直接退出软件」。
 *
 * ---------- Android 15 的强制要求 ----------
 *
 * 官方文档（developer.android.com/guide/navigation/predictive-back-gesture）明确写：
 *   "**Stop intercepting back events using `KeyEvent.KEYCODE_BACK`.**"
 *   "intercepting back events from `KeyEvent.KEYCODE_BACK`
 *    is **no longer supported**"
 *
 * targetSdk 36（Android 16）时预测性返回默认开启，
 * 必须用 `OnBackPressedCallback`（AndroidX Activity 1.6+）
 * 或 `OnBackInvokedCallback`（平台 API）。
 * 原生层的拦截见 `MainActivity.java`。
 *
 * ---------- 分层原则（M3 + Android 共同约定）----------
 *
 * 返回优先级**从内到外**，和 Android 的回调栈行为一致
 * （官方：「回调以栈的形式添加，最后添加且已启用的处理下一次返回」）：
 *
 *   第1 层  键盘避让中→ 收起键盘（不关弹层）
 *   第 2 层  确认框/底部弹层  → 关闭它
 *   第 3 层  多选模式/输入历史下拉 → 退出该模式
 *   第 4 层  二级页面        → 返回上一级
 *   第 5 层  Tab 根页面      → 二次确认后退出应用
 *
 * 关键：**弹层必须比路由优先**。用户打开 Sheet 后按返回，
 * 期望是「关掉 Sheet」而不是「回到上一个页面」——
 * 这也是原生 Android 的行为（Dialog 的 onBackPressed 优先于 Activity）。
 */

/** 返回处理的优先级，数字小的先处理 */
export type BackPriority =
  | 'keyboard'   // 收起键盘
  | 'overlay'    // 弹层：Sheet / Confirm / 日历 / 下拉
  | 'mode';      // 模式：多选 / 输入历史

export interface BackHandler {
  /** 数字小的优先处理 */
  priority: BackPriority;
  /** 返回这个处理器。true = 我处理了，返回事件已被消费 */
  handler: () => boolean;
  /** 用于调试与自检 */
  label: string;
}

const stack: BackHandler[] = [];

/**
 * 注册一个返回处理器。
 *
 * @param unregister 取消注册的函数（组件卸载时务必调用，
 *                   否则处理器会残留 —— 页面切走了返回键还在关旧弹层）
 */
export function pushBack(h: BackHandler): () => void {
  // 同一label 只保留最新的一次，避免热重渲染/重复挂载堆出一串死处理器
  const at = stack.findIndex((x) => x.label === h.label);
  if (at >= 0) stack.splice(at, 1);
  stack.push(h);
  return () => removeBack(h.label);
}

export function removeBack(label: string): void {
  const at = stack.findIndex((x) => x.label === label);
  if (at >= 0) stack.splice(at, 1);
}

/** 当前栈里有没有处理器（给原生层/自检用） */
export function backDepth(): number {
  return stack.length;
}

/** 栈顶处理器（调试用） */
export function backTop(): string | null {
  return stack.length ? stack[stack.length - 1].label : null;
}

/**
 * 执行返回。返回 true = 已被某个处理器消费。
 *
 * 原生层拿到 false 时才应该退出应用。
 */
export function runBack(): boolean {
  // 从栈顶往下找第一个愿意处理的
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const h = stack[i];
    let done = false;
    try {
      done = h.handler();
    } catch {
      // 处理器内部出错不能导致应用卡住 —— 当作没处理，继续往下试
      done = false;
    }
    if (done) return true;
  }
  return false;
}

/* ---------- 原生 → JS 桥 ---------- */

/**
 * Android MainActivity 通过 evaluateJavascript 调这个全局函数。
 * 挂在 window 上而不是模块里 —— 原生侧拿不到 ES module 的引用。
 *
 * 返回值字符串约定（原生侧按这个决定要不要 finish）：
 */
declare global {
  interface Window {
    __wlOnBack__?: () => string;
  }
}

let exitHook: (() => boolean) | null = null;

/**
 * 注册「栈空时的兜底处理」—— 由 App 根组件注入（它才知道路由和 Tab 状态）。
 *
 * @returns 必须返回 boolean：
 *   true  = 本次返回已被应用内部消化（二级页返回、退多选等），原生不要动
 *   false = 需要退出应用，但要先弹二次确认
 */
export function setExitHook(fn: () => boolean): void {
  exitHook = fn;
}

/* ---------- JS → 原生：返回值约定 ---------- */

/**
 * 不需要额外的 Java↔JS 通道 —— **用两次返回的返回值区分**就够了：
 *
 *   第一次按返回（根页面，栈空，未确认）
 *     → 'ask-exit'  →  原生什么都不做，JS 弹「再按一次退出」
 *   第二次按返回（2 秒内，提示还在）
 *     → 'exit-now'  →  原生 finish()
 *   超过 2 秒再按
 *     → 又回到 'ask-exit'  →  重新计时，防误触
 *   栈非空（弹层/多选/二级页）
 *     → 'handled'   →  原生什么都不做
 *
 * 三种返回值都含 "exit" 或等于 "handled"，
 * 对应 MainActivity.dispatchToWeb 的 `value.contains("exit")` 判断。
 */
export const BACK_EXIT_ASK = 'ask-exit';
export const BACK_EXIT_NOW = 'exit-now';
export const BACK_HANDLED = 'handled';

/**
 * 退出确认提示是否正在显示。
 *
 * 由 App 根组件通过 setExitPending 维护 —— 它才知道提示弹了没有。
 * 这样 backStack 不需要自己管 UI 状态，只读一个标记。
 */
let exitPending = false;
export function setExitPending(v: boolean): void {
  exitPending = v;
}

/** 供调试/自检：手动触发一次返回 */
export function handleBackFallback(): void {
  if (typeof window !== 'undefined') window.__wlOnBack__!();
}

/* ---------- 暴露给原生层的全局入口 ---------- */

if (typeof window !== 'undefined') {
  // Android MainActivity 通过 evaluateJavascript 调这个。
  // 必须是**同步返回字符串**，原生层在回调里决定是否 finish()。
  window.__wlOnBack__ = (): string => {
    // 第 1 层：栈内有处理器（弹层/多选）→ 明确 handled
    if (runBack()) return BACK_HANDLED;

    if (exitHook) {
      // 第 2 层：交给根组件决定。exitHook 返回 true 表示
      //「本次返回已被应用内部消化」（二级页返回、多选退出等），
      // 返回 false 表示「需要退出，但要先问用户」。
      //
      // 关键：不能用 exitPending 这个全局标记来判断 ——
      // 二级页 nav(-1) 之后标记也是 false，会被误判成
      // 「第一次按返回，要弹退出提示」。
      if (exitHook() === true) return BACK_HANDLED;

      // 第 3 层：根页面且用户还没确认退出 → 弹提示，本次不退出
      if (exitPending) return BACK_EXIT_NOW;
      return BACK_EXIT_ASK;
    }
    return BACK_EXIT_NOW;
  };

  // PC / 模拟器上的 Esc 等价于返回，方便调试与自动化测试。
  // 真机上这条路走不通（三键返回不进 WebView 的 keydown），
  // 真正的拦截在 MainActivity.java 的 OnBackPressedCallback。
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (window.__wlOnBack__!() !== BACK_HANDLED) e.preventDefault();
    }
  });
}

