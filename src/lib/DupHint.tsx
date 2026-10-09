/**
 * 重名区分
 *
 * 本地同名极常见（好几个「张三」），只靠姓名必然对不上人。
 * 三层区分，按省事程度递进：
 *
 *   一键：直接选已有的同名档案（最省事，不用打字）
 *   手动：起个区分名，如「建国·南麻」「张三(二哥)」自由输入
 *   自动：填关系或地区，系统拼成「张三（表弟·沂源）」
 *
 * 录入时检测到同名会主动提示，不静默合并。
 */

import React, { useState } from 'react';
import { AlertTriangle, Check, Users } from 'lucide-react';
import { Person, findSameName, resolveDisplayName } from './types';
import { useApp } from './store';
import { Sheet, PickSheet } from './ui';
import { cn } from './utils';

export interface DupInfo {
  /** 同名的其他档案 */
  candidates: Person[];
  /** 目标档案（编辑时为它自己） */
  self?: Person;
  name: string;
}

/**
 * 重名提示条。显示在录入面板顶部。
 * 点「选已有的人」展开选择；点「设区分名」起别名。
 */
export function DupHint({
  info, onPickExisting, onSetAlias,
}: {
  info: DupInfo | null;
  onPickExisting: () => void;
  onSetAlias: () => void;
}) {
  if (!info || info.candidates.length === 0) return null;
  return (
    <div className="rounded-lg border border-[#E0C4C1] bg-accent-soft/50 px-2.5 py-2">
      <div className="flex items-start gap-1.5">
        <AlertTriangle size={14} strokeWidth={2} className="text-accent mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[length:var(--f-sm)] text-ink-2 leading-snug">
            本机已有 <b className="text-accent">{info.candidates.length}</b> 位「{info.name}」。
            要不要选其中一位，或给这位起个区分名？
          </div>
          <div className="flex gap-1.5 mt-1.5">
            <button
              onClick={onPickExisting}
              className="btn-ghost btn-sm bg-card"
            >
              <Users size={12} strokeWidth={2} />选已有的人
            </button>
            <button onClick={onSetAlias} className="btn-ghost btn-sm bg-card">
              设区分名
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 选已有同名档案 */
export function DupPicker({
  open, onClose, name, candidates, onPick,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  candidates: Person[];
  onPick: (p: Person) => void;
}) {
  const { db } = useApp();
  return (
    <Sheet open={open} onClose={onClose} title={`选择已有的「${name}」`}>
      <div className="card overflow-hidden -mx-3.5">
        {candidates.map((p) => {
          const n = db.persons.filter((x) => x.name === name).length;
          return (
            <button
              key={p.id}
              onClick={() => { onPick(p); onClose(); }}
              className="row w-full text-left active:bg-paper"
            >
              <div className="w-[calc(var(--f-md)*2.1)] h-[calc(var(--f-md)*2.1)] rounded-full
                              bg-accent-soft text-accent shrink-0
                              flex items-center justify-center text-[length:var(--f-md)] font-medium">
                {p.name.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[length:var(--f-md)] truncate">
                  {p.alias?.trim() || p.name}
                </div>
                <div className="text-[length:var(--f-xs)] text-ink-3 mt-0.5 truncate">
                  {[p.relation, p.region, p.phone].filter(Boolean).join(' · ') || '暂无档案信息'}
                </div>
              </div>
              {p.alias?.trim() && (
                <span className="tagx bg-line/60 text-ink-2 shrink-0">已区分</span>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

/** 手动起区分名 */
export function AliasEditor({
  open, onClose, personName, initial, onSave,
}: {
  open: boolean;
  onClose: () => void;
  personName: string;
  initial?: string;
  onSave: (alias: string, relation?: string, region?: string) => void;
}) {
  const { db } = useApp();
  const [alias, setAlias] = useState(initial ?? '');
  const [relation, setRelation] = useState('');
  const [region, setRegion] = useState('');

  // 同名的其他人都填了啥，给个参考
  const others = db.persons.filter((p) => p.name === personName);

  const submit = () => {
    const a = alias.trim();
    const r = relation.trim();
    const g = region.trim();
    // 三者全空 => 清掉区分名（回到序号兜底）
    onSave(a || r || g ? a : '', r || undefined, g || undefined);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`区分「${personName}」`}
      footer={
        <button className="btn flex-1" onClick={submit}>
          {alias.trim() || relation.trim() || region.trim() ? '保存区分' : '清空区分名'}
        </button>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">区分名（推荐，一眼能认）</label>
          <input
            className="field"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="如：建国·南麻 / 张三(二哥)"
            autoComplete="off"
          />
          <p className="text-[length:var(--f-xs)] text-ink-3 mt-1 leading-relaxed">
            填了就直接用这个名字显示，最不容易搞混。
          </p>
        </div>

        <div className="h-px bg-line" />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">关系</label>
            <input
              className="field"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              placeholder="表弟 / 同事"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label">地区</label>
            <input
              className="field"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="南麻 / 县城"
              autoComplete="off"
            />
          </div>
        </div>
        <p className="text-[length:var(--f-xs)] text-ink-3 leading-relaxed -mt-1.5">
          不填区分名时，会自动拼成「{personName}（关系·地区）」；两个都不填就显示序号。
        </p>

        {others.length > 1 && (
          <div className="card p-2.5">
            <div className="text-[length:var(--f-xs)] text-ink-3 mb-1.5">本机同名的几位</div>
            {others.map((p) => (
              <div key={p.id} className="text-[length:var(--f-sm)] text-ink-2 py-0.5 flex items-center gap-1.5">
                <span className="truncate">
                  {p.alias?.trim() || resolveDisplayName(p, others.length, others.indexOf(p))}
                </span>
                {p.id === initial && <span className="tagx bg-accent-soft text-accent">当前</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** 列出同名的所有人（人员页用） */
export function findDupGroups(persons: Person[]): { name: string; list: Person[] }[] {
  const m = new Map<string, Person[]>();
  for (const p of persons) {
    const arr = m.get(p.name) ?? [];
    arr.push(p);
    m.set(p.name, arr);
  }
  return [...m.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([name, list]) => ({ name, list }));
}
