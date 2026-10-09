"""v2.14.6 核对截图 —— 4 个问题修复效果"""
import json, os
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:3000/"
OUT = "_ui_compare/shots"
os.makedirs(OUT, exist_ok=True)

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
    {"id":"r3","personId":"p3","received":{"channel":"wechat","amount":600,"date":"2026-09-20","event":"wedding","place":"女方家·沂源","gift":"两瓶酒"},"createdAt":"2026-09-20T00:00:00.000Z","updatedAt":"2026-09-20T00:00:00.000Z"},
  ],
  "todos": [], "customEvents": [],
  "settings": {"accent":"#2F6B4F","bg":"#F4F2EE","appLock":False,"currency":"¥","weekStart":1,"theme":"a","themePicked":True,"fontSize":"off","careMode":False},
  "updatedAt": "",
}

def load(pg, seed):
    pg.evaluate("(v)=>localStorage.setItem('wanglai.db.v1', v)", json.dumps(seed))
    pg.reload(); pg.wait_for_selector("text=往来记录"); pg.wait_for_timeout(500)

def longpress(pg, idx=0):
    row = pg.query_selector_all(".row")[idx]
    bb = row.bounding_box()
    pg.mouse.move(bb['x']+bb['width']/2, bb['y']+bb['height']/2)
    pg.mouse.down(); pg.wait_for_timeout(700); pg.mouse.up(); pg.wait_for_timeout(500)

def care(s):
    o = json.loads(json.dumps(s)); o['settings']['careMode']=True; o['settings']['fontSize']='xxl'
    return o

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width":390,"height":780})
    pg.goto(URL)

    # 1) 标准模式列表（问题3：重新排版）
    load(pg, SEED)
    pg.screenshot(path=f'{OUT}/10_list_normal.png')

    # 2) 大字模式列表（问题3）
    load(pg, care(SEED))
    pg.screenshot(path=f'{OUT}/11_list_care.png')

    # 3) 大字模式多选工具条（问题1）
    longpress(pg, 0)
    pg.screenshot(path=f'{OUT}/12_care_selectbar.png')
    pg.click("button[aria-label='全选']"); pg.wait_for_timeout(400)
    pg.screenshot(path=f'{OUT}/13_care_selectbar_all.png')
    pg.click("button[aria-label='退出多选']"); pg.wait_for_timeout(400)

    # 4) 删除确认弹窗（问题2）
    row = pg.query_selector_all(".row")[0]
    bb = row.bounding_box()
    pg.mouse.move(bb['x']+bb['width']/2, bb['y']+bb['height']/2)
    pg.mouse.down(); pg.wait_for_timeout(60); pg.mouse.up(); pg.wait_for_timeout(700)
    d = pg.query_selector("button.btn-danger:has-text('删除')")
    if d:
        d.click(); pg.wait_for_timeout(500)
        pg.screenshot(path=f'{OUT}/14_care_confirm_delete.png')
        c = pg.query_selector("button:has-text('取消')")
        if c: c.click()
        pg.wait_for_timeout(300)
    x = pg.query_selector("button[aria-label='关闭']")
    if x: x.click()
    pg.wait_for_timeout(400)

    # 5) 悬浮方向菜单（问题4）
    pg.click("button[aria-label='记一笔']"); pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/15_direction_menu_care.png')

    # 6) 我随礼（别人办事）录入表单
    pg.click("button:has-text('我随礼')"); pg.wait_for_timeout(700)
    pg.screenshot(path=f'{OUT}/16_editor_their_care.png')
    x = pg.query_selector("button[aria-label='关闭']")
    if x: x.click()
    pg.wait_for_timeout(400)

    # 7) 别人随礼（我办事）录入表单
    pg.click("button[aria-label='记一笔']"); pg.wait_for_timeout(500)
    pg.click("button:has-text('别人随礼')"); pg.wait_for_timeout(700)
    pg.screenshot(path=f'{OUT}/17_editor_mine_care.png')

    # 8) 标准模式的方向菜单与表单
    load(pg, SEED)
    pg.click("button[aria-label='记一笔']"); pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/18_direction_menu_normal.png')
    pg.click("button:has-text('我随礼')"); pg.wait_for_timeout(700)
    pg.screenshot(path=f'{OUT}/19_editor_their_normal.png')

    b.close()
print("screenshots saved")