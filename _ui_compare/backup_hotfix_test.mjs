#!/usr/bin/env node
/**
 * v2.13.1-hotfix 备份导入端到端实测（用涛哥的真实备份文件）
 *
 * 背景：涛哥反馈两个备份文件都恢复不了，界面显示「人员零、记录零」。
 * 本脚本不依赖 Android，直接在Node 里复刻 importBackup 的关键判定，
 * 定位到底哪一步失败。
 */
import fs from 'node:fs';

const NEW_CANDIDATES = [
  'D:/下载/往来礼记备份-20261007-1835.json',
  'D:/下载/往来礼记备份-20261008-2100.json',
];
const OLD_CANDIDATES = [
  'D:/下载/往来礼记_备份_2026-10-08.json',
  'D:/下载/往来礼记_备份_2026-10-08 (1).json',
];

/** 涛哥的真实文件可能已被移走/改名，找不到就用内置样例保底，
 *  保证这个回归**任何时候都能跑**，不依赖本地文件是否还在。 */
/**
 * 内置样例：**校验和字段留空**。
 * 不要伪造 _checksum —— 样例数据是手写的，字段顺序/内容与真实导出
 * 未必一致，算出来的校验和必然对不上，会造成「格式有问题」的误导。
 * 真实文件（找到时）会带正确的 _checksum，那时才校验。
 */
const NEW_SAMPLE = {
  _app: 'wanglai-liji', _format: 1,
  data: {
    schemaVersion: 3,
    persons: [{ id: 'p1', name: '李嬷嬷', createdAt: '', updatedAt: '' }],
    records: [{
      id: 'r1', personId: 'p1',
      received: { channel: 'alipay', amount: 200, date: '2026-10-07', event: 'business' },
      returned: { channel: 'cash', amount: 100, date: '2026-10-07', event: 'birthday' },
      remindAt: '2026-10-07T18:00', reminded: false, createdAt: '', updatedAt: '',
    }],
    todos: [], customEvents: [], settings: {},
  },
};
const OLD_SAMPLE = [
  { id: '1', name: '陈作花', amount: 100, type: 'sent', scenario: 'solemn', event: '殡礼', date: '2026-08-03' },
  { id: '2', name: '白雨萌', amount: 200, type: 'sent', scenario: 'celebration', event: '升学', date: '2026-08-03' },
  { id: '3', name: '王鹏', amount: 600, type: 'sent', scenario: 'celebration', event: '开业', date: '2026-08-03' },
  { id: '4', name: '文豪', amount: 200, type: 'sent', scenario: 'celebration', event: '结婚', date: '2026-08-03' },
];

function firstExisting(paths, fallbackObj, fallbackLabel) {
  for (const p of paths) {
    if (fs.existsSync(p)) return { path: p, isReal: true };
  }
  return { path: null, isReal: false, label: fallbackLabel, obj: fallbackObj };
}

const MAGIC = 'wanglai-liji';
function checksum(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return 'fnv1a:' + h.toString(16).padStart(8, '0');
}
function nowISO() { return new Date().toISOString(); }
function str(v) { return typeof v === 'string' ? v : v == null ? '' : String(v); }

/** 复刻 backup.ts 的 convertFanLi */
function convertFanLi(input) {
  const personsByName = new Map();
  const persons = [], records = [];
  let n = 0;
  const genId = () => 'mig_' + Date.now().toString(36) + '_' + (n++).toString(36);
  for (const r of input) {
    if (!r || typeof r !== 'object') continue;
    const name = String(r.name ?? '').trim();
    if (!name) continue;
    let pid = personsByName.get(name);
    if (!pid) {
      pid = 'mig_p_' + name;
      personsByName.set(name, pid);
      persons.push({ id: pid, name, note: '由旧版备份导入', createdAt: nowISO(), updatedAt: nowISO() });
    }
    const amt = Number(r.amount) || 0;
    const date = String(r.date ?? '').slice(0, 10) || nowISO().slice(0, 10);
    const isSent = String(r.type) === 'sent';
    const solemn = String(r.scenario) === 'solemn';
    const evt = String(r.event ?? '');
    let event = 'other';
    if (solemn) event = 'funeral';
    else if (/结婚|喜|嫁/.test(evt)) event = 'wedding';
    else if (/升学|学/.test(evt)) event = 'school';
    else if (/开业|开张/.test(evt)) event = 'business';
    else if (/生日/.test(evt)) event = 'birthday';
    else if (/乔迁|搬家/.test(evt)) event = 'housewarming';
    else if (/满月/.test(evt)) event = 'fullmoon';
    else if (/百日/.test(evt)) event = 'birthday';
    const side = { channel: 'cash', amount: amt, date, event };
    records.push({
      id: String(r.id ?? genId()), personId: pid,
      received: isSent ? undefined : side,
      returned: isSent ? side : undefined,
      remindAt: undefined, reminded: false,
      createdAt: nowISO(), updatedAt: nowISO(),
    });
  }
  return { schemaVersion: 3, persons, records, todos: [], customEvents: [], settings: {} };
}

/** 复刻 db.ts 中 persons/records 的取值判定（关键片段） */
function migratePersonsRecords(input) {
  const rawPersons = Array.isArray(input.persons) ? input.persons
    : Array.isArray(input.people) ? input.people : [];
  const persons = rawPersons.filter(p => str(p?.name ?? '').trim());

  const validIds = new Set(persons.map(p => p.id));
  const byName = new Map(persons.map(p => [p.name, p.id]));

  const rawRecords = Array.isArray(input.records) ? input.records : [];
  const records = [];
  for (const raw of rawRecords) {
    const rid = str(raw?.id);
    if (!rid) continue;
    let pid = str(raw?.personId);
    // 悬空 personId 兜底：按名字找
    if (pid && !validIds.has(pid)) pid = '';
    if (!pid) {
      const nm = str(raw?.personName ?? raw?.name);
      if (nm && byName.has(nm)) pid = byName.get(nm);
    }
    const hasIn = raw?.received && Number(raw.received.amount) > 0;
    const hasOut = raw?.returned && Number(raw.returned.amount) > 0;
    if (!hasIn && !hasOut) continue;
    if (!pid) continue;
    records.push({ id: rid, personId: pid });
  }
  return { persons, records };
}

function tryImportWithLabel(src, _l) {
  const label = src.path ? src.path.split('/').pop() : _l;
  console.log('\n' + '='.repeat(64));
  console.log('文件：' + label);
  console.log('='.repeat(64));
  let parsed;
  if (src.path) {
    try { parsed = JSON.parse(fs.readFileSync(src.path, 'utf8')); }
    catch (e) { console.log('  FAIL JSON 解析:', e.message); return; }
    console.log('  [来源] 真实文件 ' + src.path);
  } else {
    parsed = src.obj;
    console.log('  [来源] 内置样例（真实文件已移走）');
  }
  if (Array.isArray(parsed)) {
    console.log('  [识别] 旧版「凡礼记事」裸数组，长度', parsed.length);
    parsed = convertFanLi(parsed);
  }
  const hasMagic = parsed && typeof parsed === 'object' && '_app' in parsed;
  const body = hasMagic ? parsed.data : parsed;
  console.log('  hasMagic :', hasMagic, hasMagic ? '(_app=' + parsed._app + ')' : '');
  if (hasMagic && parsed._checksum) {
    const actual = checksum(JSON.stringify(body));
    console.log('  校验和   :', actual === parsed._checksum ? 'MATCH' : 'MISMATCH');
  }
  const r = migratePersonsRecords(body);
  console.log('  RESULT→ 人员', r.persons.length, '人 / 记录', r.records.length, '条');
}
tryImportWithLabel(firstExisting(OLD_CANDIDATES, OLD_SAMPLE, '旧版样例（凡礼记事）'), '旧版样例（凡礼记事）');
// 新版（往来礼记自身格式）也要能恢复
tryImportWithLabel(
  firstExisting(NEW_CANDIDATES, NEW_SAMPLE),
  '新版样例（往来礼记）',
);
