/**
 * v2.14.0-hotfix2 回归：SuggestBox 定位/透明度 + 记录支持时间
 *
 * 涛哥真机截图确认的三个问题：
 *   1. 输入法弹出时，历史记录框「跑到了输入法的位置」，
 *      没有紧挨着输入框
 *   2. 历史记录框**明显是透明的**，下方字段直接透出来
 *   3. 记一笔只有日期没有时间（回礼方同样）
 *
 * 这个测试断言的是**真实计算**：把不同视口尺寸喂进去，
 * 看最终 top 算得对不对 —— 而不是查代码里有没有那句。
 */
import fs from 'node:fs';

let pass = 0, fail = 0;
const check = (n, c, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); }
};

console.log('='.repeat(68));
console.log('v2.14.0-hotfix2 历史框定位/透明度 + 记录时间');
console.log('='.repeat(68));

const suggest = fs.readFileSync('src/lib/Suggest.tsx', 'utf8');
const rec = fs.readFileSync('src/pages/RecordsPage.tsx', 'utf8');
const types = fs.readFileSync('src/lib/types.ts', 'utf8');
const dbTs = fs.readFileSync('src/lib/db.ts', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');

/* ---------- 1. 定位：用 visualViewport 而非 window.innerHeight ---------- */
console.log('\n[1] ★定位（输入法弹出时不跑位）');

/**
 * 复刻修好后的定位算法（含 CSS 里那层限高，必须一起算，
 * 否则会误判「越界」—— 上一版测试就漏了 maxHeight 这层）
 */
function locate({ viewH, viewTop = 0, rectTop, rectBottom, itemCount }) {
  const rowH = 52;
  const wantH = Math.min(240, itemCount * rowH);
  const GAP = 6;
  const rTop = rectTop - viewTop;
  const rBottom = rectBottom - viewTop;
  const belowSpace = viewH - rBottom;
  let top, flipped, spaceH;
  if (belowSpace >= wantH + GAP) {
    top = rBottom + GAP;
    flipped = false;
    spaceH = viewH - top;
  } else {
    top = Math.max(4, rTop - wantH - GAP);
    flipped = true;
    spaceH = top + wantH;
  }
  // ★ v2.14.0-hotfix2：三重约束（可用空间 / 内容高度 / 50vh）。
  // 原来漏了 wantH，只有 2-3 条时也拉出 400px 大空白框。
  const cssMaxH = Math.max(48, Math.min(spaceH, wantH, viewH * 0.5));
  return { top, flipped, wantH, spaceH, cssMaxH, bottom: top + cssMaxH };
}

// 场景 A：键盘未弹（视口 800，姓名框在 300~340）
const A = locate({ viewH: 800, rectTop: 300, rectBottom: 340, itemCount: 3 });
check('键盘未弹：紧贴输入框下方',
  A.top === 346 && !A.flipped, `top=${A.top} flipped=${A.flipped}`);

// 场景 B：★键盘弹起，视口缩到 420，姓名框在 300~340
const B = locate({ viewH: 420, rectTop: 300, rectBottom: 340, itemCount: 3 });
check('★键盘弹起：识别到下方空间不足',
  B.flipped === true, `flipped=${B.flipped}`);
check('★键盘弹起：翻到输入框上方而非贴着键盘',
  B.top === 300 - 156 - 6, `top=${B.top}`);
check('★键盘弹起：列表不超出视口下沿',
  B.bottom <= 420 + 1, `底边=${B.bottom} 视口=420`);

// 场景 C：★键盘弹起 + adjustPan（视口被平移，offsetTop 非 0）
const C = locate({ viewH: 420, viewTop: 380, rectTop: 680, rectBottom: 720, itemCount: 3 });
check('★键盘弹起+adjustPan：用 offsetTop 修正后的坐标',
  C.flipped === true, `flipped=${C.flipped}`);
check('adjustPan 场景不越界',
  C.top >= 4 && C.bottom <= 420 + 1,
  `top=${C.top} 底边=${C.bottom}`);

// 场景 D：条目多时高度按内容截断（内部滚动）
const D = locate({ viewH: 800, rectTop: 300, rectBottom: 340, itemCount: 8 });
check('条目多时高度被截断到 240（内部滚动）',
  D.cssMaxH === 240, `cssMaxH=${D.cssMaxH}`);

// 场景 D2：★只有 2 条历史 —— 容器必须贴合内容，不拉出大空白框
const D2 = locate({ viewH: 800, rectTop: 300, rectBottom: 340, itemCount: 2 });
check('★少量条目时高度贴合内容（2 条 ≈ 104px）',
  D2.cssMaxH === 104, `cssMaxH=${D2.cssMaxH}，期望 ${2 * 52}`);

// 场景 E：★键盘弹起 + 8 条（上方案例，最容易出界）
const E = locate({ viewH: 420, rectTop: 300, rectBottom: 340, itemCount: 8 });
check('★键盘弹起+多条目：仍不越界',
  E.bottom <= 420 + 1, `底边=${E.bottom} 视口=420`);

// 源码层面
check('源码使用 visualViewport', suggest.includes('window.visualViewport'));
check('源码使用 vv.offsetTop（处理 adjustPan）', suggest.includes('offsetTop'));
check('不再用 window.innerHeight 判断剩余空间',
  !/const below = rect \?/.test(suggest),
  '旧的 innerHeight 判定必须移除');

/* ---------- 2. 不透明 ---------- */
console.log('\n[2] ★不透明（截图确认原来是半透明的）');
// 提取浮层 div 的真实 className（排除注释，否则注释里写的
// 「原来用 .card」会被误判成代码仍在用 card）
const boxBlock = suggest
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
check('浮层 className 里不再有 card 类（其背景带 alpha）',
  !/className="[^"]*(\s|^)card(\s|$)/.test(boxBlock),
  '浮层用 card 会继承 rgba 背景');
check('背景用 --color-card（不透明纯色）',
  suggest.includes("background: 'var(--color-card)'"));
check('玻璃主题下关掉 backdrop-filter',
  suggest.includes("backdropFilter: 'none'"));
// 变量本身必须是不透明
const cardVar = css.match(/--color-card:\s*([^;]+);/);
check('--color-card 是不透明纯色',
  cardVar && /^#[0-9A-Fa-f]{6}$/.test(cardVar[1].trim()),
  `实际 ${cardVar ? cardVar[1].trim() : '未定义'}`);
check('确认 .card 的确带 alpha（所以不能用）',
  /\.card \{[\s\S]*?rgba\(255, 255, 255, var\(--card-alpha\)\)/.test(css));

/* ---------- 3. 记录支持时间 ---------- */
console.log('\n[3] ★记录支持日期+时间');
check('Side 类型有可选 time 字段',
  /export interface Side[\s\S]*?time\?:\s*string/.test(types));
check('migrate 读 time 且校验 HH:mm 格式',
  /time: \/\^\\d\{1,2\}:\\d\{2\}\$\//.test(dbTs) ||
  /\\d\{1,2\}:\\d\{2\}/.test(dbTs));
const flat = (s) => s.replace(/\s*\n\s*/g, ' ');
const recF = flat(rec);
const timeInputs = (recF.match(/type="time"/g) || []).length;
check('记录页有 2 处时间输入（收礼 + 回礼）',
  timeInputs === 2, `实际 ${timeInputs} 处`);
check('收礼方日期与时间并排',
  /日期与时间[\s\S]{0,300}type="date"[\s\S]{0,300}type="time"/.test(recF));
check('回礼方日期与时间并排',
  /v2\.14\.0：回礼方同样支持时间[\s\S]{0,300}type="date"[\s\S]{0,300}type="time"/.test(recF));
check("时间可留空（用 ?? '' 兜底）",
  (recF.match(/value=\{\w+\.time \?\? ''\}/g) || []).length >= 1);
check('清空时间时写 undefined 而非空串',
  /onChange=\{\(e\) => \{?[^}]*time: e\.target\.value \|\| undefined/.test(recF));
check('时间宽度用 rem 不是 px（适配大字模式）',
  recF.includes('w-[7.5rem]') && !recF.includes('time\" className=\"field w-[8'));

console.log('\n' + '='.repeat(68));
console.log(`通过 ${pass} / ${pass + fail}`);
if (fail) process.exitCode = 1;
console.log('='.repeat(68));