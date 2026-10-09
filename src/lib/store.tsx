/**
 * 应用状态 —— 用 React Context + useReducer，替代原先无状态的假数据。
 * 每次变更即落盘，保证杀进程/重启不丢。
 */

import React, {
  createContext, useContext, useEffect, useMemo, useReducer, useRef, useState,
} from 'react';
import {
  DB, EMPTY_DB, GiftRecord, Person, Settings, Side, Todo, CustomEvent,
  EventKind, PayChannel,
  aggregateByPerson, sumReceived, sumReturned, resolveDisplayName,
} from './types';
import { loadDB, saveDB, uid, migrate } from './db';

const now = () => new Date().toISOString();
export const todayStr = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

type Action =
  | { t: 'addPerson'; p: Partial<Person> }
  | { t: 'updatePerson'; id: string; p: Partial<Person> }
  | { t: 'removePerson'; id: string }
  | { t: 'addRecord'; r: Partial<GiftRecord> }
  | { t: 'updateRecord'; id: string; r: Partial<GiftRecord> }
  | { t: 'removeRecord'; id: string }
  | { t: 'settings'; s: Partial<Settings> }
  | { t: 'replace'; db: DB }
  | { t: 'addTodo'; td: Partial<Todo> }
  | { t: 'updateTodo'; id: string; td: Partial<Todo> }
  | { t: 'toggleTodo'; id: string }
  | { t: 'removeTodo'; id: string }
  | { t: 'clearDoneTodos' }
  | { t: 'addEvent'; ev: CustomEvent }
  | { t: 'removeEvent'; key: string };

function reducer(db: DB, a: Action): DB {
  switch (a.t) {
    case 'addPerson': {
      const ts = now();
      const p: Person = {
        id: uid(), name: '', alias: undefined, relation: undefined, group: undefined,
        phone: undefined, wechat: undefined, region: undefined, note: undefined,
        ...a.p, createdAt: a.p.createdAt ?? ts, updatedAt: ts,
      } as Person;
      // 姓名去重：已存在同名档案时直接复用，不重复建。
      // 本地确实会有多个同名的人，但都是用户主动在「人员」页建的；
      // 记账时同名直接复用第一个，是符合直觉的行为。
      const dup = db.persons.find((x) => x.name === p.name && p.name !== '');
      if (dup) return db;
      return { ...db, persons: [...db.persons, p] };
    }
    case 'updatePerson':
      return {
        ...db,
        persons: db.persons.map((p) =>
          p.id === a.id ? { ...p, ...a.p, updatedAt: now() } : p),
      };
    case 'removePerson':
      return {
        ...db,
        persons: db.persons.filter((p) => p.id !== a.id),
        records: db.records.filter((r) => r.personId !== a.id),
      };
    case 'addRecord': {
      const ts = now();
      const rec: GiftRecord = {
        id: uid(),
        personId: '',
        received: { channel: 'cash', amount: 0, date: todayStr(), event: 'wedding' },
        returned: undefined,
        ...a.r,
        createdAt: ts, updatedAt: ts,
      } as GiftRecord;
      return { ...db, records: [rec, ...db.records] };
    }
    case 'updateRecord':
      return {
        ...db,
        records: db.records.map((r) =>
          r.id === a.id ? { ...r, ...a.r, updatedAt: now() } : r),
      };
    case 'removeRecord':
      return { ...db, records: db.records.filter((r) => r.id !== a.id) };
    case 'settings':
      return { ...db, settings: { ...db.settings, ...a.s } };
    case 'addTodo': {
      const ts = now();
      const td: Todo = {
        id: uid(), title: '', note: undefined, due: undefined,
        dueTime: undefined, leadMin: undefined,
        done: false, personId: undefined,
        ...a.td, createdAt: ts, updatedAt: ts,
      } as Todo;
      if (!td.title.trim()) return db;
      return { ...db, todos: [...db.todos, td] };
    }
    case 'updateTodo':
      return {
        ...db,
        todos: db.todos.map((t) =>
          t.id === a.id ? { ...t, ...a.td, updatedAt: now() } : t),
      };
    case 'toggleTodo':
      return {
        ...db,
        todos: db.todos.map((t) =>
          t.id === a.id
            ? { ...t, done: !t.done, doneAt: !t.done ? now() : undefined, updatedAt: now() }
            : t),
      };
    case 'removeTodo':
      return { ...db, todos: db.todos.filter((t) => t.id !== a.id) };
    case 'clearDoneTodos':
      return { ...db, todos: db.todos.filter((t) => !t.done) };
    case 'addEvent': {
      if (!a.ev.label.trim()) return db;
      if (db.customEvents.some((c) => c.label === a.ev.label)) return db;
      return { ...db, customEvents: [...db.customEvents, a.ev] };
    }
    case 'removeEvent':
      return { ...db, customEvents: db.customEvents.filter((c) => c.key !== a.key) };
    case 'replace':
      return a.db;
    default:
      return db;
  }
}

interface Ctx {
  db: DB;
  dispatch: React.Dispatch<Action>;
  /** 便捷：取显示名（同名自动带区分后缀） */
  nameOf: (id: string) => string;
  /** 取原始姓名（不做区分，用于搜索匹配） */
  rawNameOf: (id: string) => string;
  stats: ReturnType<typeof aggregateByPerson>;
  totalIn: number;
  totalOut: number;
  /** 查某姓名的人数，用于判断是否需要区分显示 */
  dupCount: (name: string, exceptId?: string) => number;
  /** 从备份恢复 */
  replaceDB: (next: DB) => void;
  /** 备份文件读入后应用到 store */
  applyDB: (raw: any) => DB;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // 读取一次即固定，后续全靠 reducer
  const [db, dispatch] = useReducer(reducer, undefined, () => loadDB());
  const dirty = useRef(false);

  // 首次挂载：把迁移后的结构写回，避免每次启动都重复解析旧格式
  // 只在挂载时跑一次，不能写成无依赖（那会每次渲染都覆盖外部写入）
  useEffect(() => {
    try { saveDB(db); } catch { /* 配额问题留给用户手动导出时提示 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 数据变更后落盘
  useEffect(() => {
    if (!dirty.current) return;
    try { saveDB(db); } catch (e) { console.error(e); }
    dirty.current = false;
  }, [db]);

  const wrap = React.useCallback((a: Action) => {
    dirty.current = true;
    dispatch(a);
  }, []);

  // 同名分组：姓名 -> 该姓名的所有人（保持入库顺序，用于生成序号）
  const groups = useMemo(() => {
    const m = new Map<string, Person[]>();
    for (const p of db.persons) {
      const arr = m.get(p.name) ?? [];
      arr.push(p);
      m.set(p.name, arr);
    }
    return m;
  }, [db.persons]);

  const personOf = useMemo(
    () => (id: string) => db.persons.find((p) => p.id === id),
    [db.persons],
  );

  /** 显示名：同名的自动带区分后缀（alias > 关系·地区 > 序号） */
  const nameOf = useMemo(
    () => (id: string) => {
      const p = personOf(id);
      if (!p) return '';
      const same = groups.get(p.name) ?? [];
      if (same.length <= 1) return p.name;
      return resolveDisplayName(p, same.length, same.findIndex((x) => x.id === p.id));
    },
    [personOf, groups],
  );

  const rawNameOf = useMemo(
    () => (id: string) => personOf(id)?.name ?? '',
    [personOf],
  );

  const dupCount = useMemo(
    () => (name: string, exceptId?: string) =>
      db.persons.filter((p) => p.name === name && p.id !== exceptId).length + 1,
    [db.persons],
  );

  const stats = useMemo(() => aggregateByPerson(db), [db]);
  const totalIn = useMemo(() => sumReceived(db.records), [db.records]);
  const totalOut = useMemo(() => sumReturned(db.records), [db.records]);

  const replaceDB = (next: DB) => {
    saveDB(next);
    dirty.current = false;
    dispatch({ t: 'replace', db: next });
  };

  const applyDB = (raw: any) => migrate(raw);

  const value: Ctx = {
    db, dispatch: wrap, nameOf, rawNameOf, dupCount,
    stats, totalIn, totalOut, replaceDB, applyDB,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp 必须在 AppProvider 内使用');
  return c;
}

/* ---------------- 吐司 ---------------- */

export function useToast() {
  const [msg, setMsg] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const show = (m: string, ms = 2200) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(''), ms);
  };
  const node = msg
    ? <div className="toast" role="status">{msg}</div>
    : null;
  return { show, node };
}

/* ---------------- 格式化 ---------------- */

export const fmtMoney = (n: number, cur = '¥') => {
  const v = Math.abs(Number(n) || 0);
  const s = v % 1 === 0 ? String(v) : v.toFixed(2);
  return `${n < 0 ? '-' : ''}${cur}${s}`;
};

export const fmtDate = (s: string) => {
  if (!s) return '';
  const [, m, d] = s.split('-');
  return `${Number(m)}月${Number(d)}日`;
};

export const fmtMonth = (s: string) => {
  if (!s) return '';
  const [y, m] = s.split('-');
  return `${y}年${Number(m)}月`;
};

const nowTime = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const blankSide = (over: Partial<Side> = {}): Side => ({
  channel: 'cash' as PayChannel,
  amount: 0,
  date: todayStr(),
  // v2.14.2：新记录默认带当前时刻，方便记酒席开席时间（涛哥要求）
  time: nowTime(),
  event: 'wedding' as EventKind,
  ...over,
});
