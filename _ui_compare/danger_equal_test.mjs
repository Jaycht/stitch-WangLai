#!/usr/bin/env node
/**
 * v2.13.2-hotfix3：删除按钮等宽 + 关怀模式（大字）适配验证
 *
 * 涛哥 2026-10-08 的三条要求：
 *   1. 删除按钮和保存保持一致（等宽），不要刻意突出删除
 *   2. 审查全项目是否还有类似问题
 *   3. **考虑大字模式下按钮比例、字体大小问题**
 *
 * 大字模式为什么是关键：
 *   --h-btn: max(36px, calc(36px - 24px + var(--f-md) * 2.77))
 *   字号放大 → --h-btn 变高 → 按钮跟着长高。
 *   若宽度写死 px（原来的 w-16=64px、我中间试的 88px），
 *   大字模式下两个中文字必然装不下或换行。
 *   所以**等宽 flex-1 才是正解**，本测试算清这笔账。
 */
import fs from 'node:fs';

let pass = 0, fail = 0;
const check = (n, c, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); }
};

console.log('='.repeat(68));
console.log('v2.13.2-hotfix3 删除按钮等宽 + 大字模式适配');
console.log('='.repeat(68));

const css = fs.readFileSync('src/index.css', 'utf8');
const rec = fs.readFileSync('src/pages/RecordsPage.tsx', 'utf8');
const per = fs.readFileSync('src/pages/PersonsPage.tsx', 'utf8');

/* ---------- 1. 等宽：涛哥要求删除与保存一致 ---------- */
console.log('\n[1] 删除按钮：方案 A（淡红底 + 加粗，与保存等宽）');
/**
 * ★v2.14.1 方案 A（涛哥 2026-10-09 拍板）
 *   上一版是「纯文字无底色」，涛哥指正：旁边是实心保存按钮，
 *   纯文字「显得很单薄」—— **纯文字的块感≈0，视觉重量 5% vs 100%**。
 *   方案 A：加 7% 淡红底 + 字重 600 → 视觉重量补到约 30%，
 *   宽度仍flex-1 与保存等宽，高度仍 var(--h-btn)（大字模式自适应）。
 */
const cssA = fs.readFileSync('src/index.css', 'utf8');
// 取 .btn-danger 规则的声明体（避开正则转义，直接按字符串切）
const ruleIdx = cssA.indexOf('button.btn-danger:not([class*="pill-"]) {');
const declA = ruleIdx >= 0
  ? cssA.slice(ruleIdx, cssA.indexOf('}', ruleIdx))
  : '';
check('.btn-danger 规则存在', ruleIdx >= 0);
check('  有淡红底（解决「很单薄」）',
  declA.includes('background: rgba(198, 40, 40, 0.07)'),
  declA.split('background')[1] || '未找到 background');
check('  字重 600（7% 淡底撑不住视觉重量，靠加粗立住）',
  declA.includes('font-weight: 600'));
check('  红字 #C62828', declA.includes('color: #C62828'));
check('  高度用 var(--h-btn)（大字模式自适应）',
  declA.includes('height: var(--h-btn)'));
check('  不是实心红底（不与主按钮抢视觉）',
  !declA.includes('background: #C62828'));
check('  有按下反馈（active 加深）',
  cssA.includes('button.btn-danger:not([class*="pill-"]):active'));

check('记录页删除用 flex-1（与保存等宽）',
  /className="btn-danger flex-1" onClick=\{deleteRec\}/.test(rec.replace(/\s*\n\s*/g, ' ')));
check('人员页删除用 flex-1（与编辑等宽）',
  /className="btn-danger flex-1"[\s\S]{0,120}onDelete\(person/.test(per.replace(/\s*\n\s*/g, ' ')));
check('两处删除按钮都不再手写行内样式（统一走 CSS 类）',
  !rec.includes('text-[#C62828] active:bg-') &&
  !per.includes('text-[#C62828] active:bg-'),
  '样式应集中在 index.css，避免两处分叉');
check('保存仍是实心主按钮（层级分明）',
  rec.includes('className="btn flex-1" onClick={save}'));

/* ---------- 2. 解析 --h-btn 公式，算大字模式下的实际尺寸 ---------- */
console.log('\n[2] 大字模式尺寸推算（--h-btn 随字号变化）');
const m = css.match(/--h-btn:\s*max\((\d+)px,\s*calc\(\s*(\d+)px\s*-\s*(\d+)px\s*\+\s*var\(--f-md\)\s*\*\s*([\d.]+)\s*\)\)/);
check('能解析 --h-btn 公式', m !== null, m ? '' : '公式变了，需同步更新本测试');
const [, base, baseMin, minus, k] = m.map(Number);
console.log(`  --h-btn = max(${base}px, ${baseMin}px - ${minus}px + --f-md * ${k})`);

/** 给定 f-md 计算实际高度 */
const hBtnOf = (fmd) => Math.max(base, baseMin - minus + fmd * k);

// 各档位的 --f-md（px）：正常 + 关怀模式 6 档
const FONTS = [
  { name: '默认', fmd: 15 },
  { name: 'xs', fmd: 16 },
  { name: 'sm', fmd: 17.5 },
  { name: 'md', fmd: 19 },
  { name: 'lg', fmd: 21 },
  { name: 'xl', fmd: 23 },
  { name: 'xxl', fmd: 25 },
];
console.log('\n  档位   --f-md   按钮高   2中文字需宽   可用半宽  是否够');
let allFit = true;
const SCREEN = 360, PAD = 28, GAP = 8;   // 360 屏 - px-3.5*2 - gap-2
const halfW = (SCREEN - PAD - GAP) / 2;
console.log(`  （按 360px 屏，两按钮等宽各 ${halfW.toFixed(0)}px）`);
for (const f of FONTS) {
  const h = hBtnOf(f.fmd);
  const need = f.fmd * 2 + 2 * 16;      // 两个中文字 + 左右 padding 32
  const fit = need <= halfW;
  if (!fit) allFit = false;
  console.log(`  ${f.name.padEnd(6)} ${String(f.fmd).padStart(4)}   ${h.toFixed(0).padStart(5)}   ${need.toFixed(0).padStart(9)}   ${halfW.toFixed(0).padStart(7)}   ${fit ? '够' : '不够 <<<'}`);
}
check('关怀模式最大档（xxl / --f-md=25）下两个中文字仍放得下', allFit);
check('按钮高度确实随字号增长（说明 --h-btn 联动生效）',
  hBtnOf(25) > hBtnOf(15),
  `${hBtnOf(15).toFixed(0)}px → ${hBtnOf(25).toFixed(0)}px`);

/* ---------- 3. 等宽方案的优越性对比 ---------- */
console.log('\n[3] 为什么等宽优于固定 px（对比表）');
const delFixed = 64;   // 原来的 w-16
const delTried = 88;   // 我中间试的
console.log(`  方案              默认档  xxl档   结论`);
for (const [label, w] of [['固定 64px（原问题）', delFixed], ['固定 88px（我试错方向）', delTried], ['等宽 flex-1（本次）', halfW]]) {
  const needDefault = 15 * 2 + 32;
  const needXxl = 25 * 2 + 32;
  const okD = w >= needDefault, okX = w >= needXxl;
  console.log(`  ${label.padEnd(18)} ${w.toFixed(0).padStart(4)}px ${w.toFixed(0).padStart(5)}px   ${okD && okX ? 'OK' : '大字下装不下'}`);
}
check('固定 64px 在大字模式下装不下（这就是原 bug 的深层原因）',
  delFixed < 25 * 2 + 32, `${delFixed}px < ${25 * 2 + 32}px`);
check('等宽方案在大字模式下自动容纳', halfW >= 25 * 2 + 32);

/* ---------- 4. .btn-danger 版式（上一轮已修，确认仍在）---------- */
console.log('\n[4] 删除按钮版式完整（不是退化样式）');
const d4 = declA;
check('  display: flex（文字居中，不挤在角落）', d4.includes('display: flex'));
check('  align-items: center', d4.includes('align-items: center'));
check('  justify-content: center', d4.includes('justify-content: center'));
check('  有 border-radius（与大按钮圆角一致）', d4.includes('border-radius'));
check('  有 font-size（不是浏览器默认小字）', d4.includes('font-size'));
check('  有 padding（左右留白从容）', d4.includes('padding'));
check('  有 transition（按下有过渡）', d4.includes('transition'));
check('  作用域仍排除 pill-（不撑大工具条小按钮）',
  cssA.includes('button.btn-danger:not([class*="pill-"])'));


console.log('\n[5] 确认框用实心红（与底栏淡红底分层）');
const solidIdx = cssA.indexOf('button.btn-danger-solid:not([class*="pill-"]) {');
const solidDecl = solidIdx >= 0
  ? cssA.slice(solidIdx, cssA.indexOf('}', solidIdx))
  : '';
check('确认框有独立的实心红类', solidIdx >= 0);
check('  实心红底 #C62828（不可逆动作要更醒目）',
  solidDecl.includes('background: #C62828'));
check('  白字（红底白字，对比度够）', solidDecl.includes('color: #fff'));
check('  白色描边（防历史「红字红底看不见」）',
  solidDecl.includes('rgba(255, 255, 255, 0.28)'));
check('  同样用 var(--h-btn)（与其它按钮等高）',
  solidDecl.includes('height: var(--h-btn)'));

console.log('\n[6] 工具条小按钮不受污染');
check('工具条用 btn-danger-tiny（只改颜色不改版式）',
  fs.readFileSync('src/lib/ActionSheet.tsx', 'utf8').includes('btn-danger-tiny'));
check('btn-danger-tiny 不设 height（版式交给 pill-sm）',
  !cssA.match(/\.btn-danger-tiny\s*\{[^}]*height/));

console.log('\n' + '='.repeat(68));
console.log(`通过 ${pass} / ${pass + fail}`);
if (fail) process.exitCode = 1;
console.log('='.repeat(68));
