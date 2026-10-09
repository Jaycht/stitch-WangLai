"""v2.14.8 验证 —— 大字模式人员页卡片只留「姓名 + 金额」

铁律：只跑 tsc/build 不算数，必须真实浏览器量运行时几何 + 看截图。
断言的是「输入→输出」：喂进大字模式种子，量出每行实际渲染几行文字、
文本里有没有「次 · 收 X · 回 Y」「人家多给」这些被砍掉的东西。
同时跑标准模式做回归，确认没把标准模式一起砍坏。
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _seed import with_settings  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://127.0.0.1:3000/"
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')
os.makedirs(SHOTS, exist_ok=True)

results = []
def ok(name, cond, detail=""):
    results.append((name, cond, detail))
    print(("PASS" if cond else "FAIL"), name, detail)


def load(pg, seed):
    pg.evaluate("(v)=>localStorage.setItem('wanglai.db.v1', v)", json.dumps(seed))
    # 就绪信号用 .tabbar 而不是页面文字：路由会停在上一个 Tab，用文字会假超时
    pg.reload()
    pg.wait_for_selector(".tabbar", timeout=15000)
    pg.wait_for_timeout(600)


def load_care(pg):
    load(pg, with_settings(careMode=True, fontSize='xxl'))


def load_normal(pg):
    load(pg, with_settings(careMode=False, fontSize='off'))


def goto_persons(pg):
    pg.click(".tabitem:has-text('人员')")
    pg.wait_for_timeout(700)


# 量每一行：左列（姓名区）/ 右列（金额区）各自渲染了几「视觉行」，
# 以及它们实际显示出来的文字。视觉行 = 该列内不同 top 的叶子文本元素个数。
ROWS_JS = """() => {
  const lines = (root) => {
    const tops = new Set();
    root.querySelectorAll('*').forEach(el => {
      // 只看真正带文字的叶子元素，避免把容器也算一行
      if (el.children.length > 0) return;
      const t = (el.innerText || '').trim();
      if (!t) return;
      tops.add(Math.round(el.getBoundingClientRect().top / 4));
    });
    return tops.size;
  };
  const out = [];
  document.querySelectorAll('.row').forEach(row => {
    const left  = row.querySelector('.flex-1');
    const right = row.querySelector('.text-right');
    if (!left) return;
    out.push({
      leftText:  (left.innerText  || '').trim(),
      rightText: right ? (right.innerText || '').trim() : '',
      leftLines:  lines(left),
      rightLines: right ? lines(right) : 0,
      leftFS:  Math.round(parseFloat(getComputedStyle(left.querySelector('span') || left).fontSize)),
      avatars: row.querySelectorAll('.rounded-full.bg-accent-soft').length,
      tags:    row.querySelectorAll('.tagx').length,
    });
  });
  return {
    rows: out,
    avatars: document.querySelectorAll('.row .rounded-full.bg-accent-soft').length,
    tags:    document.querySelectorAll('.row .tagx').length,
    sub:     (() => {
      const bar = document.querySelector('.topbar');
      if (!bar) return null;
      const arr = bar.innerText.split('\\n').map(s => s.trim()).filter(Boolean);
      return arr.length >= 2 ? arr[1] : null;
    })(),
  };
}"""

TIP_JS = """() => {
  const el = document.querySelector('[role=note]');
  return el ? el.innerText.replace(/\\n/g, ' | ') : null;
}"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 390, "height": 780})
    pg.goto(URL)

    # ================= 大字模式：卡片只留姓名 + 金额 =================
    load_care(pg)
    goto_persons(pg)
    d = pg.evaluate(ROWS_JS)
    rows = d['rows']
    pg.screenshot(path=os.path.join(SHOTS, '29_persons_care_v2148.png'), full_page=True)

    ok("大字模式人员列表有数据行", len(rows) >= 3, f"count={len(rows)}")
    ok("大字模式左列只有 1 行（无『N 次 · 收 X · 回 Y』副行）",
       bool(rows) and all(r['leftLines'] == 1 for r in rows),
       f"{[(r['leftText'], r['leftLines']) for r in rows]}")
    ok("大字模式右列只有 1 行（无『人家多给/我多随/两清』副行）",
       bool(rows) and all(r['rightLines'] <= 1 for r in rows),
       f"{[(r['rightText'], r['rightLines']) for r in rows]}")

    alltxt = " | ".join(r['leftText'] + ' ~ ' + r['rightText'] for r in rows)
    for banned, why in [
        ('次 · 收', '往来次数与收/回小计'),
        ('人家多给', '净值方向词'),
        ('我多随', '净值方向词'),
        ('两清', '净值方向词'),
        ('暂无往来记录', '空态副行'),
    ]:
        ok(f"大字模式已隐藏「{banned}」（{why}）", banned not in alltxt, f"{alltxt[:160]}")

    ok("大字模式不再画姓氏圆牌", d['avatars'] == 0, f"avatars={d['avatars']}")
    ok("大字模式不再画关系/同名标签", d['tags'] == 0, f"tags={d['tags']}")

    # 姓名还在（含同名区分后缀），金额还在 —— 砍的是装饰不是信息
    ok("大字模式姓名仍在（含同名区分后缀）",
       bool(rows) and all(r['leftText'] for r in rows)
       and any('张三' in r['leftText'] for r in rows),
       f"{[r['leftText'] for r in rows]}")
    ok("大字模式金额仍在（带正负号的数字）",
       bool(rows) and all(
           any(ch.isdigit() for ch in r['rightText']) for r in rows
       ),
       f"{[r['rightText'] for r in rows]}")

    # 字号不能因为精简而变小（老人就是要大）
    ok("大字模式姓名字号 ≥ 20px",
       bool(rows) and all(r['leftFS'] >= 20 for r in rows),
       f"{[r['leftFS'] for r in rows]}")

    ok("大字模式顶栏副标题简化为「共 N 人」",
       d['sub'] is not None and d['sub'].startswith('共') and '有往来' not in d['sub'],
       f"sub={d['sub']!r}")

    # 首次提示条：大字模式下不能再说「顶部有全选」（那个入口已藏）
    tip = pg.evaluate(TIP_JS)
    ok("大字模式首屏能看到操作提示条", tip is not None, f"{tip!r}")
    ok("大字模式提示条不再提「全选」（该入口在大字模式下已隐藏）",
       tip is not None and '全选' not in tip, f"{tip!r}")
    # ★ 不能用「按 \n 拆开的句子都很短」来判断不折行 —— 折行本身就会往
    #   innerText 里插 \n，越折越「短」，这种断言只会骗自己。量真实行数。
    tiplines = pg.evaluate("""() => {
      const note = document.querySelector('[role=note]');
      if (!note) return null;
      const box = note.querySelector('.flex-1');
      return [...box.children].map(el => {
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
        return { t: el.innerText.replace(/\\n/g, '⏎').trim(),
                 lines: Math.round(el.getBoundingClientRect().height / lh) };
      });
    }""")
    ok("大字模式提示条每句都只占一行（不折行）",
       bool(tiplines) and all(r['lines'] <= 1 for r in tiplines), f"{tiplines}")
    ok("大字模式提示条已精简（去掉滑动/返回键长解释）",
       tip is not None and '滑动列表' not in tip and '返回键' not in tip, f"{tip!r}")
    ok("大字模式提示条保留『短按/长按』两句核心说明",
       tip is not None and '短按' in tip and '长按' in tip, f"{tip!r}")

    # 功能不能砍坏：点进去还能看全部档案
    # ★ 不能用 pg.click()：Playwright 的 down→up 间隔 < 50ms，
    #   会被 useLongPress 的 CLICK_MIN_MS(50ms) 门槛当成误触丢弃 → 假阴性。
    #   真人手指一次点按约 80~150ms，所以这里手动按下 150ms 再抬起，模拟真输入。
    def human_tap(selector, idx=0):
        el = pg.query_selector_all(selector)[idx]
        box = el.bounding_box()
        pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        pg.mouse.down()
        pg.wait_for_timeout(150)
        pg.mouse.up()

    human_tap(".row")
    pg.wait_for_timeout(800)
    detail = pg.evaluate("""() => {
      const s = document.querySelector('.sheet, [role=dialog]');
      return s ? s.innerText.replace(/\\n/g, ' | ').slice(0, 200) : null;
    }""")
    ok("大字模式点一下仍能进详情（功能未砍坏）",
       detail is not None and ('收礼' in detail or '净值' in detail),
       f"{detail!r}")
    pg.screenshot(path=os.path.join(SHOTS, '30_persons_care_detail_v2148.png'))
    # 关掉详情
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(300)
    mask = pg.query_selector("div.fixed.inset-0")
    if mask:
        mask.click()
    pg.wait_for_timeout(300)

    # ================= 标准模式回归：一样都不能少 =================
    load_normal(pg)
    # 提示条每个 key 只出一次，重进页面前清掉标记才能再看到
    pg.evaluate("() => localStorage.removeItem('wanglai.tips.longpress.v2.persons')")
    pg.click(".tabitem:has-text('记录')")
    pg.wait_for_timeout(300)
    goto_persons(pg)
    tipn = pg.evaluate(TIP_JS)
    ok("标准模式提示条保留完整说明（含「全选」）",
       tipn is not None and '全选' in tipn, f"{tipn!r}")
    n = pg.evaluate(ROWS_JS)
    nrows = n['rows']
    pg.screenshot(path=os.path.join(SHOTS, '31_persons_normal_v2148.png'), full_page=True)

    ok("标准模式仍有数据行", len(nrows) >= 3, f"count={len(nrows)}")
    ok("标准模式保留『N 次 · 收 X · 回 Y』副行",
       any('次 · 收' in r['leftText'] for r in nrows),
       f"{[r['leftText'] for r in nrows][:2]}")
    ok("标准模式保留净值方向词",
       any(any(w in r['rightText'] for w in ('人家多给', '我多随', '两清')) for r in nrows),
       f"{[r['rightText'] for r in nrows][:2]}")
    ok("标准模式保留姓氏圆牌", n['avatars'] >= 3, f"avatars={n['avatars']}")
    ok("标准模式保留关系/同名标签", n['tags'] >= 1, f"tags={n['tags']}")

    av = pg.evaluate("""() => {
      const d = document.querySelector('.row .rounded-full.bg-accent-soft');
      if (!d) return null;
      const r = d.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height),
               ratio: +(r.height / r.width).toFixed(2) };
    }""")
    ok("标准模式姓氏圆牌仍是正圆", av is not None and 0.9 <= av['ratio'] <= 1.1, f"{av}")
    ok("标准模式顶栏副标题仍是「N 人 · 有往来 M 人」",
       n['sub'] is not None and '有往来' in n['sub'], f"sub={n['sub']!r}")

    # ================= 悬浮加号不遮挡（回归） =================
    load_care(pg)
    goto_persons(pg)
    pg.evaluate("() => { const el = document.scrollingElement; el.scrollTop = el.scrollHeight; }")
    pg.wait_for_timeout(400)
    fab = pg.evaluate("""() => {
      const f = document.querySelector('.fab');
      if (!f) return null;
      const fr = f.getBoundingClientRect();
      let worst = 0, worstText = '';
      document.querySelectorAll('.card, .row').forEach(el => {
        const b = el.getBoundingClientRect();
        const ox = Math.min(b.right, fr.right) - Math.max(b.left, fr.left);
        const oy = Math.min(b.bottom, fr.bottom) - Math.max(b.top, fr.top);
        if (ox > 0 && oy > 0 && ox * oy > worst) {
          worst = ox * oy; worstText = el.innerText.slice(0, 20);
        }
      });
      return { area: Math.round(worst), text: worstText };
    }""")
    ok("大字模式人员页加号仍不遮挡内容",
       fab is not None and fab['area'] == 0, f"{fab}")
    pg.screenshot(path=os.path.join(SHOTS, '32_persons_care_bottom_v2148.png'))

    b.close()

fails = [r for r in results if not r[1]]
print("\n==== 结果 ====")
print(f"总 {len(results)}，通过 {len(results)-len(fails)}，失败 {len(fails)}")
for name, _, detail in fails:
    print("  ✗", name, detail)
sys.exit(1 if fails else 0)
