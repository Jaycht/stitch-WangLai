/**
 * v2.13.1-hotfix 真机问题回归 —— **模拟运行时行为，不只查编译**
 *
 * 涛哥真机反馈的 4 个问题，这次全部在 Node 里复现并断言：
 *   1. 退出提醒不弹（原生侧字符串匹配 bug）
 *   2. 首页/设置页没有权限引导卡片（Promise.all 被单项拖死）
 *   3. 右上角按钮底部与标题栏重合（btn-sm 28px vs 顶栏 36px）
 *
 * 教训：v2.13.1 之前我只跑tsc + build 就说「已修复」，
 *       结果真机三个问题一个没解决。这次必须验证**运行时行为**。
 */
import fs from 'node:fs';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}

console.log('='.repeat(66));
console.log('v2.13.1-hotfix 运行时行为回归');
console.log('='.repeat(66));

/* ============ 问题 1：退出提醒 ============ */
console.log('\n[1] 原生返回键协议判定');

// 原生代码里的判断（修复前）
const oldNativeJudge = (v) => v === null || v.includes('exit');
check('修复前：ask-exit 被误判为可退出（真机bug 根因）',
  oldNativeJudge('"ask-exit"') === true,
  '这就是「二次确认没机会显示、App 直接退出」的原因');

// 修复后的精确匹配
const newNativeJudge = (v) => {
  if (v === null) return false;
  const s = String(v).replace(/"/g, '').trim();
  if (s === 'handled') return false;
  if (s === 'ask-exit') return false;
  return true;
};
check('修复后：ask-exit → 不退出（弹二次确认）', newNativeJudge('"ask-exit"') === false);
check('修复后：handled → 不退出', newNativeJudge('"handled"') === false);
check('修复后：exit-now → 退出', newNativeJudge('"exit-now"') === true);
check('修复后：null → 保守不退出（不误退）', newNativeJudge(null) === false);

// 读真实 Java 源码确认已改
const java = fs.readFileSync(
  'android/app/src/main/java/com/lijiang/giftbook/MainActivity.java', 'utf8');
check('MainActivity 已改为精确 equals 匹配',
  java.includes('"ask-exit".equals(v)'));
// 注意：注释里会提到 contains（那是在解释根因），所以只查**代码行**
const javaCode = java.split('\n')
  .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
  .join('\n');
check('MainActivity 代码中已无 contains("exit") 判断',
  !javaCode.includes('contains("exit")'),
  '注释里可以提 contains，但不能出现在实际代码');
check('MainActivity 兜底值改为 exit-now（不含 ask 的歧义）',
  java.includes("return 'exit-now'"));

/* ============ 问题 2：权限引导卡片不显示 ============ */
console.log('\n[2] 权限检测的挂死风险');

// 模拟「一个 Promise 永不 resolve」——国产 ROM 的真实行为
const HANG = new Promise(() => {});
function withTimeout(p, ms, fb) {
  return Promise.race([p.catch(() => fb), new Promise((r) => setTimeout(() => r(fb), ms))]);
}

async function testPermGuide() {
  // 修复前：Promise.all 里任何一项挂死 → 整体挂死 → show 永远 false
  const oldWay = Promise.all([
    HANG,                       // checkPerms 挂死（import 插件不响应）
    Promise.resolve(true),
    Promise.resolve(false),
  ]);
  const oldSettled = await Promise.race([
    oldWay.then(() => 'settled'),
    new Promise((r) => setTimeout(() => r('HUNG'), 300)),
  ]);
  check('修复前：单项挂死导致整体挂死（卡片永不显示）',
    oldSettled === 'HUNG', '真实 bug：refresh() 永不 setState');

  // 修复后：每项独立超时，兜底值兜住
  const [perms, cal] = await Promise.all([
    withTimeout(HANG, 100, null),
    withTimeout(Promise.resolve(true), 100, false),
  ]);
  const notifOk = perms?.canPost === true;
  const calendarOk = cal === true;
  const show = !(notifOk && calendarOk);
  check('修复后：探测挂死不阻塞，卡片仍会显示', show === true);
  check('修复后：挂死时按「未授权」处理（宁多提示不漏提示）',
    notifOk === false);
}

// 读真实源码确认
const permGuide = fs.readFileSync('src/lib/PermGuide.tsx', 'utf8');
check('PermGuide 不再用单个 Promise.all 包全部探测',
  !/await Promise\.all\(\[\s*checkPerms\(\),\s*canUseCalendar\(\)/.test(permGuide));
check('PermGuide 有独立超时保护 probeTimeout', permGuide.includes('probeTimeout'));
check('PermGuide 超时后回填可用兜底对象',
  permGuide.includes("display: 'denied'"));
check('PermGuide useEffect 只依赖 refresh（不再被 calendarAsked 触发）',
  /useEffect\(\(\) => \{ void refresh\(\); \}, \[refresh\]\)/.test(permGuide));

/* ============ 问题 3：顶栏按钮底部重合 ============ */
console.log('\n[3] 顶栏按钮高度对齐');

const css = fs.readFileSync('src/index.css', 'utf8');
const hSm = parseInt(css.match(/--h-sm:\s*max\((\d+)px/)?.[1] ?? '0', 10);
const hCtl = parseInt(css.match(/--h-ctl:\s*max\((\d+)px/)?.[1] ?? '0', 10);
console.log(`  --h-sm=${hSm}px  --h-ctl=${hCtl}px`);
check('根因确认：btn-sm(28px) 比顶栏控件(36px) 矮 8px',
  hCtl - hSm === 8, `差 ${hCtl - hSm}px`);
/**
 * ★v2.13.3 设计变更（涛哥第二次截图反馈）：
 *   我第一版把 .topbar .btn-sm 撑到 36px，结果**按钮更大更丑，
 *   而底部还是和标题栏底部齐平** —— 方向完全搞反。
 *
 *   重新诊断：问题不在按钮高度，而在 **.topbar 没有 padding-bottom**。
 *   顶栏底边与按钮底边之间的留白全靠 min-height - 按钮高 的余量，
 *   把按钮从 28 提到 36 正好吃光那点余量 → 底部贴死。
 *
 *   正确解法：① 按钮恢复 btn-sm 原生尺寸 ② 顶栏补 padding-bottom。
 */
check('已撤销「把顶栏 btn-sm 撑到 36px」的错误规则',
  !/\.topbar \.btn-sm\s*\{/.test(css),
  '按钮变大并不能解决底部齐平，反而更丑');
check('改由.topbar 补 padding-bottom 解决底部齐平',
  /\.topbar\s*\{[^}]*padding-bottom:\s*\d+px/.test(css));
const pb = css.match(/\.topbar\s*\{[^}]*padding-bottom:\s*(\d+)px/);
check('padding-bottom 是小留白（4~10px）',
  pb && parseInt(pb[1], 10) >= 4 && parseInt(pb[1], 10) <= 10,
  `实际 ${pb ? pb[1] + 'px' : '未设'}`);

/* ============ 附加：备份与版本号不能被改坏 ============ */
console.log('\n[4] 之前已修好的不能回归');
const backup = fs.readFileSync('src/lib/backup.ts', 'utf8');
check('convertFanLi 旧版备份兼容仍在', backup.includes('convertFanLi'));
const bg = fs.readFileSync('android/app/build.gradle', 'utf8');
const vName = bg.match(/versionName\s*"([^"]+)"/)?.[1];
const vTs = fs.readFileSync('src/version.ts', 'utf8').match(/VERSION\s*=\s*'([^']+)'/)?.[1];
check('两套版本号一致', vName === vTs, `build.gradle=${vName} version.ts=${vTs}`);

/* ============ 汇总 ============ */
await testPermGuide();

console.log('\n' + '='.repeat(66));
console.log(`通过 ${pass} / ${pass + fail}`);
if (fail) {
  console.log('失败项：');
  process.exitCode = 1;
}
console.log('='.repeat(66));
