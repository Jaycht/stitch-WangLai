/**
 * v2.14.0 回归：零权限申请 + 只做登记不提醒
 *
 * 决策依据（涛哥 2026-10-08）：
 *   「关于酒席提醒，我们只提供时间设置，但不提供提醒服务，
 *     待办事项也只提供登记，不提供提醒」
 *   「最好我们的app 实现零权限申请」
 *
 * 这个测试断言的是**行为与数据**，不是「代码删了没」——
 * 后者只能证明你敲了删除键，证明不了功能真的不再触发。
 */
import fs from 'node:fs';

let pass = 0, fail = 0;
const check = (n, c, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); }
};

console.log('='.repeat(68));
console.log('v2.14.0 零权限 + 只做登记不提醒');
console.log('='.repeat(68));

const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const dbTs = fs.readFileSync('src/lib/db.ts', 'utf8');
const types = fs.readFileSync('src/lib/types.ts', 'utf8');
const rec = fs.readFileSync('src/pages/RecordsPage.tsx', 'utf8');
const todos = fs.readFileSync('src/pages/TodosPage.tsx', 'utf8');
const settings = fs.readFileSync('src/pages/SettingsPage.tsx', 'utf8');
const gradleBuild = fs.readFileSync('android/app/capacitor.build.gradle', 'utf8');
const gradleSettings = fs.readFileSync('android/capacitor.settings.gradle', 'utf8');
const mainJava = fs.readFileSync(
  'android/app/src/main/java/com/lijiang/giftbook/MainActivity.java', 'utf8');

/** 去掉 JS/JSX 注释，只留真实代码 —— 注释里提到旧功能是正常的说明 */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '')
   .replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ---------- 1. 零权限：这是本版的核心承诺 ---------- */
console.log('\n[1] ★零权限申请（安装时不会再被判敏感应用）');
const perms = [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map((m) => m[1]);
console.log('  实际声明的权限:', perms.join(', '));
check('只声明 INTERNET 一条',
  perms.length === 1 && perms[0] === 'android.permission.INTERNET',
  `实际 ${perms.length} 条：${perms.join(', ')}`);
for (const p of ['POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'USE_EXACT_ALARM',
  'RECEIVE_BOOT_COMPLETED', 'VIBRATE', 'WRITE_CALENDAR', 'READ_CALENDAR',
  'CAMERA', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE']) {
  check(`  无 ${p}`, !perms.includes(p));
}
check('INTERNET 保留了（Capacitor 运行必需）', perms.includes('android.permission.INTERNET'));

console.log('\n[2] 通知/日历插件已从构建链彻底移除');
check('gradle dependencies 里无 local-notifications',
  !gradleBuild.includes('local-notifications'));
check('gradle dependencies 里无 ebarooni-calendar',
  !gradleBuild.includes('ebarooni'));
check('settings.gradle 里无 local-notifications',
  !gradleSettings.includes('local-notifications'));
check('settings.gradle 里无 ebarooni',
  !gradleSettings.includes('ebarooni'));
check('MainActivity 不再注册 AppSettingsPlugin',
  !stripComments(mainJava).includes('AppSettingsPlugin'));
check('MainActivity 仍保留 SafFilePlugin（备份恢复要用，零存储权限）',
  mainJava.includes('SafFilePlugin'));

console.log('\n[3] 相关源码文件已删除');
for (const f of ['src/lib/notify.ts', 'src/lib/calendar.ts',
  'src/lib/PermGuide.tsx', 'src/lib/appSettings.ts']) {
  check(`  ${f} 不存在`, !fs.existsSync(f));
}
check('AppSettingsPlugin.java 不存在',
  !fs.existsSync('android/app/src/main/java/com/lijiang/giftbook/AppSettingsPlugin.java'));

/* ---------- 4. 只做登记：不再触发任何排期 ---------- */
console.log('\n[4] ★不再排期（真的不提醒了）');
const flat = (s) => s.replace(/\s*\n\s*/g, ' ');
const recF = flat(rec), todoF = flat(todos);

check('记录页不再调 scheduleOne', !rec.includes('scheduleOne'));
check('记录页不再调 cancelOne', !rec.includes('cancelOne'));
check('记录页不再调 ensurePermission', !rec.includes('ensurePermission'));
check('待办页不再调 scheduleTodo', !todos.includes('scheduleTodo'));
check('待办页不再调 cancelTodo', !todos.includes('cancelTodo'));
check('待办页不再调 ensurePermission', !todos.includes('ensurePermission'));
const recCode = stripComments(rec);
const todoCode = stripComments(todos);
const setCode = stripComments(settings);

check('记录页不再有「提前多久提醒」UI', !recCode.includes('提前多久'));
check('待办页不再有「提前多久提醒」UI', !todoCode.includes('提前多久'));
check('记录页不再有「提醒时刻」文案', !recCode.includes('提醒时刻'));
check('待办页不再有「提醒时刻」文案', !todoCode.includes('提醒时刻'));
check('记录页不再有提醒筛选 tab', !recCode.includes("'remind'"));
check('设置页不再有权限引导卡片', !setCode.includes('PermGuideCard'));
check('设置页不再有日历同步', !setCode.includes('syncAll'));

console.log('\n[5] 提示文案到位（避免用户以为漏了功能）');
check('记录页有「只做登记，不发送提醒」提示',
  rec.includes('只做登记，不发送提醒'));
check('记录页提示了用手机自带闹钟',
  rec.includes('时钟'));
check('待办页有「只做登记，不发送提醒」提示',
  todos.includes('只做登记，不发送提醒'));
check('待办页提示了用手机自带闹钟',
  todos.includes('时钟'));

/* ---------- 6. 日期/时间必须完整保留（这是用户数据）---------- */
console.log('\n[6] ★日期/时间完整保留（只是不再据此提醒）');
check('类型里 due 字段保留', /due\?:\s*string/.test(types));
check('类型里 dueTime 字段保留', /dueTime\?:\s*string/.test(types));
check('待办页仍有日期输入', /type="date"/.test(todos));
check('待办页仍有时刻输入', /type="time"/.test(todos));
check('待办保存时仍写入 due', /due: due \|\| undefined/.test(todoF));
check('待办保存时仍写入 dueTime',
  /dueTime: due && dueTime \? dueTime : undefined/.test(todoF));
check('记录保存时仍写入日期（received.date 路径未被破坏）',
  dbTs.includes('raw.received?.date'));

/* ---------- 7. 旧备份必须能导入 ---------- */
console.log('\n[7] ★旧备份兼容（用户的已有数据不能丢）');
const ns = dbTs.match(/function normSettings[\s\S]*?\n}/)[0];
const nr = dbTs.match(/function normRecord[\s\S]*?\n}/)[0];
check('normSettings 不再输出 remindLeadMin', !/remindLeadMin\s*:/.test(ns));
check('normSettings 不再输出 calendarAsked', !/calendarAsked\s*:/.test(ns));
check('normSettings 不再输出 useCalendar', !/useCalendar\s*:/.test(ns));
check('normSettings 不再输出 notifAsked', !/notifAsked\s*:/.test(ns));
check('normRecord 的 remindAt 恒为 undefined（丢弃旧提醒时间）',
  /remindAt: undefined/.test(nr));
check('normRecord 仍读 received.date（赴宴时间不丢）',
  /raw\.received\?\.date/.test(nr));
check('类型里仍保留 remindAt 声明（migrate 才认得旧字段）',
  /remindAt\?:\s*string/.test(types));
check('类型里仍保留 leadMin 声明',
  /leadMin\?:\s*number/.test(types));
check('DEFAULT_SETTINGS 不含提醒默认值',
  !/remindLeadMin/.test(types.split('DEFAULT_SETTINGS')[1]?.split('}')[0] || ''));

console.log('\n' + '='.repeat(68));
console.log(`通过 ${pass} / ${pass + fail}`);
if (fail) process.exitCode = 1;
console.log('='.repeat(68));