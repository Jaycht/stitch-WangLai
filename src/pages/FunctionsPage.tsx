/** 功能聚合页 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, GitBranch, Sparkles, Compass, ListChecks, ChevronRight,
  BarChart3,
} from 'lucide-react';
import { useApp, fmtMoney } from '../lib/store';
import { TopBar, Section } from '../lib/ui';
import { cn } from '../lib/utils';
import { useTheme } from '../lib/theme';
import { CHANNELS, channelBreakdown, makeEventLookup } from '../lib/types';

const FEATURES = [
  { to: '/almanac', label: '万年黄历', desc: '宜忌 · 冲煞 · 值神', Icon: CalendarDays, color: '#B3271E' },
  { to: '/lucky', label: '吉日良辰', desc: '按事项挑日子', Icon: Sparkles, color: '#B32719' },
  { to: '/taisui', label: '太岁查询', desc: '值年 · 犯太岁', Icon: Compass, color: '#8A6D1F' },
  { to: '/relation', label: '关系计算', desc: '亲缘称呼速查', Icon: GitBranch, color: '#3D6B8E' },
];

export function FunctionsPage() {
  const nav = useNavigate();
  const { db, stats, totalIn, totalOut } = useApp();
  const lookup = makeEventLookup(db.customEvents);
  const { care } = useTheme();

  const openTodos = db.todos.filter((t) => !t.done).length;
  const today = new Date().toISOString().slice(0, 10);
  const urgentTodos = db.todos.filter(
    (t) => !t.done && t.due && t.due <= today,
  ).length;

  const topPersons = stats.filter((s) => s.count > 0).slice(0, 5);
  const channels = channelBreakdown(db.records);
  const maxCh = channels[0]?.amount || 1;

  // 事由分布
  const eventStat = db.records.reduce((m, r) => {
    const k = r.received?.event ?? 'other';
    m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  }, new Map<string, number>());
  const maxEv = Math.max(1, ...eventStat.values());
  const sortedEvents = [...eventStat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <>
      <TopBar title="功能" sub="黄历 · 择日 · 统计" />

      <div className="page-body space-y-3.5">
        {/* 待办入口 —— 有未完成时置顶并显示数量 */}
        {!care && (
        <button
          onClick={() => nav('/todos')}
          className={cn(
            'w-full px-3 py-3 flex items-center gap-2.5 text-left transition-colors',
            openTodos > 0
              ? 'bg-accent-soft border border-accent-line rounded-[var(--r-ctl)]'
              : 'bg-card border border-line rounded-[var(--r-ctl)] active:bg-paper',
          )}
        >
          <div className={cn(
            'w-8 h-[var(--h-ctl)] rounded-lg flex items-center justify-center shrink-0',
            openTodos > 0 ? 'bg-accent text-white' : 'bg-paper text-ink-3',
          )}>
            <ListChecks size={17} strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[length:var(--f-md)] font-medium">待办事项</div>
            <div className="text-[length:var(--f-xs)] text-ink-3">
              {openTodos > 0
                ? `${openTodos} 项未完成${urgentTodos > 0 ? `，${urgentTodos} 项快到了` : ''}`
                : db.todos.length > 0 ? '全部完成' : '记下要办的事'}
            </div>
          </div>
          {openTodos > 0 && (
            <span className="text-[length:var(--f-md)] font-semibold num text-accent shrink-0">
              {openTodos}
            </span>
          )}
          <ChevronRight size={15} strokeWidth={1.8} className="text-ink-3 shrink-0" />
        </button>
        )}

        {/* 工具入口 */}
        <div className="grid grid-cols-2 gap-2">
          {FEATURES.map(({ to, label, desc, Icon, color }) => (
            <button
              key={to}
              onClick={() => nav(to)}
              className="card px-3 py-3 flex items-center gap-2.5 text-left active:bg-paper"
            >
              <div
                className="w-8 h-[var(--h-ctl)] rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${color}14`, color }}
              >
                <Icon size={17} strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <div className="text-[length:var(--f-md)] font-medium truncate">{label}</div>
                <div className="text-[length:var(--f-xs)] text-ink-3 truncate">{desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* 人情概览 */}
        <Section title="人情概览">
          <div className="card overflow-hidden">
            <div className="row">
              <span className="text-[length:var(--f-md)] flex-1">档案人数</span>
              <span className="text-[length:var(--f-md)] num font-medium">{db.persons.length} 人</span>
            </div>
            <div className="row">
              <span className="text-[length:var(--f-md)] flex-1">往来记录</span>
              <span className="text-[length:var(--f-md)] num font-medium">{db.records.length} 条</span>
            </div>
            <div className="row">
              <span className="w-[15px] text-center text-[length:var(--f-md)] text-in shrink-0">+</span>
              <span className="text-[length:var(--f-md)] flex-1">收礼合计</span>
              <span className="text-[length:var(--f-md)] num font-medium text-in">
                {fmtMoney(totalIn, db.settings.currency)}
              </span>
            </div>
            <div className="row">
              <span className="w-[15px] text-center text-[length:var(--f-md)] text-out shrink-0">−</span>
              <span className="text-[length:var(--f-md)] flex-1">回礼合计</span>
              <span className="text-[length:var(--f-md)] num font-medium text-out">
                {fmtMoney(totalOut, db.settings.currency)}
              </span>
            </div>
            <div className="row">
              <span className="w-[15px] text-center text-[length:var(--f-md)] text-accent shrink-0">
                <BarChart3 size={13} strokeWidth={2} />
              </span>
              <span className="text-[length:var(--f-md)] flex-1">已设提醒</span>
              <span className="text-[length:var(--f-md)] num font-medium">
                {db.records.filter((r) => r.remindAt).length} 场
              </span>
            </div>
          </div>
        </Section>

        {/* 渠道分布 */}
        {!care && channels.length > 0 && (
          <Section title="渠道分布">
            <div className="card p-3 space-y-2">
              {channels.map((c) => (
                <div key={c.channel} className="flex items-center gap-2">
                  <span className="text-[length:var(--f-sm)] text-ink-2 w-14 shrink-0">
                    {CHANNELS.find((x) => x.key === c.channel)?.label ?? c.channel}
                  </span>
                  <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full"
                      style={{ width: `${Math.max(4, (c.amount / maxCh) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[length:var(--f-sm)] num text-ink-3 w-16 text-right shrink-0">
                    {fmtMoney(c.amount, '')}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* 事由分布 */}
        {!care && sortedEvents.length > 0 && (
          <Section title="事由分布">
            <div className="card p-3 space-y-2">
              {sortedEvents.map(([k, n]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="text-[length:var(--f-sm)] text-ink-2 w-10 shrink-0">
                    {lookup(k).label}
                  </span>
                  <div className="flex-1 h-1.5 bg-line rounded-full overflow-hidden">
                    <div
                      className="h-full bg-ink-3 rounded-full"
                      style={{ width: `${(n / maxEv) * 100}%` }}
                    />
                  </div>
                  <span className="text-[length:var(--f-sm)] num text-ink-3 w-8 text-right shrink-0">
                    {n} 次
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* 往来最多 */}
        {!care && topPersons.length > 0 && (
          <Section title="往来最多">
            <div className="card overflow-hidden">
              {topPersons.map((s, i) => (
                <button
                  key={s.person.id}
                  onClick={() => nav('/persons')}
                  className={cn('row w-full text-left', i > 0 && 'border-t border-line')}
                >
                  <span className="text-[length:var(--f-xs)] text-ink-3 w-4 shrink-0 num">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[length:var(--f-md)] truncate">{s.person.name}</div>
                    <div className="text-[length:var(--f-xs)] text-ink-3 num">{s.count} 次往来</div>
                  </div>
                  <span className={cn('text-[length:var(--f-md)] num shrink-0',
                    s.net > 0 ? 'text-in' : s.net < 0 ? 'text-out' : 'text-ink-3')}>
                    {s.net > 0 ? '+' : s.net < 0 ? '−' : ''}{fmtMoney(Math.abs(s.net), '')}
                  </span>
                  <ChevronRight size={14} strokeWidth={1.8} className="text-ink-3 shrink-0" />
                </button>
              ))}
            </div>
          </Section>
        )}
      </div>
    </>
  );
}
