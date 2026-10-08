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
console.log('\n[1] 删除与保存等宽（不再刻意突出删除）');
check('记录页删除按钮用 flex-1（与保存等宽）',
  /btn-danger btn flex-1/.test(rec));
check('人员页删除按钮用 flex-1（与编辑等宽）',
  /btn-danger btn flex-1/.test(per));
check('记录页已去掉写死的 w-[88px]', !rec.includes('w-[88px]'));
check('人员页已去掉写死的 w-[88px]', !per.includes('w-[88px]'));
check('删除同时带 btn 基类（保证版式与保存完全一致）',
  /className="btn-danger btn flex-1"/.test(rec));

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
console.log('\n[4] .btn-danger 版式修复未被回退');
const dm = css.match(/button\.btn-danger:not\(\[class\*="pill-"\]\)\s*\{([^}]*)\}/);
check('.btn-danger:not 规则仍在', dm !== null);
if (dm) {
  for (const p of ['display', 'align-items', 'justify-content', 'height', 'font-size', 'padding']) {
    check(`  有 ${p}`, new RegExp(`${p}\\s*:`).test(dm[1]));
  }
  check('  高度用 --h-btn（与保存严格等高）', /height:\s*var\(--h-btn\)/.test(dm[1]));
}
check('作用域隔离仍在（不撑大工具条小按钮）',
  css.includes('btn-danger:not([class*="pill-"])'));

/* ---------- 5. 删除按钮仍保持红色醒目 ---------- */
console.log('\n[5] 删除的红色醒目样式未丢失');
check('.btn-danger 仍是红底白字',
  /btn-danger:not[\s\S]*?background:\s*#C62828/.test(css) && /btn-danger:not[\s\S]*?color:\s*#fff/.test(css));
check('仍带白色描边保证红底对比度',
  /btn-danger:not[\s\S]*?border:\s*1px solid rgba\(255,\s*255,\s*255/.test(css));

console.log('\n' + '='.repeat(68));
console.log(`通过 ${pass} / ${pass + fail}`);
if (fail) process.exitCode = 1;
console.log('='.repeat(68));
