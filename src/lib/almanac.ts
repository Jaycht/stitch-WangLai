/**
 * 黄历封装 —— 基于 lunar-javascript (MIT, (c) 6tail)
 *
 * 说明：该库是 6tail 的开源历法库，MIT 协议允许自由使用与再分发，
 * 版权声明保留在 node_modules/lunar-javascript/LICENSE。
 * 本文件是业务层封装，不改动库本身。
 */

import { Solar, Lunar } from 'lunar-javascript';

export interface DayInfo {
  /** 公历 YYYY-MM-DD */
  solar: string;
  /** 农历中文 */
  lunar: string;
  yearGZ: string;
  monthGZ: string;
  dayGZ: string;
  animal: string;
  festivals: string[];
  yi: string[];
  ji: string[];
  naYin: string;
  chong: string;
  sha: string;
  tianShen: string;
  tianShenType: string;
  tianShenLuck: string;
  pengZu: string;
  xiu: string;
  xiuLuck: string;
  taiShen: string;
  jiShen: string;
  xiongSha: string[];
  position: { xi: string; cai: string; fu: string; yangGui: string; yinGui: string };
  hours: { zhi: string; type: string; yi: string[]; ji: string[] }[];
  /** 建除十二神 */
  zhiXing: string;
  /** 星宿歌诀 */
  xiuSong: string;
  /** 九星 */
  nineStar: string;
  /** 胎神方位 */
  taiShenPos: string;
  /** 农历月日中文，如「八月廿六」 */
  lunarMD: string;
}

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

export function toSolarStr(y: number, m: number, d: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${y}-${p(m)}-${p(d)}`;
}

export function parseDate(s: string): { y: number; m: number; d: number } {
  const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
  }
  return { y: +m[1], m: +m[2], d: +m[3] };
}

export function getDay(dateStr: string): DayInfo {
  const { y, m, d } = parseDate(dateStr);
  const solar = Solar.fromYmd(y, m, d);
  const l = solar.getLunar();
  const nine = l.getDayNineStar();

  return {
    solar: toSolarStr(y, m, d),
    lunar: l.toString(),
    yearGZ: l.getYearInGanZhi(),
    monthGZ: l.getMonthInGanZhi(),
    dayGZ: l.getDayInGanZhi(),
    animal: l.getYearShengXiao(),
    festivals: [...l.getFestivals(), ...l.getOtherFestivals()],
    yi: l.getDayYi(),
    ji: l.getDayJi(),
    naYin: l.getDayNaYin(),
    chong: l.getDayChongShengXiao(),
    sha: l.getDaySha(),
    tianShen: l.getDayTianShen(),
    tianShenType: l.getDayTianShenType(),
    tianShenLuck: l.getDayTianShenLuck(),
    pengZu: `${l.getPengZuGan()}；${l.getPengZuZhi()}`,
    xiu: l.getXiu(),
    xiuLuck: l.getXiuLuck(),
    xiuSong: l.getXiuSong(),
    taiShen: l.getDayPositionTai(),
    jiShen: l.getDayJiShen().slice(0, 6).join('、'),
    xiongSha: l.getDayXiongSha().slice(0, 5),
    position: {
      xi: l.getDayPositionXiDesc(),
      cai: l.getDayPositionCaiDesc(),
      fu: l.getDayPositionFuDesc(),
      yangGui: l.getDayPositionYangGuiDesc(),
      yinGui: l.getDayPositionYinGuiDesc(),
    },
    hours: l.getTimes().map((t) => ({
      zhi: t.getGanZhi(),
      type: t.getTianShenType(),
      yi: t.getYi().slice(0, 3),
      ji: t.getJi().slice(0, 2),
    })),
    zhiXing: l.getZhiXing(),
    nineStar: nine ? `${nine.getNameInXuanKong()}·${nine.getNumber()}` : '',
    taiShenPos: l.getDayPositionTai(),
    lunarMD: l.getMonthInChinese() + l.getDayInChinese(),
  };
}

/** 某月的日历网格（补齐前后空位，周起始可配置） */
export interface CalCell {
  date: string;
  day: number;
  inMonth: boolean;
  lunarText: string;
  isToday: boolean;
  yiTop: string[];
  festival?: string;
}

export function monthGrid(year: number, month: number, weekStart: 0 | 1 = 1): CalCell[] {
  const first = new Date(year, month - 1, 1);
  const lead = first.getDay();               // 0=周日
  const pad = (lead - weekStart + 7) % 7;
  const total = new Date(year, month, 0).getDate();
  const prevTotal = new Date(year, month - 1, 0).getDate();
  const today = toSolarStr(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  const cells: CalCell[] = [];

  const push = (dt: Date, inMonth: boolean) => {
    const s = toSolarStr(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    let lunarText: string;
    let yiTop: string[] = [];
    try {
      const l = Solar.fromYmd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()).getLunar();
      lunarText = l.getDayInChinese() === '初一'
        ? l.getMonthInChinese()
        : l.getDayInChinese();
      yiTop = l.getDayYi().slice(0, 2);
    } catch { lunarText = ''; }
    cells.push({ date: s, day: dt.getDate(), inMonth, lunarText, isToday: s === today, yiTop });
  };

  for (let i = pad - 1; i >= 0; i--) {
    push(new Date(year, month - 1, 1 - i), false);
  }
  for (let d = 1; d <= total; d++) {
    push(new Date(year, month - 1, d), true);
  }
  let tail = 0;
  while (cells.length % 7 !== 0 || tail < pad) {
    tail++;
    push(new Date(year, month, tail), false);
  }
  return cells;
}

export const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

/* ---------------- 择日 ---------------- */

/** 常用事项的宜忌关键词 */
export const LUCKY_TOPICS: { key: string; label: string; yi: string[]; ji: string[] }[] = [
  { key: 'wedding', label: '嫁娶', yi: ['嫁娶', '纳采', '订盟'], ji: ['破土', '安葬'] },
  { key: 'betrothal', label: '订婚', yi: ['订盟', '纳采'], ji: ['词讼'] },
  { key: 'moving', label: '入宅', yi: ['入宅', '移徙', '安床'], ji: ['破土', '重日'] },
  { key: 'opening', label: '开业', yi: ['开市', '交易', '立券', '开光'], ji: ['破土', '安葬'] },
  { key: 'travel', label: '出行', yi: ['出行', '旅游'], ji: ['忌安葬', '大葬'] },
  { key: 'funeral', label: '安葬', yi: ['安葬', '祭祀'], ji: ['动土', '破土'] },
  { key: 'solar', label: '动土', yi: ['动土', '破土', '筑基'], ji: ['冲动物'] },
  { key: 'study', label: '入学', yi: ['入学', '开笔'], ji: ['忌安葬'] },
];

export interface LuckyResult {
  date: string;
  lunarMD: string;
  score: number;      // 匹配度 0~100
  hits: string[];     // 命中的宜项
  misses: string[];   // 命中的忌项
  yiCount: number;
  verdict: string;
}

/** 在日期区间内为某事项挑吉日 */
export function findLuckyDays(
  from: string, days: number, topicKey: string,
): LuckyResult[] {
  const topic = LUCKY_TOPICS.find((t) => t.key === topicKey) ?? LUCKY_TOPICS[0];
  const start = parseDate(from);
  const out: LuckyResult[] = [];
  for (let i = 0; i < days; i++) {
    const dt = new Date(start.y, start.m - 1, start.d + i);
    const s = toSolarStr(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    let info: DayInfo;
    try { info = getDay(s); } catch { continue; }
    const hits = topic.yi.filter((k) => info.yi.includes(k));
    const misses = topic.ji.filter((k) => info.ji.includes(k));
    // 基准分：宜的数量越多越好，忌命中直接扣
    const base = Math.min(40, info.yi.length * 4);
    const hitScore = hits.length * 25;
    const missPenalty = misses.length * 35;
    const typeBonus = info.tianShenType === '黄道' ? 8 : 0;
    const score = Math.max(0, Math.min(100, base + hitScore - missPenalty + typeBonus));
    out.push({
      date: s,
      lunarMD: info.lunarMD,
      score,
      hits,
      misses,
      yiCount: info.yi.length,
      verdict: score >= 70 ? '大吉' : score >= 50 ? '宜' : score >= 30 ? '勉强' : '不宜',
    });
  }
  return out;
}

/* ---------------- 太岁 ---------------- */

export interface TaiSuiInfo {
  year: number;
  /** 干支纪年 */
  gz: string;
  /** 生肖 */
  animal: string;
  /** 太岁方为 */
  position: string;
  /** 太岁年支 */
  taiSuiAnimal: string;
  /** 犯太岁的生肖（值年相冲） */
  clashAnimals: string[];
  /** 宜 */
  yi: string[];
  /** 忌 */
  ji: string[];
  /** 平安符方向 */
  pingAn: string;
}

const ANIMALS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

/** 太岁方位常量 */
const TAI_SUI_POS: Record<string, string> = {
  子: '正北', 丑: '东北', 寅: '东北', 卯: '正东', 辰: '东南', 巳: '东南',
  午: '正南', 未: '西南', 申: '西南', 酉: '正西', 戌: '西北', 亥: '西北',
};

export function getTaiSui(year?: number): TaiSuiInfo {
  const y = year ?? new Date().getFullYear();
  const solar = Solar.fromYmd(y, 6, 1);      // 农历年切换点在立春，取6月确保已过年
  const l = solar.getLunar();
  const gz = l.getYearInGanZhi();
  const zhi = gz[1];
  const animal = l.getYearShengXiao();
  // 值年支即太岁生肖；正对冲生肖为犯太岁
  const idx = ANIMALS.indexOf(animal);
  const clashIdx = (idx + 6) % 12;
  const pingAnIdx = (idx + 8) % 12;
  return {
    year: y,
    gz,
    animal,
    position: TAI_SUI_POS[zhi] ?? '东南',
    taiSuiAnimal: animal,
    clashAnimals: [ANIMALS[clashIdx]],
    // 年运吉凶没有直接 API，用值日黄道吉凶近似
    yi: [],
    ji: [],
    pingAn: TAI_SUI_POS[ANIMALS[pingAnIdx]] ?? '正南',
  };
}

export const ALL_ANIMALS = ANIMALS;
export const WEEK_CN_LIST = WEEK_CN;
export { Lunar };
