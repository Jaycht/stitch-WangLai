/**
 * 输入历史下拉 —— 姓名 / 关系等字段的输入建议
 *
 * 交互规则（涛哥定的原话）：
 *   1. 点击输入框时，自动弹出历史输入供选择
 *   2. 用户不选、自己打字时，每输入一个字实时检索
 *   3. 无匹配则自动收起
 *
 * 设计要点：
 *   - 历史从人员库实时聚合，不另存一份 —— 避免两份数据不一致
 *   - 排序按「匹配度 + 最近往来时间」，常用的人自然排在前面
 *   - 键盘导航（上下键 + 回车 + Esc）必须有，扫码/单手操作靠点选很难中
 *   - 遮罩用 mousedown 而非 click 收起，否则输入框先失焦、列表已被卸载
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Person } from './types';
import { cn } from './utils';

/* ---------- 候选构建 ---------- */

export interface Suggest {
  id: string;
  /** 填进输入框的主文本（姓名或区分名） */
  value: string;
  /** 副标题：关系 · 地区 */
  sub?: string;
  /** 完整 Person，用于一并带回关系等信息 */
  person?: Person;
  /** 排序分，外部不展示 */
  _s: number;
}

type Field = 'name' | 'relation';

export function buildSuggests(
  persons: Person[],
  field: Field,
  q: string,
  limit = 8,
): Suggest[] {
  const key = q.trim().toLowerCase();
  const out: Suggest[] = [];

  // ---- 关系字段：历史值 = 所有关系备注的去重集合 ----
  if (field === 'relation') {
    const seen = new Set<string>();
    for (const p of persons) {
      const rel = p.relation?.trim();
      if (!rel || seen.has(rel)) continue;
      seen.add(rel);
      if (key) {
        const hay = `${rel} ${p.name} ${p.region ?? ''}`.toLowerCase();
        if (!hay.includes(key)) continue;
      }
      // 关系词越常见越靠前：按持有该关系的人数排序
      const n = persons.filter((x) => x.relation?.trim() === rel).length;
      out.push({ id: 'rel:' + rel, value: rel, sub: `${n} 人`, _s: n * 10 });
    }
    out.sort((a, b) => b._s - a._s);
    return out.slice(0, limit);
  }

  // ---- 姓名字段 ----
  for (const p of persons) {
    if (!p.name) continue;
    const alias = p.alias?.trim() ?? '';
    const rel = p.relation?.trim() ?? '';
    const area = p.region?.trim() ?? '';

    if (key) {
      const hay = `${p.name} ${alias} ${rel} ${area}`.toLowerCase();
      if (!hay.includes(key)) continue;
    }

    // 匹配度：全名全等 > 全名前缀 > 别名前缀 > 别名包含 > 其它包含
    const ln = p.name.toLowerCase();
    const la = alias.toLowerCase();
    let s: number;
    if (!key) s = 30;
    else if (ln === key) s = 100;
    else if (ln.startsWith(key)) s = 80;
    else if (la && la.startsWith(key)) s = 70;
    else if (ln.includes(key) || la.includes(key)) s = 50;
    else s = 30;
    // 同分时按最近更新时间靠前
    s += Math.min(9, Math.floor(sinceDays(p.updatedAt) / 90));

    out.push({
      id: p.id,
      value: alias || p.name,
      sub: [rel, area].filter(Boolean).join(' · ') || undefined,
      person: p,
      _s: s,
    });
  }

  out.sort((a, b) => b._s - a._s);
  return out.slice(0, limit);
}

function sinceDays(iso?: string): number {
  if (!iso) return 9999;
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return 9999;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

/* ---------- 组件 ---------- */

export function SuggestBox({
  items,
  open,
  activeIndex,
  onPick,
  onClose,
  anchorRef,
}: {
  items: Suggest[];
  open: boolean;
  activeIndex: number;
  onPick: (s: Suggest) => void;
  onClose: () => void;
  /** 触发输入框：点它不算「点外面」，且遮罩要给它让位 */
  anchorRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  // 点外面收起：用 document 监听而不是全屏遮罩。
  // 遮罩方案会盖住输入框本身 —— 弹出后再点输入框就打不了字，
  // 用户无法继续编辑，是致命可用性缺陷。
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (boxRef.current?.contains(t)) return;
      if (anchorRef?.current?.contains(t)) return;
      onClose();
    };
    // capture 阶段先于 onBlur 执行，避免 blur 把列表先关掉导致判定失真
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('touchstart', onDown, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('touchstart', onDown, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open || items.length === 0) return null;

  // 贴着输入框下方弹出，不固定在屏幕中部 ——
  // 中部弹出时列表会盖住输入框本身，用户想补个字都点不到。
  const rect = anchorRef?.current?.getBoundingClientRect();
  const top = rect ? Math.min(rect.bottom + 6, window.innerHeight - 240) : 120;
  const below = rect ? rect.bottom + 6 + Math.min(240, items.length * 52) < window.innerHeight : false;
  // 下方空间不够就翻到输入框上方
  const finalTop = below || !rect ? top : Math.max(8, rect.top - Math.min(240, items.length * 52) - 6);

  return (
    <div
      ref={boxRef}
      className="fixed left-3 right-3 z-50 card overflow-hidden
                 max-h-[45vh] overflow-y-auto shadow-lg shadow-black/10"
      style={{ top: Math.max(8, finalTop) }}
      role="listbox"
    >
      {items.map((s, i) => (
        <button
          key={s.id}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          onMouseDown={(e) => {
            // preventDefault 是必须的：否则输入框先失焦、onClose 触发、列表卸载
            e.preventDefault();
            onPick(s);
          }}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 text-left active:bg-accent-soft',
            // 键盘导航的高亮（模拟器/外接键盘场景）
            i === activeIndex && 'bg-accent-soft',
            i > 0 && 'border-t border-line',
          )}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[var(--f-md)] truncate">{s.value}</div>
            {s.sub && (
              <div className="text-[var(--f-xs)] text-ink-3 truncate mt-0.5">
                {s.sub}
              </div>
            )}
          </div>
          {i === activeIndex && (
            <Check size={14} strokeWidth={2.4} className="text-accent shrink-0" />
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------- 输入框 Hook ---------- */

/**
 * 把「点击弹出 + 边打边检索 + 无匹配收起 + 键盘导航」收在一个 Hook 里。
 * 三个页面共用，不重复实现。
 */
export function useSuggest({
  persons,
  field,
  value,
  onChange,
  onPickPerson,
  maxItems = 8,
}: {
  persons: Person[];
  field: Field;
  value: string;
  onChange: (v: string) => void;
  onPickPerson?: (p: Person) => void;
  maxItems?: number;
}) {
  const [open, setOpen] = useState(false);
  // -1 = 无高亮。手机上默认不高亮，避免第一项看着像「已选中」。
  // 按了方向键才进入键盘导航模式，此时才显示高亮位置。
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(
    () => buildSuggests(persons, field, value, maxItems),
    [persons, field, value, maxItems],
  );

  // 规则 3：无匹配自动收起
  const visible = open && items.length > 0;

  useEffect(() => { setActive(-1); }, [value]);

  const pick = (s: Suggest) => {
    onChange(s.value);
    // 选中已有的人：把关系一并带上，省得再手打
    if (s.person && onPickPerson) onPickPerson(s.person);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!visible) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // -1 → 0：首次按下落到第一项，之后正常循环
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      // -1 → 最后一项：从上往回走应该落到末尾
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      // 回车选中高亮项；没有高亮则放行给表单提交
      if (items[active]) {
        e.preventDefault();
        pick(items[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return {
    inputRef,
    items,
    visible,
    active,
    handlers: {
      ref: inputRef,
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        setOpen(true); // 规则 2：边打边检索
        onChange(e.target.value);
      },
      onFocus: () => setOpen(true), // 规则 1：点击即弹
      onKeyDown,
    },
    boxProps: {
      items,
      open: visible,
      activeIndex: active,
      anchorRef: inputRef,
      onPick: pick,
      onClose: () => setOpen(false),
    },
  };
}