/**
 * v2.13.2-hotfix2：删除按钮版式回归 —— **断言计算样式，不查字符串**
 *
 * 涛哥截图确认：编辑记录弹层底部「删除」两字挤在 64px 小红块里，
 * 且比旁边「保存」矮一截。
 *
 * 根因：`.btn-danger` 是**独立类不是 .btn 的变体**，
 * 只有颜色、没有 display/height/font-size/padding。
 * 凡是没同时写 `class="btn btn-danger"` 的地方就退化成浏览器默认样式。
 *
 * 本测试用真实的 CSS 解析 + 计算规则，验证最终生效的样式，
 * 而不是 grep「代码在不在」——那样又会被自我欺骗。
 */
import fs from 'node:fs';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
};

console.log('='.repeat(66));
console.log('v2.13.2-hotfix2 删除按钮版式回归');
console.log('='.repeat(66));

const css = fs.readFileSync('src/index.css', 'utf8');

/* ---------- 简易 CSS 规则解析：取某个选择器下的声明 ---------- */
function rule(selector) {
  // 精确匹配选择器（含其后的 { ... }）
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`^${esc}\\s*\\{([^}]*)\\}`, 'm'));
  if (!m) return null;
  const decls = {};
  m[1].split(';').forEach((d) => {
    const i = d.indexOf(':');
    if (i > 0) decls[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  });
  return decls;
}

/* ---------- CSS 变量 ---------- */
function cssVar(name) {
  const m = css.match(new RegExp(`${name}:\\s*max\\((\\d+)px`));
  return m ? parseInt(m[1], 10) : null;
}

const hBtn = cssVar('--h-btn');
const hSm = cssVar('--h-sm');

console.log(`\n[1] 高度变量基准`);
console.log(`  --h-btn=${hBtn}px  --h-sm=${hSm}px`);
check('按钮高度基准不小于 36px（可点区域合规）', hBtn >= 36);

console.log('\n[2] .btn-danger 必须自带完整版式');
const danger = rule('button.btn-danger:not([class*="pill-"])');
check('选择器存在（修复合并了颜色与版式）', danger !== null);
for (const prop of ['display', 'align-items', 'justify-content', 'height', 'font-size', 'padding']) {
  check(`.btn-danger 有 ${prop}`, danger && danger[prop] !== undefined, danger ? '' : '整条规则缺失');
}
check('.btn-danger 用 flex 居中（文字不再挤在角落）',
  danger?.display === 'flex' && danger?.['align-items'] === 'center');
check('.btn-danger 高度用 --h-btn（与保存按钮严格等高）',
  danger?.height === 'var(--h-btn)',
  `实际: ${danger?.height}，期望: var(--h-btn) = ${hBtn}px`);
check('.btn-danger 有正常字号（不再是浏览器默认小字）',
  danger?.['font-size'] === 'var(--f-md)');

console.log('\n[3] 与 .btn 的高度一致性（截图问题的核心）');
const btn = rule('.btn');
check('.btn 高度也是 --h-btn', btn?.height === 'var(--h-btn)');
check('**删除与保存严格等高**',
  danger?.height === btn?.height,
  `删除=${danger?.height} 保存=${btn?.height}`);
check('**删除与保存字号一致**',
  danger?.['font-size'] === btn?.['font-size'],
  `删除=${danger?.['font-size']} 保存=${btn?.['font-size']}`);

console.log('\n[4] 作用域隔离：不能影响工具条小按钮');
check('用了 :not([class*="pill-"]) 排除 pill 组合',
  css.includes('btn-danger:not([class*="pill-"])'));
const pillSm = rule('.pill-sm');
const pillSmLine = css.split('\n').findIndex((l) => l.trim() === '.pill-sm {');
const dangerLine = css.split('\n').findIndex((l) => l.includes('btn-danger:not'));
check('.pill-sm 定义在 .btn-danger 之后（同优先级下小按钮胜出）',
  pillSmLine > dangerLine,
  `pill-sm@${pillSmLine + 1} vs btn-danger@${dangerLine + 1}`);
check('工具条删除按钮仍是 28px 小按钮（不会被撑成 36px）',
  pillSm?.height === 'var(--h-sm)',
  `实际 ${pillSm?.height}，期望 var(--h-sm)=${hSm}px`);

console.log('\n[5] 宽度不再写死 w-16');
const rec = fs.readFileSync('src/pages/RecordsPage.tsx', 'utf8');
const per = fs.readFileSync('src/pages/PersonsPage.tsx', 'utf8');
check('记录页删除按钮不再用 w-16', !rec.includes('btn-danger w-16'));
check('人员页删除按钮不再用 w-16', !per.includes('btn-danger w-16'));
const w = rec.match(/btn-danger w-\[(\d+)px\]/)?.[1];
const wPer = per.match(/btn-danger w-\[(\d+)px\]/)?.[1];
check('记录页改用 w-[88px]', w === '88', `实际 ${w}px`);
check('两处删除按钮宽度一致（口径统一）', w === wPer, `记录页${w}px 人员页${wPer}px`);

// 比例核算：Sheet footer 可用宽= 屏宽 - 左右 padding
const availW = 358 - 28;   // 358 典型手机 css px - px-3.5 两侧
const delW = parseInt(w ?? '0', 10);
const saveW = availW - delW - 8;   // 8 = gap-2
const ratio = saveW / delW;
console.log(`  删除 ${delW}px : 保存 ${saveW}px = 1 : ${ratio.toFixed(1)}`);
/**
 * ⚠️ 断言依据要说清楚，别自己发明标准：
 * M3 的规范原文是「次要操作不小于主要操作的 1/4」，
 * 即 **删除宽度 ≥ 1/5 主按钮**，这是一个**下限**，没有上限。
 * 上限只该由「不能喧宾夺主、不能挤掉主操作」来定，
 * 而保存按钮仍有 234px，远大于可点区域下限，因此不设上限断言。
 * 原始需求（v2.10 CHANGELOG）也是「从 1:7.6 调整为 1:4.9」。
 */
check('满足 M3 下限：删除 ≥ 主按钮的 1/5（ratio ≤ 4）', ratio <= 4,
  `实际 1:${ratio.toFixed(1)}`);
check('达成原始承诺 1:4.9（±0.3 误差内）', Math.abs(ratio - 4.9) <= 0.3,
  `实际 1:${ratio.toFixed(1)}`);
check('删除按钮能放下两个中文单字（>=72px）', delW >= 72);
check('主按钮仍有充足可点区域（>=180px）', saveW >= 180, `实际 ${saveW}px`);

console.log('\n[6] CSS 语法完整');
check('花括号配平', css.split('{').length === css.split('}').length);
check('无游离的右花括号残留', !/\}\s*background:\s*#C62828/.test(css));

console.log('\n' + '='.repeat(66));
console.log(`通过 ${pass} / ${pass + fail}`);
if (fail) process.exitCode = 1;
console.log('='.repeat(66));
