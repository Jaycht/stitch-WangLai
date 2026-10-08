/** 待办事项 —— 恢复并增强：可关联人员、截止日期、逾期提示 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Check, Trash2, Circle, Calendar, Link2, X, ListChecks, CheckSquare, BellOff,
} from 'lucide-react';
import { Todo, splitTodos } from '../lib/types';
import { useApp, todayStr } from '../lib/store';
import { TopBar, Sheet, Empty, Section, Confirm } from '../lib/ui';
import { cn } from '../lib/utils';
import { pushBack } from '../lib/backStack';
import { useLongPress } from '../lib/useLongPress';
import { SelectBar, CheckMark } from '../lib/ActionSheet';
import {
  scheduleTodo, cancelTodo, ensurePermission, needExactWarn, type PermStatus,
} from '../lib/notify';

/** 待办提醒的提前量选项（v2.13.1） */
const TODO_LEAD_OPTIONS = [
  { v: 0, label: '准点' },
  { v: 15, label: '提前 15 分' },
  { v: 30, label: '提前 30 分' },
  { v: 60, label: '提前 1 小时' },
  { v: 180, label: '提前 3 小时' },
  { v: 1440, label: '提前 1 天' },
];

/** 权限还没查到时的占位（避免 needExactWarn 收到 null） */
const UNKNOWN_PERMS: PermStatus = {
  available: false, display: 'denied', exactAlarm: 'denied',
  canPost: false, canExact: false,
};

/** 距今天的天数：正数=还有几天，负数=已过几天 */
function daysFromToday(d: string): number {
  const t = new Date(todayStr() + 'T00:00:00').getTime();
  const x = new Date(d + 'T00:00:00').getTime();
  return Math.round((x - t) / 86400000);
}

function DueText({ due }: { due?: string }) {
  if (!due) return null;
  const n = daysFromToday(due);
  const txt =
    n === 0 ? '今天' :
    n === 1 ? '明天' :
    n === -1 ? '昨天' :
    n > 0 ? `还有 ${n} 天` :
    `逾期 ${-n} 天`;
  return (
    <span className={cn(
      'tagx',
      n < 0 ? 'bg-ink/8 text-ink-2' : n === 0 ? 'bg-accent text-white' : 'bg-line/70 text-ink-2',
    )}>
      {txt}
    </span>
  );
}

export function TodosPage() {
  const { db, dispatch, nameOf } = useApp();
  const nav = useNavigate();
  const [edit, setEdit] = useState<Todo | 'new' | null>(null);
  const [clearDone, setClearDone] = useState(false);
  const [showDone, setShowDone] = useState(false);

  /* ---------- 长按：多选模式 ----------
     按 M3 规范：长按 = 选中该条并进入多选，不弹菜单。 */
  const [sel, setSel] = useState<Set<string>>(new Set());
  const selecting = sel.size > 0;
  const [batchDel, setBatchDel] = useState(false);

  const { open, done } = useMemo(() => splitTodos(db.todos), [db.todos]);

  /** 多选时可勾选的清单 = 未完成 + （展开时）已完成 */
  const selectable = showDone ? [...open, ...done] : open;

  const exitSelect = () => setSel(new Set());

  /* 返回键优先级：多选模式下先退出多选，而不是返回上一个页面。
     这与原生 Android 一致（选中的Checkbox 状态属于「临时模式」，
     返回应该先撤销模式）。 */
  useEffect(() => {
    if (!selecting) return;
    return pushBack({
      priority: 'mode',
      label: 'multi-select',
      handler: () => {
        exitSelect();
        return true;
      },
    });
  }, [selecting]);
  const toggleSel = (id: string) => {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  /** 标题栏「全选」：一键进多选并选中全部可勾选项 */
  const selectAll = () => {
    if (selectable.length === 0) return;
    if (sel.size === selectable.length) exitSelect();
    else setSel(new Set(selectable.map((t) => t.id)));
  };
  const doBatchDelete = () => {
    for (const id of sel) dispatch({ t: 'removeTodo', id });
    setBatchDel(false);
    exitSelect();
  };

  return (
    <>
      <TopBar
        title="待办事项"
        sub={`未完成 ${open.length} 项${done.length ? ` · 已完成 ${done.length} 项` : ''}`}
        onBack={() => nav(-1)}
        right={
          db.todos.length > 0 ? (
            <div className="flex items-center gap-1.5">
              {!selecting && selectable.length > 0 && (
                <button
                  onClick={selectAll}
                  className="btn-ghost btn-sm shrink-0 flex items-center gap-1"
                  aria-label="全选并批量操作"
                >
                  <CheckSquare size={14} strokeWidth={1.9} />
                  全选
                </button>
              )}
              <button
                onClick={() => setShowDone((v) => !v)}
                className="btn-ghost btn-sm shrink-0"
              >
                {showDone ? '隐藏已完成' : `看已完成 ${done.length}`}
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="page-body space-y-3">
        {selecting && (
          <SelectBar
            count={sel.size}
            total={selectable.length}
            allSelected={sel.size === selectable.length && selectable.length > 0}
            onSelectAll={selectAll}
            onCancel={exitSelect}
            onEdit={sel.size === 1 ? () => {
              const t = db.todos.find((x) => x.id === [...sel][0]);
              if (t) { setEdit(t); exitSelect(); }
            } : undefined}
            onDelete={() => setBatchDel(true)}
            title="项"
          />
        )}

        {db.todos.length === 0 ? (
          <div className="card">
            <Empty
              text="还没有待办"
              hint="随份子的日子要提前买礼金、定饭店，记进来省得忘"
            />
          </div>
        ) : (
          <>
            {/* 未完成 */}
            {open.length > 0 && (
              <Section title={`要做（${open.length}）`}>
                <div className="card overflow-hidden">
                  {open.map((t, i) => (
                    <TodoRow
                      key={t.id}
                      t={t}
                      first={i === 0}
                      personName={t.personId ? nameOf(t.personId) : ''}
                      selecting={selecting}
                      selected={sel.has(t.id)}
                      onClick={() => (selecting ? toggleSel(t.id) : setEdit(t))}
                      onLongPress={() => toggleSel(t.id)}
                      onToggle={() => dispatch({ t: 'toggleTodo', id: t.id })}
                      onEdit={() => setEdit(t)}
                      onRemove={() => dispatch({ t: 'removeTodo', id: t.id })}
                    />
                  ))}
                </div>
              </Section>
            )}

            {/* 已完成 */}
            {showDone && done.length > 0 && (
              <Section
                title={`已完成（${done.length}）`}
                action={
                  <button
                    onClick={() => setClearDone(true)}
                    className="text-[var(--f-xs)] text-ink-3"
                  >
                    清除
                  </button>
                }
              >
                <div className="card overflow-hidden">
                  {done.map((t, i) => (
                    <TodoRow
                      key={t.id}
                      t={t}
                      first={i === 0}
                      personName={t.personId ? nameOf(t.personId) : ''}
                      selecting={selecting}
                      selected={sel.has(t.id)}
                      onClick={() => toggleSel(t.id)}
                      onLongPress={() => toggleSel(t.id)}
                      onToggle={() => dispatch({ t: 'toggleTodo', id: t.id })}
                      onEdit={() => setEdit(t)}
                      onRemove={() => dispatch({ t: 'removeTodo', id: t.id })}
                    />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {/* 分类提示 */}
        <div className="card p-3">
          <div className="text-[var(--f-sm)] font-medium mb-1.5 flex items-center gap-1.5">
            <ListChecks size={14} strokeWidth={2} className="text-ink-3" />可以记这些
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['买礼金', '定饭店', '问随礼名单', '确认桌数', '提前一天提醒自己', '封车 / 借桌布椅']
              .map((s) => (
                <button key={s} onClick={() => setEdit({ title: s } as Todo)} className="pill">
                  <Plus size={11} strokeWidth={2.4} />{s}
                </button>
              ))}
          </div>
        </div>
      </div>

      <button
        onClick={() => setEdit('new')}
        aria-label="新增待办"
        className="fab fixed right-3 w-14 h-14 rounded-full bg-accent text-white
                   flex items-center justify-center shadow-lg shadow-black/20
                   active:scale-95 transition-transform z-30"
        style={{ bottom: 'calc(var(--h-tab) + var(--sab) + 16px)' }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth={2.6}
               strokeLinecap="round" aria-hidden>
            <path d="M12 5v14" /><path d="M5 12h14" />
          </svg>
      </button>

      {/* 批量删除待办 */}
      {batchDel && (
        <Confirm
          open
          title={`删除${sel.size} 条待办？`}
          message="删除后无法恢复。若只是想把它们标记完成，用左边的圆圈勾选即可。"
          danger
          okText="删除"
          onCancel={() => setBatchDel(false)}
          onOk={doBatchDelete}
        />
      )}

      {/* 清除已完成 —— 用应用内确认框，不用浏览器原生 confirm */}
      {clearDone && done.length > 0 && (
        <Confirm
          open
          title={`清除 ${done.length} 条已完成的待办？`}
          message="清除后无法恢复，未完成的待办不受影响。"
          danger
          okText="清除"
          onCancel={() => setClearDone(false)}
          onOk={() => {
            dispatch({ t: 'clearDoneTodos' });
            setClearDone(false);
          }}
        />
      )}

      {edit && (
        <TodoEditor todo={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />
      )}
    </>
  );
}

/* ---------- 单行 ---------- */

function TodoRow({
  t, first, personName, selecting, selected,
  onClick, onLongPress, onToggle, onEdit, onRemove,
}: {
  t: Todo;
  first: boolean;
  personName: string;
  /** 是否处于多选模式 */
  selecting: boolean;
  /** 本行是否被选中 */
  selected: boolean;
  onClick: () => void;
  onLongPress: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const lp = useLongPress({ onLongPress, onClick, fastClick: selecting });

  // 多选模式下把整行交给长按手势；非多选时保留原有的勾选圈+编辑按钮布局
  return (
    <div
      className={cn(
        'row select-none',
        !first && 'row-alt',
        selecting && selected && 'bg-accent-soft',
      )}
      style={selecting && selected
        ? { boxShadow: 'inset 3px 0 0 var(--color-accent)' }
        : undefined}
      {...lp}
      /* 非多选态也要长按：把 lp 挂到外层，
         但内部那个占满整行的 <button> 会吃掉 pointer 事件冒泡，
         所以给它加 onMouseDown 让长按仍能触发（见下）。 */
    >
      {selecting ? (
        /* 多选态：左边换成勾选圆框，整行可点 */
        <span className="shrink-0 flex items-center justify-center w-5 h-5"
              onClick={(e) => { e.stopPropagation(); onToggle(); }}>
          {t.done
            ? <Check size={17} strokeWidth={2.6} className="text-accent" />
            : <Circle size={17} strokeWidth={1.6} className="text-ink-3" />}
        </span>
      ) : (
        <button
          onClick={onToggle}
          aria-label={t.done ? '标记未完成' : '标记完成'}
          className="shrink-0 w-5 h-5 flex items-center justify-center"
        >
          {t.done
            ? <Check size={17} strokeWidth={2.6} className="text-accent" />
            : <Circle size={17} strokeWidth={1.6} className="text-ink-3" />}
        </button>
      )}
      {selecting && <CheckMark on={selected} />}
      {/* 内容区的 <button>：
          - 多选态：**不挂 onClick**，点击由外层 row 的 lp 统一处理
            （否则内外两层都响应click，会双次切换选中态并弹出编辑面板）
          - 非多选态：点内容= 编辑，走 onEdit
          onMouseDown 的 preventDefault 阻止输入框聚焦，
          但**不影响 pointer 事件冒泡**给外层的 useLongPress。 */}
      <button
        onClick={selecting ? undefined : onEdit}
        onMouseDown={selecting ? (e) => e.preventDefault() : undefined}
        className="flex-1 min-w-0 text-left"
      >
        <div className={cn(
          'text-[var(--f-md)] leading-snug',
          t.done && 'line-through text-ink-3',
        )}>
          {t.title}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {t.due && !t.done && <DueText due={t.due} />}
          {t.due && t.done && (
            <span className="text-[var(--f-xs)] text-ink-3 num">{t.due.slice(5)}</span>
          )}
          {personName && (
            <span className="tagx bg-line/60 text-ink-2">{personName}</span>
          )}
          {t.note && (
            <span className="text-[var(--f-xs)] text-ink-3 truncate max-w-[180px]">{t.note}</span>
          )}
        </div>
      </button>
      {confirming ? (
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => { onRemove(); setConfirming(false); }}
            className="text-[var(--f-xs)] text-[#C62828] px-1.5 py-1 rounded"
          >确认删</button>
          <button
            onClick={() => setConfirming(false)}
            className="text-[var(--f-xs)] text-ink-3 px-1.5 py-1 rounded"
          >算了</button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          aria-label="删除"
          className="w-8 h-[var(--h-ctl)] -mr-1 flex items-center justify-center text-ink-3 active:bg-line/60 rounded-md shrink-0"
        >
          <Trash2 size={15} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}

/* ---------- 编辑 ---------- */

function TodoEditor({ todo, onClose }: { todo: Todo | null; onClose: () => void }) {
  const { db, dispatch, nameOf } = useApp();
  const [title, setTitle] = useState(todo?.title ?? '');
  const [note, setNote] = useState(todo?.note ?? '');
  const [due, setDue] = useState(todo?.due ?? '');
  const [dueTime, setDueTime] = useState(todo?.dueTime ?? '');
  const [leadMin, setLeadMin] = useState<number | undefined>(todo?.leadMin);
  const [personId, setPersonId] = useState(todo?.personId ?? '');
  /** v2.13.1：权限状态与排期反馈 */
  const [perms, setPerms] = useState<PermStatus | null>(null);
  const [schedMsg, setSchedMsg] = useState<string | null>(null);

  const canSave = title.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    const payload = {
      title: title.trim(),
      note: note.trim() || undefined,
      due: due || undefined,
      // 只有填了时刻才带上提前量，没时刻就沿用「提前 1 天」
      dueTime: due && dueTime ? dueTime : undefined,
      leadMin: due && dueTime ? leadMin : undefined,
      personId: personId || undefined,
    };
    if (todo) dispatch({ t: 'updateTodo', id: todo.id, td: payload });
    else dispatch({ t: 'addTodo', td: payload });

    // v2.13.1-hotfix：先关面板，再后台排期。
    // 权限申请在国产 ROM 上可能被压制而不 resolve，await 会卡死界面。
    onClose();
    if (due) {
      void (async () => {
        const tmp = { ...(todo ?? {}), ...payload, id: todo?.id ?? 'pending', done: false,
          createdAt: '', updatedAt: '' } as Todo;
        const res = await scheduleTodo(tmp, nameOf, db.settings.remindLeadMin ?? 60)
          .catch(() => ({ ok: false as const, reason: 'error' as const }));
        if (!res.ok && res.reason === 'past') {
          setSchedMsg('提醒时间减去提前量后已经过去，本次未排上。改个时间或调小提前量即可。');
        } else if (res.ok && (res.inexact || needExactWarn(leadMin ?? db.settings.remindLeadMin ?? 60, perms ?? UNKNOWN_PERMS))) {
          setSchedMsg('未获精确闹钟权限，此提醒可能延迟几分钟。要准点的话，请用手机自带「时钟」另设闹钟。');
        }
      })();
    } else if (todo) {
      void cancelTodo(todo.id);
    }
  };

  const quickDue = [
    { v: todayStr(), l: '今天' },
    { v: (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })(), l: '明天' },
    { v: (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10); })(), l: '3天后' },
    { v: (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })(), l: '一周后' },
  ];

  /** v2.13.1：用户第一次设提醒时，主动申请通知权限（不阻塞 UI） */
  const applyDue = (v: string) => {
    setDue(v);
    if (v && !perms) {
      void ensurePermission().then((r) => setPerms(r)).catch(() => {});
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={todo ? '编辑待办' : '新增待办'}
      footer={
        <button className="btn flex-1" onClick={save} disabled={!canSave}>
          {canSave ? '保存' : '写点什么'}
        </button>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">要做什么</label>
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="如：去镇上取现金、买两箱牛奶"
            autoComplete="off"
          />
        </div>

        <div>
          <label className="label">什么时候</label>
          <div className="flex gap-1.5 mb-2">
            {quickDue.map((o) => (
              <button
                key={o.l}
                onClick={() => void applyDue(o.v)}
                className={cn('pill flex-1', due === o.v && 'pill-on')}
              >
                {o.l}
              </button>
            ))}
            {due && (
              <button
                onClick={() => { setDue(''); setDueTime(''); setLeadMin(undefined); }}
                className="pill-sm"
                aria-label="清除日期"
              >
                <X size={12} strokeWidth={2.4} />
              </button>
            )}
          </div>
          <input
            className="field"
            type="date"
            value={due}
            onChange={(e) => void applyDue(e.target.value)}
          />

          {/* v2.13.1：填了时刻才到点提醒，否则退回「提前 1 天」 */}
          {due && (
            <div className="mt-2">
              <label className="label">提醒时刻（留空则提前 1 天提醒）</label>
              <input
                className="field"
                type="time"
                value={dueTime}
                onChange={(e) => {
                  setDueTime(e.target.value);
                  if (e.target.value && leadMin === undefined) setLeadMin(0);
                }}
              />
              {dueTime && (
                <div className="mt-2">
                  <label className="label">提前多久提醒</label>
                  <div className="flex flex-wrap gap-1.5">
                    {TODO_LEAD_OPTIONS.map((o) => (
                      <button
                        key={o.v}
                        onClick={() => setLeadMin(o.v)}
                        className={cn('pill', (leadMin ?? 0) === o.v && 'pill-on')}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {schedMsg && (
            <p className="text-[var(--f-xs)] text-ink-3 mt-2 flex items-start gap-1">
              <BellOff size={12} strokeWidth={2} className="mt-0.5 shrink-0" />
              <span>{schedMsg}</span>
            </p>
          )}
        </div>

        {db.persons.length > 0 && (
          <div>
            <label className="label">跟谁有关（可选）</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setPersonId('')}
                className={cn('pill', !personId && 'pill-on')}
              >不关联</button>
              {db.persons.slice(0, 14).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPersonId(p.id)}
                  className={cn('pill', personId === p.id && 'pill-on')}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="label">备注</label>
          <textarea
            className="field-area"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="如：记得要发票"
          />
        </div>
      </div>
    </Sheet>
  );
}

export default TodosPage;
