/**
 * 设备性能分级 —— 首次启动自动选主题
 *
 * 思路：宁保守不激进。测不准就当低端，绝不让老机器卡。
 * 判定维度（任一不达标即降级）：
 *   1. CPU 核心数        navigator.hardwareConcurrency
 *   2. 设备内存 GB       navigator.deviceMemory（Chrome/Android 有，Safari 无）
 *   3. 实测渲染帧率     跑一段强制重绘，量帧耗时 —— 最准，但要多花 200ms
 *   4. 屏幕像素密度      devicePixelRatio × 屏面积，估算 GPU 压力
 *
 * 分级：
 *   low  → 方案 A 青瓷扁平   （无毛玻璃，最省）
 *   mid  → 方案 B 柔光玻璃
 *   high → 方案 C 澎湃卡片
 */

export type PerfTier = 'low' | 'mid' | 'high';
export type ThemeKey = 'a' | 'b' | 'c';

export const THEME_LABEL: Record<ThemeKey, { name: string; desc: string }> = {
  a: { name: '青瓷扁平', desc: '纯色卡片，最省电，低端机首选' },
  b: { name: '柔光玻璃', desc: '磨砂玻璃质感，兼顾美观与流畅' },
  c: { name: '澎湃卡片', desc: '大圆角通透玻璃，视觉最精致' },
};

export const TIER_TO_THEME: Record<PerfTier, ThemeKey> = {
  low: 'a', mid: 'b', high: 'c',
};

/* ---------------- 各项指标 ---------------- */

function cpuCores(): number {
  return (navigator.hardwareConcurrency as number) || 0;
}

function memGB(): number {
  const d = (navigator as any).deviceMemory;
  return typeof d === 'number' ? d : 0;   // 0 = 拿不到（Safari）
}

/** 屏幕总像素（CSS 像素 × dpr），估 GPU 压力 */
function screenLoad(): number {
  const w = window.screen?.width ?? 390;
  const h = window.screen?.height ?? 844;
  const dpr = window.devicePixelRatio || 1;
  return w * h * dpr * dpr;
}

/**
 * 实测渲染帧率：连续造 24 帧带毛玻璃的卡片，量平均帧耗时。
 * 只在设备支持时跑（headless/无 backdrop-filter 直接跳过）。
 */
async function measureFps(): Promise<number> {
  // 不支持毛玻璃的引擎跳过，交给其它指标判
  if (!CSS.supports('backdrop-filter', 'blur(2px)')) return -1;

  return new Promise<number>((resolve) => {
    const host = document.createElement('div');
    host.style.cssText = `
      position:fixed;left:-9999px;top:0;width:60px;height:60px;
      pointer-events:none;contain:strict;`;
    const inner = document.createElement('div');
    inner.style.cssText = `
      width:100%;height:100%;
      background:rgba(255,255,255,.6);
      backdrop-filter:blur(8px);
      border-radius:8px;`;
    host.appendChild(inner);
    document.body.appendChild(host);

    const times: number[] = [];
    let last = performance.now();
    const FRAMES = 24;
    let n = 0;

    const tick = () => {
      // 强制重绘，让 backdrop-filter 真的参与合成
      inner.style.transform = `translateX(${n % 3}px)`;
      const now = performance.now();
      times.push(now - last);
      last = now;
      if (++n < FRAMES) {
        requestAnimationFrame(tick);
      } else {
        host.remove();
        // 去掉第一帧（预热），算平均
        const arr = times.slice(1).sort((a, b) => a - b);
        const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
        const fps = avg > 0 ? 1000 / avg : 999;
        resolve(Math.round(Math.min(fps, 999)));
      }
    };
    requestAnimationFrame(tick);
  });
}

/* ---------------- 综合判定 ---------------- */

export interface DeviceReport {
  tier: PerfTier;
  theme: ThemeKey;
  cores: number;
  mem: number;
  screenLoad: number;
  fps: number;
  reason: string;
}

/**
 * 检测设备性能，决定推荐主题。
 * @param forceFps 是否跑帧率实测（首次启动跑一次，约 200-400ms）
 */
export async function detectDevice(forceFps = false): Promise<DeviceReport> {
  const cores = cpuCores();
  const mem = memGB();
  const load = screenLoad();
  let fps = -1;

  if (forceFps) {
    try { fps = await measureFps(); } catch { fps = -1; }
  }

  // ---- 降级条件：任一不达标就往下掉 ----
  let tier: PerfTier = 'high';
  const reasons: string[] = [];

  // 内存：< 3GB 基本告别毛玻璃
  if (mem > 0 && mem < 3) { tier = 'low'; reasons.push(`内存${mem}GB`); }
  else if (mem > 0 && mem < 4) { tier = mid_or_low(tier); reasons.push(`内存${mem}GB偏低`); }

  // CPU：单核直接不行，双核勉强
  if (cores > 0 && cores <= 2) { tier = 'low'; reasons.push(`${cores}核CPU`); }
  else if (cores > 0 && cores <= 4 && tier !== 'low') {
    tier = mid_or_low(tier); reasons.push(`${cores}核CPU`);
  }

  // 屏幕负载：2K 以上 + 高 dpr 压力大
  if (load > 4_000_000) {
    tier = mid_or_low(tier); reasons.push('高分屏');
  }

  // 帧率实测最准，优先级最高
  if (fps >= 0) {
    if (fps < 40) { tier = 'low'; reasons.push(`实测${fps}fps`); }
    else if (fps < 52) { tier = mid_or_low(tier); reasons.push(`实测${fps}fps`); }
    else reasons.push(`实测${fps}fps`);
  }

  // 拿不到任何指标时，默认保守
  if (cores === 0 && mem === 0) {
    tier = 'mid'; reasons.push('指标不可用，取中间档');
  }

  return {
    tier,
    theme: TIER_TO_THEME[tier],
    cores, mem, screenLoad: load, fps,
    reason: reasons.length ? reasons.join('，') : '性能充足',
  };
}

function mid_or_low(cur: PerfTier): PerfTier {
  return cur === 'high' ? 'mid' : 'low';
}

/* ---------------- 本地缓存 ---------------- */

const CACHE_KEY = 'wanglai.themedetect';

export interface CachedDetect extends DeviceReport {
  savedAt: string;
}

export function cacheDetect(r: DeviceReport) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...r, savedAt: new Date().toISOString() }));
  } catch { /* 隐私模式忽略 */ }
}

export function readDetect(): CachedDetect | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return typeof o?.tier === 'string' ? o : null;
  } catch {
    return null;
  }
}

/* ---------------- 系统字体缩放探测 ---------------- */

/**
 * 读出 WebView / 浏览器实际施加的字体缩放比。
 *
 * 为什么必须探测而不是读一个变量：
 * - Android WebView 会把系统「字体大小」设置以 textZoom 的形式作用到页面，
 *   但这个值没有任何 Web API 能直接读。
 * - iOS Safari 的 `-webkit-text-size-adjust` 同理。
 * - 唯一可靠办法是**量**：渲染一段已知字号的文本，量它实际的像素高度，
 *   除以理论值就是缩放比。
 *
 * 用 100px 而不是 16px，是为了把 subpixel 舍入误差压到 1% 以下。
 */
export function detectSystemFontScale(): number {
  if (typeof document === 'undefined') return 1;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = [
    'position:fixed',
    'left:-9999px',
    'top:0',
    'visibility:hidden',
    'pointer-events:none',
    'font-size:100px',
    'line-height:1',
    'font-family:sans-serif',
    'white-space:nowrap',
  ].join(';');
  // 用中文：CJK 字形的高度跟 font-size 严格线性，比拉丁字母好测
  probe.textContent = '国';
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  if (!h || !isFinite(h)) return 1;
  const scale = h / 100;
  // 落在合理区间才采信，异常值退回 1
  if (scale < 0.5 || scale > 3) return 1;
  return Math.round(scale * 1000) / 1000;
}

/** 档位 → 实际倍率。'auto' 表示跟随系统。 */
export function resolveFontScale(key: string, sysScale: number): number {
  if (!key || key === 'off') return 1;
  if (key === 'auto') return sysScale >= 1 ? sysScale : 1;
  const n = parseFloat(key.replace(/[^\d.]/g, ''));
  return isFinite(n) && n > 0 ? n : 1;
}
