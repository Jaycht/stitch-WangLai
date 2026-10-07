/**
 * 底部 Tab 图标 —— 自绘 SVG，不走图标库。
 *
 * 为什么不用 lucide 的线性图标：
 * - 线性图标太「平」，4 个灰线框并排没有主次，视觉上糊成一片
 * - 记账是长期高频操作，图标应该有一点「实体感」才显得稳
 *
 * 设计要点：
 * 1. **统一画布 24×24**，但图形本身占 18~20px，四周留白一致
 * 2. **两套状态**：未选中是「单色描边 + 淡填充」，选中是「实心填充 + 高光」
 * 3. **高光**统一放在左上（光源在左上，符合直觉）
 * 4. 选中时图标**微放大 1.08×**并加底部投影，给出「按下去」的实体反馈
 */

interface IconProps {
  /** 是否选中 */
  active?: boolean;
  /** 主题色，缺省读CSS 变量 */
  color?: string;
}

type IconFC = (p: IconProps) => React.ReactElement;

/* ---------- 记录：账本 ---------- */

const IconRecords: IconFC = ({ active, color }) => (
  <svg viewBox="0 0 24 24" fill="none" style={{ color }}>
    {/* 书本主体 */}
    <path
      d="M5 4.2c0-.66.54-1.2 1.2-1.2H11c1.1 0 2 .9 2 2v13.6c0-.66-.54-1.2-1.2-1.2H6.2c-.66 0-1.2.54-1.2 1.2V4.2Z"
      fill={active ? 'currentColor' : 'currentColor'}
      fillOpacity={active ? 0.16 : 0.07}
    />
    <path
      d="M5 4.2c0-.66.54-1.2 1.2-1.2H11c1.1 0 2 .9 2 2v13.6c0-.66-.54-1.2-1.2-1.2H6.2c-.66 0-1.2.54-1.2 1.2V4.2Z"
      stroke="currentColor"
      strokeWidth={active ? 1.9 : 1.5}
      strokeLinejoin="round"
    />
    {/* 右侧对称页 */}
    <path
      d="M19 4.2c0-.66-.54-1.2-1.2-1.2H13c-1.1 0-2 .9-2 2v13.6c0-.66.54-1.2 1.2-1.2h4.6c.66 0 1.2.54 1.2 1.2V4.2Z"
      fill="currentColor"
      fillOpacity={active ? 0.16 : 0.07}
    />
    <path
      d="M19 4.2c0-.66-.54-1.2-1.2-1.2H13c-1.1 0-2 .9-2 2v13.6c0-.66.54-1.2 1.2-1.2h4.6c.66 0 1.2.54 1.2 1.2V4.2Z"
      stroke="currentColor"
      strokeWidth={active ? 1.9 : 1.5}
      strokeLinejoin="round"
    />
    {/* 装订线 */}
    <path
      d="M12 6.4v13"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.6}
      strokeLinecap="round"
    />
    {/* 左上高光 */}
    {active && (
      <path
        d="M6.6 4.6h3.6"
        stroke="#fff"
        strokeOpacity={0.85}
        strokeWidth={1.1}
        strokeLinecap="round"
      />
    )}
    {/* 金额条目 */}
    <path d="M7.6 9.4h2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={active ? 0.95 : 0.5} />
    <path d="M7.6 12.4h2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={active ? 0.95 : 0.5} />
    <path d="M14.6 9.4h2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={active ? 0.95 : 0.5} />
  </svg>
);

/* ---------- 人员：双人剪影 ---------- */

const IconPersons: IconFC = ({ active, color }) => (
  <svg viewBox="0 0 24 24" fill="none" style={{ color }}>
    {/* 后方的人（错位，营造层次） */}
    <circle
      cx="15.4" cy="8.4" r="2.9"
      fill="currentColor" fillOpacity={active ? 0.14 : 0.06}
    />
    <circle cx="15.4" cy="8.4" r="2.9" stroke="currentColor" strokeWidth={active ? 1.8 : 1.45} />
    <path
      d="M10.9 19.4c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5"
      fill="currentColor" fillOpacity={active ? 0.14 : 0.06}
    />
    <path
      d="M10.9 19.4c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5"
      stroke="currentColor" strokeWidth={active ? 1.8 : 1.45} strokeLinecap="round"
    />
    {/* 前方的人（主角，不描边只填充 → 主次分明） */}
    <circle
      cx="8.6" cy="8.9" r="3.4"
      fill="currentColor" fillOpacity={active ? 0.26 : 0.1}
    />
    <circle cx="8.6" cy="8.9" r="3.4" stroke="currentColor" strokeWidth={active ? 1.9 : 1.55} />
    <path
      d="M3.4 19.6c0-2.9 2.3-5.2 5.2-5.2s5.2 2.3 5.2 5.2"
      fill="currentColor" fillOpacity={active ? 0.26 : 0.1}
    />
    <path
      d="M3.4 19.6c0-2.9 2.3-5.2 5.2-5.2s5.2 2.3 5.2 5.2"
      stroke="currentColor" strokeWidth={active ? 1.9 : 1.55} strokeLinecap="round"
    />
    {/* 头顶高光 */}
    {active && (
      <circle cx="7.2" cy="7.5" r="1.05" fill="#fff" fillOpacity={0.72} />
    )}
  </svg>
);

/* ---------- 功能：工具盒 ---------- */

const IconFunctions: IconFC = ({ active, color }) => (
  <svg viewBox="0 0 24 24" fill="none" style={{ color }}>
    {/* 盒体 */}
    <rect
      x="3.4" y="7.2" width="17.2" height="12.2" rx="2.6"
      fill="currentColor" fillOpacity={active ? 0.16 : 0.07}
    />
    <rect
      x="3.4" y="7.2" width="17.2" height="12.2" rx="2.6"
      stroke="currentColor" strokeWidth={active ? 1.9 : 1.5}
    />
    {/* 盒盖 */}
    <path
      d="M2.6 7.2h18.8"
      stroke="currentColor" strokeWidth={active ? 2.1 : 1.7} strokeLinecap="round"
    />
    {/* 提手 */}
    <path
      d="M9 7.2V5.9c0-.8.7-1.5 1.5-1.5h3c.8 0 1.5.7 1.5 1.5v1.3"
      stroke="currentColor" strokeWidth={active ? 1.9 : 1.5}
      strokeLinecap="round"
      fill="none"
    />
    {/* 锁扣 */}
    <rect
      x="10.6" y="10.6" width="2.8" height="2.6" rx="1"
      fill={active ? 'currentColor' : 'none'}
      fillOpacity={active ? 0.9 : 0}
      stroke="currentColor" strokeWidth={active ? 1.4 : 1.35}
    />
    {/* 内部分隔（工具格） */}
    <path d="M12 13.2v3" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" opacity={active ? 0.7 : 0.38} />
    {/* 盖面高光 */}
    {active && (
      <path d="M6.4 5.9h6" stroke="#fff" strokeOpacity={0.75} strokeWidth={1.05} strokeLinecap="round" />
    )}
  </svg>
);

/* ---------- 我的：名片 ---------- */

const IconMine: IconFC = ({ active, color }) => (
  <svg viewBox="0 0 24 24" fill="none" style={{ color }}>
    {/* 卡面 */}
    <rect
      x="2.9" y="5.1" width="18.2" height="13.8" rx="2.8"
      fill="currentColor" fillOpacity={active ? 0.16 : 0.07}
    />
    <rect
      x="2.9" y="5.1" width="18.2" height="13.8" rx="2.8"
      stroke="currentColor" strokeWidth={active ? 1.9 : 1.5}
    />
    {/* 头像 */}
    <circle
      cx="8.5" cy="10.6" r="2.6"
      fill="currentColor" fillOpacity={active ? 0.3 : 0.12}
    />
    <circle cx="8.5" cy="10.6" r="2.6" stroke="currentColor" strokeWidth={active ? 1.75 : 1.4} />
    <path
      d="M4.9 16.6c0-2 1.6-3.5 3.6-3.5s3.6 1.5 3.6 3.5"
      fill="currentColor" fillOpacity={active ? 0.3 : 0.12}
    />
    <path
      d="M4.9 16.6c0-2 1.6-3.5 3.6-3.5s3.6 1.5 3.6 3.5"
      stroke="currentColor" strokeWidth={active ? 1.75 : 1.4} strokeLinecap="round"
    />
    {/* 信息行 */}
    <path
      d="M14.6 9.6h4M14.6 12.6h3"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"
      opacity={active ? 0.9 : 0.45}
    />
    {/* 卡面高光斜切 */}
    {active && (
      <path
        d="M4.6 7.2h6.4"
        stroke="#fff" strokeOpacity={0.8}
        strokeWidth={1.15} strokeLinecap="round"
      />
    )}
  </svg>
);

/* ---------- 导出 ---------- */

export const TAB_ICONS: { key: string; label: string; Icon: IconFC }[] = [
  { key: '/', label: '记录', Icon: IconRecords },
  { key: '/persons', label: '人员', Icon: IconPersons },
  { key: '/functions', label: '功能', Icon: IconFunctions },
  { key: '/settings', label: '我的', Icon: IconMine },
];