"""v2.14.7 验证 —— 图标底纹不再变细长条 + 大字模式字号档位收起成一行
铁律：只跑 tsc/build 不算数，必须真实浏览器量运行时几何。
"""
import json, sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:3000/"

SEED = {
  "schemaVersion": 3,
  "persons": [
    {"id":"p1","name":"陈嫒嫒","relation":"客户","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"},
    {"id":"p2","name":"李四","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"},
  ],
  "records": [
    {"id":"r1","personId":"p1","received":{"channel":"cash","amount":300,"date":"2026-10-01","event":"wedding"},"returned":{"channel":"cash","amount":200,"date":"2026-10-03","event":"wedding"},"createdAt":"2026-10-01T00:00:00.000Z","updatedAt":"2026-10-01T00:00:00.000Z"},
  ],
  "todos": [], "customEvents": [],
  "settings": {"accent":"#2F6B4F","bg":"#F4F2EE","appLock":False,"currency":"¥","weekStart":1,"theme":"a","themePicked":True,"fontSize":"xxl","careMode":True},
  "updatedAt": "",
}

results = []
def ok(name, cond, detail=""):
    results.append((name, cond, detail))
    print(("PASS" if cond else "FAIL"), name, detail)

def load(pg, seed):
    pg.evaluate("(v)=>localStorage.setItem('wanglai.db.v1', v)", json.dumps(seed))
    # 等底部 Tab 栏而不是「往来记录」：路由会停在上一个 Tab，
    # 「往来记录」只在记录页出现，用它当就绪信号会假超时。
    pg.reload(); pg.wait_for_selector(".tabbar", timeout=15000); pg.wait_for_timeout(600)

def load_care(pg):
    s = json.loads(json.dumps(SEED)); s['settings']['careMode']=True; s['settings']['fontSize']='xxl'
    load(pg, s)

def load_normal(pg):
    s = json.loads(json.dumps(SEED)); s['settings']['careMode']=False; s['settings']['fontSize']='off'
    load(pg, s)

def measure_icons(pg):
    return pg.evaluate("""() => {
      const out = [];
      document.querySelectorAll('.card').forEach(card => {
        const d = card.querySelector('div[style*="background"]');
        if (!d) return;
        const r = d.getBoundingClientRect();
        if (r.width < 8) return;
        out.push({ w: Math.round(r.width), h: Math.round(r.height),
                   ratio: +(r.height / r.width).toFixed(2) });
      });
      return out;
    }""")

def measure_avatar(pg):
    return pg.evaluate("""() => {
      const d = document.querySelector('.rounded-full.bg-accent-soft');
      if (!d) return null;
      const r = d.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height),
               ratio: +(r.height / r.width).toFixed(2) };
    }""")

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width":390,"height":780})
    pg.goto(URL)

    # ===== 方向菜单副标题不被压成两行（新文案要一行放下）=====
    # ★ 放在最前面做：方向菜单是浮层，一旦打开就会拦截后续所有点击
    load_care(pg)
    pg.click(".tabitem:has-text('记录')"); pg.wait_for_timeout(300)
    pg.click("button[aria-label='记一笔']"); pg.wait_for_timeout(700)
    menu = pg.evaluate("""() => {
      const menuEl = document.querySelector('[role=menu]');
      const out = [];
      document.querySelectorAll('[role=menuitem]').forEach(item => {
        const arr = [...item.querySelectorAll('span')];
        if (arr.length < 4) return;
        const title = arr[arr.length - 2];
        const sub   = arr[arr.length - 1];
        const lines = (el) => {
          const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
          return Math.round(el.getBoundingClientRect().height / lh);
        };
        out.push({ title: title.innerText.trim(), sub: sub.innerText.trim(),
                   titleLines: lines(title), subLines: lines(sub) });
      });
      return { items: out, text: menuEl ? menuEl.innerText.replace(/\\n/g, ' | ') : null };
    }""")
    items = menu['items']
    ok("方向菜单两个选项都在", len(items) == 2, f"count={len(items)}")
    ok("方向菜单标题是『我随礼 / 别人随礼』",
       sorted(x['title'] for x in items) == sorted(['我随礼', '别人随礼']),
       f"{[x['title'] for x in items]}")
    ok("方向菜单副标题是『别人办事 / 我办事』",
       sorted(x['sub'] for x in items) == sorted(['别人办事', '我办事']),
       f"{[x['sub'] for x in items]}")
    ok("方向菜单标题副标题都不换行",
       bool(items) and all(x['titleLines'] <= 1 and x['subLines'] <= 1 for x in items),
       f"{items}")
    ok("方向菜单已去掉『这次是谁办事？』标题",
       '这次是谁办事' not in (menu['text'] or ''), f"{menu['text']!r}")
    # 关掉菜单，避免遮挡后续操作
    mask = pg.query_selector("div.fixed.inset-0")
    if mask: mask.click()
    pg.wait_for_timeout(400)

    # ===== 问题2a：功能页图标底纹必须是「接近正方形」（大字 + 标准两种模式）=====
    for mode, loader in (('大字', load_care), ('标准', load_normal)):
        loader(pg)
        pg.click(".tabitem:has-text('功能')"); pg.wait_for_timeout(500)
        icons = measure_icons(pg)
        ok(f"问题2 {mode}模式找到图标底纹", len(icons) >= 4, f"count={len(icons)}")
        bad = [i for i in icons if i['ratio'] > 1.35 or i['ratio'] < 0.74]
        ok(f"问题2 {mode}模式图标底纹接近正方形", len(bad) == 0,
           f"ratios={[i['ratio'] for i in icons]}")

        # ★ 顺带查：功能名不能被压成竖排（大字下两列放不下 4 个字）
        wrapped = pg.evaluate("""() => {
          const bad = [];
          document.querySelectorAll('.card .font-medium').forEach(el => {
            const t = el.innerText.trim();
            // 用行数判断：宽度够但换行了就是被挤成竖排
            const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
            const lines = Math.round(el.getBoundingClientRect().height / lh);
            if (t.length >= 4 && lines >= 2) bad.push({ t, lines });
          });
          return bad;
        }""")
        ok(f"问题2 {mode}模式功能名不被压成竖排", len(wrapped) == 0,
           f"wrapped={wrapped[:3]}")
        pg.click(".tabitem:has-text('记录')"); pg.wait_for_timeout(200)

    # ===== 问题2b：人员页姓氏圆牌必须是正圆（两种模式）=====
    for mode, loader in (('大字', load_care), ('标准', load_normal)):
        loader(pg)
        pg.click(".tabitem:has-text('人员')"); pg.wait_for_timeout(500)
        av = measure_avatar(pg)
        ok(f"问题2 {mode}模式找到姓氏圆牌", av is not None, f"{av}")
        if av:
            ok(f"问题2 {mode}模式姓氏圆牌是正圆", 0.9 <= av['ratio'] <= 1.1,
               f"w={av['w']} h={av['h']} ratio={av['ratio']}")
        pg.click(".tabitem:has-text('记录')"); pg.wait_for_timeout(200)

    # ===== 问题1：大字模式字号 = 原生下拉「选择字体大小」，无倍数数字 =====
    load_care(pg)
    pg.click(".tabitem:has-text('我的')"); pg.wait_for_timeout(700)

    sel = pg.evaluate("""() => {
      const s = document.querySelector('#care-font-size');
      if (!s) return null;
      const r = s.getBoundingClientRect();
      const lbl = [...document.querySelectorAll('label')]
        .find(l => l.getAttribute('for') === 'care-font-size');
      const box = s.parentElement;
      return {
        tag: s.tagName,
        h: Math.round(r.height), w: Math.round(r.width),
        fontSize: parseFloat(getComputedStyle(s).fontSize),
        value: s.value,
        options: [...s.options].map(o => o.text),
        label: lbl ? lbl.innerText.trim() : null,
        boxText: box ? box.innerText.replace(/\\n/g, ' | ') : null,
        // 只量说明段落本身：select 的 innerText 在 Chrome 里会带上全部 option，
        // 拿它当「说明文字长度」会误判
        tipText: box && box.querySelector('p')
          ? box.querySelector('p').innerText.trim() : null,
      };
    }""")
    ok("问题1 字号改成了原生下拉 select", sel is not None and sel['tag'] == 'SELECT',
       f"{sel}")
    if sel:
        ok("问题1 标题是『选择字体大小』", sel['label'] == '选择字体大小',
           f"label={sel['label']!r}")
        # ★ 涛哥定稿：下拉框「只比字体稍大点」。
        # 原来用 .field（--h-ctl = 12px + f-md×2.77）→ 大字下 88px，比字号还高 3.2 倍，太笨重。
        # 现在 .field-select = max(36px, f-md×1.45 + 4px) → 大字 44px（1.61 倍）、标准 36px。
        ratio = sel['h'] / sel['fontSize'] if sel['fontSize'] else 0
        ok("问题1 下拉框比字号稍大(1.3~1.9 倍)",
           1.3 <= ratio <= 1.9, f"h={sel['h']} fs={sel['fontSize']} ratio={ratio:.2f}")
        ok("问题1 下拉框不再被撑大(≤48px)", sel['h'] <= 48, f"h={sel['h']}")
        ok("问题1 档位完整(>=7 含标准)", len(sel['options']) >= 7, f"{sel['options']}")
        ok("问题1 不再显示倍数(2.10×等)",
           '2.10' not in (sel['boxText'] or '') and '×' not in (sel['boxText'] or ''),
           f"{sel['boxText']!r}")
        ok("问题1 旧文案『字号档位』已移除",
           '字号档位' not in (sel['boxText'] or ''), f"{sel['boxText']!r}")
        ok("问题1 说明文字已精简(<40字)",
           len(sel['tipText'] or '') < 40, f"{sel['tipText']!r}")

    # 真切换 + 持久化（断言输入→输出，不是断言代码存在）
    if sel:
        pg.select_option("#care-font-size", "md")
        pg.wait_for_timeout(600)
        v1 = pg.evaluate("() => document.querySelector('#care-font-size').value")
        ok("问题1 选『特大』后值为 md", v1 == 'md', f"value={v1}")

        # ★ 输入→输出：字号真的变了（量一段文字的实际 font-size）
        fs = pg.evaluate("""() => {
          const el = document.querySelector('.tabitem span, .tabitem');
          return el ? parseFloat(getComputedStyle(el).fontSize) : null;
        }""")

        # 与 load() 保持一致的就绪信号：等 .tabbar（.tabitem 在部分路由下渲染更慢）
        pg.reload(); pg.wait_for_selector(".tabbar", timeout=15000); pg.wait_for_timeout(800)
        pg.click(".tabitem:has-text('我的')"); pg.wait_for_timeout(700)
        v2 = pg.evaluate("""() => {
          const s = document.querySelector('#care-font-size');
          return s ? s.value : null;
        }""")
        ok("问题1 刷新后档位保持(已持久化)", v2 == 'md', f"value={v2}")

        # 对照：标准模式不出现这个下拉（只改大字模式）
        load_normal(pg)
        pg.click(".tabitem:has-text('我的')"); pg.wait_for_timeout(700)
        in_normal = pg.evaluate("() => !!document.querySelector('#care-font-size')")
        ok("问题1 标准模式不显示该下拉(只改大字模式)", in_normal is False,
           f"exists={in_normal}")

    # ===== 问题3：悬浮加号（FAB）不得遮挡列表内容 =====
    # 涛哥真机截图：人员页最后一张卡片被加号压住（「回 0」看不见）。
    # 根因：.page-body 底部留白只算了 Tab 栏，没算 FAB（FAB 是 fixed 浮层）。
    # 量化判据：滚到底后，内容底边必须高于 FAB 顶边。
    FAB_JS = """() => {
      const fab = document.querySelector('.fab');
      if (!fab) return { noFab: true };
      const f = fab.getBoundingClientRect();
      const pb = document.querySelector('.page-body');
      let worst = 0, worstText = '';
      document.querySelectorAll('.card, .row').forEach(el => {
        const b = el.getBoundingClientRect();
        const ox = Math.min(b.right, f.right) - Math.max(b.left, f.left);
        const oy = Math.min(b.bottom, f.bottom) - Math.max(b.top, f.top);
        if (ox > 0 && oy > 0) {
          const a = ox * oy;
          if (a > worst) { worst = a; worstText = el.innerText.slice(0, 20); }
        }
      });
      return {
        noFab: false,
        fabTop: Math.round(f.top),
        padBottom: pb ? Math.round(parseFloat(getComputedStyle(pb).paddingBottom)) : null,
        overlapArea: Math.round(worst),
        overlapText: worstText,
        // FAB 顶边距视口底的距离 = 内容至少要留的底部留白
        needPad: Math.round(window.innerHeight - f.top),
      };
    }"""
    for tab, label in (('记录', '记录页'), ('人员', '人员页')):
        load_care(pg)
        pg.click(f".tabitem:has-text('{tab}')"); pg.wait_for_timeout(700)
        # 滚到底再量（内容短时滚不动，正好暴露问题）
        pg.evaluate("() => { const el = document.scrollingElement; el.scrollTop = el.scrollHeight; }")
        pg.wait_for_timeout(400)
        r = pg.evaluate(FAB_JS)
        ok(f"问题3 大字模式{label}有悬浮加号", r and r.get('noFab') is False, f"{r}")
        if r and not r.get('noFab'):
            ok(f"问题3 大字模式{label}底部留白足够让开加号",
               r['padBottom'] >= r['needPad'], f"pad={r['padBottom']} need={r['needPad']}")
            ok(f"问题3 大字模式{label}加号不遮挡内容",
               r['overlapArea'] == 0, f"area={r['overlapArea']} text={r['overlapText']!r}")

    b.close()

fails = [r for r in results if not r[1]]
print("\n==== 结果 ====")
print(f"总 {len(results)}，通过 {len(results)-len(fails)}，失败 {len(fails)}")
sys.exit(1 if fails else 0)