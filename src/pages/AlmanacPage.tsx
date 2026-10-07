/** 万年黄历 —— 基于 lunar-javascript，离线计算 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getDay, monthGrid, toSolarStr, WEEK_LABELS, DayInfo } from '../lib/almanac';
import { TopBar, Section } from '../lib/ui';
import { cn } from '../lib/utils';

export function AlmanacPage() {
  const nav = useNavigate();
  const today = new Date();
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() + 1 });
  const [sel, setSel] = useState(toSolarStr(today.getFullYear(), today.getMonth() + 1, today.getDate()));

  const cells = useMemo(() => monthGrid(ym.y, ym.m, 1), [ym]);
  const info: DayInfo | null = useMemo(() => {
    try { return getDay(sel); } catch { return null; }
  }, [sel]);

  const shift = (delta: number) => {
    const d = new Date(ym.y, ym.m - 1 + delta, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() + 1 });
  };

  return (
    <>
      <TopBar
        title="万年黄历"
        sub="老黄历 · 离线计算"
        onBack={() => nav(-1)}
        right={
          <button className="btn-ghost btn-sm" onClick={() => {
            const t = new Date();
            setSel(toSolarStr(t.getFullYear(), t.getMonth() + 1, t.getDate()));
            setYm({ y: t.getFullYear(), m: t.getMonth() + 1 });
          }}>今天</button>
        }
      />

      <div className="px-3 pt-3 pb-24 space-y-3">
        {/* 月份头 */}
        <div className="card px-3 py-2.5 flex items-center justify-between">
          <button onClick={() => shift(-1)} className="w-8 h-[var(--h-ctl)] flex items-center justify-center
                     text-ink-2 active:bg-line/50 rounded-md" aria-label="上个月">
            <ChevronLeft size={18} strokeWidth={1.9} />
          </button>
          <div className="text-center">
            <div className="text-[var(--f-lg)] font-semibold num">{ym.y} 年 {ym.m} 月</div>
            <div className="text-[var(--f-xs)] text-ink-3">
              {info ? `${info.yearGZ}年 ${info.animal}年` : ''}
            </div>
          </div>
          <button onClick={() => shift(1)} className="w-8 h-[var(--h-ctl)] flex items-center justify-center
                     text-ink-2 active:bg-line/50 rounded-md" aria-label="下个月">
            <ChevronRight size={18} strokeWidth={1.9} />
          </button>
        </div>

        {/* 日历网格 */}
        <div className="card p-2">
          <div className="grid grid-cols-7 mb-1">
            {WEEK_LABELS.map((w) => (
              <div key={w} className="text-center text-[var(--f-xs)] text-ink-3">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((c, i) => (
              <button
                key={c.date + i}
                onClick={() => setSel(c.date)}
                className={cn(
                  'cal-cell flex flex-col items-center justify-center py-1 rounded-md transition-colors',
                  c.inMonth ? 'text-ink' : 'text-ink-3/40',
                  sel === c.date && 'bg-accent text-white',
                  c.isToday && sel !== c.date && 'ring-1 ring-accent',
                )}
              >
                <span className="text-[var(--f-md)] num leading-none">{c.day}</span>
                <span className="text-[var(--f-xs)] mt-0.5 leading-none opacity-70 truncate max-w-full px-0.5">
                  {c.lunarText}
                </span>
              </button>
            ))}
          </div>
        </div>

        {!info ? (
          <div className="card p-4 text-center text-[var(--f-md)] text-ink-3">该日期超出可计算范围</div>
        ) : (
          <>
            {/* 日期头 */}
            <div className="card px-3.5 py-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[var(--f-num)] font-semibold num leading-none">
                  {Number(sel.slice(8, 10))}日
                </span>
                <span className="text-[var(--f-md)] text-ink-2">
                  {sel.slice(0, 4)}年{Number(sel.slice(5, 7))}月
                </span>
                <span className="text-[var(--f-sm)] text-ink-3 ml-auto">
                  {info.lunarMD}
                </span>
              </div>
              <div className="text-[var(--f-sm)] text-ink-3 mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
                <span className="num">{info.yearGZ}年 {info.monthGZ}月 {info.dayGZ}日</span>
                <span>{info.animal}年</span>
                {info.festivals.length > 0 && (
                  <span className="text-accent">{info.festivals.join(' ')}</span>
                )}
              </div>
            </div>

            {/* 宜忌 */}
            <div className="grid grid-cols-2 gap-2 care-grid-2">
              <div className="card p-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-5 h-5 rounded bg-in text-white text-[var(--f-sm)]
                                   flex items-center justify-center">宜</span>
                  <span className="text-[var(--f-xs)] text-ink-3">{info.yi.length} 项</span>
                </div>
                <div className="text-[var(--f-sm)] leading-relaxed text-ink-2 break-all">
                  {info.yi.join(' ')}
                </div>
              </div>
              <div className="card p-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-5 h-5 rounded bg-ink-3 text-white text-[var(--f-sm)]
                                   flex items-center justify-center">忌</span>
                  <span className="text-[var(--f-xs)] text-ink-3">{info.ji.length} 项</span>
                </div>
                <div className="text-[var(--f-sm)] leading-relaxed text-ink-2 break-all">
                  {info.ji.join(' ')}
                </div>
              </div>
            </div>

            {/* 三宫格 */}
            <div className="grid grid-cols-3 gap-px bg-line rounded-[var(--r-card)] overflow-hidden care-grid-3">
              <Cell label="纳音" value={info.naYin} />
              <Cell label="冲煞" value={`冲${info.chong}煞${info.sha}`} />
              <Cell
                label="值神"
                value={info.tianShen}
                sub={`${info.tianShenType}·${info.tianShenLuck}`}
              />
            </div>

            {/* 方位 */}
            <Section title="吉神方位">
              <div className="card p-3 grid grid-cols-3 gap-2 care-grid-3">
                <Pos label="喜神" v={info.position.xi} />
                <Pos label="财神" v={info.position.cai} />
                <Pos label="福神" v={info.position.fu} />
                <Pos label="阳贵神" v={info.position.yangGui} />
                <Pos label="阴贵神" v={info.position.yinGui} />
                <Pos label="胎神" v={info.taiShenPos} />
              </div>
            </Section>

            {/* 星宿 */}
            <Section title="二十八星宿">
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[var(--f-lg)] font-semibold">{info.xiu}</span>
                  <span className={cn('tagx',
                    info.xiuLuck === '吉' ? 'bg-in/10 text-in' : 'bg-ink-3/10 text-ink-2')}>
                    {info.xiuLuck}
                  </span>
                  {info.nineStar && (
                    <span className="tagx bg-line/60 text-ink-2">九星 {info.nineStar}</span>
                  )}
                </div>
                <div className="text-[var(--f-sm)] text-ink-2 leading-relaxed">{info.xiuSong}</div>
              </div>
            </Section>

            {/* 彭祖百忌 + 建除 */}
            <div className="grid grid-cols-2 gap-2 care-grid-2">
              <div className="card p-2.5">
                <div className="text-[var(--f-xs)] text-ink-3 mb-1">彭祖百忌</div>
                <div className="text-[var(--f-sm)] text-ink-2 leading-relaxed">{info.pengZu}</div>
              </div>
              <div className="card p-2.5">
                <div className="text-[var(--f-xs)] text-ink-3 mb-1">建除十二神</div>
                <div className="text-[var(--f-sm)] text-ink-2 leading-relaxed">
                  {info.zhiXing}
                  <div className="text-ink-3 mt-0.5">{info.jiShen}</div>
                </div>
              </div>
            </div>

            {/* 吉神宜趋 / 凶神宜忌 */}
            <div className="grid grid-cols-2 gap-2 care-grid-2">
              <div className="card p-2.5">
                <div className="text-[var(--f-xs)] text-ink-3 mb-1">吉神宜趋</div>
                <div className="text-[var(--f-sm)] text-ink-2 leading-relaxed">{info.jiShen}</div>
              </div>
              <div className="card p-2.5">
                <div className="text-[var(--f-xs)] text-ink-3 mb-1">凶神宜忌</div>
                <div className="text-[var(--f-sm)] text-ink-2 leading-relaxed">
                  {info.xiongSha.length ? info.xiongSha.join('、') : '无'}
                </div>
              </div>
            </div>

            {/* 时辰 */}
            <Section title="十二时辰吉凶">
              <div className="card overflow-hidden">
                <div className="grid grid-cols-4 gap-px bg-line care-grid-4">
                  {info.hours.map((h) => (
                    <div key={h.zhi} className="bg-card px-2 py-2">
                      <div className="text-[var(--f-sm)] font-medium num">{h.zhi}</div>
                      <div className={cn('text-[var(--f-xs)] mt-0.5',
                        h.type === '黄道' ? 'text-in' : 'text-ink-3')}>
                        {h.type}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            <p className="text-[var(--f-xs)] text-ink-3/70 text-center leading-relaxed pt-1">
              历法数据由 lunar-javascript（MIT 协议）离线计算<br />
              民俗参考，婚丧嫁娶请以实际情况为准
            </p>
          </>
        )}
      </div>
    </>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card px-2.5 py-2">
      <div className="text-[var(--f-xs)] text-ink-3">{label}</div>
      <div className="text-[var(--f-md)] font-medium mt-0.5 truncate">{value}</div>
      {sub && <div className="text-[var(--f-xs)] text-ink-3 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function Pos({ label, v }: { label: string; v: string }) {
  return (
    <div className="text-center">
      <div className="text-[var(--f-xs)] text-ink-3">{label}</div>
      <div className="text-[var(--f-md)] font-medium text-accent mt-0.5">{v}</div>
    </div>
  );
}

export default AlmanacPage;
