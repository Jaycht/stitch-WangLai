/** 往来记录：时间轴列表 + 双向账目录入 + 重名区分 + 酒席提醒 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, HandCoins, Bell, BellOff, Clock, CheckSquare } from 'lucide-react';
import {
  GiftRecord, Person, Side, CHANNELS, EventKind,
  makeEventLookup, findSameName, resolveDisplayName,
} from '../lib/types';
import { useApp, fmtMoney, fmtDate, blankSide } from '../lib/store';
import { uid } from '../lib/db';
import { useSuggest, SuggestBox } from '../lib/Suggest';
import { TopBar, Sheet, Empty, SearchBox, Confirm } from '../lib/ui';
import { EventPicker, EventChip, EventBtn } from '../lib/EventPicker';
import { DupHint, DupPicker, AliasEditor } from '../lib/DupHint';
import {
  LEAD_OPTIONS, scheduleOne, cancelOne, canNotify,
  ensurePermission, permAdvice, needExactWarn, type PermStatus,
} from '../lib/notify';
import { useLongPress } from '../lib/useLongPress';
import { SelectBar, CheckMark } from '../lib/ActionSheet';
import { cn } from '../lib/utils';
import { FieldGroup } from '../lib/FieldGroup';
import { pushBack } from '../lib/backStack';
import { LongPressTip, useTipOnce } from '../lib/LongPressTip';

const chLabel = (k: string) => CHANNELS.find((c) => c.key === k)?.label ?? k;

type Filter = 'all' | 'in' | 'out' | 'remind';

export function RecordsPage() {
  const { db, dispatch, nameOf, rawNameOf, totalIn, totalOut } = useApp();
  const nav = useNavigate();
  const [tab, setTab] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<GiftRecord | 'new' | null>(null);
  const [delTarget, setDelTarget] = useState<GiftRecord | null>(null);

  /* ---------- 长按：多选模式 ---------- */
  // 有ids = 多选模式中（空 Set 表示不在多选）
  const [sel, setSel] = useState<Set<string>>(new Set());
  const selecting = sel.size > 0;
  /** 批量删除二次确认 */
  const [batchDel, setBatchDel] = useState(false);

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
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  /**
   * 长按 = 选中该条并进入多选模式。
   * 依据 Material Design 规范：长按手势专门用于选择，
   * 不该拿它弹上下文菜单（那是 Android 3.0 之前的旧模式）。
   * 再次长按同一条 = 取消选中。
   */
  const onRowLongPress = (r: GiftRecord) => {
    toggleSel(r.id);
  };

  /** 标题栏「全选」：一键进入多选并全选（可发现性入口） */
  const selectAll = () => {
    if (list.length === 0) return;
    if (sel.size === list.length) exitSelect();
    else setSel(new Set(list.map((r) => r.id)));
  };

  /** 批量删除 */
  const doBatchDelete = () => {
    const n = sel.size;
    for (const id of sel) dispatch({ t: 'removeRecord', id });
    setBatchDel(false);
    exitSelect();
    setDeletedCount(n);
  };
  const [deletedCount, setDeletedCount] = useState(0);

  // 首次进入提示「短按/长按」各做什么，只出一次
  const tip = useTipOnce('records');
  /** 待删里有几条设过提醒，删除前要提醒用户 */
  const delCountWithRemind = useMemo(
    () => db.records.filter((r) => sel.has(r.id) && r.remindAt).length,
    [db.records, sel],
  );

  const lookup = useMemo(() => makeEventLookup(db.customEvents), [db.customEvents]);

  const list = useMemo(() => {
    let rs = db.records;
    if (tab === 'in') rs = rs.filter((r) => (r.received?.amount ?? 0) > 0);
    if (tab === 'out') rs = rs.filter((r) => (r.returned?.amount ?? 0) > 0);
    if (tab === 'remind') rs = rs.filter((r) => r.remindAt);
    if (q.trim()) {
      const k = q.trim();
      // 同时匹配显示名和原始姓名
      rs = rs.filter((r) =>
        nameOf(r.personId).includes(k) || rawNameOf(r.personId).includes(k));
    }
    return [...rs].sort((a, b) => {
      // 有提醒的按提醒时间前置，其余按日期倒序
      const ar = a.remindAt ?? '';
      const br = b.remindAt ?? '';
      if (ar && br) return ar.localeCompare(br);
      if (ar) return -1;
      if (br) return 1;
      return (b.received?.date || '').localeCompare(a.received?.date || '');
    });
  }, [db.records, tab, q, nameOf, rawNameOf]);

  const groups = useMemo(() => {
    const m = new Map<string, GiftRecord[]>();
    for (const r of list) {
      const key = (r.received?.date || '').slice(0, 7);
      const arr = m.get(key) ?? [];
      arr.push(r);
      m.set(key, arr);
    }
    return [...m.entries()];
  }, [list]);

  const net = totalIn - totalOut;
  const remindCount = db.records.filter((r) => r.remindAt).length;

  return (
    <>
      <TopBar
        title="往来记录"
        sub={`${db.persons.length} 人 · ${db.records.length} 条`}
        right={
          <>
            <button onClick={() => nav('/persons')} className="btn-ghost btn-sm">
              <Users size={14} strokeWidth={1.9} />人员
            </button>
            {/* 全选入口：M3 说移动端勾选框不该常驻，
                用标题栏的快捷入口解决「用户不知道能批量操作」 */}
            {list.length > 0 && !selecting && (
              <button
                onClick={selectAll}
                className="btn-ghost btn-sm shrink-0 flex items-center gap-1"
                aria-label="全选并批量操作"
              >
                <CheckSquare size={14} strokeWidth={1.9} />
                全选
              </button>
            )}
          </>
        }
      />

      <div className="page-body space-y-3">
        {/*汇总条 */}
        <div className="card px-3.5 py-3">
          <div className="flex items-end gap-1.5">
            <div className="flex-1">
              <div className="text-[var(--f-xs)] text-ink-3 mb-0.5">收礼合计</div>
              <div className="text-[var(--f-num)] font-semibold num text-in leading-none">
                {fmtMoney(totalIn, db.settings.currency)}
              </div>
            </div>
            <div className="w-px h-[var(--h-ctl)] bg-line" />
            <div className="flex-1">
              <div className="text-[var(--f-xs)] text-ink-3 mb-0.5">回礼合计</div>
              <div className="text-[var(--f-num)] font-semibold num text-out leading-none">
                {fmtMoney(totalOut, db.settings.currency)}
              </div>
            </div>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-line flex items-center justify-between">
            <span className="text-[var(--f-sm)] text-ink-3">人情净值（收 − 回）</span>
            <span className={cn(
              'text-[var(--f-lg)] font-semibold num',
              net > 0 ? 'text-in' : net < 0 ? 'text-out' : 'text-ink-3',
            )}>
              {net > 0 ? '尚欠人情' : net < 0 ? '多随了' : '两清'}　{fmtMoney(Math.abs(net), db.settings.currency)}
            </span>
          </div>
        </div>

        {/* 筛选 */}
        {selecting && (
          <SelectBar
            count={sel.size}
            total={list.length}
            allSelected={sel.size === list.length && list.length > 0}
            onSelectAll={() => {
              if (sel.size === list.length) exitSelect();
              else setSel(new Set(list.map((r) => r.id)));
            }}
            onCancel={exitSelect}
            onEdit={() => {
              // 只有选中 1 条时才真能编辑，>1 条由 SelectBar 内部禁用
              const r = db.records.find((x) => x.id === [...sel][0]);
              if (r) { setEdit(r); exitSelect(); }
            }}
            onDelete={() => setBatchDel(true)}
            title="条"
          />
        )}

        <div className="flex items-center gap-2">
          <div className="flex bg-card border border-line rounded-lg p-0.5 shrink-0">
            {([
              ['all', '全部'], ['in', '收礼'], ['out', '回礼'],
            ] as [Filter, string][]).map(([k, lb]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn(
                  'h-[var(--h-sm)] px-2.5 rounded-md text-[var(--f-sm)] transition-colors',
                  tab === k ? 'bg-accent text-white font-medium' : 'text-ink-2',
                )}
              >
                {lb}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <SearchBox value={q} onChange={setQ} placeholder="按姓名筛选" />
          </div>
        </div>

        <LongPressTip
          show={tip.show}
          role="记录"
          onClose={tip.dismiss}
        />

        {remindCount > 0 && tab !== 'remind' && (
          <button
            onClick={() => setTab('remind')}
            className="card px-3 py-2 w-full flex items-center gap-2 active:bg-paper"
          >
            <Bell size={14} strokeWidth={1.9} className="text-accent" />
            <span className="text-[var(--f-sm)] flex-1 text-left">已设 {remindCount} 个酒席提醒</span>
            <span className="text-[var(--f-xs)] text-ink-3">查看</span>
          </button>
        )}

        {/* 列表 */}
        {list.length === 0 ? (
          <div className="card">
            <Empty
              text={q ? '没有匹配的人员' : tab === 'remind' ? '还没有设置提醒' : '还没有任何记录'}
              hint={q ? '换个名字试试' : tab === 'remind' ? '在记录里点开一条，设个提醒时间' : '点右下角按钮记第一笔'}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(([month, rs]) => {
              const mi = rs.reduce((s, r) => s + (r.received?.amount ?? 0), 0);
              const mo = rs.reduce((s, r) => s + (r.returned?.amount ?? 0), 0);
              return (
                <div key={month}>
                  <div className="flex items-baseline justify-between px-0.5 mb-1.5">
                    <span className="text-[var(--f-sm)] font-medium num">{month.replace('-', '年')}月</span>
                    <span className="text-[var(--f-xs)] text-ink-3 num">
                      {mi ? `收 ${fmtMoney(mi, '')}` : ''}
                      {mi && mo ? ' · ' : ''}
                      {mo ? `回 ${fmtMoney(mo, '')}` : ''}
                    </span>
                  </div>
                  <div className="card overflow-hidden">
                    {rs.map((r, i) => (
                      <RecordRow
                        key={r.id}
                        r={r}
                        name={nameOf(r.personId)}
                        evDef={lookup(r.received?.event ?? 'other')}
                        evDefBack={r.returned ? lookup(r.returned.event) : null}
                        onClick={() => (selecting ? toggleSel(r.id) : setEdit(r))}
                        onLongPress={() => onRowLongPress(r)}
                        selecting={selecting}
                        selected={sel.has(r.id)}
                        first={i === 0}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!selecting && (
        <button
          onClick={() => setEdit('new')}
          aria-label="记一笔"
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

      {/* 批量删除二次确认 */}
      {batchDel && (
        <Confirm
          open
          title={`删除 ${sel.size} 条记录？`}
          message={
            <>
              删除后无法恢复。
              {delCountWithRemind > 0 && (
                <div className="mt-1 text-[#C62828]">
                  其中 {delCountWithRemind} 条设过酒席提醒，提醒也会一并取消。
                </div>
              )}
            </>
          }
          danger
          okText="删除"
          onCancel={() => setBatchDel(false)}
          onOk={doBatchDelete}
        />
      )}

      {deletedCount > 0 && <DeletedToast n={deletedCount} />}

      {edit && (
        <RecordEditor rec={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />
      )}
      {delTarget && (
        <DeleteSheet
          rec={delTarget}
          name={nameOf(delTarget.personId)}
          onClose={() => setDelTarget(null)}
        />
      )}
    </>
  );
}

/* ---------- 单条 ---------- */

function RecordRow({
  r, name, evDef, evDefBack, onClick, onLongPress, first,
  selecting, selected,
}: {
  r: GiftRecord;
  name: string;
  evDef: ReturnType<typeof makeEventLookup> extends (k: string) => infer T ? T : never;
  evDefBack: ReturnType<typeof makeEventLookup> extends (k: string) => infer T ? T | null : never;
  onClick: () => void;
  onLongPress: () => void;
  first: boolean;
  /** 是否处于多选模式 */
  selecting: boolean;
  /** 本行是否被选中 */
  selected: boolean;
}) {
  const rv = r.received?.amount ?? 0;
  const tv = r.returned?.amount ?? 0;

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
      <div className={cn(
        'side-bar',
        rv > 0 ? 'bg-in' : 'bg-out',
      )} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[var(--f-lg)] font-medium truncate">{name || '（未命名）'}</span>
          {evDef && <EventChip ev={evDef} />}
          {r.remindAt && (
            <span className="tagx bg-accent-soft text-accent shrink-0 inline-flex items-center gap-0.5">
              <Clock size={9} strokeWidth={2.6} />
              {r.remindAt.slice(5, 16).replace('T', ' ')}
            </span>
          )}
        </div>
        <div className="text-[var(--f-xs)] text-ink-3 mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span className="num">{fmtDate(r.received?.date || '')}</span>
          {r.received?.channel && rv > 0 && (
            <><span>·</span><span>{chLabel(r.received.channel)}</span></>
          )}
          {r.received?.gift && (<><span>·</span><span>{r.received.gift}</span></>)}
          {r.received?.place && (<><span>·</span><span>{r.received.place}</span></>)}
        </div>
        {tv > 0 && evDefBack && (
          <div className="text-[var(--f-xs)] text-out mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="text-ink-3">回礼</span>
            <span className="num">{fmtDate(r.returned!.date)}</span>
            <EventChip ev={evDefBack} />
            {r.returned!.channel && (
              <><span>·</span><span>{chLabel(r.returned!.channel)}</span></>
            )}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        {rv > 0 && (
          <div className="text-[var(--f-lg)] font-semibold num text-in leading-tight">
            +{fmtMoney(rv, '')}
          </div>
        )}
        {tv > 0 && (
          <div className="text-[var(--f-md)] font-medium num text-out leading-tight">
            −{fmtMoney(tv, '')}
          </div>
        )}
        {rv === 0 && tv === 0 && (
          <div className="text-[var(--f-sm)] text-ink-3">未填金额</div>
        )}
      </div>
    </div>
  );
}

/* ---------- 录入/编辑 ---------- */

function RecordEditor({ rec, onClose }: { rec: GiftRecord | null; onClose: () => void }) {
  const { db, dispatch, nameOf, dupCount } = useApp();
  const isNew = rec === null;

  const [personId, setPersonId] = useState(rec?.personId ?? '');
  const [personName, setPersonName] = useState(rec ? nameOf(rec.personId) : '');
  const [alias, setAlias] = useState('');
  const [relation, setRelation] = useState('');
  const [region, setRegion] = useState('');
  const [received, setReceived] = useState<Side>(rec?.received ?? blankSide());
  const [returned, setReturned] = useState<Side | null>(rec?.returned ?? null);
  const [remark, setRemark] = useState(rec?.remark ?? '');
  const [remindAt, setRemindAt] = useState(rec?.remindAt ?? '');

  const [showDup, setShowDup] = useState(false);
  const [showDupList, setShowDupList] = useState(false);
  const [showAlias, setShowAlias] = useState(false);
  const [notifyOK, setNotifyOK] = useState<boolean | null>(null);
  /** v2.13.1：当前权限状态，供准点提醒时提示 */
  const [perms, setPerms] = useState<PermStatus | null>(null);
  /** v2.13.1：排期结果反馈，不再静默 */
  const [schedMsg, setSchedMsg] = useState<string | null>(null);

  const hasOut = (returned?.amount ?? 0) > 0;
  const hasIn = (received?.amount ?? 0) > 0;
  const canSave = personName.trim().length > 0 && (hasIn || hasOut);

  /** 权限提示语：准点提醒时若无精确闹钟权限要额外提醒可能延迟 */
  const advice = perms
    ? permAdvice(perms, (db.settings.remindLeadMin ?? 60) === 0)
    : null;

  // 同名检测：只在「已填了名字」且不是选中了已有档案时提示
  const trimmed = personName.trim();
  const dups = useMemo(
    () => (trimmed ? findSameName(db.persons, trimmed, personId) : []),
    [trimmed, db.persons, personId],
  );
  const sameNameTotal = trimmed ? dupCount(trimmed, personId) : 0;

  /* 备注提示词：跟着当前选中的事由走。
     优先取收礼侧事由，收礼没选就看回礼侧。
     丧事系在 types.ts 里就没配 hint，白事不提示字眼。 */
  const evLookup = useMemo(() => makeEventLookup(db.customEvents), [db.customEvents]);
  const remarkHint = evLookup(
    received.event || returned?.event || '',
  )?.hint;

  const setR = (patch: Partial<Side>) => setReceived((s) => ({ ...s, ...patch }));
  const setT = (patch: Partial<Side>) =>
    setReturned((s) => (s ? { ...s, ...patch } : s));

  // 选已有档案后直接填好全部字段
  const applyPerson = (p: Person) => {
    setPersonId(p.id);
    // 档案有区分名时输入框填区分名，和列表显示保持一致
    setPersonName(p.alias?.trim() || p.name);
    setAlias(p.alias ?? '');
    setRelation(p.relation ?? '');
    setRegion(p.region ?? '');
  };

  // 输入历史下拉：点击弹出、边打边检索、无匹配自动收起
  const nameSuggest = useSuggest({
    persons: db.persons,
    field: 'name',
    value: personName,
    onChange: (v) => { setPersonName(v); setPersonId(''); },
    onPickPerson: applyPerson,
  });
  const relSuggest = useSuggest({
    persons: db.persons,
    field: 'relation',
    value: relation,
    onChange: setRelation,
  });

  const save = async () => {
    if (!canSave) return;
    const name = personName.trim();

    // 找已有档案：优先 personId，其次按名字找唯一的那个
    let pid = personId;
    if (!pid) {
      const same = db.persons.filter((p) => p.name === name);
      // 只有本机就一个同名时才自动复用；有多个同名必须用户明确选过
      if (same.length === 1) pid = same[0].id;
    }
    if (!pid) {
      pid = uid();
      dispatch({
        t: 'addPerson',
        p: {
          id: pid, name,
          alias: alias.trim() || undefined,
          relation: relation.trim() || undefined,
          region: region.trim() || undefined,
        },
      });
    } else {
      const dirtyPerson =
        (alias.trim() && alias.trim() !== db.persons.find((p) => p.id === pid)?.alias) ||
        (relation.trim() && relation.trim() !== db.persons.find((p) => p.id === pid)?.relation) ||
        (region.trim() && region.trim() !== db.persons.find((p) => p.id === pid)?.region);
      if (dirtyPerson) {
        dispatch({
          t: 'updatePerson',
          id: pid,
          p: {
            alias: alias.trim() || undefined,
            relation: relation.trim() || undefined,
            region: region.trim() || undefined,
          },
        });
      }
    }

    const payload = {
      personId: pid,
      received,
      returned: hasOut ? returned! : undefined,
      remark: remark.trim() || undefined,
      remindAt: remindAt || undefined,
      reminded: false,
    };
    if (isNew) dispatch({ t: 'addRecord', r: payload });
    else dispatch({ t: 'updateRecord', id: rec!.id, r: payload });

    // 排提醒（原生环境才真发通知）
    if (remindAt) {
      // v2.13.1：首次设提醒时主动申请权限，拿不到就如实告知用户
      const perms = await ensurePermission();
      setPerms(perms);
      const lead = db.settings.remindLeadMin ?? 60;
      const fake: GiftRecord = { ...(rec ?? {}), ...payload, id: rec?.id ?? 'pending' } as GiftRecord;
      const res = await scheduleOne(fake, nameOf, lead);
      if (!res.ok) {
        setSchedMsg(
          res.reason === 'past'
            ? '提醒时间减去提前量后已经过去，本次未排上。改个时间或调小提前量即可。'
            : '未能排上系统通知，提醒会写入系统日历。'
        );
      } else if (res.inexact || needExactWarn(lead, perms)) {
        setSchedMsg('未获精确闹钟权限，此提醒可能延迟几分钟。要准点的话，请用手机自带「时钟」另设闹钟。');
      } else {
        setSchedMsg(null);
      }
    } else if (rec?.remindAt) {
      void cancelOne(rec.id);
    }
    onClose();
  };

  const deleteRec = () => {
    if (rec) {
      dispatch({ t: 'removeRecord', id: rec.id });
      void cancelOne(rec.id);
    }
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? '记一笔' : '编辑记录'}
      footer={
        <>
          {!isNew && (
            <button className="btn-danger w-16 shrink-0" onClick={deleteRec}>删除</button>
          )}
          <button className="btn flex-1" onClick={save} disabled={!canSave}>
            {canSave ? '保存' : '填人和金额'}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        {/* ========== 第 1 组：基本信息 ==========
            姓名 + 金额 + 日期 = 一次记账的核心动作，
            必须最先填、最显眼。 */}
        <FieldGroup title="基本信息">
        <div>
          <label className="label">对方姓名</label>
          <input
            className="field"
            {...nameSuggest.handlers}
            placeholder="点此从历史中选择，或直接输入"
            autoComplete="off"
          />
          <SuggestBox {...nameSuggest.boxProps} />

          {/* 重名提示 */}
          {dups.length > 0 && (
            <div className="mt-2">
              <DupHint
                info={{ candidates: dups, self: undefined, name: trimmed }}
                onPickExisting={() => setShowDupList(true)}
                onSetAlias={() => setShowAlias(true)}
              />
            </div>
          )}

          {/* 已选中某位同名档案时，允许改区分名 */}
          {(dups.length > 0 || alias || relation || region) && (
            <div className="grid grid-cols-3 gap-2 mt-2 care-grid-3">
              <div>
                <label className="label">区分名</label>
                <input
                  className="field"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="建国·南麻"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="label">关系</label>
                <input
                  className="field"
                  {...relSuggest.handlers}
                  placeholder="点此从历史中选择"
                  autoComplete="off"
                />
                <SuggestBox {...relSuggest.boxProps} />
              </div>
              <div>
                <label className="label">地区</label>
                <input
                  className="field"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="南麻"
                  autoComplete="off"
                />
              </div>
            </div>
          )}
          {sameNameTotal > 1 && (
            <p className="text-[var(--f-xs)] text-ink-3 mt-1.5">
              显示为：{resolveDisplayName(
                { id: personId, name: trimmed, alias, relation, region, createdAt: '', updatedAt: '' },
                sameNameTotal, 0,
              )}
            </p>
          )}

          {/* 快速选已有的人 */}
          {db.persons.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {db.persons.slice(0, 12).map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPerson(p)}
                  className={cn('pill', personId === p.id && 'pill-on')}
                >
                  {resolveDisplayName(p, dupCount(p.name, p.id), db.persons.filter((x) => x.name === p.name).findIndex((x) => x.id === p.id))}
                </button>
              ))}
            </div>
          )}
        </div>
        </FieldGroup>

        <div className="h-px bg-line" />

        {/* ========== 第 2 组：礼金与日期 ==========
            金额是必填项，日期跟它同属「这笔什么时候记的」，
            放一起最顺。 */}
        <FieldGroup title="礼金与日期">
          <SideEditor
            title="收礼（对方办的）"
            side={received}
            onChange={setR}
            tone="in"
            compact
          />
          <div>
            <label className="label">日期</label>
            <input
              className="field"
              type="date"
              value={received.date}
              onChange={(e) => setR({ date: e.target.value })}
            />
          </div>
        </FieldGroup>

        {/* ========== 第 3 组：事由与地点 ==========
            这两个是「这笔钱是干嘛的」的补充说明。 */}
        <FieldGroup title="事由与地点">
          <div>
            <label className="label">事由</label>
            <EventPicker
              value={received.event}
              onChange={(k) => setR({ event: k as EventKind })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 care-grid-2">
            <div>
              <label className="label">地点 / 办方</label>
              <input
                className="field"
                value={received.place ?? ''}
                onChange={(e) => setR({ place: e.target.value })}
                placeholder="如：女方家·沂源"
              />
            </div>
            <div>
              <label className="label">礼物</label>
              <input
                className="field"
                value={received.gift ?? ''}
                onChange={(e) => setR({ gift: e.target.value })}
                placeholder="如：两瓶酒"
              />
            </div>
          </div>
        </FieldGroup>

        {/* ========== 第 4 组：回礼（可选，单独成组）============
            单独拆出来的理由：回礼**大多数时候为空**，
            混在其它组里会让那一片空旷；
            而且「收」和「回」本来就是两个方向的动作。 */}
        <FieldGroup
          title="回礼（我方办的）"
          hint={returned ? undefined : '可选'}
        >
        <div>
          <div className="flex items-center justify-between mb-1.5">
            {!returned && (
              <button
                onClick={() => setReturned(blankSide({ date: received.date }))}
                className="btn-ghost btn-sm"
              >
                <HandCoins size={13} strokeWidth={1.9} />加回礼
              </button>
            )}
          </div>
          {returned ? (
            <SideEditor
              title=""
              side={returned}
              onChange={setT}
              tone="out"
              onRemove={() => setReturned(null)}
            />
          ) : (
            <div className="text-[var(--f-sm)] text-ink-3 leading-relaxed bg-paper rounded-lg px-2.5 py-2">
              对方随了礼你回过钱？点「加回礼」记上。回礼记录了，人情净值才算得准。
            </div>
          )}
        </div>
        </FieldGroup>

        {/* ========== 第 5 组：提醒与备注 ==========
            都是记完之后补充的，不是记这笔的必需信息，放最后。 */}
        <FieldGroup title="提醒与备注">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[var(--f-sm)] font-medium text-ink-2 flex items-center gap-1.5">
              <Bell size={13} strokeWidth={2} />酒席提醒
            </span>
            {remindAt ? (
              <button onClick={() => { setRemindAt(''); setNotifyOK(null); }} className="text-[var(--f-xs)] text-ink-3">
                清除
              </button>
            ) : (
              <button
                onClick={async () => {
                  const d = received.date || new Date().toISOString().slice(0, 10);
                  setRemindAt(`${d}T18:00`);
                  setNotifyOK(await canNotify());
                }}
                className="text-[var(--f-xs)] text-accent"
              >
                设提醒
              </button>
            )}
          </div>
          {remindAt ? (
            <>
              <div className="flex gap-2">
                <input
                  className="field flex-1"
                  type="date"
                  value={remindAt.slice(0, 10)}
                  onChange={(e) =>
                    setRemindAt((s) => `${e.target.value}T${(s || '').slice(11, 16) || '18:00'}`)}
                />
                <input
                  className="field w-28"
                  type="time"
                  value={remindAt.slice(11, 16)}
                  onChange={(e) =>
                    setRemindAt((s) => `${(s || '').slice(0, 10)}T${e.target.value}`)}
                />
              </div>
              <div className="mt-2">
                <label className="label">提前多久提醒</label>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_OPTIONS.map((o) => (
                    <button
                      key={o.v}
                      onClick={() => dispatch({ t: 'settings', s: { remindLeadMin: o.v } })}
                      className={cn('pill', (db.settings.remindLeadMin ?? 60) === o.v && 'pill-on')}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {schedMsg && (
                <p className="text-[var(--f-xs)] text-ink-3 mt-2 flex items-start gap-1">
                  <BellOff size={12} strokeWidth={2} className="mt-0.5 shrink-0" />
                  <span>{schedMsg}</span>
                </p>
              )}
              {!schedMsg && advice && (
                <p className="text-[var(--f-xs)] text-ink-3 mt-2 flex items-start gap-1">
                  <BellOff size={12} strokeWidth={2} className="mt-0.5 shrink-0" />
                  <span>{advice}</span>
                </p>
              )}
              {!schedMsg && !advice && notifyOK === false && (
                <p className="text-[var(--f-xs)] text-ink-3 mt-2 flex items-start gap-1">
                  <BellOff size={12} strokeWidth={2} className="mt-0.5 shrink-0" />
                  <span>系统通知未授权，提醒会写入系统日历。</span>
                </p>
              )}
            </>
          ) : (
            <p className="text-[var(--f-sm)] text-ink-3 leading-relaxed bg-paper rounded-lg px-2.5 py-2">
              设个时间，当天进门会提醒你。空着就是不提醒。
            </p>
          )}
        </div>

        {/* 备注 */}
        <div>
          <label className="label">备注</label>
          <textarea
            className="field-area"
            rows={2}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            /* 提示词随所选事由变：结婚提示新人姓名、满月提示宝宝小名…
               丧事系不给提示（白事不提示字眼），没选事由时用通用文案 */
            placeholder={remarkHint || '如：随礼事项、地点、礼金明细'}
          />
        </div>
        </FieldGroup>
      </div>

      {/* 选已有同名档案 */}
      {showDupList && (
        <DupPicker
          open
          onClose={() => setShowDupList(false)}
          name={trimmed}
          candidates={dups}
          onPick={(p) => applyPerson(p)}
        />
      )}

      {/* 起区分名 */}
      {showAlias && (
        <AliasEditor
          open
          onClose={() => setShowAlias(false)}
          personName={trimmed}
          initial={alias}
          onSave={(a, r, g) => {
            setAlias(a);
            if (r) setRelation(r);
            if (g) setRegion(g);
          }}
        />
      )}
    </Sheet>
  );
}

/* ---------- 单边编辑器 ---------- */

function SideEditor({
  title, side, onChange, tone, onRemove, compact,
}: {
  title: string;
  side: Side;
  onChange: (p: Partial<Side>) => void;
  tone: 'in' | 'out';
  onRemove?: () => void;
  /**
   * 精简模式：只显示「金额 + 渠道」。
   * 日期/事由/地点交给外层的 FieldGroup 统一组织，
   * 否则一组卡片里塞八个字段又变回糊状。
   */
  compact?: boolean;
}) {
  const [chOpen, setChOpen] = useState(false);

  return (
    <div>
      {title && <div className="text-[var(--f-sm)] font-medium text-ink-2 mb-1.5">{title}</div>}

      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <label className="label">金额（元）</label>
          {/* 金额框的键盘类型：试过三种，这是唯一在 WebView 上可靠的。
               * type="number"        → 一定弹数字键盘，但会覆盖 inputMode，
               *                         且部分机型没有小数点键
               * type="text" + inputMode="decimal" → Chrome 有效，
               *                         **但 Android WebView 支持不稳定，
               *                         实测弹出的是带字母的键盘**（涛哥反馈）
               * type="tel"           → 一定弹数字键盘（含数字与符号），
               *                         WebView 100% 支持，
               *                         且允许输入小数点（键盘上有 . 键）
               * 小数点照样能用：onChange 里已做过滤，只保留数字与一个小数点。
               */}

          <input
            className="field num font-semibold h-10"
            style={{ fontSize: 16, color: 'var(--color-ink)' }}
            type="tel"
            inputMode="decimal"
            enterKeyHint="done"
            value={side.amount === 0 ? '' : String(side.amount)}
            onChange={(e) => {
              // 过滤掉非数字与小数点（兼容用户输入全角句号）
              const raw = e.target.value.replace(/[^\d.]/g, '');
              // 只保留一个小数点
              const parts = raw.split('.');
              const v = parts.length > 2
                ? `${parts[0]}.${parts.slice(1).join('')}`
                : raw;
              onChange({ amount: parseFloat(v) || 0 });
            }}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="label">渠道</label>
          <button className="field h-10 min-w-[84px]" onClick={() => setChOpen(true)}>
            {chLabel(side.channel)}
          </button>
        </div>
      </div>

      {chOpen && (
        <Sheet open onClose={() => setChOpen(false)} title="礼金渠道">
          <div className="grid grid-cols-2 gap-2 care-grid-2">
            {CHANNELS.map((c) => (
              <button
                key={c.key}
                onClick={() => { onChange({ channel: c.key }); setChOpen(false); }}
                className={cn('pill h-10', side.channel === c.key && 'pill-on')}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {!compact && (
      <>
      <div className="mt-2.5">
        <label className="label">日期</label>
        <input
          className="field"
          type="date"
          value={side.date}
          onChange={(e) => onChange({ date: e.target.value })}
        />
      </div>

      <div className="mt-2.5">
        <label className="label">事由</label>
        <EventPicker
          value={side.event}
          onChange={(k) => onChange({ event: k as EventKind })}
        />
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div>
          <label className="label">地点 / 办方</label>
          <input
            className="field"
            value={side.place ?? ''}
            onChange={(e) => onChange({ place: e.target.value })}
            placeholder="如：女方家·沂源"
          />
        </div>
        <div>
          <label className="label">礼物</label>
          <input
            className="field"
            value={side.gift ?? ''}
            onChange={(e) => onChange({ gift: e.target.value })}
            placeholder="如：两瓶酒"
          />
        </div>
      </div>
      </>
      )}

      {onRemove && (
        <button onClick={onRemove} className="btn-ghost btn-sm mt-2.5 w-full">
          移除回礼
        </button>
      )}
    </div>
  );
}

/* ---------- 删除确认 ---------- */

function DeleteSheet({
  rec, name, onClose,
}: { rec: GiftRecord; name: string; onClose: () => void }) {
  const { dispatch } = useApp();
  return (
    <Sheet
      open
      onClose={onClose}
      title="删除记录"
      footer={
        <>
          <button className="btn-ghost flex-1" onClick={onClose}>取消</button>
          <button
            className="btn btn-danger flex-1"
            onClick={() => {
              dispatch({ t: 'removeRecord', id: rec.id });
              void cancelOne(rec.id);
              onClose();
            }}
          >
            确认删除
          </button>
        </>
      }
    >
      <p className="text-[var(--f-md)] text-ink-2 leading-relaxed">
        将删除与「{name}」在 {rec.received?.date} 的这条记录，删除后无法恢复。
      </p>
    </Sheet>
  );
}

/* ---------- 删除完成提示（3秒自消） ---------- */

function DeletedToast({ n }: { n: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 30);
    const t2 = setTimeout(() => setShow(false), 3000);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [n]);
  if (!show) return null;
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 bottom-[70px] z-50
                 bg-ink/92 text-white text-[var(--f-md)] px-4 py-2
                 rounded-[var(--r-ctl)] shadow-lg"
      role="status"
    >
      已删除 {n} 条记录
    </div>
  );
}
