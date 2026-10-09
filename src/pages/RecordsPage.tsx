/** 往来记录：时间轴列表 + 双向账目录入 + 重名区分 + 酒席提醒 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, HandCoins, Bell, BellOff, CheckSquare } from 'lucide-react';
import {
  GiftRecord, Person, Side, CHANNELS, EventKind,
  makeEventLookup, findSameName, resolveDisplayName,
} from '../lib/types';
import { useApp, fmtMoney, fmtDate, blankSide } from '../lib/store';
import { useTheme } from '../lib/theme';
import { uid } from '../lib/db';
import { useSuggest, SuggestBox } from '../lib/Suggest';
import { TopBar, Sheet, Empty, SearchBox, Confirm } from '../lib/ui';
import { EventPicker, EventChip, EventBtn } from '../lib/EventPicker';
import { DupHint, DupPicker, AliasEditor } from '../lib/DupHint';
// v2.14.0：提醒与权限相关 import 已移除（不再提供提醒服务、零权限申请）
import { useLongPress } from '../lib/useLongPress';
import { SelectBar, CheckMark } from '../lib/ActionSheet';
import { cn } from '../lib/utils';
import { FieldGroup } from '../lib/FieldGroup';
import { pushBack } from '../lib/backStack';
import { LongPressTip, useTipOnce } from '../lib/LongPressTip';

const chLabel = (k: string) => CHANNELS.find((c) => c.key === k)?.label ?? k;

// v2.14.0：移除 'remind'（不再提供提醒）
type Filter = 'all' | 'in' | 'out';

export function RecordsPage() {
  const { db, dispatch, nameOf, rawNameOf, totalIn, totalOut } = useApp();
  const nav = useNavigate();
  // 关怀模式（大字模式）：开启时简化本页，见下方条件渲染
  const { care } = useTheme();
  const [tab, setTab] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<GiftRecord | 'new' | null>(null);
  const [delTarget, setDelTarget] = useState<GiftRecord | null>(null);
  /* v2.14.6：新建记录的方向（谁办事）。
     悬浮菜单选完才知道；编辑旧记录时由 RecordEditor 按记录内容反推，
     不需要这个状态。 */
  const [dirMenu, setDirMenu] = useState(false);
  const [dir, setDir] = useState<Direction | null>(null);

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
  const lookup = useMemo(() => makeEventLookup(db.customEvents), [db.customEvents]);

  const list = useMemo(() => {
    let rs = db.records;
    if (tab === 'in') rs = rs.filter((r) => (r.received?.amount ?? 0) > 0);
    if (tab === 'out') rs = rs.filter((r) => (r.returned?.amount ?? 0) > 0);
    if (q.trim()) {
      const k = q.trim();
      // 同时匹配显示名和原始姓名
      rs = rs.filter((r) =>
        nameOf(r.personId).includes(k) || rawNameOf(r.personId).includes(k));
    }
    return [...rs].sort((a, b) => {
      // v2.14.0：不再有「提醒前置」，纯按日期倒序
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
  return (
    <>
      <TopBar
        title="往来记录"
        sub={`${db.persons.length} 人 · ${db.records.length} 条`}
        right={
          <>
            {/* 关怀模式：移除「人员」入口（人员可从底部 Tab 进入，
                记一笔时也能从「快速选已有的人」选到） */}
            {!care && (
              <button onClick={() => nav('/persons')} className="btn-ghost btn-sm">
                <Users size={14} strokeWidth={1.9} />人员
              </button>
            )}
            {/* 全选入口：M3 说移动端勾选框不该常驻，
                用标题栏的快捷入口解决「用户不知道能批量操作」
                —— 关怀模式下隐藏，全选只在进入多选态后由 SelectBar 提供 */}
            {!care && list.length > 0 && !selecting && (
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

      {/* has-fab：本页有悬浮加号，底部要让出加号的高度，否则最后一行会被压住 */}
      <div className="page-body has-fab space-y-3">
        {/*汇总条 —— 关怀模式下隐藏，避免挤占大字列表空间 */}
        {!care && (
        <div className="card px-3.5 py-3">
          <div className="flex items-end gap-1.5">
            <div className="flex-1">
              <div className="text-[length:var(--f-xs)] text-ink-3 mb-0.5">收礼合计</div>
              <div className="text-[length:var(--f-num)] font-semibold num text-in leading-none">
                {fmtMoney(totalIn, db.settings.currency)}
              </div>
            </div>
            <div className="w-px h-[var(--h-ctl)] bg-line" />
            <div className="flex-1">
              <div className="text-[length:var(--f-xs)] text-ink-3 mb-0.5">回礼合计</div>
              <div className="text-[length:var(--f-num)] font-semibold num text-out leading-none">
                {fmtMoney(totalOut, db.settings.currency)}
              </div>
            </div>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-line flex items-center justify-between">
            <span className="text-[length:var(--f-sm)] text-ink-3">人情净值（收 − 回）</span>
            <span className={cn(
              'text-[length:var(--f-lg)] font-semibold num',
              net > 0 ? 'text-in' : net < 0 ? 'text-out' : 'text-ink-3',
            )}>
              {net > 0 ? '尚欠人情' : net < 0 ? '多随了' : '两清'}　{fmtMoney(Math.abs(net), db.settings.currency)}
            </span>
          </div>
        </div>
        )}

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

        {/* 筛选 + 搜索 —— 关怀模式下整体隐藏（大字模式下只保留列表，
            筛选/搜索可用底部 Tab 与记一笔流程替代，减少界面元素） */}
        {!care && (
        <div className="flex items-center gap-2">
          <div className="flex bg-card border border-line rounded-lg p-0.5 shrink-0">
            {([
              ['all', '全部'], ['in', '收礼'], ['out', '回礼'],
            ] as [Filter, string][]).map(([k, lb]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn(
                  'h-[var(--h-sm)] px-2.5 rounded-md text-[length:var(--f-sm)] transition-colors',
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
        )}

        <LongPressTip
          show={tip.show}
          role="记录"
          onClose={tip.dismiss}
        />

        {/* 列表 */}
        {list.length === 0 ? (
          <div className="card">
            <Empty
              text={q ? '没有匹配的人员' : '还没有任何记录'}
              hint={
                q
                  ? '换个名字试试'
                  : care
                    ? '点右下角「+」记第一笔；管理人员请在底部「人员」标签'
                    : '点右下角按钮记第一笔'
              }
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
                    <span className="text-[length:var(--f-sm)] font-medium num">{month.replace('-', '年')}月</span>
                    <span className="text-[length:var(--f-xs)] text-ink-3 num">
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
                        care={care}
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
          onClick={() => setDirMenu(true)}
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

      {/* ★ v2.14.6 悬浮方向菜单（涛哥定）：点加号先选「谁办事」，
          再进入对应录入表单。解决「我给份子钱该记哪」的困惑，
          同时把原来两组（收礼/回礼）堆叠的表单减半，大字模式也不挤。 */}
      {dirMenu && (
        <DirectionMenu
          onPick={(d) => { setDirMenu(false); setDir(d); setEdit('new'); }}
          onClose={() => setDirMenu(false)}
        />
      )}

      {/* 批量删除二次确认 */}
      {batchDel && (
        <Confirm
          open
          title={`删除 ${sel.size} 条记录？`}
          message={
            <>
              删除后无法恢复。
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
        <RecordEditor
          rec={edit === 'new' ? null : edit}
          dir={dir}
          onClose={() => { setEdit(null); setDir(null); }}
        />
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
  selecting, selected, care,
}: {
  r: GiftRecord;
  name: string;
  evDef: ReturnType<typeof makeEventLookup> extends (k: string) => infer T ? T : never;
  evDefBack: ReturnType<typeof makeEventLookup> extends (k: string) => infer T ? T | null : never;
  onClick: () => void;
  onLongPress: () => void;
  first: boolean;
  /** 大字模式：只显示姓名 + 金额（涛哥：给年纪大的人用，越简单越好） */
  care?: boolean;
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
      {/* ★ v2.14.6 大字模式（涛哥原则：给年纪大的人用，在不破坏录入与备份
          恢复的前提下越简单越好）：**只显示姓名 + 金额**。
          事由徽标、日期、渠道、地点、礼物、回礼详情全部隐藏 ——
          老人扫一眼只要知道「谁、多少钱」，其余在编辑页里看得到。 */}
      <div className="flex-1 min-w-0 pr-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[length:var(--f-lg)] font-semibold truncate">
            {name || '（未命名）'}
          </span>
          {!care && evDef && <EventChip ev={evDef} />}
        </div>
        {!care && (
        <>
        {/* 方向词：让人一眼知道这笔是给出还是收到 */}
        <div className="text-[length:var(--f-xs)] text-ink-3 mt-0.5
                        flex items-center gap-1 min-w-0 overflow-hidden">
          <span className={cn('shrink-0 font-medium', rv > 0 ? 'text-in' : 'text-out')}>
            {rv > 0 && tv > 0 ? '收＋回' : rv > 0 ? '我收到' : '我给出'}
          </span>
          <span className="num shrink-0">{fmtDate(r.received?.date || '')}</span>
          {r.received?.channel && rv > 0 && (
            <>
              <span className="shrink-0">·</span>
              <span className="truncate">{chLabel(r.received.channel)}</span>
            </>
          )}
          {r.received?.place && (
            <>
              <span className="shrink-0">·</span>
              <span className="truncate">{r.received.place}</span>
            </>
          )}
          {r.received?.gift && (
            <>
              <span className="shrink-0">·</span>
              <span className="truncate">{r.received.gift}</span>
            </>
          )}
          {/* 回礼金额：只留金额，事由/渠道移到第三行 */}
          {tv > 0 && <span className="text-out shrink-0">· 回礼 {fmtMoney(tv, '')}</span>}
        </div>
        {/* 回礼详情独立成第三行：事由 + 渠道 + 日期，不与主信息流混排 */}
        {tv > 0 && (
          <div className="text-[length:var(--f-xs)] text-ink-3 mt-0.5
                          flex items-center gap-1 min-w-0 overflow-hidden">
            <span className="shrink-0">回礼于 {fmtDate(r.returned!.date)}</span>
            {evDefBack && <EventChip ev={evDefBack} />}
            {r.returned!.channel && (
              <><span>·</span><span className="truncate">{chLabel(r.returned!.channel)}</span></>
            )}
          </div>
        )}
        </>
        )}
      </div>
      <div className="text-right shrink-0">
        {rv > 0 && (
          <div className="text-[length:var(--f-lg)] font-semibold num text-in leading-tight">
            +{fmtMoney(rv, '')}
          </div>
        )}
        {tv > 0 && (
          <div className="text-[length:var(--f-md)] font-medium num text-out leading-tight">
            −{fmtMoney(tv, '')}
          </div>
        )}
        {rv === 0 && tv === 0 && (
          <div className="text-[length:var(--f-sm)] text-ink-3">未填金额</div>
        )}
      </div>
    </div>
  );
}

/* ---------- 录入/编辑 ---------- */

/**
 * 方向：谁办的事。
 *
 * v2.14.6（涛哥定）：这是本应用最核心的概念。
 * 原来的「收礼（对方办的）/ 回礼（我方办的）」把**钱的方向**和**谁办事**
 * 混在一起，导致「别人婚礼我给份子钱该记哪」根本想不明白。
 * 现在把两个维度拆开：
 *   - 谁办事 → 对方办事 / 我方办事（Direction，先选）
 *   - 钱的方向 → 由方向直接决定，不需要用户判断
 *     对方办事 = 我随礼付出；我方办事 = 别人随礼我收到
 */
export type Direction = 'their' | 'mine';

/* v2.14.7-final（涛哥定稿）：标题写「我做了什么」，副标题写「谁办事」。
   —— 对年纪大的人，动作比「对方/我方」这种代词好懂得多：
      我随礼（别人办事）＝我把钱给出去了
      别人随礼（我办事）＝钱进我口袋 */
const DIR_INFO: Record<Direction, { title: string; sub: string; side: 'out' | 'in' }> = {
  their: { title: '我随礼', sub: '别人办事', side: 'out' },
  mine:  { title: '别人随礼', sub: '我办事', side: 'in' },
};

/**
 * 悬浮方向菜单 —— 贴着右下角加号弹出。
 *
 * 为什么不做成并排 Tab（涛哥原话）：大字模式下两个 Tab 并排会挤。
 * 就近弹出的单列菜单在 2.1 倍字号下也放得下，
 * 选完再进录入表单，表单只剩一个方向、字段减半。
 */
function DirectionMenu({
  onPick, onClose,
}: {
  onPick: (d: Direction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (ref.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('touchstart', onDown, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('touchstart', onDown, true);
    };
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={ref}
        /* 宽度跟着字号走，不要写死 rem ——
           大字模式下文字放大，写死的 15rem 装不下「别人办事，我随礼」，
           副标题会被压成两行（涛哥真机截图确认）。
           用 ch（字符宽）随内容伸缩，同时不超出屏幕。 */
        className="fixed z-50 w-[min(22rem,calc(100vw-2rem))] card overflow-hidden"
        style={{
          right: 'calc(var(--s-3) + 0.75rem)',
          bottom: 'calc(var(--h-tab) + var(--sab) + 16px + 3.5rem + 0.5rem)',
        }}
        role="menu"
      >
        {/* v2.14.7-final：去掉「这次是谁办事？」标题。
            两个选项本身已经说清楚了，标题只是多占一行。 */}
        {(['their', 'mine'] as Direction[]).map((d) => {
          const info = DIR_INFO[d];
          return (
            <button
              key={d}
              onClick={() => onPick(d)}
              className="w-full px-3 py-2.5 flex items-center gap-2.5 text-left
                         active:bg-accent-soft border-b border-line last:border-b-0"
              role="menuitem"
            >
              <span className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                info.side === 'out' ? 'bg-out/12 text-out' : 'bg-in/12 text-in',
              )}>
                {info.side === 'out'
                  ? <HandCoins size={16} strokeWidth={1.9} />
                  : <Users size={16} strokeWidth={1.9} />}
              </span>
              <span className="min-w-0">
                <span className="block text-[length:var(--f-md)] font-medium truncate">
                  {info.title}
                </span>
                <span className="block text-[length:var(--f-xs)] text-ink-3 truncate">
                  {info.sub}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function RecordEditor({
  rec, dir, onClose,
}: {
  rec: GiftRecord | null;
  /** 新建时由悬浮菜单选定；编辑旧记录时按内容反推 */
  dir: Direction | null;
  onClose: () => void;
}) {
  const { db, dispatch, nameOf, dupCount } = useApp();
  // 关怀模式（大字）：事由默认折叠、隐藏姓名常驻快捷 chip
  const { care } = useTheme();
  const isNew = rec === null;

  /* 方向的确定：
     - 新建：来自悬浮菜单的 dir（必有）
     - 编辑：按记录内容反推 —— 主要是「我给出」就是我给对方随礼，
       只有收礼没有回礼的按「我收到」处理（v2.14.0 之前的老数据归类规则，
       涛哥拍板：付出→对方办事、收到→我方办事）。 */
  const effDir: Direction = isNew
    ? (dir ?? 'their')
    : ((rec?.returned?.amount ?? 0) > 0 ? 'their' : 'mine');
  const isOut = DIR_INFO[effDir].side === 'out';

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
  // v2.14.2：编辑页删除也要二次确认，与批量删除一致（涛哥反馈「没有删除提示弹窗」）
  const [confirmDel, setConfirmDel] = useState(false);
  // v2.14.0：notifyOK / perms / schedMsg 已随提醒功能一并移除

  const hasOut = (returned?.amount ?? 0) > 0;
  const hasIn = (received?.amount ?? 0) > 0;
  /* v2.14.6：方向决定金额落在哪一侧，canSave 只看「填了人和金额」，
     不再要求同时有收/回两组。 */
  const canSave = personName.trim().length > 0
    && (Math.abs(received.amount || 0) > 0 || hasOut);

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

    /* ★ v2.14.6 按方向写入：
       - 对方办事（我随礼付出）→ 金额落在 returned（我给出去的钱）
       - 我方办事（我办席收礼）→ 金额落在 received（我收到的钱）
       这正是涛哥拍板的老数据归类规则，两边语义完全一致，
       所以历史记录零迁移、统计/净值口径不变。 */
    const main = { ...received, amount: Math.abs(received.amount || 0) };
    const payload = {
      personId: pid,
      received: isOut ? blankSide({ date: received.date }) : main,
      returned: isOut ? main : (hasOut ? returned! : undefined),
      remark: remark.trim() || undefined,
      remindAt: remindAt || undefined,
      reminded: false,
    };
    if (isNew) dispatch({ t: 'addRecord', r: payload });
    else dispatch({ t: 'updateRecord', id: rec!.id, r: payload });

    // v2.14.0：不再排任何提醒（涛哥决策「只做登记，不提供提醒服务」）。
    // 保留同步关闭面板，避免用户以为卡死。
    onClose();
  };

  const deleteRec = () => {
    setConfirmDel(true);
  };

  const doDelete = () => {
    if (rec) dispatch({ t: 'removeRecord', id: rec.id });
    setConfirmDel(false);
    onClose();
  };

  return (
    <>
    <Sheet
      open
      onClose={onClose}
      title={isNew ? `记一笔 · ${DIR_INFO[effDir].title}` : '编辑记录'}
      footer={
        <>
          {!isNew && (
            /* v2.13.3-hotfix（涛哥：两个按钮太大，突兀，与整体风格不相容）：
               方向来回错了三次：
                 w-16(64px) → 挤成一团、比保存矮
                 w-[88px]   → 反过来突出删除，方向也不对
                 flex-1 等宽 → 两块红底抢视觉，还是太大
               最后对齐**全app 确认框的既有风格**（见 ui.tsx Confirm）：
               次要操作（取消/删除）用「无底色 + 大字号」文字按钮，
               主操作（保存）才用实心按钮。
               这样删除不抢视觉、保存仍是明确的主动作；
               高度用 var(--h-btn) 而非写死 px，关怀模式大字下自动适配。 */
            <button className="btn-danger flex-1" onClick={deleteRec}>删除</button>
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
            <p className="text-[length:var(--f-xs)] text-ink-3 mt-1.5">
              显示为：{resolveDisplayName(
                { id: personId, name: trimmed, alias, relation, region, createdAt: '', updatedAt: '' },
                sameNameTotal, 0,
              )}
            </p>
          )}

          {/* 快速选已有的人 —— 大字模式下隐藏这排常驻 chip，省出竖向空间；
              「点输入框弹出的历史下拉」与「输入即检索历史」仍保留（那是浮层，不受影响）。 */}
          {!care && db.persons.length > 0 && (
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

        {/* ========== 第 2 组：礼金 ==========
            ★ v2.14.6 大字模式极简（涛哥定原则：「给年纪大的人用，
            在不破坏录入和备份恢复的前提下，越简单越好」）：
            只留「金额」一个必填项 + 一个备注框。
            渠道/地点/礼物/时刻全部并入备注，用户想写就写，不写也不影响记账。 */}
        <FieldGroup title={care ? '金额' : '礼金与日期'}>
          {care ? (
            <>
              <div>
                <label className="label">金额</label>
                <input
                  className="field"
                  type="number"
                  inputMode="decimal"
                  value={received.amount || ''}
                  onChange={(e) => setR({ amount: Number(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
              <div className="mt-2.5">
                <label className="label">备注（可留空）</label>
                <input
                  className="field"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="如：女方家·沂源 现金"
                />
              </div>
            </>
          ) : (
            <>
              <SideEditor
                title={isOut ? '我随礼付出（礼金）' : '我收到的礼金'}
                side={received}
                onChange={setR}
                tone={isOut ? 'out' : 'in'}
                compact
              />
              {/* v2.14.0：日期 + 时间并排。
                  涛哥要求「记录婚礼酒席的时间」——日期不够用。
                  时间是可选的，只登记日期的场景不受影响。 */}
              <div>
                <label className="label">日期与时刻</label>
                <div className="flex gap-2">
                  <input
                    className="field flex-1 min-w-0"
                    type="date"
                    value={received.date}
                    onChange={(e) => setR({ date: e.target.value })}
                  />
                  <input
                    className="field flex-1 min-w-0"
                    type="time"
                    value={received.time ?? ''}
                    onChange={(e) => setR({ time: e.target.value || undefined })}
                  />
                </div>
              </div>
            </>
          )}
        </FieldGroup>

        {/* ========== 第 3 组：事由 ==========
            ★ 大字模式：事由整个组隐藏 —— 老人不需要分场合，
            金额记清楚就够，场合写不写进备注都行。 */}
        {!care && (
        <FieldGroup title="事由与地点">
          <div>
            <label className="label">事由</label>
            <EventPicker
              value={received.event}
              onChange={(k) => setR({ event: k as EventKind })}
              care={care}
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
        )}

        {/* v2.14.6：原来这里是「回礼（我方办的）」整组表单。
            方向模型下，回礼 = **另一条记录**（我方办事），
            所以不再在本表单里重复一组方向，只在有回礼时显示说明，
            并引导用户另记一条。老数据的回礼仍完整保留、照常显示。
            ★ 大字模式：整块隐藏（原则：越简单越好）。 */}
        {!care && !hasOut && (
          <div className="flex items-start gap-1.5 px-2.5 py-2 rounded-lg bg-paper">
            <HandCoins size={12} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-3" />
            <p className="text-[length:var(--f-xs)] text-ink-3 leading-relaxed">
              {isOut
                ? '这份人情你给了多少？如果对方后来回礼了，回礼要**另记一条**（再点一次加号，选「我方办事」）。'
                : '收到了多少？如果这份人情你之后要回礼，回礼要**另记一条**（再点一次加号，选「对方办事」）。'}
            </p>
          </div>
        )}

        {/* ========== 第 5 组：备注 ==========
            v2.14.0：原「酒席提醒」整块已移除（不再提供提醒服务）。
            ★ 大字模式：整组隐藏 —— 备注已在「金额」组里给了一个输入框，
            不需要再来一块（原则：越简单越好）。 */}
        {!care && (
        <FieldGroup title="备注">

        {/* 提示：本应用只做登记，不发通知。
            一句话讲清即可，不能让用户以为漏了功能。 */}
        <div className="flex items-start gap-1.5 px-2.5 py-2 rounded-lg bg-paper">
          <BellOff size={12} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-3" />
          <p className="text-[length:var(--f-xs)] text-ink-3 leading-relaxed">
            本应用只做登记，不发送提醒。需要到点响，请用手机自带「时钟」设个闹钟。
          </p>
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
        )}
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

    {/* v2.14.2：删除二次确认（覆盖在录入弹层之上） */}
    {confirmDel && (
      <Confirm
        open
        title="删除这条记录？"
        message={<>删除后无法恢复。</>}
        danger
        okText="删除"
        onCancel={() => setConfirmDel(false)}
        onOk={doDelete}
      />
    )}
    </>
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
      {title && <div className="text-[length:var(--f-sm)] font-medium text-ink-2 mb-1.5">{title}</div>}

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
      {/* v2.14.0：回礼方同样支持时间（涛哥：「回礼中也是只有日期没有时间」） */}
      <div className="mt-2.5">
        <label className="label">日期与时刻</label>
        <div className="flex gap-2">
          <input
            className="field flex-1 min-w-0"
            type="date"
            value={side.date}
            onChange={(e) => onChange({ date: e.target.value })}
          />
          <input
            className="field flex-1 min-w-0"
            type="time"
            value={side.time ?? ''}
            onChange={(e) => onChange({ time: e.target.value || undefined })}
          />
        </div>
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
            className="btn-danger-solid flex-1"
            onClick={() => {
              dispatch({ t: 'removeRecord', id: rec.id });
              onClose();
            }}
          >
            确认删除
          </button>
        </>
      }
    >
      <p className="text-[length:var(--f-md)] text-ink-2 leading-relaxed">
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
                 bg-ink/92 text-white text-[length:var(--f-md)] px-4 py-2
                 rounded-[var(--r-ctl)] shadow-lg"
      role="status"
    >
      已删除 {n} 条记录
    </div>
  );
}
