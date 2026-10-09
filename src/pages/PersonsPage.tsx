/** 人员档案：按人聚合，长按多选/操作菜单，可编辑完整档案 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, Phone, MessageCircle, MapPin, Tag, CheckSquare,
} from 'lucide-react';
import {
  Person, RELATION_GROUPS, makeEventLookup, resolveDisplayName, nameCounts,
  GiftRecord,
} from '../lib/types';
import { useApp, fmtMoney, fmtDate } from '../lib/store';
import { TopBar, Sheet, Empty, SearchBox, Section, Confirm } from '../lib/ui';
import { EventChip } from '../lib/EventPicker';
import { AliasEditor } from '../lib/DupHint';
import { useSuggest, SuggestBox } from '../lib/Suggest';
import { useLongPress } from '../lib/useLongPress';
import { SelectBar, CheckMark } from '../lib/ActionSheet';
import { cn } from '../lib/utils';
import { useTheme } from '../lib/theme';
import { pushBack } from '../lib/backStack';
import { LongPressTip, useTipOnce } from '../lib/LongPressTip';

/* ---------- 主页面 ---------- */

export function PersonsPage() {
  const { db, dispatch, stats } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Person | 'new' | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [aliasFor, setAliasFor] = useState<Person | null>(null);

  const lookup = useMemo(() => makeEventLookup(db.customEvents), [db.customEvents]);
  const { care } = useTheme();

  /** 重名显示名：别名 > 关系·地区 > 序号 */
  const dn = useMemo(() => {
    const counts = nameCounts(db.persons);
    const m = new Map<string, string>();
    for (const p of db.persons) {
      const n = counts.get(p.name) ?? 1;
      const idx = db.persons
        .filter((x) => x.name === p.name)
        .findIndex((x) => x.id === p.id);
      m.set(p.id, n <= 1 ? p.name : resolveDisplayName(p, n, idx));
    }
    return m;
  }, [db.persons]);

  const list = useMemo(() => {
    const k = q.trim();
    const arr = stats.filter((s) => (
      k ? (dn.get(s.person.id)?.includes(k) || s.person.name.includes(k)) : true
    ));
    return [...arr].sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return b.net - a.net;
    });
  }, [stats, q, dn]);

  /* ---------- 长按：多选模式 ---------- */

  const [sel, setSel] = useState<Set<string>>(new Set());
  const selecting = sel.size > 0;
  const [batchDel, setBatchDel] = useState(false);
  const [delOne, setDelOne] = useState<{ id: string; name: string; count: number } | null>(null);

  // 首次进入提示「短按/长按」各做什么，只出一次
  const tip = useTipOnce('persons');

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

  /**
   * 长按 = 选中该条并进入多选模式。
   * 依据 Material Design 规范：长按手势专门用于选择，
   * 不该拿它弹上下文菜单。再次长按同一条 = 取消选中。
   */
  const onRowLongPress = (id: string) => {
    toggleSel(id);
  };

  /** 标题栏「全选」：一键进入多选并全选 */
  const selectAll = () => {
    if (list.length === 0) return;
    if (sel.size === list.length) exitSelect();
    else setSel(new Set(list.map((x) => x.person.id)));
  };

  /** 待删人员会连带删掉多少条记录 —— 删除前必须让人知道 */
  const delStats = useMemo(() => ({
    persons: sel.size,
    records: stats
      .filter((s) => sel.has(s.person.id))
      .reduce((sum, s) => sum + s.records.length, 0),
  }), [sel, stats]);

  const doBatchDelete = () => {
    for (const id of sel) dispatch({ t: 'removePerson', id });
    setBatchDel(false);
    exitSelect();
  };

  const withDebt = stats.filter((s) => s.net !== 0);
  const totalNet = withDebt.reduce((s, x) => s + x.net, 0);

  return (
    <>
      {/* 按 Material Design 3 规范：底部 Tab 的四个根页面属于「顶层目的地」，
          顶栏不显示返回箭头。返回箭头只用于层级导航的子页面
          （万年黄历 / 吉日良辰 / 太岁 / 亲缘 / 待办）。
          之前这里错误地加了 onBack，从 Tab 切过来时顶栏会突然冒出
          一个返回箭头，点它会退回上一个 Tab —— 语义不对。 */}
      <TopBar
        title="人员"
        sub={`${db.persons.length} 人 · 有往来 ${withDebt.length} 人`}
        right={
          /* 全选入口：解决「用户不知道能批量操作」的可发现性 */
          list.length > 0 && !selecting && !care ? (
            <button
              onClick={selectAll}
              className="btn-ghost btn-sm shrink-0 flex items-center gap-1"
              aria-label="全选并批量操作"
            >
              <CheckSquare size={14} strokeWidth={1.9} />
              全选
            </button>
          ) : undefined
        }
      />

      <div className="page-body space-y-3">
        {!selecting && (
          <LongPressTip show={tip.show} role="人员" onClose={tip.dismiss} />
        )}

        {!care && totalNet !== 0 && (
          <div className="card px-3.5 py-2.5 flex items-center justify-between">
            <span className="text-[length:var(--f-sm)] text-ink-3">整体人情净值</span>
            <span className={cn(
              'text-[length:var(--f-lg)] font-semibold num',
              totalNet > 0 ? 'text-in' : 'text-out',
            )}>
              {totalNet > 0 ? '尚欠 ' : '多随了 '}
              {fmtMoney(Math.abs(totalNet), db.settings.currency)}
            </span>
          </div>
        )}

        {selecting && (
          <SelectBar
            count={sel.size}
            total={list.length}
            allSelected={sel.size === list.length && list.length > 0}
            onSelectAll={() => {
              if (sel.size === list.length) exitSelect();
              else setSel(new Set(list.map((s) => s.person.id)));
            }}
            onCancel={exitSelect}
            onEdit={() => {
              // 只有选中 1 条时才真能编辑，>1 条由 SelectBar 内部禁用
              const p = db.persons.find((x) => x.id === [...sel][0]);
              if (p) { setEdit(p); exitSelect(); }
            }}
            onDelete={() => setBatchDel(true)}
            title="人"
          />
        )}

        {!selecting && !care && (
          <SearchBox value={q} onChange={setQ} placeholder="搜索姓名" />
        )}

        {list.length === 0 ? (
          <div className="card">
            <Empty
              text={q ? '没有匹配的人' : '还没有人员档案'}
              hint="记第一笔时会自动建档"
            />
          </div>
        ) : (
          <div className="card overflow-hidden">
            {list.map((s, i) => {
              const same = db.persons.filter((x) => x.name === s.person.name);
              const showDupTag = same.length > 1 && !s.person.alias?.trim();
              return (
                <PersonRow
                  key={s.person.id}
                  selecting={selecting}
                  selected={sel.has(s.person.id)}
                  onClick={() => (selecting ? toggleSel(s.person.id) : setDetail(s.person.id))}
                  onLongPress={() => onRowLongPress(s.person.id)}
                  className={cn(i > 0 && 'border-t border-line')}
                >
                  {/* 姓氏圆牌。★ v2.14.7（涛哥截图指正）：原来 w-8 h-[var(--h-ctl)]，
                      宽固定 32px、高随字号涨 → 大字下变成一颗细长「药丸」。
                      改为**正圆**且边长跟随字号，视觉上就是个圆牌。 */}
                  <div
                    className="w-[calc(var(--f-md)*2.1)] h-[calc(var(--f-md)*2.1)] rounded-full
                                bg-accent-soft text-accent
                                flex items-center justify-center text-[length:var(--f-md)]
                                font-medium shrink-0"
                  >
                    {s.person.name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[length:var(--f-lg)] font-medium truncate">
                        {dn.get(s.person.id) ?? s.person.name}
                      </span>
                      {s.person.relation && (
                        <span className="tagx bg-line/60 text-ink-2 shrink-0">
                          {s.person.relation}
                        </span>
                      )}
                      {showDupTag && (
                        <span
                          className="tagx bg-accent-soft text-accent shrink-0"
                          onClick={(e) => { e.stopPropagation(); setAliasFor(s.person); }}
                        >同名 {same.length}</span>
                      )}
                    </div>
                    <div className="text-[length:var(--f-xs)] text-ink-3 mt-0.5 num">
                      {s.count > 0
                        ? `${s.count} 次 · 收 ${fmtMoney(s.received, '')} · 回 ${fmtMoney(s.returned, '')}`
                        : '暂无往来记录'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {s.count > 0 ? (
                      <>
                        <div className={cn(
                          'text-[length:var(--f-lg)] font-semibold num',
                          s.net > 0 ? 'text-in' : s.net < 0 ? 'text-out' : 'text-ink-3',
                        )}>
                          {s.net > 0 ? '+' : s.net < 0 ? '−' : ''}
                          {fmtMoney(Math.abs(s.net), '')}
                        </div>
                        <div className="text-[length:var(--f-xs)] text-ink-3">
                          {s.net > 0 ? '人家多给' : s.net < 0 ? '我多随' : '两清'}
                        </div>
                      </>
                    ) : (
                      <ChevronRight size={16} strokeWidth={1.8} className="text-ink-3" />
                    )}
                  </div>
                </PersonRow>
              );
            })}
          </div>
        )}
      </div>

      {!selecting && (
        <button
          onClick={() => setEdit('new')}
          aria-label="新增人员"
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
      )}

      {edit && (
        <PersonEditor person={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />
      )}

      {detail && (
        <PersonDetail
          id={detail}
          displayName={dn.get(detail) ?? ''}
          onClose={() => setDetail(null)}
          onEdit={(p) => { setDetail(null); setEdit(p); }}
          onAlias={() => {
            const p = db.persons.find((x) => x.id === detail);
            if (p) { setDetail(null); setAliasFor(p); }
          }}
          onDelete={(p, cnt) => {
            setDetail(null);
            setDelOne({ id: p.id, name: dn.get(p.id) ?? p.name, count: cnt });
          }}
          lookup={lookup}
        />
      )}

      {/* 删除单人（替换原生 confirm） */}
      {delOne && (
        <Confirm
          open
          title={`删除「${delOne.name}」？`}
          message={delOne.count > 0
            ? <>会连带删除 TA 的 {delOne.count} 条往来记录，删除后无法恢复。</>
            : '该人暂无往来记录，删除后无法恢复。'}
          danger
          okText="删除"
          onCancel={() => setDelOne(null)}
          onOk={() => {
            dispatch({ t: 'removePerson', id: delOne.id });
            setDelOne(null);
          }}
        />
      )}

      {/* 批量删除确认 */}
      {batchDel && (
        <Confirm
          open
          title={`删除 ${delStats.persons} 个人员？`}
          message={
            <>
              会连带删除 {delStats.records} 条往来记录，删除后无法恢复。
              如只是想清理账目，建议先到「我的」导出备份。
            </>
          }
          danger
          okText="全部删除"
          onCancel={() => setBatchDel(false)}
          onOk={doBatchDelete}
        />
      )}

      {aliasFor && (
        <AliasEditor
          open
          onClose={() => setAliasFor(null)}
          personName={aliasFor.name}
          initial={aliasFor.alias ?? ''}
          onSave={(a, r, g) => {
            dispatch({
              t: 'updatePerson',
              id: aliasFor.id,
              p: { alias: a || undefined, relation: r, region: g },
            });
            setAliasFor(null);
          }}
        />
      )}
    </>
  );
}

/* ---------- 带长按的人员行 ---------- */

function PersonRow({
  selecting, selected, onClick, onLongPress, className, children,
}: {
  selecting: boolean;
  selected: boolean;
  onClick: () => void;
  onLongPress: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const lp = useLongPress({ onLongPress, onClick, fastClick: selecting });
  return (
    <div
      className={cn(
        'row cursor-pointer select-none',
        className,
        selecting && selected && 'bg-accent-soft',
      )}
      style={selecting && selected
        ? { boxShadow: 'inset 3px 0 0 var(--color-accent)' }
        : undefined}
      {...lp}
    >
      {selecting && <CheckMark on={selected} />}
      {children}
    </div>
  );
}

/* ---------- 编辑档案 ---------- */

function PersonEditor({
  person, onClose,
}: { person: Person | null; onClose: () => void }) {
  const { dispatch, db } = useApp();
  const [name, setName] = useState(person?.name ?? '');
  const [alias, setAlias] = useState(person?.alias ?? '');
  const [relation, setRelation] = useState(person?.relation ?? '');
  const [group, setGroup] = useState(person?.group ?? '');
  const [phone, setPhone] = useState(person?.phone ?? '');
  const [wechat, setWechat] = useState(person?.wechat ?? '');
  const [region, setRegion] = useState(person?.region ?? '');
  const [note, setNote] = useState(person?.note ?? '');

  // 输入历史：点一下从已有档案里挑，不用每次手打全名。
  // 编辑已有档案时把自己从候选里剔除。
  const suggestPool = useMemo(
    () => (person ? db.persons.filter((p) => p.id !== person.id) : db.persons),
    [db.persons, person],
  );
  const nameSuggest = useSuggest({
    persons: suggestPool,
    field: 'name',
    value: name,
    onChange: setName,
  });
  const relSuggest = useSuggest({
    persons: db.persons,
    field: 'relation',
    value: relation,
    onChange: setRelation,
  });

  const dups = useMemo(
    () => (name.trim() ? db.persons.filter(
      (p) => p.name === name.trim() && p.id !== person?.id,
    ) : []),
    [name, db.persons, person?.id],
  );

  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    const payload = {
      name: name.trim(),
      alias: alias.trim() || undefined,
      relation: relation.trim() || undefined,
      group: (group || undefined) as Person['group'],
      phone: phone.trim() || undefined,
      wechat: wechat.trim() || undefined,
      region: region.trim() || undefined,
      note: note.trim() || undefined,
    };
    if (person) dispatch({ t: 'updatePerson', id: person.id, p: payload });
    else dispatch({ t: 'addPerson', p: payload });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={person ? '编辑档案' : '新增人员'}
      footer={
        <button className="btn flex-1" onClick={save} disabled={!canSave}>
          {canSave ? '保存' : '填姓名'}
        </button>
      }
    >
      <div className="space-y-2.5">
        <div>
          <label className="label">姓名 *</label>
          <input className="field" {...nameSuggest.handlers}
            placeholder="点此从历史中选择，或直接输入" autoComplete="off" />
          <SuggestBox {...nameSuggest.boxProps} />
        </div>

        {dups.length > 0 && (
          <div
            className="rounded-[var(--r-ctl)] border border-accent-line
                       bg-accent-soft/50 px-2.5 py-2"
          >
            <div className="text-[length:var(--f-sm)] text-ink-2 leading-snug">
              本机已有 <b className="text-accent">{dups.length}</b> 位「{name.trim()}」。
              同名时列表会显示成：
            </div>
            <div className="text-[length:var(--f-md)] font-medium mt-1 text-accent num">
              {resolveDisplayName(
                {
                  id: person?.id ?? '', name: name.trim(), alias,
                  relation: relation.trim(), region: region.trim(),
                  createdAt: '', updatedAt: '',
                },
                dups.length + 1, dups.length,
              )}
            </div>
            <p className="text-[length:var(--f-xs)] text-ink-3 mt-1">
              填「区分名」最直观，或补上关系/地区自动拼后缀。
            </p>
          </div>
        )}

        {dups.length > 0 && (
          <div>
            <label className="label">区分名（同名时才显示）</label>
            <input className="field" value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="如：建国·南麻" autoComplete="off" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 care-grid-2">
          <div>
            <label className="label">关系</label>
            <input className="field" {...relSuggest.handlers}
              placeholder="点此从历史中选择" autoComplete="off" />
            <SuggestBox {...relSuggest.boxProps} />
          </div>
          <div>
            <label className="label">分组</label>
            <select className="field" value={group}
              onChange={(e) => setGroup(e.target.value as Person['group'])}>
              <option value="">未归类</option>
              {RELATION_GROUPS.map((g) => (
                <option key={g.key} value={g.key}>{g.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 care-grid-2">
          <div>
            <label className="label">电话</label>
            <input className="field num" value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="138…" inputMode="tel" autoComplete="off" />
          </div>
          <div>
            <label className="label">微信</label>
            <input className="field" value={wechat}
              onChange={(e) => setWechat(e.target.value)}
              placeholder="微信号" autoComplete="off" />
          </div>
        </div>

        <div>
          <label className="label">地区</label>
          <input className="field" value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="如：沂源县南麻街道" autoComplete="off" />
        </div>

        <div>
          <label className="label">备注</label>
          <textarea className="field-area" rows={2} value={note}
            onChange={(e) => setNote(e.target.value)} placeholder="其它要记的" />
        </div>
      </div>
    </Sheet>
  );
}

/* ---------- 人员详情 ---------- */

function PersonDetail({
  id, displayName, onClose, onEdit, onAlias, onDelete, lookup,
}: {
  id: string;
  displayName: string;
  onClose: () => void;
  onEdit: (p: Person) => void;
  onAlias: () => void;
  onDelete: (p: Person, records: number) => void;
  lookup: ReturnType<typeof makeEventLookup>;
}) {
  const { db, stats } = useApp();
  const person = db.persons.find((p) => p.id === id);
  const stat = stats.find((s) => s.person.id === id);
  if (!person || !stat) return null;

  const sameName = db.persons.filter(
    (x) => x.name === person.name && x.id !== person.id,
  );

  const recs = [...stat.records].sort((a, b) =>
    (b.received?.date || '').localeCompare(a.received?.date || ''),
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={displayName || person.name}
      footer={
        <>
          {/* 删除按钮（涛哥：太大、突兀、与整体风格不相容）：
            方向来回错了三次 —— w-16(64px) 挤成一团、
            w-[88px] 反过来突出删除、flex-1 等宽两块红底抢视觉。
            最终对齐全app 确认框风格（ui.tsx Confirm）：
            次要操作用无底色文字按钮，主操作才用实心按钮。
            高度用 var(--h-btn)，关怀模式大字下自动适配。 */}
          <button
            className="btn-danger flex-1"
            onClick={() => onDelete(person, stat.records.length)}
            aria-label="删除这个人和它的全部记录"
          >删除</button>
          <button className="btn flex-1" onClick={() => onEdit(person)}>编辑档案</button>
        </>
      }
    >
      <div className="space-y-3.5">
        {/* 汇总 */}
        <div className="card px-3.5 py-3">
          <div className="flex items-end gap-1.5">
            <div className="flex-1 min-w-0">
              <div className="text-[length:var(--f-xs)] text-ink-3">收礼</div>
              <div className="text-[length:var(--f-num)] font-semibold num text-in">
                {fmtMoney(stat.received, db.settings.currency)}
              </div>
            </div>
            <div className="w-px h-7 bg-line shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[length:var(--f-xs)] text-ink-3">回礼</div>
              <div className="text-[length:var(--f-num)] font-semibold num text-out">
                {fmtMoney(stat.returned, db.settings.currency)}
              </div>
            </div>
            <div className="w-px h-7 bg-line shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[length:var(--f-xs)] text-ink-3">净值</div>
              <div className={cn(
                'text-[length:var(--f-num)] font-semibold num',
                stat.net > 0 ? 'text-in' : stat.net < 0 ? 'text-out' : 'text-ink-3',
              )}>
                {fmtMoney(stat.net, db.settings.currency)}
              </div>
            </div>
          </div>
        </div>

        {/* 档案 */}
        <div className="card overflow-hidden">
          <Row label="关系" value={person.relation} />
          <Row
            label="分组"
            value={RELATION_GROUPS.find((g) => g.key === person.group)?.label}
          />
          <Row
            label="电话"
            value={person.phone}
            icon={<Phone size={13} strokeWidth={1.8} />}
          />
          <Row
            label="微信"
            value={person.wechat}
            icon={<MessageCircle size={13} strokeWidth={1.8} />}
          />
          <Row
            label="地区"
            value={person.region}
            icon={<MapPin size={13} strokeWidth={1.8} />}
          />
          <Row label="备注" value={person.note} />
          {(person.alias?.trim() || sameName.length > 0) && (
            <div className="row">
              <Tag size={13} strokeWidth={1.8} className="text-ink-3 shrink-0" />
              <span className="text-[length:var(--f-md)] shrink-0">区分名</span>
              <span className="flex-1" />
              <span className="text-[length:var(--f-md)] text-accent truncate ml-2">
                {person.alias?.trim() || '未设'}
              </span>
            </div>
          )}
        </div>

        {/* 拨号 / 复制微信号 */}
        {(person.phone || person.wechat) && (
          <div className="grid grid-cols-2 gap-2 care-grid-2">
            {person.phone && (
              <button
                className="btn-ghost"
                onClick={() => { window.location.href = `tel:${person.phone!.replace(/\s/g, '')}`; }}
              >
                <Phone size={15} strokeWidth={1.8} />拨号
              </button>
            )}
            {person.wechat && (
              <button
                className="btn-ghost"
                onClick={() => navigator.clipboard?.writeText(person.wechat!)}
              >
                <MessageCircle size={15} strokeWidth={1.8} />复制微信号
              </button>
            )}
          </div>
        )}

        {/* 同名的其他几位 */}
        {sameName.length > 0 && (
          <Section title={`同名的其他 ${sameName.length} 位`}>
            <div className="card overflow-hidden">
              {sameName.map((p, i) => {
                const st = stats.find((x) => x.person.id === p.id);
                return (
                  <div key={p.id} className={cn('row', i > 0 && 'border-t border-line')}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[length:var(--f-md)] truncate">
                        {[p.alias, p.relation, p.region].filter(Boolean).join(' · ') || '未填区分信息'}
                      </div>
                      <div className="text-[length:var(--f-xs)] text-ink-3 num mt-0.5">
                        {st && st.count > 0
                          ? `${st.count} 次 · 净 ${fmtMoney(st.net, '')}`
                          : '暂无往来'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="btn-ghost w-full mt-2" onClick={onAlias}>
              给这 {sameName.length + 1} 位「{person.name}」设区分名
            </button>
          </Section>
        )}

        {/* 往来明细 */}
        <Section title={`往来明细（${recs.length}）`}>
          {recs.length === 0 ? (
            <div className="card px-3 py-4 text-center">
              <span className="text-[length:var(--f-sm)] text-ink-3">还没有往来记录</span>
            </div>
          ) : (
            <div className="card overflow-hidden">
              {recs.map((r: GiftRecord, i) => {
                const ev = lookup(r.received?.event ?? 'other');
                const evBack = r.returned ? lookup(r.returned.event) : null;
                return (
                  <div key={r.id} className={cn('px-3 py-2.5', i > 0 && 'border-t border-line')}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[length:var(--f-md)] num">
                        {fmtDate(r.received?.date || '')}
                      </span>
                      {ev && <EventChip ev={ev} />}
                    </div>
                    <div className="text-[length:var(--f-xs)] text-ink-3 mt-1 flex items-center gap-1.5 flex-wrap">
                      <span>收 {fmtMoney(r.received?.amount ?? 0, '')}</span>
                      {r.received?.gift && (<><span>·</span><span>{r.received.gift}</span></>)}
                    </div>
                    {r.returned && (
                      <div className="text-[length:var(--f-xs)] text-out mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="text-ink-3">回礼</span>
                        <span className="num">{fmtDate(r.returned.date)}</span>
                        {evBack && <EventChip ev={evBack} />}
                        <span>·</span>
                        <span>{fmtMoney(r.returned.amount, '')}</span>
                        {r.returned.gift && (<><span>·</span><span>{r.returned.gift}</span></>)}
                      </div>
                    )}
                    {r.remark && (
                      <div className="text-[length:var(--f-xs)] text-ink-3 mt-0.5">{r.remark}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </Sheet>
  );
}

/* ---------- 行 ---------- */

function Row({
  label, value, icon,
}: { label: string; value?: string; icon?: React.ReactNode }) {
  return (
    <div className="row">
      {icon
        ? <span className="text-ink-3 shrink-0">{icon}</span>
        : <span className="text-[length:var(--f-md)] text-ink-3 shrink-0 w-[15px]">{label.slice(0, 1)}</span>}
      <span className="text-[length:var(--f-md)] shrink-0">{label}</span>
      <span className="flex-1" />
      <span className="text-[length:var(--f-md)] text-ink-2 truncate ml-3">
        {value || <span className="text-ink-3">未填</span>}
      </span>
    </div>
  );
}