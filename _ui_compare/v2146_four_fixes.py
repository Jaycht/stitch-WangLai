"""v2.14.6 运行时验证 —— 4 个真机问题（涛哥截图反馈）+ 新录入模型
铁律：只跑 tsc/build 不算数，必须真实浏览器量运行时行为。
"""
import json, sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:3000/"

SEED = {
  "schemaVersion": 3,
  "persons": [
    {"id":"p1","name":"陈作花","relation":"同事","region":"南麻","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"},
    {"id":"p2","name":"白雨萌","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"},
    {"id":"p3","name":"王鹏","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"},
  ],
  "records": [
    {"id":"r1","personId":"p1","received":{"channel":"cash","amount":0,"date":"2026-10-09","event":"funeral"},"returned":{"channel":"cash","amount":100,"date":"2026-08-03","event":"funeral"},"createdAt":"2026-10-09T00:00:00.000Z","updatedAt":"2026-10-09T00:00:00.000Z"},
    {"id":"r2","personId":"p2","received":{"channel":"cash","amount":0,"date":"2026-10-09","event":"school"},"returned":{"channel":"cash","amount":200,"date":"2026-08-03","event":"school"},"createdAt":"2026-10-09T00:00:00.000Z","updatedAt":"2026-10-09T00:00:00.000Z"},
  ],
  "todos": [],
  "customEvents": [],
  "settings": {"accent":"#2F6B4F","bg":"#F4F2EE","appLock":False,"currency":"¥","weekStart":1,"theme":"a","themePicked":True,"fontSize":"off","careMode":False},
  "updatedAt": "",
}

results = []
def ok(name, cond, detail=""):
    results.append((name, cond, detail))
    print(("PASS" if cond else "FAIL"), name, detail)

def close_sheet(pg):
    x = pg.query_selector("button[aria-label='关闭']")
    if x: x.click()
    pg.wait_for_timeout(350)

def seed_care(pg):
    s = json.loads(json.dumps(SEED)); s['settings']['careMode']=True; s['settings']['fontSize']='xxl'
    pg.evaluate("(v)=>localStorage.setItem('wanglai.db.v1', v)", json.dumps(s))
    pg.reload(); pg.wait_for_selector("text=往来记录"); pg.wait_for_timeout(600)

def load_seed(pg, s):
    pg.evaluate("(v)=>localStorage.setItem('wanglai.db.v1', v)", json.dumps(s))
    pg.reload(); pg.wait_for_selector("text=往来记录"); pg.wait_for_timeout(500)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width":390,"height":780})
    pg.goto(URL)
    pg.evaluate("(v)=>localStorage.setItem('wanglai.db.v1', v)", json.dumps(SEED))
    pg.reload(); pg.wait_for_selector("text=往来记录", timeout=8000)
    pg.wait_for_timeout(500)

    # ===== 问题1：大字模式 多选工具条「删除」是否被挤出屏幕 =====
    seed_care(pg)
    # 长按行进入多选（长按=直接进入多选，不弹菜单）
    row = pg.query_selector(".row")
    if row:
        bb = row.bounding_box()
        cx = bb['x'] + bb['width']/2
        cy = bb['y'] + bb['height']/2
        pg.mouse.move(cx, cy); pg.mouse.down()
        pg.wait_for_timeout(700)
        pg.mouse.up(); pg.wait_for_timeout(500)

    bar = pg.query_selector("button[aria-label='删除所选']")
    ok("进入多选态(出现删除所选)", bar is not None)
    if bar:
        bb = bar.bounding_box(); vw = 390
        ok("问题1 大字模式删除按钮在屏幕内", bb and bb['x']+bb['width'] <= vw+1,
           f"right={bb['x']+bb['width'] if bb else None} vw={vw}")
        sel_all = pg.query_selector("button[aria-label='全选']")
        if sel_all:
            sb = sel_all.bounding_box()
            ok("问题1 全选按钮在屏幕内", sb and sb['x']+sb['width'] <= vw+1,
               f"right={sb['x']+sb['width'] if sb else None}")
        # 全选后「取消全选」变长也不溢出
        if sel_all:
            sel_all.click(); pg.wait_for_timeout(500)
        cancel = pg.query_selector("button:has-text('取消')")
        ok("问题1 全选后出现取消", cancel is not None)
        if cancel:
            cb = cancel.bounding_box()
            ok("问题1 取消(全选态)仍不溢出", cb and cb['x']+cb['width'] <= vw+1,
               f"right={cb['x']+cb['width'] if cb else None}")
            # 文字不得换行成两行：直接查 white-space 是否为 nowrap（这才是「我加的类生效了」）
            one_line = pg.evaluate("""() => {
              const b = [...document.querySelectorAll('.pill-sm')].find(x => x.textContent.includes('取消'));
              if (!b) return null;
              return getComputedStyle(b).whiteSpace === 'nowrap';
            }""")
            ok("问题1 按钮文字不换行(nowrap 生效)", one_line is True, f"nowrap={one_line}")
        pg.click("button[aria-label='退出多选']"); pg.wait_for_timeout(400)

    # ===== 问题2：删除确认弹窗按钮高度（大字模式要够大）=====
    r2 = pg.query_selector(".row")
    if r2:
        bb = r2.bounding_box()
        cx = bb['x'] + bb['width']/2; cy = bb['y'] + bb['height']/2
        pg.mouse.move(cx, cy); pg.mouse.down(); pg.wait_for_timeout(60); pg.mouse.up()
        pg.wait_for_timeout(700)
    dbtn = pg.query_selector("button.btn-danger:has-text('删除')")
    ok("点开编辑页(有删除按钮)", dbtn is not None)
    if dbtn:
        dbtn.click(); pg.wait_for_timeout(500)
        cancel_btn = pg.query_selector("button:has-text('取消')")
        del_btn = pg.query_selector("button:has-text('删除')")
        if cancel_btn and del_btn:
            hb = cancel_btn.bounding_box()
            ok("问题2 取消按钮高度随字号放大(>50)", hb and hb['height'] > 50,
               f"h={hb['height'] if hb else None}")
            ok("问题2 删除按钮高度随字号放大(>50)", del_btn.bounding_box()['height'] > 50,
               f"h={del_btn.bounding_box()['height']}")
        else:
            ok("问题2 找到确认弹窗按钮", False)
        pg.click("button:has-text('取消')"); pg.wait_for_timeout(400)
    close_sheet(pg)

    # ===== 问题4：新录入模型 悬浮方向菜单 =====
    # 先恢复标准模式种子（前面问题1/2 用的是大字模式）
    load_seed(pg, SEED)
    pg.click("button[aria-label='记一笔']"); pg.wait_for_timeout(500)
    menu = pg.query_selector("[role=menu]")
    ok("问题4 点加号弹出方向菜单", menu is not None)
    their = pg.query_selector("button:has-text('我随礼')")
    mine  = pg.query_selector("button:has-text('别人随礼')")
    ok("问题4 菜单有「我随礼」选项", their is not None)
    ok("问题4 菜单有「别人随礼」选项", mine is not None)
    if their:
        their.click(); pg.wait_for_timeout(600)
        t = pg.query_selector("text=记一笔 · 我随礼")
        ok("问题4 选我随礼→标题正确", t is not None)
        lbl = pg.query_selector("text=我随礼付出（礼金）")
        ok("问题4 标准模式表单显示付出方向", lbl is not None)
        ok("问题4 不再有加回礼按钮", pg.query_selector("button:has-text('加回礼')") is None)
        close_sheet(pg)

    if mine:
        pg.click("button[aria-label='记一笔']"); pg.wait_for_timeout(500)
        pg.query_selector("button:has-text('别人随礼')").click(); pg.wait_for_timeout(600)
        ok("问题4 选别人随礼→标题正确", pg.query_selector("text=记一笔 · 别人随礼") is not None)
        ok("问题4 标准模式表单显示收到方向", pg.query_selector("text=我收到的礼金") is not None)
        close_sheet(pg)

    # ===== 问题3：列表三级层次（标准模式）=====
    load_seed(pg, SEED)
    row = pg.query_selector(".row")
    if row:
        info = pg.evaluate("""() => {
          const box = document.querySelector('.row .flex-1.min-w-0');
          if (!box) return null;
          const kids = [...box.children];
          const g = e => e ? ({
            cls: e.className,
            fw: getComputedStyle(e).fontWeight,
            fs: getComputedStyle(e).fontSize,
            h: e.getBoundingClientRect().height,
            text: e.innerText.slice(0,50).replace(/\\n/g,' | ')
          }) : null;
          return {
            childCount: kids.length,
            line1: g(kids[0]),
            line2: g(kids[1]),
            nameFw: g(document.querySelector('.row .font-semibold')),
          };
        }""")
        ok("问题3 标准模式记录行为2-3行", info and 2 <= info['childCount'] <= 3,
           f"children={info['childCount'] if info else None}")
        if info and 2 <= info['childCount'] <= 3:
            nf = info['nameFw']
            ok("问题3 一级姓名加重(fw>=600)", nf and int(nf['fw']) >= 600,
               f"fw={nf['fw'] if nf else None}")
            ok("问题3 含方向词(我给出/我收到/收＋回)",
               any(k in info['line2']['text'] for k in ('我给出','我收到','收＋回')),
               f"line2={info['line2']['text']!r}")
            # ★ 关键回归：文字不能被压成竖排（高度异常大 = 被挤成竖排）
            ok("问题3 信息行高度正常(未被压成竖排)",
               info['line2']['h'] and info['line2']['h'] < 60,
               f"line2_h={info['line2']['h']}")
            # ★ 关键回归：文字区与金额区不能重叠（涛哥截图里「回礼100」叠在「−100」上）
            overlap = pg.evaluate("""() => {
              const row = document.querySelector('.row');
              if (!row) return null;
              const box = row.querySelector('.flex-1.min-w-0');
              const amt = row.querySelector('.text-right');
              if (!box || !amt) return null;
              const a = box.getBoundingClientRect(), b = amt.getBoundingClientRect();
              return { boxRight: Math.round(a.right), amtLeft: Math.round(b.left) };
            }""")
            ok("问题3 文字区与金额区不重叠", overlap and overlap['boxRight'] <= overlap['amtLeft'],
               f"boxRight={overlap['boxRight'] if overlap else None} amtLeft={overlap['amtLeft'] if overlap else None}")

    # 大字模式下同样检查（这是涛哥出问题的场景）
    cs = json.loads(json.dumps(SEED)); cs['settings']['careMode']=True; cs['settings']['fontSize']='xxl'
    load_seed(pg, cs)
    ov2 = pg.evaluate("""() => {
      const out = [];
      document.querySelectorAll('.row').forEach(row => {
        const box = row.querySelector('.flex-1.min-w-0');
        const amt = row.querySelector('.text-right');
        if (!box || !amt) return;
        const a = box.getBoundingClientRect(), b = amt.getBoundingClientRect();
        // 文字区实际内容右边界（用 scrollWidth 才知道有没有溢出）
        out.push({ boxRight: Math.round(a.right), amtLeft: Math.round(b.left),
                   scrollW: box.scrollWidth, clientW: box.clientWidth });
      });
      return out;
    }""")
    if ov2:
        bad = [o for o in ov2 if o['boxRight'] > o['amtLeft'] or o['scrollW'] > o['clientW'] + 1]
        ok("问题3 大字模式文字不与金额重叠且不溢出", len(bad) == 0,
           f"rows={len(ov2)} bad={len(bad)} {bad[:2]}")

    # ===== 大字模式极简（涛哥新原则：给年纪大的人用，越简单越好）=====
    # 列表：只有姓名 + 金额，无事由徽标、无日期、无渠道/地点/礼物
    list_simple = pg.evaluate("""() => {
      const row = document.querySelector('.row');
      if (!row) return null;
      const box = row.querySelector('.flex-1.min-w-0');
      return {
        rows: box ? box.children.length : -1,          // 应为 1（只有姓名）
        hasChip: !!box?.querySelector('.tagx'),
        text: box ? box.innerText.replace(/\\n/g,' | ') : '',
      };
    }""")
    ok("大字模式列表只显示姓名(1行)", list_simple and list_simple['rows'] == 1,
       f"children={list_simple['rows'] if list_simple else None}")
    ok("大字模式列表无事由徽标", list_simple and list_simple['hasChip'] is False)
    ok("大字模式列表无日期/渠道等细节",
       list_simple and ('月' not in list_simple['text'] and '日' not in list_simple['text']),
       f"text={list_simple['text']!r}" if list_simple else '')

    # 录入：只有姓名 + 金额 + 备注，无渠道/地点/礼物/日期/事由/备注独立组
    pg.click("button[aria-label='记一笔']"); pg.wait_for_timeout(500)
    pg.click("button:has-text('我随礼')"); pg.wait_for_timeout(700)
    care_form = pg.evaluate("""() => {
      const sheet = document.querySelector('.sheet-mask') || document.body;
      const labels = [...sheet.querySelectorAll('label')].map(l => l.innerText.trim());
      const phs = [...sheet.querySelectorAll('input,textarea')].map(i => i.placeholder || '');
      return { labels, phs };
    }""")
    labs = care_form['labels'] if care_form else []
    ok("大字模式录入只有姓名+金额+备注",
       labs == ['对方姓名', '金额', '备注（可留空）'], f"labels={labs}")
    ok("大字模式录入无渠道/地点/礼物字段",
       care_form and not any(k in ' '.join(labs) for k in ('渠道', '地点', '礼物', '日期', '事由')),
       f"labels={labs}")
    ok("大字模式录入字段数<=4",
       care_form and len(care_form['phs']) <= 4, f"inputs={len(care_form['phs'])} {care_form['phs']}")
    # 保存按钮仍可用（录入功能没被破坏）
    ok("大字模式底部有保存动作",
       pg.query_selector("button:has-text('保存')") is not None
       or pg.query_selector("button:has-text('填人和金额')") is not None)
    x = pg.query_selector("button[aria-label='关闭']")
    if x: x.click()
    pg.wait_for_timeout(400)

    # 标准模式不受影响：字段仍完整
    ns = json.loads(json.dumps(SEED)); ns['settings']['careMode']=False; ns['settings']['fontSize']='off'
    load_seed(pg, ns)
    pg.click("button[aria-label='记一笔']"); pg.wait_for_timeout(500)
    pg.click("button:has-text('我随礼')"); pg.wait_for_timeout(700)
    normal_form = pg.evaluate("""() => {
      const sheet = document.querySelector('.sheet-mask') || document.body;
      return [...sheet.querySelectorAll('label')].map(l => l.innerText.trim());
    }""")
    ok("标准模式录入字段完整(不受大字精简影响)",
       normal_form and any('渠道' in l for l in normal_form)
       and any('地点' in l for l in normal_form),
       f"labels={normal_form}")
    x = pg.query_selector("button[aria-label='关闭']")
    if x: x.click()

    b.close()

fails = [r for r in results if not r[1]]
print("\n==== 结果 ====")
print(f"总 {len(results)}，通过 {len(results)-len(fails)}，失败 {len(fails)}")
sys.exit(1 if fails else 0)