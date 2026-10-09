"""v2.14.5 运行时验证 —— 记一笔弹层的「分模式折叠」+ 大字模式姓名常驻 chip 隐藏
铁律：只跑 tsc/build 不算数，必须真实浏览器量运行时行为。
用已装好的 chromium（LOCALAPPDATA/ms-playwright/chromium-1243）。
"""
import json, sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:3000/"

SEED = {
  "schemaVersion": 3,
  "persons": [
    {"id":"p1","name":"王建国","relation":"同事","region":"南麻","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"},
    {"id":"p2","name":"王秀兰","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"},
    {"id":"p3","name":"李德海","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"},
  ],
  "records": [
    {"id":"r1","personId":"p1","received":{"channel":"cash","amount":1000,"date":"2026-10-01","event":"wedding"},"createdAt":"2026-10-01T00:00:00.000Z","updatedAt":"2026-10-01T00:00:00.000Z"},
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

def open_editor(pg):
    pg.wait_for_selector("button[aria-label='记一笔']", timeout=6000)
    pg.click("button[aria-label='记一笔']")
    pg.wait_for_selector("text=记一笔", timeout=5000)
    pg.wait_for_timeout(300)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width":390,"height":780})

    # ===== 标准模式：事由默认铺开 =====
    pg.goto(URL)
    pg.evaluate("(v)=>localStorage.setItem('wanglai.db.v1', v)", json.dumps(SEED))
    pg.reload()
    pg.wait_for_selector("text=往来记录", timeout=8000)
    open_editor(pg)

    ok("标准模式事由默认铺开(显示喜事分组)", pg.query_selector("text=喜事") is not None)
    ok("标准模式默认铺开(有收起按钮)", pg.query_selector("text=收起") is not None)
    ok("标准模式默认铺开(可直接点结婚)", pg.query_selector("button:has-text('结婚')") is not None)
    ok("标准模式默认铺开(无展开入口)", pg.query_selector("button:has-text('展开')") is None)

    # 手动收起 → 展开 仍可用
    pg.click("button:has-text('收起')"); pg.wait_for_timeout(300)
    ok("标准模式可手动收起", pg.query_selector("button:has-text('展开')") is not None
                              and pg.query_selector("text=喜事") is None)
    pg.click("button:has-text('展开')"); pg.wait_for_timeout(300)
    ok("标准模式可再展开", pg.query_selector("text=喜事") is not None)

    # 选中自动收起
    wed = pg.query_selector("button:has-text('结婚')")
    if wed:
        wed.click(); pg.wait_for_timeout(350)
        eb = pg.query_selector("button:has-text('展开')")
        bar = eb.inner_text() if eb else ""
        ok("标准模式选中后自动收起", pg.query_selector("text=喜事") is None and eb is not None)
        ok("标准模式收起条显示已选(结婚)", "结婚" in bar, f"bar={bar!r}")

    # 标准模式：姓名下方常驻快捷 chip 应保留
    ok("标准模式姓名快捷chip保留(王建国)", pg.query_selector("button.pill:has-text('王建国')") is not None)
    close_sheet(pg)

    # ===== 关怀模式：事由默认收起 + 姓名快捷 chip 隐藏 + 浮层检索保留 =====
    seed2 = json.loads(json.dumps(SEED))
    seed2["settings"]["careMode"]=True; seed2["settings"]["fontSize"]="xxl"
    pg.evaluate("(v)=>localStorage.setItem('wanglai.db.v1', v)", json.dumps(seed2))
    pg.reload()
    pg.wait_for_selector("text=往来记录")
    pg.wait_for_timeout(500)
    open_editor(pg)

    ok("关怀模式事由默认收起(有展开入口)", pg.query_selector("button:has-text('展开')") is not None)
    ok("关怀模式事由默认收起(未铺开)", pg.query_selector("text=喜事") is None)
    # 展开仍可用
    pg.click("button:has-text('展开')"); pg.wait_for_timeout(300)
    ok("关怀模式仍可展开事由", pg.query_selector("text=喜事") is not None)
    pg.click("button:has-text('收起')"); pg.wait_for_timeout(250)

    # 姓名下方常驻快捷 chip 应隐藏
    ok("关怀模式隐藏姓名快捷chip", pg.query_selector("button.pill:has-text('王建国')") is None)

    # 但「输入即检索历史」的浮层下拉仍保留
    nm = pg.query_selector("input[placeholder*='历史']")
    ok("关怀模式姓名输入框仍在", nm is not None)
    if nm:
        nm.click(); nm.fill("王"); pg.wait_for_timeout(450)
        box = pg.query_selector("div.fixed.z-50")
        ok("关怀模式输入即检索历史(浮层下拉保留)", box is not None)
        txt = box.inner_text() if box else ""
        ok("关怀模式检索命中历史(王建国)", "王建国" in txt, f"box={txt!r}")
        nm.fill("")
    close_sheet(pg)

    b.close()

fails = [r for r in results if not r[1]]
print("\n==== 结果 ====")
print(f"总 {len(results)}，通过 {len(results)-len(fails)}，失败 {len(fails)}")
sys.exit(1 if fails else 0)
