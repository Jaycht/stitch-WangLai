/**
 * 亲缘称呼计算 —— 基于 relationship.js (MIT, (c) HaoLe Zheng)
 *
 * 该库是独立开源项目，按 MIT 协议使用，版权声明见 public/vendor/relationship.min.js 头部。
 * 本文件仅做类型包装与结果分组，不修改其算法。
 *
 * 库有两种调用形态（浏览器实测结论）：
 *   1. 名词短语  r({ text: '外婆的哥哥' })  -> ['舅外公']
 *   2. 问句格式  r('外婆的哥哥是谁')          -> ['舅外公']
 * 名词短语直接传字符串会返回空数组，所以先试问句，再兜底对象形态。
 */

type RelFn = (arg: unknown) => string[];

let fn: RelFn | null = null;
let tried = false;

function load(): RelFn | null {
  if (fn) return fn;
  const w = window as unknown as { relationship?: RelFn };
  if (typeof w.relationship === 'function') {
    fn = w.relationship;
    return fn;
  }
  // 单文件预览版：public/vendor 里的脚本没被原样拷贝进来，
  // 改从构建图里的虚拟模块取（vite.preview.config.ts 提供）。
  // 正式版走 index.html 的 <script> 标签，不会走到这里。
  if (!tried) {
    tried = true;
    // 单文件预览构建里，vendor 源码被内联成 window.__WL_VENDOR__。
    // 正式构建没有这个全局，走 index.html 的 <script> 标签。
    const v = (window as unknown as { __WL_VENDOR__?: RelFn }).__WL_VENDOR__;
    if (typeof v === 'function') {
      w.relationship = v;
      fn = v;
    }
  }
  return fn;
}

/** 给名词短语补后缀，转成库能识别的问句 */
function variants(text: string): string[] {
  return [text, `${text}是谁`, `${text}是什么关系`, `${text}叫什么`];
}

export interface RelResult {
  ok: boolean;
  /** 主称呼，如「舅外公」 */
  text: string;
  /** 同义称呼列表 */
  aliases: string[];
  /** 所属分组 */
  group: '宗亲' | '姑姻' | '舅眷' | '姨姻' | '其它姻亲' | '未归类';
  groupDesc: string;
  message: string;
}

/** 称呼分组规则，参考民间称谓惯例 */
const GROUP_RULES: { name: RelResult['group']; desc: string; test: (t: string) => boolean }[] = [
  { name: '舅眷', desc: '舅舅一脉眷属，含母系血亲与舅妈姻亲。', test: (t) => /舅/.test(t) },
  { name: '姑姻', desc: '姑姑这一支的姻亲，如姑父、姑父家人。', test: (t) => /姑父|姑妈|姑母|姑姑/.test(t) },
  { name: '姨姻', desc: '姨妈这一支的姻亲，如姨父、姨父家人。', test: (t) => /姨父|姨妈|姨母/.test(t) },
  {
    name: '其它姻亲',
    desc: '岳父母、公婆、连襟、妯娌、嫂子、姐夫等。',
    test: (t) => /岳|婆婆|公婆|儿媳|女婿|妻子|丈夫|亲家/.test(t),
  },
  {
    name: '宗亲',
    desc: '同姓本家，父系直系与兄弟后代，血亲同姓。',
    test: (t) => /父|母|祖|爷|奶|哥|姐|弟|妹|叔|伯|堂|侄|子|女|孙|嫂|媳|婿|曾|高|姑婆/.test(t),
  },
];

function classify(text: string): { group: RelResult['group']; desc: string } {
  for (const r of GROUP_RULES) {
    if (r.test(text)) return { group: r.name, desc: r.desc };
  }
  return { group: '未归类', desc: '暂未归入以上分组。' };
}

/** 常见口语别名补充 */
const EXTRA_ALIASES: Record<string, string[]> = {
  父亲: ['爸爸', '爹'],
  母亲: ['妈妈', '娘'],
  祖父: ['爷爷'],
  祖母: ['奶奶'],
  外祖父: ['姥爷', '外公'],
  外祖母: ['姥姥', '外婆'],
  儿子: ['小子'],
  女儿: ['闺女'],
  哥哥: ['哥'],
  弟弟: ['弟'],
  姐姐: ['姐'],
  妹妹: ['妹'],
  伯父: ['大爷', '大伯'],
  叔父: ['叔叔'],
  姑母: ['姑姑', '姑妈'],
  舅父: ['舅舅', '舅爷'],
  姨母: ['姨妈', '阿姨'],
  媳妇: ['老婆'],
};

export function calcRelation(input: string): RelResult {
  const text = input.trim();
  const fail = (message: string): RelResult => ({
    ok: false, text: '', aliases: [], group: '未归类', groupDesc: '', message,
  });

  if (!text) return fail('请输入关系问句，例如「外婆的哥哥」');

  const f = load();
  if (!f) return fail('称呼计算模块未加载，请重新打开应用');

  let names: string[] = [];
  try {
    // 优先按问句试（名词短语直接传字符串会返回空数组）
    for (const q of variants(text)) {
      const r = f(q);
      if (Array.isArray(r) && r.length) {
        names = r.filter((x) => typeof x === 'string' && x.length > 0);
        if (names.length) break;
      }
    }
    // 兜底：对象形态
    if (!names.length) {
      const r = f({ text });
      if (Array.isArray(r)) names = r.filter((x) => typeof x === 'string' && x.length > 0);
    }
  } catch {
    return fail('计算失败，输入格式可能不被支持');
  }

  if (!names.length) return fail('没有找到对应的称呼，换个说法试试');

  const main = names[0];
  const { group, desc } = classify(main);
  const aliases = Array.from(
    new Set([...names.slice(1), ...(EXTRA_ALIASES[main] ?? [])]),
  ).slice(0, 6);

  return { ok: true, text: main, aliases, group, groupDesc: desc, message: '' };
}

/** 供 UI 展示的分组说明 */
export const GROUP_DESC: { name: string; desc: string }[] = [
  { name: '宗亲', desc: '同姓本家，父系直系与兄弟后代，血亲同姓。' },
  { name: '姑姻', desc: '姑姑这一支的姻亲，如姑父、姑父家人。' },
  { name: '舅眷', desc: '舅舅一脉眷属，母系血亲与舅妈姻亲。' },
  { name: '姨姻', desc: '姨妈这一支的姻亲，如姨父、姨父家人。' },
  { name: '其它姻亲', desc: '岳父母、公婆、连襟、妯娌、嫂子、姐夫等。' },
];

/** 示例问句（均已实测可算） */
export const EXAMPLE_QUESTIONS = [
  '外婆的哥哥',
  '爸爸的妈妈',
  '妈妈的姑姑',
  '爸爸的姐姐',
  '哥哥的老婆',
  '姐姐的女儿',
  '爸爸的哥哥的儿子',
  '堂兄',
];
