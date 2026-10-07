/** 事由选择器 —— 喜事红 / 丧事黑白，支持自定义永久保存 */

import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  CustomEvent, EventDef, EventTone, eventsByTone, allEvents, makeEventLookup,
} from './types';
import { useApp } from './store';
import { uid } from './db';
import { Sheet, Confirm } from './ui';
import { cn } from './utils';
import { useLongPress } from './useLongPress';
import { SelectBar, CheckMark } from './ActionSheet';

const TONE_TITLE: Record<EventTone, string> = {
  fest: '喜事',
  solemn: '丧事 · 祭奠',
};

/**
 * 事由按钮组。
 * 喜事选中=红底白字，丧事选中=黑底白字，一眼分清。
 */
export function EventPicker({
  value, onChange, compact,
}: {
  value: string;
  onChange: (k: string) => void;
  /** 紧凑模式：单行内展示，常用于回礼侧 */
  compact?: boolean;
}) {
  const { db, dispatch } = useApp();
  const groups = eventsByTone(db.customEvents);
  const [adding, setAdding] = useState<EventTone | null>(null);

  /* ---------- 管理页的长按多选 ----------
     与记录页/人员页同一套规范：长按 = 选中并进入多选。 */
  const [sel, setSel] = useState<Set<string>>(new Set());
  const selecting = sel.size > 0;
  const [batchDel, setBatchDel] = useState(false);

  const exitSelect = () => setSel(new Set());
  const toggleSel = (key: string) => {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };
  const selectAll = () => {
    const all = db.customEvents.map((c) => c.key);
    if (all.length === 0) return;
    if (sel.size === all.length) exitSelect();
    else setSel(new Set(all));
  };
  const doBatchDelete = () => {
    for (const k of sel) dispatch({ t: 'removeEvent', key: k });
    setBatchDel(false);
    exitSelect();
  };
  const [label, setLabel] = useState('');
  const [manage, setManage] = useState(false);

  const save = () => {
    const t = label.trim();
    if (!t || !adding) return;
    dispatch({
      t: 'addEvent',
      ev: { key: 'ce_' + uid(), label: t, tone: adding, createdAt: new Date().toISOString() },
    });
    onChange('ce_' + uid());
    setLabel('');
    setAdding(null);
  };

  const renderGroup = (tone: EventTone) => (
    <div className={cn(!compact && 'mt-2.5')}>
      {!compact && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className={cn(
              'text-[var(--f-xs)] font-medium px-1.5 py-0.5 rounded',
              tone === 'fest' ? 'bg-accent-soft text-accent' : 'bg-ink/8 text-ink-2',
            )}
          >
            {TONE_TITLE[tone]}
          </span>
          <div className="flex-1 h-px bg-line" />
          <button
            onClick={() => setAdding(tone)}
            className="text-[var(--f-xs)] text-ink-3 flex items-center gap-0.5 active:text-accent"
          >
            <Plus size={11} strokeWidth={2.4} />自定义
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {groups[tone].map((e) => (
          <EventBtn key={e.key} e={e} on={value === e.key} onClick={() => onChange(e.key)} compact={compact} />
        ))}
        {compact && (
          <button
            onClick={() => setAdding(tone)}
            className="pill-sm"
            aria-label="自定义事由"
          >
            <Plus size={12} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {renderGroup('fest')}
      {renderGroup('solemn')}

      {db.customEvents.length > 0 && !compact && (
        <button
          onClick={() => setManage(true)}
          className="text-[var(--f-xs)] text-ink-3 mt-2.5 underline underline-offset-2"
        >
          管理自定义事由（{db.customEvents.length}）
        </button>
      )}

      {/* 新增自定义事由 */}
      {adding && (
        <Sheet
          open
          onClose={() => { setAdding(null); setLabel(''); }}
          title={adding === 'fest' ? '新增喜事' : '新增丧事'}
          footer={
            <button className="btn flex-1" onClick={save} disabled={!label.trim()}>
              保存并使用
            </button>
          }
        >
          <div>
            <label className="label">名称</label>
            <input
              className="field"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={adding === 'fest' ? '如：乔迁 / 订婚 / 升学宴' : '如：出殡 / 周年 / 上梁'}
              autoComplete="off"
            />
            <p className="text-[var(--f-xs)] text-ink-3 mt-2 leading-relaxed">
              保存后永久出现在{adding === 'fest' ? '喜事' : '丧事'}列表里，
              以后记账直接点选，不用再输。
            </p>
          </div>
        </Sheet>
      )}

      {/* 管理已有自定义 */}
      {manage && (
        <Sheet
          open
          onClose={() => { setManage(false); exitSelect(); }}
          title="自定义事由"
          footer={selecting
            ? <span className="text-[var(--f-sm)] text-ink-3 w-full text-center py-1.5">
                长按可多选后批量删除
              </span>
            : <button className="btn-ghost flex-1" onClick={() => setManage(false)}>完成</button>}
        >
          {selecting && (
            <div className="mb-2.5">
              <SelectBar
                count={sel.size}
                total={db.customEvents.length}
                allSelected={sel.size === db.customEvents.length && db.customEvents.length > 0}
                onSelectAll={selectAll}
                onCancel={exitSelect}
                onDelete={() => setBatchDel(true)}
                title="项"
              />
            </div>
          )}
          <div className="card overflow-hidden">
            {db.customEvents.map((c, ci) => (
              <EventRow
                key={c.key}
                c={c}
                first={ci === 0}
                selecting={selecting}
                selected={sel.has(c.key)}
                onClick={() => (selecting ? toggleSel(c.key) : undefined)}
                onLongPress={() => toggleSel(c.key)}
                onDelete={() => dispatch({ t: 'removeEvent', key: c.key })}
              />
            ))}
          </div>
          <p className="text-[var(--f-xs)] text-ink-3 mt-2 leading-relaxed">
            删除自定义事由不会影响已有记录，历史记录会显示为原键名。
            长按任意一项可进入多选，批量删除更快。
          </p>
        </Sheet>
      )}

      {/* 批量删除自定义事由 */}
      {batchDel && (
        <Confirm
          open
          title={`删除 ${sel.size} 个自定义事由？`}
          message="删除后这些事由会从列表消失。已有记录不受影响，历史记录仍显示原名称。"
          danger
          okText="删除"
          onCancel={() => setBatchDel(false)}
          onOk={doBatchDelete}
        />
      )}
    </>
  );
}

/* ---------- 单个事由按钮 ---------- */

export function EventBtn({
  e, on, onClick, compact,
}: { e: EventDef; on: boolean; onClick: () => void; compact?: boolean }) {
  const cls = compact
    ? cn(
        'px-2.5 h-[var(--h-sm)] rounded-md border text-[var(--f-sm)] transition-colors',
        on
          ? e.tone === 'fest'
            ? 'bg-accent border-accent text-white font-medium'
            : 'bg-ink border-ink text-white font-medium'
          : 'border-line bg-card text-ink-2',
      )
    : cn(
        'px-2.5 h-[var(--h-ctl)] rounded-md border text-[var(--f-md)] transition-colors',
        on
          ? e.tone === 'fest'
            ? 'bg-accent border-accent text-white font-medium'
            : 'bg-ink border-ink text-white font-medium'
          : e.tone === 'fest'
            ? 'border-accent-line bg-accent-soft/40 text-accent'
            : 'border-line bg-card text-ink-2',
      );
  return (
    <button onClick={onClick} className={cls}>
      {e.label}
    </button>
  );
}

/** 只读的标签形态（列表里用） */
export function EventChip({ ev, on }: { ev: EventDef; on?: boolean }) {
  return (
    <span
      className={cn(
        'tagx',
        ev.tone === 'fest'
          ? on ? 'bg-accent text-white' : 'bg-accent-soft text-accent'
          : on ? 'bg-ink text-white' : 'bg-ink/8 text-ink-2',
      )}
    >
      {ev.label}
    </span>
  );
}

/** 由 DB 提供查找的便捷组件 */
export function useEventDef() {
  const { db } = useApp();
  return makeEventLookup(db.customEvents);
}

export { allEvents };
export type { CustomEvent };

/* ---------- 带长按的自定义事由行 ---------- */

function EventRow({
  c, first, selecting, selected, onClick, onLongPress, onDelete,
}: {
  c: CustomEvent;
  first: boolean;
  selecting: boolean;
  selected: boolean;
  onClick: () => void;
  onLongPress: () => void;
  onDelete: () => void;
}) {
  const lp = useLongPress({ onLongPress, onClick, fastClick: selecting });
  return (
    <div
      className={cn(
        'row select-none',
        !first && 'border-t border-line',
        selecting && selected && 'bg-accent-soft',
      )}
      style={selecting && selected
        ? { boxShadow: 'inset 3px 0 0 var(--color-accent)' }
        : undefined}
      {...lp}
    >
      {selecting && <CheckMark on={selected} />}
      <EventChip ev={c} />
      <span className="flex-1 text-[var(--f-md)] truncate">{c.label}</span>
      <span className={cn(
        'tagx shrink-0',
        c.tone === 'fest' ? 'bg-accent-soft text-accent' : 'bg-ink/8 text-ink-2',
      )}>
        {c.tone === 'fest' ? '喜' : '丧'}
      </span>
      {!selecting && (
        <button
          onClick={onDelete}
          className="w-8 h-[var(--h-ctl)] -mr-1 flex items-center justify-center
                     text-ink-3 active:bg-line/60 rounded-md shrink-0"
          aria-label={`删除 ${c.label}`}
        >
          <X size={15} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
