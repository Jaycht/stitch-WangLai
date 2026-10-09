/** 亲缘称呼计算 —— 基于 relationship.js (MIT) */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { calcRelation, RelResult, GROUP_DESC, EXAMPLE_QUESTIONS } from '../lib/relation';
import { TopBar, Section } from '../lib/ui';
import { cn } from '../lib/utils';

export function RelationPage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<RelResult | null>(null);
  const [open, setOpen] = useState(true);

  const run = (text: string) => {
    setQ(text);
    setRes(calcRelation(text));
    setOpen(true);
  };

  return (
    <>
      <TopBar title="关系计算" sub="亲缘称呼速查" onBack={() => nav(-1)} />

      <div className="page-body space-y-3">
        <div className="card p-3">
          <label className="label">输入关系问句</label>
          <div className="flex gap-2">
            <input
              className="field flex-1"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run(q)}
              placeholder="外婆的哥哥"
            />
            <button className="btn-icon" onClick={() => run(q)} aria-label="计算">
              {/* ★ v2.14.9（涛哥截图：放大镜太小不美观）：
                  原来写死 size={15}，输入框是随字号长高的，图标却永远 15px，
                  越是大字越显得空。改成跟着字号走（标准约 19px、大字约 27px）。
                  lucide 的 svg 自带 width/height 属性，CSS 类优先级更高，能覆盖掉。 */}
              <Search
                strokeWidth={2}
                className="w-[calc(var(--f-md)*1.5)] h-[calc(var(--f-md)*1.5)]"
              />
            </button>
          </div>
          {/* 快捷问句
              ★ v2.14.9（涛哥截图：右侧留白、和上方搜索按钮不对齐）：
              原来是 flex-wrap，每个 pill 的宽度由文字长短决定，
              行末自然对不齐，右边空出一条 —— 看着像没做完。
              改成**两列等宽网格**：每格等宽、铺满整行，右边缘与上方
              搜索按钮严格对齐。大字模式下 care-grid-2 会自动转单列，
              否则 8 个字的问句在大字号下放不进半屏。 */}
          <div className="grid grid-cols-2 gap-2 mt-2 care-grid-2">
            {EXAMPLE_QUESTIONS.map((s) => (
              <button key={s} onClick={() => run(s)} className="pill w-full">
                {s}
              </button>
            ))}
          </div>
        </div>

        {res && (
          <div className="card px-3.5 py-4">
            {res.ok ? (
              <>
                <div className="text-[length:var(--f-xs)] text-ink-3 mb-1">计算结果</div>
                <div className="text-[length:var(--f-num)] font-bold leading-tight text-accent">
                  {res.text}
                </div>
                {res.aliases.length > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-line">
                    <div className="text-[length:var(--f-xs)] text-ink-3 mb-1">也称</div>
                    <div className="flex flex-wrap gap-1.5">
                      {res.aliases.map((a) => (
                        <span key={a} className="tagx bg-line/60 text-ink-2">{a}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-2.5 pt-2.5 border-t border-line">
                  <div className="text-[length:var(--f-xs)] text-ink-3 mb-1">所属分组</div>
                  <div className="text-[length:var(--f-md)] text-ink-2">
                    <span className="text-accent font-medium">{res.group}</span>
                    <span className="text-ink-3"> · {res.groupDesc}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-3">
                <div className="text-[length:var(--f-md)] text-ink-2">{res.message}</div>
                <div className="text-[length:var(--f-sm)] text-ink-3 mt-1">
                  试试「爸爸的妈妈」「妈妈的哥哥」这类问法
                </div>
              </div>
            )}
          </div>
        )}

        <Section title="称呼分组说明">
          <div className="card overflow-hidden">
            {GROUP_DESC.map((g, i) => (
              <div key={g.name} className={cn('px-3 py-2.5', i > 0 && 'border-t border-line')}>
                <div className="text-[length:var(--f-md)] font-medium">{g.name}</div>
                <div className="text-[length:var(--f-sm)] text-ink-3 mt-0.5 leading-relaxed">{g.desc}</div>
              </div>
            ))}
          </div>
        </Section>

        <p className="text-[length:var(--f-xs)] text-ink-3/70 text-center leading-relaxed pt-1">
          称呼计算由 relationship.js 提供（MIT 协议开源库，作者 HaoLe Zheng）<br />
          各地区称谓习惯不同，结果供参考
        </p>
      </div>
    </>
  );
}

export default RelationPage;
