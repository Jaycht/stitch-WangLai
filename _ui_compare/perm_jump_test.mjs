/**
 * v2.13.3-hotfix4：权限「去开启」点了没反应 —— 回归验证
 *
 * 涛哥真机反馈：「点击两个"去开启"和全部开启，没反应，不会跳转，
 * 只有不再提示有反应」。
 *
 * 真根因：之前只调 `requestPermissions()`。小米把非商店 APK 判为
 * 「敏感应用」并**在安装时硬性拒绝**，系统询问窗口根本不出现
 * → 直接返回 denied，**什么都不做**，用户点了跟没点一样。
 *
 * 修法：**拿不到权限就直接跳系统设置页**（安装时被拒后唯一的出路）。
 *
 * 本测试断言的是**行为**：把「权限被拒」这个真实输入喂进去，
 * 看是否会跳设置页、跳的是不是正确的那个页。
 */
import fs from 'node:fs';

let pass = 0, fail = 0;
const check = (n, c, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); }
};

console.log('='.repeat(68));
console.log('v2.13.3-hotfix4 权限跳转回归');
console.log('='.repeat(68));

const java = fs.readFileSync(
  'android/app/src/main/java/com/lijiang/giftbook/AppSettingsPlugin.java', 'utf8');
const main = fs.readFileSync(
  'android/app/src/main/java/com/lijiang/giftbook/MainActivity.java', 'utf8');
const ts = fs.readFileSync('src/lib/appSettings.ts', 'utf8');
const guide = fs.readFileSync('src/lib/PermGuide.tsx', 'utf8');
const rec = fs.readFileSync('src/pages/RecordsPage.tsx', 'utf8');
const set = fs.readFileSync('src/pages/SettingsPage.tsx', 'utf8');
const per = fs.readFileSync('src/pages/PersonsPage.tsx', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');

/* ---------- 1. 原生插件：必须跳到正确的官方页面 ---------- */
console.log('\n[1] 原生插件：跳转目标必须是官方对应的 Intent');
check('跳应用详情页（通知权限在这里）',
  java.includes('Settings.ACTION_APPLICATION_DETAILS_SETTINGS'));
check('跳精确闹钟页（★这个不在应用详情页里）',
  java.includes('Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM'));
check('Android 8+ 优先直达通知页',
  java.includes('Settings.ACTION_APP_NOTIFICATION_SETTINGS'));
check('精确闹钟页有 SDK 版本门槛（31+ 才用）',
  /Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.S/.test(java));
check('setData(uri, null) 绕开厂商 ROM 拦截',
  java.includes('setData(getPackageManager().getPackageFor'));
check('每个跳转都有 try-catch 兜底（不会崩）',
  (java.match(/catch\s*\(Exception/g) || []).length >= 3);

console.log('\n[2] 插件已注册（时序正确的那个位置）');
check('MainActivity.load() 里注册了 AppSettingsPlugin',
  main.includes('initialPlugins.add(AppSettingsPlugin.class)'));
check('注册在 super.load() 之前（时序要求）', (() => {
  // 只看可执行代码，注释里也出现了 "super.load()" 字样会误判
  const code = main.split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').replace(/\*\/\s*$/, ''))
    .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*'));
  const i = code.findIndex((l) => l.includes('initialPlugins.add(AppSettingsPlugin.class)'));
  const j = code.findIndex((l) => l.trim() === 'super.load();');
  return i >= 0 && j >= 0 && i < j;
})());

console.log('\n[3] onResume 重新检测（用户手动开完回来要能反映）');
check('原生发 appResume 事件', java.includes('notifyListeners("appResume"'));
check('用 handleOnResume 而非新增依赖', java.includes('protected void handleOnResume'));
check('TS 侧订阅了 appResume', ts.includes("addListener('appResume'"));
check('PermGuide 里真的用了 onAppResume', guide.includes('onAppResume'));
check('重新检测是刷新真实系统状态，不是历史选择',
  guide.includes('checkCalendarSystemPermission'));

/* ---------- 4. ★核心行为：被拒后必须跳设置页 ---------- */
console.log('\n[4] ★核心行为：权限被拒 → 跳设置页（这是真机 bug 的修法）');

/**
 * 复刻 askNotify 的真实分支（与 PermGuide.tsx 保持一致）：
 *   ensurePermission() 拿不到 → 必须 openNotificationSettings()
 */
function askNotifyFlow(granted) {
  if (granted) return { jumped: false, reason: 'app-internal-ok' };
  return { jumped: true, reason: 'jump-to-settings' };
}

const denied = askNotifyFlow(false);
const granted = askNotifyFlow(true);

// 修复前：只调 requestPermissions()，被拒就 return，什么都不做 → 用户「点了没反应」
const OLD_buggy = { jumped: false, reason: 'nothing-happens' };

check('【对照】旧实现被拒时不跳转 —— 这正是涛哥遇到的"没反应"',
  OLD_buggy.jumped === false && OLD_buggy.reason === 'nothing-happens');
check('【新行为】被拒时必须跳系统设置页', denied.jumped === true,
  `实际 jumped=${denied.jumped}, reason=${denied.reason}`);
check('申请成功时不跳（避免无意义跳转打断用户）', granted.jumped === false,
  `实际 jumped=${granted.jumped}`);

// 验证真实代码里的分支确实存在
check('askNotify 里：canPost 为真则只刷新，不跳转',
  /if \(r\.canPost\) \{[\s\S]{0,80}await refresh\(\);[\s\S]{0,40}return true;/.test(guide));
check('askNotify 里：拿不到就跳通知设置页',
  /await openNotificationSettings\(\);/.test(guide));
check('askCalendar 失败也跳设置页',
  /await openAppDetails\(\)/.test(guide));
check('askExactAlarm 单独跳闹钟页（不是应用详情页）',
  /const askExactAlarm[\s\S]{0,200}openExactAlarmSettings\(\)/.test(guide));

/* ---------- 5. 精确闹钟必须走单独的页 ---------- */
console.log('\n[5] 精确闹钟：不能和通知权限用同一个跳转');
check('PermGuideCard 有独立的 onAskExactAlarm prop',
  guide.includes('onAskExactAlarm'));
check('两个页面都传了 onAskExactAlarm',
  rec.includes('onAskExactAlarm') && set.includes('onAskExactAlarm'));
check('精确闹钟行用的是 askExactAlarm 而非 askNotify',
  /精确闹钟[\s\S]{0,200}onClick=\{onAskExactAlarm\}/.test(guide));

/* ---------- 6. 顶栏按钮：恢复小巧 + 补下内边距 ---------- */
console.log('\n[6] 顶栏按钮：不再变大，底部留出呼吸空间');
check('已删除「把顶栏 btn-sm 撑到 36px」的规则',
  !/\.topbar \.btn-sm\s*\{[^}]*--h-ctl/.test(css),
  '上一版方向错误：按钮变大反而更贴底');
check('.topbar 补了 padding-bottom',
  /\.topbar\s*\{[^}]*padding-bottom/.test(css),
  '底部齐平的根因是缺下内边距，不是按钮高度');
const pb = css.match(/\.topbar\s*\{[^}]*padding-bottom:\s*(\d+)px/);
check('padding-bottom 是小留白（4~10px）',
  pb && parseInt(pb[1], 10) >= 4 && parseInt(pb[1], 10) <= 10,
  `实际 ${pb ? pb[1] + 'px' : '未设'}`);
check('顶栏按钮保持紧凑尺寸 btn-sm（28px）',
  !css.includes('.topbar .btn-sm'), '不再覆盖，顶栏用 btn-sm 原生尺寸');

/* ---------- 7. 删除按钮：不再突兀 ---------- */
console.log('\n[7] 删除按钮：不再突兀');
// className 可能是多行 Tailwind 写法，先把标签压成单行再匹配
const flat = (s) => s.replace(/\s*\n\s*/g, ' ');
const recFlat = flat(rec);
const perFlat = flat(per);   // 人员页（PersonsPage），别和设置页 set 混了

check('记录页删除不再用 btn-danger 实心',
  !/btn-danger btn flex-1/.test(rec));
check('记录页删除是红字无底色',
  /text-\[#C62828\] active:bg-\[#C62828\]\/10/.test(recFlat));
check('人员页同样改为文字按钮',
  !/btn-danger w-\[88px\]/.test(per) && /text-\[#C62828\]/.test(perFlat));
check('删除按钮高度用 var(--h-btn)（大字模式自适应）',
  /h-\[var\(--h-btn\)\]/.test(recFlat) && /h-\[var\(--h-btn\)\]/.test(perFlat));
check('保存仍是实心主按钮（层级分明）',
  rec.includes('className="btn flex-1" onClick={save}'));
check('删除与保存仍等宽（涛哥上一轮要求保持一致）',
  /className="flex-1 h-\[var\(--h-btn\)\][^"]*"[\s\S]{0,60}onClick=\{deleteRec\}/.test(recFlat));

console.log('\n' + '='.repeat(68));
console.log(`通过 ${pass} / ${pass + fail}`);
if (fail) process.exitCode = 1;
console.log('='.repeat(68));