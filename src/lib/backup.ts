/**
 * 备份与恢复
 *
 * 导出格式（.json）：
 * {
 *   _app: "wanglai-liji",     // 魔数，导入时先验
 *   _format: 1,                // 备份文件格式版本（与数据schema 独立）
 *   _exportedAt: "...",
 *   _counts: { persons: n, records: n },
 *   _checksum: "fnv1a:xxxxxxxx",// 内容指纹，导入时比对，检测文件损坏/改动
 *   data: { ...DB }            // 真正的数据，走 migrate() 兼容
 * }
 *
 * 兼容性保证：
 * - 只关心 _app 魔数，不关心 data 内部 schemaVersion，交给 migrate() 处理
 * - 未知字段一律忽略，缺失字段走默认值
 * - 导入支持三种模式：覆盖 / 合并（按 id 去重，保留本机较新的一条）
 * - 导出 CSV 供 Excel 直接打开核对
 */

import { DB, SCHEMA_VERSION, BUILTIN_EVENTS, CHANNELS, eventLabel } from './types';
import { migrate, saveDB, uid } from './db';

const MAGIC = 'wanglai-liji';

/** FNV-1a 32bit —— 够用的内容指纹，不做安全用途 */
function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return 'fnv1a:' + h.toString(16).padStart(8, '0');
}

export interface BackupFile {
  _app: string;
  _format: number;
  _exportedAt: string;
  _counts: { persons: number; records: number };
  _checksum: string;
  data: DB;
}

export function buildBackup(db: DB): BackupFile {
  const payload = JSON.stringify(db);
  return {
    _app: MAGIC,
    _format: 1,
    _exportedAt: new Date().toISOString(),
    _counts: { persons: db.persons.length, records: db.records.length },
    _checksum: checksum(payload),
    data: db,
  };
}

export function backupFileName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `往来礼记备份-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

export function serializeBackup(db: DB): string {
  return JSON.stringify(buildBackup(db), null, 2);
}

export type ImportMode = 'replace' | 'merge';

export interface ImportResult {
  ok: boolean;
  message: string;
  db?: DB;
  /** 统计信息 */
  addedPersons?: number;
  addedRecords?: number;
  updatedRecords?: number;
  skipped?: number;
}

/**
 * 旧版「凡礼记事」备份格式转换（v2.13.1-hotfix）
 *
 * 旧版导出的是**裸数组**，每条记录长这样：
 *   { id, name, amount, type:'sent', scenario, event, date }
 *   - type: 'sent'（随礼/送礼） | 'received'（收礼）
 *   - scenario: 'celebration'（喜事） | 'solemn'（白事）
 *   - event: '殡礼' | '升学' | '开业' | '结婚' | ... （中文事由名）
 *
 * 旧版没有「人员档案」概念（名字直接挂在记录上），
 * 所以要按name 去重生成persons。
 */
function convertFanLi(input: any[]): any {
  const personsByName = new Map<string, string>();
  const persons: any[] = [];
  const records: any[] = [];

  const genId = (() => {
    let n = 0;
    return () => 'mig_' + Date.now().toString(36) + '_' + (n++).toString(36);
  })();

  for (const r of input) {
    if (!r || typeof r !== 'object') continue;
    const name = String(r.name ?? '').trim();
    if (!name) continue;

    // 同名归并到同一个人
    let pid = personsByName.get(name);
    if (!pid) {
      pid = 'mig_p_' + name;
      personsByName.set(name, pid);
      persons.push({ id: pid, name, note: '由旧版备份导入', createdAt: nowISO(), updatedAt: nowISO() });
    }

    const amt = Number(r.amount) || 0;
    const date = String(r.date ?? '').slice(0, 10) || nowISO().slice(0, 10);
    const isSent = String(r.type) === 'sent';
    // 白事默认收礼方向（吊唁收礼），喜事按 sent 判定
    const solemn = String(r.scenario) === 'solemn';
    const evt = String(r.event ?? '');
    // 事由映射到内建 key；「殡礼」归到白事类
    let event = 'other';
    if (solemn) event = 'funeral';
    else if (/结婚|喜|嫁/.test(evt)) event = 'wedding';
    else if (/升学|学/.test(evt)) event = 'school';
    else if (/开业|开张/.test(evt)) event = 'business';
    else if (/生日/.test(evt)) event = 'birthday';
    else if (/乔迁|搬家/.test(evt)) event = 'housewarming';
    else if (/满月/.test(evt)) event = 'fullmoon';
    else if (/百日/.test(evt)) event = 'birthday';

    const side = {
      channel: 'cash' as const,
      amount: amt,
      date,
      event,
    };
    records.push({
      id: String(r.id ?? genId()),
      personId: pid,
      received: isSent ? undefined : side,
      returned: isSent ? side : undefined,
      remindAt: undefined,
      reminded: false,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    });
  }

  return { schemaVersion: 3, persons, records, todos: [], customEvents: [], settings: {} };
}

function nowISO(): string {
  return new Date().toISOString();
}

/**
 * 解析并导入。
 * 任何一步失败都不改动现有数据 —— 先全部在内存里算好再落盘。
 */
export function importBackup(text: string, current: DB, mode: ImportMode = 'replace'): ImportResult {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: '文件不是合法的 JSON，可能已损坏' };
  }

  // 旧版「凡礼记事」：裸数组，格式完全不同，先转换
  if (Array.isArray(parsed)) {
    const conv = convertFanLi(parsed);
    if (!conv.persons.length) {
      return { ok: false, message: '旧版备份里没有识别到任何有效记录' };
    }
    parsed = conv;
  }

  // 兼容两种：包了魔数的备份文件 / 裸的 DB 对象
  const hasMagic = parsed && typeof parsed === 'object' && '_app' in parsed;
  const body = hasMagic ? parsed.data : parsed;

  if (hasMagic && parsed._app !== MAGIC) {
    return { ok: false, message: `这不是往来礼记的备份文件（标识为 ${parsed._app}）` };
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, message: '备份文件内容为空或格式不正确' };
  }

  // 校验和比对（仅对带魔数的文件做）
  if (hasMagic && parsed._checksum) {
    const actual = checksum(JSON.stringify(body));
    if (actual !== parsed._checksum) {
      return { ok: false, message: '备份文件校验失败，文件可能已被修改或传输损坏' };
    }
  }

  // 迁移到当前 schema
  let incoming: DB;
  try {
    incoming = migrate(body);
  } catch (e: any) {
    return { ok: false, message: '数据解析失败：' + (e?.message ?? e) };
  }

  if (mode === 'replace') {
    return {
      ok: true,
      message: `已恢复 ${incoming.persons.length} 人 / ${incoming.records.length} 条记录`,
      db: incoming,
    };
  }

  // ---- 合并模式 ----
  const merged: DB = migrate(JSON.parse(JSON.stringify(current)));
  const pIdx = new Map(merged.persons.map((p) => [p.id, p]));
  const rIdx = new Map(merged.records.map((r) => [r.id, r]));
  const tIdx = new Map(merged.todos.map((t) => [t.id, t]));
  const ceIdx = new Map(merged.customEvents.map((c) => [c.key, c]));

  let addedPersons = 0;
  let addedRecords = 0;
  let updatedRecords = 0;
  let addedTodos = 0;
  let addedEvents = 0;

  for (const p of incoming.persons) {
    // 只按 id 判重。绝不按姓名合并 —— 本地就是有多个「张三」，
    // 按名合并会把两个人的账混成一笔，这比多建一档危险得多。
    if (pIdx.has(p.id)) {
      // id 相同则取较新的一条
      const exist = pIdx.get(p.id)!;
      if ((p.updatedAt ?? '') > (exist.updatedAt ?? '')) {
        const i = merged.persons.findIndex((x) => x.id === p.id);
        merged.persons[i] = p;
      }
      continue;
    }
    merged.persons.push(p);
    pIdx.set(p.id, p);
    addedPersons++;
  }

  for (const r of incoming.records) {
    const realPid = pIdx.get(r.personId)?.id ?? r.personId;
    const rr = { ...r, personId: realPid };
    const exist = rIdx.get(rr.id);
    if (!exist) {
      merged.records.push(rr);
      rIdx.set(rr.id, rr);
      addedRecords++;
    } else if ((rr.updatedAt ?? '') > (exist.updatedAt ?? '')) {
      const i = merged.records.findIndex((x) => x.id === rr.id);
      merged.records[i] = rr;
      updatedRecords++;
    }
  }

  for (const t of incoming.todos) {
    const tt = { ...t, personId: pIdx.get(t.personId ?? '')?.id };
    if (tIdx.has(tt.id)) continue;
    merged.todos.push(tt);
    tIdx.set(tt.id, tt);
    addedTodos++;
  }

  for (const c of incoming.customEvents) {
    if (ceIdx.has(c.key)) continue;
    merged.customEvents.push(c);
    ceIdx.set(c.key, c);
    addedEvents++;
  }

  merged.records.sort((a, b) => (b.received.date || '').localeCompare(a.received.date || ''));

  const bits: string[] = [];
  if (addedPersons) bits.push(`新增 ${addedPersons} 人`);
  if (addedRecords) bits.push(`新增 ${addedRecords} 条记录`);
  if (updatedRecords) bits.push(`更新 ${updatedRecords} 条`);
  if (addedTodos) bits.push(`待办 ${addedTodos} 条`);
  if (addedEvents) bits.push(`自定义事由 ${addedEvents} 个`);

  return {
    ok: true,
    message: bits.length ? bits.join('，') : '没有新数据，现状已是最新',
    db: merged,
    addedPersons, addedRecords, updatedRecords,
  };
}

/* ---------------- CSV 导出 ---------------- */

const csvCell = (v: unknown): string => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const chLabel = (k: string) => CHANNELS.find((c) => c.key === k)?.label ?? k;

/** 导出 CSV（BOM 头，Excel 双击可正确识别中文） */
export function toCSV(db: DB): string {
  const nameOf = new Map(db.persons.map((p) => [p.id, p]));
  const head = [
    '日期', '姓名', '区分名', '关系', '对方事由', '收礼金额', '收礼渠道', '收礼礼物',
    '我方事由', '回礼金额', '回礼渠道', '回礼礼物', '地点', '提醒时间', '备注',
  ];
  const rows: string[][] = [head];
  for (const r of [...db.records].sort((a, b) =>
    (b.received.date || '').localeCompare(a.received.date || ''))) {
    const p = nameOf.get(r.personId);
    const rv = r.received?.amount ?? 0;
    const tv = r.returned?.amount ?? 0;
    const ev = (k: string) => eventLabel(k, db.customEvents);
    rows.push([
      r.received.date,
      p?.name ?? '（已删除的人）',
      p?.alias ?? '',
      p?.relation ?? '',
      ev(r.received.event),
      rv ? String(rv) : '',
      rv ? chLabel(r.received.channel) : '',
      r.received.gift ?? '',
      r.returned ? ev(r.returned.event) : '',
      tv ? String(tv) : '',
      tv ? chLabel(r.returned!.channel) : '',
      r.returned?.gift ?? '',
      r.received.place ?? r.returned?.place ?? '',
      r.remindAt ?? '',
      r.remark ?? '',
    ]);
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function csvFileName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `往来礼记明细-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.csv`;
}

/* ---------------- 落盘辅助 ---------------- */

export function download(filename: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立刻 revoke 在部分 WebView 上会中断下载，延后释放
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

export function pickFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(v);
    };
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return finish(null);
      const rd = new FileReader();
      rd.onload = () => finish(String(rd.result ?? ''));
      rd.onerror = () => finish(null);
      rd.readAsText(f, 'utf-8');
    };
    // 用户取消时无change 事件，靠窗口聚焦兜底清理
    window.addEventListener('focus', () => setTimeout(() => finish(null), 800), { once: true });
    input.click();
  });
}

/** 应用导入结果（会落盘） */
export function applyImport(res: ImportResult, current: DB): boolean {
  if (!res.ok || !res.db) return false;
  saveDB(res.db);
  return true;
}

export const CURRENT_SCHEMA = SCHEMA_VERSION;
export const ALL_EVENTS = BUILTIN_EVENTS;
