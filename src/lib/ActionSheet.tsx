/**
 * 长按操作菜单 —— 替代浏览器原生 confirm/alert。
 *
 * 为什么不用原生 confirm：Capacitor WebView 里弹的是系统灰色方框，
 * 样式跟应用完全不一致（深色模式下尤其突兀），而且安卓返回键会把它
 * 关掉，用户点了「删除」可能以为取消了。
 */

import React from 'react';
import { Pencil, Trash2, Copy, Share2, Check, X } from 'lucide-react';
import { Sheet } from './ui';
import { cn } from './utils';

export interface SheetAction {
  key: string;
  label: string;
  desc?: string;
  Icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  danger?: boolean;
  onPick: () => void;
}

export function ActionSheet({
  title,
  sub,
  actions,
  onClose,
}: {
  title: string;
  sub?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  return (
    <Sheet open onClose={onClose} title={title}>
      {sub && (
        <div className="text-[length:var(--f-sm)] text-ink-3 mb-2.5 leading-relaxed">
          {sub}
        </div>
      )}
      <div className="card overflow-hidden">
        {actions.map((a, i) => (
          <button
            key={a.key}
            onClick={a.onPick}
            className={cn(
              'row w-full text-left active:bg-paper',
              i > 0 && 'border-t border-line',
            )}
          >
            <span className={cn('shrink-0', a.danger ? 'text-[#C62828]' : 'text-ink-3')}>
              {a.Icon ? <a.Icon size={16} strokeWidth={1.8} /> : null}
            </span>
            <div className="flex-1 min-w-0">
              <div className={cn('text-[length:var(--f-md)]', a.danger && 'text-[#C62828]')}>
                {a.label}
              </div>
              {a.desc && (
                <div className="text-[length:var(--f-xs)] text-ink-3 mt-0.5">{a.desc}</div>
              )}
            </div>
          </button>
        ))}
      </div>
      <button className="btn-ghost w-full mt-3" onClick={onClose}>取消</button>
    </Sheet>
  );
}

/* ---------- 多选模式顶栏 ---------- */

/**
 * 多选模式的顶部工具条。
 * 固定在筛选行上方，替换掉搜索框的位置 —— 那个空间刚好够放
 * 「已选 N / 全选 / 取消 / 删除」，不需要额外占一行。
 */
export function SelectBar({
  count,
  total,
  allSelected,
  onSelectAll,
  onCancel,
  onEdit,
  onDelete,
  title = '项',
}: {
  count: number;
  total: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onCancel: () => void;
  /** 编辑，仅选中 1 条时可用（多选时无法决定编辑谁） */
  onEdit?: () => void;
  onDelete: () => void;
  title?: string;
}) {
  const canEdit = count === 1 && !!onEdit;
  /* v2.14.6：分两行 —— 上一行「关闭 + 已选 N」，下一行「全选 / 编辑 / 删除」。
     原因：关怀模式下字号放大到 2.1 倍，单行放不下三个按钮，
     「删除」会被挤出屏幕右边界（涛哥真机截图确认）。
     「取消全选」比「全选」还多两个字，更挤。
     三个按钮都用 flex-1 均分，任何字号下都不会被挤出。
     ★ 教训：横排按钮绝不能写死宽度或依赖 shrink-0，
       必须让它们可换行 + flex-1 均分。 */
  return (
    <div
      className="flex flex-col gap-1.5 card px-2.5 py-1.5"
      style={{ boxShadow: '0 0 0 2px var(--color-accent)' }}
    >
      {/* 第一行：关闭 + 已选 N */}
      <div className="flex items-center gap-2">
        <button
          onClick={onCancel}
          className="shrink-0 p-1 -m-1"
          aria-label="退出多选"
        >
          <X size={16} strokeWidth={2.2} className="text-ink-2" />
        </button>
        <span className="text-[length:var(--f-sm)] num shrink-0">
          已选 <b className="text-accent">{count}</b> {title}
        </span>
      </div>

      {/* 第二行：全选 / 编辑 / 删除，均分宽度，任何字号都不溢出 */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onSelectAll}
          className={cn(
            'pill-sm flex-1 min-w-0 justify-center items-center gap-0.5 whitespace-nowrap',
            allSelected && 'pill-on',
          )}
          aria-label="全选"
        >
          {allSelected && <Check size={12} strokeWidth={3} />}
          {allSelected ? '取消' : '全选'}
        </button>
        {onEdit && (
          <button
            onClick={onEdit}
            disabled={!canEdit}
            className="pill-sm flex-1 min-w-0 justify-center items-center gap-0.5 whitespace-nowrap"
            aria-label="编辑所选"
            title={canEdit ? '编辑这条' : '只能选中一条才能编辑'}
          >
            <Pencil size={12} strokeWidth={2.2} />
            编辑
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={count === 0}
          className="pill-sm flex-1 min-w-0 justify-center items-center gap-0.5 whitespace-nowrap btn-danger-tiny"
          aria-label="删除所选"
        >
          <Trash2 size={12} strokeWidth={2.2} />
          删除
        </button>
      </div>
    </div>
  );
}

/* ---------- 复选标记 ---------- */

/**
 * 勾选标记。**未选中时也要显示空心圈** ——
 * 否则多选模式下「哪些能选」看不出来，用户不知道哪些行可点。
 */
export function CheckMark({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        'w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0',
        on ? 'bg-accent' : 'border-[1.5px] border-ink-3/45',
      )}
      aria-hidden
    >
      {on && <Check size={11} strokeWidth={3.4} color="#fff" />}
    </span>
  );
}

export { Pencil, Trash2, Copy, Share2 };