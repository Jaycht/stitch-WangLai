/**
 * 配色方案
 *
 * 每组配色给三个档位，覆盖不同场合：
 *   base —— 标准（选中态、主按钮）
 *   soft —— 浅底（标签背景、提示条）
 *   deep —— 深字（浅底上的文字，保证对比度）
 *
 * 派生色由主色算出来，不手写 —— 换主色自动全套协调。
 */

/** hex -> {r,g,b} */
function hex2rgb(h: string): [number, number, number] {
  const s = h.replace('#', '');
  const v = s.length === 3
    ? s.split('').map((c) => c + c).join('')
    : s;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgb2hex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  return '#' + [c(r), c(g), c(b)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

/** 相对亮度（WCAG） */
function lum(r: number, g: number, b: number): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** 对比度 */
export function contrast(a: string, b: string): number {
  const [r1, g1, b1] = hex2rgb(a);
  const [r2, g2, b2] = hex2rgb(b);
  const l1 = lum(r1, g1, b1);
  const l2 = lum(r2, g2, b2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** 与白色混合，t=0 原色 t=1 全白 */
function mixWhite(c: string, t: number): string {
  const [r, g, b] = hex2rgb(c);
  return rgb2hex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}

/** 与黑色混合，t=0 原色 t=1 全黑 */
function mixBlack(c: string, t: number): string {
  const [r, g, b] = hex2rgb(c);
  return rgb2hex(r * (1 - t), g * (1 - t), b * (1 - t));
}

export interface Accent {
  /** 主色 */
  base: string;
  /** 浅底 */
  soft: string;
  /** 深字 */
  deep: string;
  /**
   * 页面底色。**这才是「整体色调」的锚点** ——
   * 只换主色而底色不变，用户会看到「只有勾选点换了颜色」，
   * 配色功能等于白做。底色必须跟着主色走。
   */
  paper: string;
  /** 比 paper 略深一点的层（卡片间隙、分组底、输入框底） */
  paper2: string;
  /** 分隔线色 */
  line: string;
  /** 玻璃主题用的淡渐层起点 */
  tint1: string;
  /** 玻璃主题用的淡渐层中点 */
  tint2: string;
  /** 玻璃主题用的淡渐层终点 */
  tint3: string;
}

export interface AccentPreset {
  key: string;
  name: string;
  /** 预览用的渐层底 */
  hint: string;
  make: () => Accent;
}

/**
 * 由主色派生整套中性色调。
 *
 * 关键：**底色不是灰的**，而是主色淡化后的大面积铺底。
 * 这样换配色时整页的「气质」都会变，
 * 而不只是勾选点、Tab 指示线那几个小地方变色。
 *
 * 公式（t 越大越接近白）：
 *   paper  = 主色 → 白 混93%（远看几乎中性，近看有色相）
 *   paper2 = 主色 → 白 混 89%
 *   line   = 主色 → 白 混 80%
 */
function makeAccent(name: string, base: string): AccentPreset {
  const [r, g, b] = hex2rgb(base);
  const l = lum(r, g, b);
  // soft 的混合比例按主色明度自适应：
  // 浅色主色需要更淡的底才看得见，深色主色可以稍浓一点。
  const softT = l > 0.45 ? 0.88 : l > 0.2 ? 0.84 : 0.8;
  const soft = mixWhite(base, softT);
  // deep 只需保证与 soft 有 4.5:1 对比度
  let deep = mixBlack(base, l > 0.45 ? 0.42 : 0.25);
  // 对比不够就继续加深
  let guard = 0;
  while (contrast(deep, soft) < 4.5 && guard < 12) {
    deep = mixBlack(deep, 0.08);
    guard++;
  }

  // 大面积底色：色相要能看出来，但不能抢内容
  const paper = mixWhite(base, 0.93);
  const paper2 = mixWhite(base, 0.89);
  const line = mixWhite(base, 0.8);
  // 玻璃渐层：两个色相，一个偏主色、一个偏冷，避免整页单色
  const tint1 = mixWhite(base, 0.84);
  const tint2 = mixWhite(base, 0.9);
  const tint3 = '#E9EDF2'; // 固定冷灰，跟主色形成冷暖对比

  return {
    key: base.slice(1).toLowerCase(),
    name,
    hint: `linear-gradient(140deg, ${mixWhite(base, 0.82)}, ${mixWhite(base, 0.94)})`,
    make: () => ({
      base,
      soft,
      deep,
      paper,
      paper2,
      line,
      tint1,
      tint2,
      tint3,
    }),
  };
}

/** 全部配色方案 */
export const ACCENTS: AccentPreset[] = [
  makeAccent('青瓷绿', '#2F6B4F'),
  makeAccent('黛蓝', '#3B6E8F'),
  makeAccent('靛青', '#3A5A8C'),
  makeAccent('紫棠', '#5A4A6B'),
  makeAccent('赭金', '#8A6D1F'),
  makeAccent('枣红', '#9E3B32'),
  makeAccent('中国红', '#A8342A'),
  makeAccent('松绿', '#4A7A45'),
  makeAccent('墨灰', '#4A5450'),
  makeAccent('暖褐', '#7A5C48'),
];

/** 取配色，认不得就回退青瓷绿 */
export function resolveAccent(hex?: string): Accent {
  const found = ACCENTS.find((a) => a.key === (hex ?? '').replace('#', '').toLowerCase());
  return (found ?? ACCENTS[0]).make();
}

/** 当前主色是否合法（导入外部数据时校验） */
export function isValidAccent(hex?: string): boolean {
  if (!hex) return false;
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return false;
  return ACCENTS.some((a) => a.key === hex.replace('#', '').toLowerCase());
}
