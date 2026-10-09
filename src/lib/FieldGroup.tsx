/**
 * 表单分组卡片 —— 给「记一笔」面板用。
 *
 * ==================== 为什么要这个 ====================
 *
 * 涛哥看真机截图后指出：「记一笔」14 个字段从上到下平铺，
 * 视觉上很乱；参考「我的」页的设置界面，**每个类别放进一个圆角卡片里**
 * 就整洁得多。
 *
 * 设置页整洁的原因是三层结构：
 *     小节标题（左侧主色竖条）
 *       └─ 圆角卡片（内容）
 *
 * 录入面板原来是平铺的，缺了中间那层卡片，
 * 所有字段糊成一片。现在补上。
 *
 * ==================== 分组依据 ====================
 *
 * 按「一次记账的动作顺序」分，不按字段类型：
 *   1. **记的是谁、记了多少、什么时候** → 这是「记一笔」的核心动作
 *   2. **为什么、在哪、带了什么** → 事由地点是补充信息
 *   3. **对方回了多少** → 独立成组，因为它常为空
 *   4. **事后动作** → 提醒与备注
 *
 * 第3 组单独拆出来的理由：回礼是**可选的**，
 * 大部分时候为空。混在第 1 组里会让那一片显得空旷。
 */

import React from 'react';

export function FieldGroup({
  title, children, className = '', hint,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  /** 标题右侧的补充说明 */
  hint?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-baseline gap-2 mb-1.5">
        <div className="sec-title">{title}</div>
        {hint && (
          <span className="text-[length:var(--f-xs)] text-ink-3 shrink-0">{hint}</span>
        )}
      </div>
      <div className="card p-3 space-y-3">{children}</div>
    </section>
  );
}

/** 组内的一行字段：左标签右控件（窄控件用，如「渠道」） */
export function FieldRow({
  label, children, className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
