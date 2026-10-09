/** 吉日良辰 + 太岁查询 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { findLuckyDays, getTaiSui, LUCKY_TOPICS, ALL_ANIMALS, LuckyResult } from '../lib/almanac';
import { useApp } from '../lib/store';
import { TopBar, Section } from '../lib/ui';
import { cn } from '../lib/utils';
import { todayStr } from '../lib/store';

export function LuckyPage() {
  const nav = useNavigate();
  const { db } = useApp();
  const [topic, setTopic] = useState('wedding');
  const [from, setFrom] = useState(todayStr());
  const [days, setDays] = useState(60);

  const results: LuckyResult[] = useMemo(
    () => findLuckyDays(from, days, topic),
    [from, days, topic],
  );
  const good = results.filter((r) => r.score >= 50);
  const topicLabel = LUCKY_TOPICS.find((t) => t.key === topic)?.label ?? '';

  return (
    <>
      <TopBar
        title="吉日良辰"
        sub={`未来 ${days} 天内挑选${topicLabel}`}
        onBack={() => nav(-1)}
      />

      <div className="page-body space-y-3">
        {/* 事项选择 */}
        <div>
          <div className="sec-title mb-2">办什么事</div>
          <div className="flex flex-wrap gap-1.5">
            {LUCKY_TOPICS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTopic(t.key)}
                className={cn('pill h-[var(--h-ctl)] px-3', topic === t.key && 'pill-on')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 参数 */}
        <div className="card p-3 space-y-2.5">
          <div>
            <label className="label">起始日期</label>
            <input
              className="field" type="date" value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label">查找范围</label>
            <div className="flex gap-1.5">
              {[30, 60, 90, 180].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={cn('pill flex-1 h-[var(--h-ctl)]', days === d && 'pill-on')}
                >
                  {d} 天
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 结果概览 */}
        <div className="card px-3.5 py-3 flex items-center justify-between">
          <div>
            <div className="text-[length:var(--f-xs)] text-ink-3">符合条件</div>
            <div className="text-[length:var(--f-num)] font-semibold num leading-tight">{good.length} 天</div>
          </div>
          <div className="text-right text-[length:var(--f-sm)] text-ink-3 leading-relaxed">
            共查 {results.length} 天<br />
            评分含宜项、忌项与黄道吉日
          </div>
        </div>

        {/* 结果列表 */}
        {good.length === 0 ? (
          <div className="card p-6 text-center">
            <div className="text-[length:var(--f-md)] text-ink-2">这个范围内没有理想日子</div>
            <div className="text-[length:var(--f-sm)] text-ink-3 mt-1">把范围拉长到 90 或 180 天试试</div>
          </div>
        ) : (
          <div className="card overflow-hidden">
            {good.map((r, i) => (
              <div key={r.date} className={cn('px-3 py-2.5', i > 0 && 'border-t border-line')}>
                <div className="flex items-center gap-2">
                  <div className="w-11 shrink-0 text-center">
                    <div className="text-[length:var(--f-xl)] font-semibold num leading-none">
                      {Number(r.date.slice(8, 10))}
                    </div>
                    <div className="text-[length:var(--f-xs)] text-ink-3 mt-0.5 num">
                      {Number(r.date.slice(5, 7))}月
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[length:var(--f-md)] num text-ink-2">
                      {r.date.slice(0, 4)}年 · {r.lunarMD}
                    </div>
                    <div className="text-[length:var(--f-xs)] text-ink-3 mt-0.5 truncate">
                      {r.hits.length ? `宜 ${r.hits.join('、')}` : `宜事 ${r.yiCount} 项`}
                      {r.misses.length ? ` · 忌 ${r.misses.join('、')}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={cn(
                      'text-[length:var(--f-lg)] font-semibold num leading-none',
                      r.score >= 80 ? 'text-in' : r.score >= 60 ? 'text-accent' : 'text-ink-2',
                    )}>{r.score}</div>
                    <div className="text-[length:var(--f-xs)] text-ink-3 mt-0.5">{r.verdict}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[length:var(--f-xs)] text-ink-3/70 text-center leading-relaxed pt-1">
          评分算法：命中宜项 +25/项，命中忌项 −35/项，黄道日 +8，宜项数量 +4/项（上限 40）<br />
          民俗参考，实际办事请结合家人意见与场地安排
        </p>
      </div>
    </>
  );
}

/* ==================== 太岁 ==================== */

export function TaiSuiPage() {
  const nav = useNavigate();
  const [year, setYear] = useState(new Date().getFullYear());
  const info = useMemo(() => getTaiSui(year), [year]);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 9 }, (_, i) => thisYear - 2 + i);
  const barRef = useRef<HTMLDivElement | null>(null);

  /**
   * 选中的年份自动滚到中间。
   *
   * ★ v2.14.9（涛哥要求改成「一行可左右拖的滚轮式」）：
   * 横向滚动条最大的毛病是**用户不知道能滑** —— 老人更不会去试。
   * 所以首屏把「今年」居中：左右都露出半截别的年份，
   * 「这里还能拖」这件事本身就成了提示。换年时也把新选中项居中。
   *
   * 用 rect 差值算而不是 offsetLeft：offsetLeft 依赖 offsetParent，
   * 卡片一旦被加上 position 就会算错。
   */
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const el = bar.querySelector<HTMLElement>('[data-sel="1"]');
    if (!el) return;
    const barRect = bar.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta = (elRect.left - barRect.left) - (bar.clientWidth - elRect.width) / 2;
    bar.scrollLeft = Math.max(
      0,
      Math.min(bar.scrollLeft + delta, bar.scrollWidth - bar.clientWidth),
    );
  }, [year]);

  return (
    <>
      <TopBar title="太岁查询" sub={`${info.gz}年 · ${info.animal}年`} onBack={() => nav(-1)} />

      <div className="page-body space-y-3">
        {/* 年份选择 —— 一行横向滚动（涛哥 2026-10-10 定的样子：滚轮式左右拖）
            ★ 背景：原来 9 个 `flex-1` 硬塞一行，按钮有「2026」4 个数字的
            最小内容宽度，加起来必然超出屏幕；外层又没有滚动容器，
            于是 2028 之后的年份**既看不见也点不到，还拖不动**。
            现在：
            · 容器 overflow-x-auto，一行排开，手指左右拖
            · 按钮 shrink-0（不给压缩）+ min-w 跟着字号推导（不写死 px），
              保证任何字号下 4 位数字都放得下且点得动
            · snap 到整格，拖完停在完整年份上，像滚轮
            · 选中项自动居中（见上面的 useEffect），兼顾「让用户知道能滑」 */}
        <div
          ref={barRef}
          className="card p-2 flex gap-1 overflow-x-auto snap-x"
        >
          {years.map((y) => (
            <button
              key={y}
              data-sel={y === year ? '1' : undefined}
              onClick={() => setYear(y)}
              className={cn(
                'snap-center shrink-0 min-w-[calc(var(--f-md)*3.4)] px-3',
                'h-[var(--h-btn)] rounded-md',
                'text-[length:var(--f-md)] num transition-colors',
                y === year ? 'bg-accent text-white font-medium' : 'text-ink-2 active:bg-paper',
              )}
            >
              {y}
            </button>
          ))}
        </div>

        {/* 主卡 */}
        <div className="card px-4 py-5 text-center">
          <div className="text-[length:var(--f-sm)] text-ink-3">{info.gz}年 · 农历{['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'].indexOf(info.animal) + 1}月</div>
          <div className="text-[length:var(--f-num)] font-bold leading-none mt-1.5" style={{ color: '#B3271E' }}>
            {info.animal}
          </div>
          <div className="text-[length:var(--f-md)] text-ink-2 mt-1">值年太岁 · {info.gz}年</div>
        </div>

        {/* 方位 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="card p-3 text-center">
            <div className="text-[length:var(--f-xs)] text-ink-3">太岁方位</div>
            <div className="text-[length:var(--f-num)] font-semibold text-accent mt-1">{info.position}</div>
            <div className="text-[length:var(--f-xs)] text-ink-3 mt-1">避方：勿在此方动土</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-[length:var(--f-xs)] text-ink-3">平安符位</div>
            <div className="text-[length:var(--f-num)] font-semibold text-in mt-1">{info.pingAn}</div>
            <div className="text-[length:var(--f-xs)] text-ink-3 mt-1">化煞方向</div>
          </div>
        </div>

        {/* 犯太岁 */}
        <Section title="犯太岁">
          <div className="card p-3.5">
            <div className="text-[length:var(--f-sm)] text-ink-2 mb-2">
              {info.year} 年生肖属{info.clashAnimals.join('、')}者与太岁相冲，传统上称「犯太岁」。
            </div>
            <div className="grid grid-cols-6 gap-1.5 care-grid-6">
              {ALL_ANIMALS.map((a) => {
                const bad = info.clashAnimals.includes(a);
                const self = a === info.animal;
                return (
                  <div
                    key={a}
                    className={cn(
                      'h-10 max-h-none min-h-[var(--h-btn)] rounded-md flex flex-col items-center justify-center',
                      bad ? 'bg-accent text-white'
                        : self ? 'bg-accent-soft text-accent ring-1 ring-accent'
                        : 'bg-paper text-ink-2',
                    )}
                  >
                    <span className="text-[length:var(--f-lg)] leading-none">{a}</span>
                    {bad && <span className="text-[length:var(--f-xs)] mt-0.5">犯</span>}
                    {self && <span className="text-[length:var(--f-xs)] mt-0.5">值年</span>}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-2.5 text-[length:var(--f-xs)] text-ink-3">
              <span className="flex items-center gap-1">
                <i className="w-2.5 h-2.5 rounded-sm bg-accent inline-block" />犯太岁
              </span>
              <span className="flex items-center gap-1">
                <i className="w-2.5 h-2.5 rounded-sm bg-accent-soft ring-1 ring-accent inline-block" />值年
              </span>
            </div>
          </div>
        </Section>

        <p className="text-[length:var(--f-xs)] text-ink-3/70 text-center leading-relaxed pt-1">
          太岁方位由农历干支推定（子=正北、午=正南，依此类推）<br />
          民俗参考，属{info.animal}者建议佩戴化解饰品、避免动工
        </p>
      </div>
    </>
  );
}

export default LuckyPage;
