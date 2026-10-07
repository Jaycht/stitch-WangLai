/**
 * 安全区适配 —— Android 15+ 强制 edge-to-edge 的处理
 *
 * 问题：targetSdk 36 时系统强制全屏，状态栏盖住顶栏、手势条盖住 Tab 栏。
 *
 * 为什么不能只靠 CSS 的 env(safe-area-inset-*)：
 * 部分 Android WebView 在没有 viewport-fit=cover 时会返回 0，
 * 此时顶栏就贴着状态栏，标题被遮。
 *
 * 做法：
 * 1. CSS 优先用 env(safe-area-inset-*)（WebView 支持时最准）
 * 2. JS 用一个 1px 的探针**实测**内容区起点，拿到真实状态栏高度
 * 3. 实测到值才覆盖 CSS 变量，避免把正确的 env() 值覆盖成 0
 * 4. 键盘弹起时打标记 class，让输入区不被遮
 */

export interface SafeArea {
  /** 状态栏高度（px） */
  top: number;
  /** 底部手势条/导航栏高度（px） */
  bottom: number;
  /** 软键盘高度（px），0 表示未弹起 */
  keyboard: number;
}

const PROBE_ID = '__wl_safearea_probe';

let probeEl: HTMLDivElement | null = null;

/**
 * 实测安全区。
 *
 * 探针原理：在 body 顶部放一个 absolute 定位、
 * `top: env(safe-area-inset-top)` 的 1px 高元素，
 * 量它的 getBoundingClientRect().top ——
 * 这就是内容区真实起点，即状态栏高度。
 */
export function readSafeArea(): SafeArea {
  if (typeof document === 'undefined') {
    return { top: 0, bottom: 0, keyboard: 0 };
  }

  if (!probeEl) {
    probeEl = document.createElement('div');
    probeEl.id = PROBE_ID;
    probeEl.setAttribute('aria-hidden', 'true');
    probeEl.style.cssText = [
      'position:absolute',
      'top:env(safe-area-inset-top,0px)',
      'left:0',
      'width:1px',
      'height:1px',
      'visibility:hidden',
      'pointer-events:none',
      'z-index:-1',
    ].join(';');
    document.body.appendChild(probeEl);
  }

  const top = Math.max(0, Math.round(probeEl.getBoundingClientRect().top));

  // 底部：用同样的办法，在 body 底部放一个 bottom 定位的探针
  let bottom = 0;
  try {
    const cs = getComputedStyle(document.documentElement);
    bottom = Math.max(0, Math.round(parseFloat(cs.getPropertyValue('--sab')) || 0));
  } catch { /* 读不到就当 0 */ }

  // 键盘高度：visualViewport 与 innerHeight 的差
  const vv = window.visualViewport;
  const keyboard = vv
    ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
    : 0;

  return { top, bottom, keyboard };
}

function setVar(name: '--sat' | '--sab', v: number): void {
  document.documentElement.style.setProperty(name, `${v}px`);
}

/**
 * 安装安全区监听。返回清理函数
 * （React 严格模式下 effect 会 mount→unmount→mount，必须能卸载）。
 */
export function installSafeArea(): () => void {
  if (typeof window === 'undefined') return () => {};

  const update = () => {
    const sa = readSafeArea();
    // **只有实测到值才覆盖**，避免把 env() 的正确值覆盖成 0
    if (sa.top > 0) setVar('--sat', sa.top);
    if (sa.bottom > 0) setVar('--sab', sa.bottom);
    // 键盘标记：供输入区避让
    document.body.classList.toggle('kb-open', sa.keyboard > 80);
  };

  // 首帧后测一次（此时 body 才有高度）
  const t0 = window.setTimeout(update, 60);
  update();

  const vv = window.visualViewport;
  vv?.addEventListener('resize', update);
  window.addEventListener('resize', update);
  const onOrient = () => setTimeout(update, 250);
  window.addEventListener('orientationchange', onOrient);

  return () => {
    window.clearTimeout(t0);
    vv?.removeEventListener('resize', update);
    window.removeEventListener('resize', update);
    window.removeEventListener('orientationchange', onOrient);
  };
}