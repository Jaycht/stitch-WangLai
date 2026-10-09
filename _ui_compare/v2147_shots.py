"""v2.14.7 核对截图 —— 图标底纹形状 + 字号档位折叠 + 方向菜单新文案"""
import json, os
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:3000/"
OUT = "_ui_compare/shots"
os.makedirs(OUT, exist_ok=True)

SEED = {
  "schemaVersion": 3,
  "persons": [
    {"id":"p1","name":"陈嫒嫒","relation":"客户","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"},
    {"id":"p2","name":"李四","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"},
    {"id":"p3","name":"王小明","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"},
  ],
  "records": [
    {"id":"r1","personId":"p1","received":{"channel":"cash","amount":300,"date":"2026-10-01","event":"wedding"},"returned":{"channel":"cash","amount":200,"date":"2026-10-03","event":"wedding"},"createdAt":"2026-10-01T00:00:00.000Z","updatedAt":"2026-10-01T00:00:00.000Z"},
    {"id":"r2","personId":"p2","received":{"channel":"cash","amount":600,"date":"2026-09-20","event":"birthday"},"createdAt":"2026-09-20T00:00:00.000Z","updatedAt":"2026-09-20T00:00:00.000Z"},
  ],
  "todos": [], "customEvents": [],
  "settings": {"accent":"#2F6B4F","bg":"#F4F2EE","appLock":False,"currency":"¥","weekStart":1,"theme":"a","themePicked":True,"fontSize":"off","careMode":False},
  "updatedAt": "",
}

def load(pg, care=False, xxl=False):
    s = json.loads(json.dumps(SEED))
    if care:
        s['settings']['careMode']=True; s['settings']['fontSize']='xxl'
    pg.evaluate("(v)=>localStorage.setItem('wanglai.db.v1', v)", json.dumps(s))
    pg.reload(); pg.wait_for_selector("text=往来记录"); pg.wait_for_timeout(600)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width":390,"height":780})
    pg.goto(URL)

    # 标准模式 功能页（问题2：图标底纹正方形）
    load(pg)
    pg.click(".tabitem:has-text('功能')"); pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/20_functions_normal.png')

    # 大字模式 功能页
    load(pg, care=True)
    pg.click(".tabitem:has-text('功能')"); pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/21_functions_care.png')

    # 大字模式 人员页（姓氏圆牌正圆）
    pg.click(".tabitem:has-text('人员')"); pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/22_persons_care.png')

    # 大字模式 人员页 —— 滚到底（验证悬浮加号不再压住最后一张卡）
    pg.evaluate("() => { const el = document.scrollingElement; el.scrollTop = el.scrollHeight; }")
    pg.wait_for_timeout(400)
    pg.screenshot(path=f'{OUT}/28_persons_care_bottom.png')

    # 标准模式 人员页
    load(pg)
    pg.click(".tabitem:has-text('人员')"); pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/23_persons_normal.png')

    # 大字模式 设置页（字号档位收起成一行）
    load(pg, care=True)
    pg.click(".tabitem:has-text('我的')"); pg.wait_for_timeout(700)
    pg.screenshot(path=f'{OUT}/24_settings_care_collapsed.png')

    # 字号下拉（原生 select，平时就一行；这里截展开态看选项）
    sel = pg.query_selector("#care-font-size")
    if sel:
        pg.evaluate("""() => {
          const s = document.querySelector('#care-font-size');
          if (s) s.scrollIntoView({block:'center'});
        }""")
        pg.wait_for_timeout(300)
        pg.screenshot(path=f'{OUT}/25_settings_care_font_select.png')

    # 方向菜单新文案（大字模式）
    pg.click(".tabitem:has-text('记录')"); pg.wait_for_timeout(400)
    pg.click("button[aria-label='记一笔']"); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/26_direction_menu_new_text.png')

    # 标准模式 方向菜单（同样新文案）
    load(pg)
    pg.click(".tabitem:has-text('记录')"); pg.wait_for_timeout(400)
    pg.click("button[aria-label='记一笔']"); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/27_direction_menu_normal.png')

    b.close()
print("screenshots saved")