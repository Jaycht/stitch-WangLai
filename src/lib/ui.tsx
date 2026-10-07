/** 通用小部件 —— 图标用 lucide 单色描边，尺寸统一 16/18 */

import React, { useEffect, useRef, useState } from 'react';
import {
  X, ChevronLeft, ChevronRight, Plus, Search, Trash2, Check,
  ChevronDown, Info,
} from 'lucide-react';
import { cn } from './utils';

/* ---------- 顶部条 ---------- */

export function TopBar({
  title, onBack, right, sub,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="topbar">
      {onBack && (
        <button
          onClick={onBack}
          className="w-8 h-[var(--h-ctl)] -ml-1 flex items-center justify-center text-ink-2 active:bg-line/50 rounded-md"
          aria-label="返回"
        >
          <ChevronLeft size={19} strokeWidth={1.9} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[var(--f-lg)] font-semibold leading-tight truncate">{title}</div>
        {sub && <div className="text-[var(--f-xs)] text-ink-3 leading-tight truncate">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

/* ---------- 弹层 ---------- */

export function Sheet({
  open, onClose, title, children, footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-mask" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center gap-2 px-3.5 h-12 border-b border-line shrink-0">
          <div className="flex-1 text-[var(--f-lg)] font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="w-8 h-[var(--h-ctl)] flex items-center justify-center text-ink-3 active:bg-line/50 rounded-md"
            aria-label="关闭"
          >
            <X size={18} strokeWidth={1.9} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 py-3">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 px-3.5 py-2.5 border-t border-line flex gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 确认框 ---------- */

export function Confirm({
  open, title, message, danger, onCancel, onOk, okText = '确定',
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  danger?: boolean;
  onCancel: () => void;
  onOk: () => void;
  okText?: string;
}) {
  return (
    <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-6">
      <div className="bg-card rounded-xl w-full max-w-[320px] overflow-hidden">
        <div className="px-4 pt-4 pb-3">
          <div className="text-[var(--f-lg)] font-semibold mb-1.5">{title}</div>
          <div className="text-[var(--f-md)] text-ink-2 leading-relaxed">{message}</div>
        </div>
        <div className="flex border-t border-line">
          <button
            onClick={onCancel}
            className="flex-1 h-11 text-[var(--f-lg)] text-ink-2 active:bg-paper"
          >
            取消
          </button>
          <button
            onClick={onOk}
            className={cn(
              'flex-1 h-11 text-[var(--f-lg)] font-medium border-l border-line active:bg-paper',
              danger ? 'text-[#8E2A22]' : 'text-accent',
            )}
          >
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 分区 ---------- */

export function Section({
  title, action, children, className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-center justify-between mb-2">
        <div className="sec-title">{title}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ---------- 搜索框 ---------- */

export function SearchBox({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search
        size={14}
        strokeWidth={2}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3/80
                   pointer-events-none select-none z-[1]"
      />
      <input
        className="field"
        // 内联写死 padding：.field 是组件层类，优先级高于 Tailwind 工具类，
        // 写在 className 里的 pl-9 会被它盖掉，这里只能内联。
        style={{ paddingLeft: 34, paddingRight: 32 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value ? (
        <button
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 z-[1]
                     flex items-center justify-center rounded-full
                     bg-ink-3/15 text-ink-2 active:bg-ink-3/25"
          aria-label="清空"
        >
          <X size={11} strokeWidth={2.6} />
        </button>
      ) : null}
    </div>
  );
}

/* ---------- 折叠面板 ---------- */

export function Collapse({
  title, children, defaultOpen = false, count,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 h-10 text-left"
      >
        <span className="text-[var(--f-md)] font-medium flex-1">{title}</span>
        {count !== undefined && (
          <span className="text-[var(--f-xs)] text-ink-3 num">{count}</span>
        )}
        <ChevronDown
          size={15}
          strokeWidth={1.9}
          className={cn('text-ink-3 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && <div className="border-t border-line">{children}</div>}
    </div>
  );
}

/* ---------- 空态 ---------- */

export function Empty({ text, hint, action }: { text: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <Info size={26} strokeWidth={1.5} className="text-ink-3/50" />
      <div className="text-[var(--f-md)]">{text}</div>
      {hint && <div className="text-[var(--f-sm)] text-ink-3/70">{hint}</div>}
      {action}
    </div>
  );
}

/* ---------- 底部弹出选择 ---------- */

export function PickSheet<T extends string>({
  open, onClose, title, options, value, onPick,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  options: { key: T; label: string; desc?: string }[];
  value?: T;
  onPick: (k: T) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="card overflow-hidden -mx-3.5">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => { onPick(o.key); onClose(); }}
            className="row w-full text-left active:bg-paper"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[var(--f-md)]">{o.label}</div>
              {o.desc && <div className="text-[var(--f-sm)] text-ink-3 mt-0.5">{o.desc}</div>}
            </div>
            {value === o.key && <Check size={16} strokeWidth={2.4} className="text-accent" />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/* ---------- 悬浮按钮 ---------- */

export function Fab({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="fixed right-3 bottom-[64px] w-12 h-12 rounded-full bg-accent text-white
                 flex items-center justify-center shadow-lg shadow-black/15 active:scale-95
                 transition-transform z-30"
    >
      <Plus size={22} strokeWidth={2.3} />
    </button>
  );
}

/* ---------- 删除按钮 ---------- */

export function IconBtn({
  onClick, danger, label,
}: { onClick: () => void; danger?: boolean; label: string }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={label}
      className={cn(
        'w-8 h-[var(--h-ctl)] -mr-1 flex items-center justify-center rounded-md active:bg-line/60',
        danger ? 'text-[#8E2A22]' : 'text-ink-3',
      )}
    >
      <Trash2 size={15.5} strokeWidth={1.8} />
    </button>
  );
}

export { ChevronLeft, ChevronRight, Plus };
