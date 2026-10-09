"""v2.14.2 实际渲染截图（真实浏览器）—— 供涛哥核对视觉效果"""
import json
from playwright.sync_api import sync_playwright

URL="http://127.0.0.1:3000/"
OUT="_ui_compare/shots"
import os; os.makedirs(OUT, exist_ok=True)

SEED={'schemaVersion':3,
 'persons':[
   {'id':'p1','name':'王建国','relation':'同事','region':'南麻','createdAt':'2026-01-01T00:00:00.000Z','updatedAt':'2026-01-01T00:00:00.000Z'},
   {'id':'p2','name':'王秀兰','createdAt':'2026-01-01T00:00:00.000Z','updatedAt':'2026-01-01T00:00:00.000Z'},
   {'id':'p3','name':'李德海','createdAt':'2026-01-01T00:00:00.000Z','updatedAt':'2026-01-01T00:00:00.000Z'}],
 'records':[
   {'id':'r1','personId':'p1','received':{'channel':'cash','amount':1000,'date':'2026-10-01','event':'wedding'},'createdAt':'2026-10-01T00:00:00.000Z','updatedAt':'2026-10-01T00:00:00.000Z'},
   {'id':'r2','personId':'p2','received':{'channel':'wechat','amount':600,'date':'2026-10-02','event':'birthday'},'returned':{'channel':'cash','amount':300,'date':'2026-10-03','event':'birthday'},'createdAt':'2026-10-02T00:00:00.000Z','updatedAt':'2026-10-02T00:00:00.000Z'}],
 'todos':[],'customEvents':[],
 'settings':{'accent':'#2F6B4F','bg':'#F4F2EE','appLock':False,'currency':'¥','weekStart':1,'theme':'a','themePicked':True,'fontSize':'off','careMode':False},
 'updatedAt':''}

def set_and_reload(pg, seed):
    pg.evaluate('(v)=>localStorage.setItem("wanglai.db.v1", v)', json.dumps(seed))
    pg.reload(); pg.wait_for_selector('text=往来记录'); pg.wait_for_timeout(400)

with sync_playwright() as p:
    b=p.chromium.launch(headless=True); pg=b.new_page(viewport={'width':390,'height':780})
    pg.goto(URL)

    # 1) 标准模式列表
    set_and_reload(pg, SEED)
    pg.screenshot(path=f'{OUT}/01_normal_list.png')

    # 2) 标准模式 + 建议框
    pg.click("button[aria-label='记一笔']"); pg.wait_for_selector('text=记一笔')
    nm=pg.query_selector("input[placeholder*='历史']"); nm.click(); nm.fill('王')
    pg.wait_for_timeout(450)
    pg.screenshot(path=f'{OUT}/02_suggest_box.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)

    # 3) 关怀模式列表（精简）
    s2=json.loads(json.dumps(SEED)); s2['settings']['careMode']=True; s2['settings']['fontSize']='xxl'
    set_and_reload(pg, s2)
    pg.screenshot(path=f'{OUT}/03_care_list.png')

    # 4) 关怀模式 设置页（只留备份/大字/关于）
    pg.click(".tabitem:has-text('我的')"); pg.wait_for_timeout(450)
    pg.screenshot(path=f'{OUT}/04_care_settings.png')

    # 5) 关怀模式 功能页（去待办/渠道/事由/往来最多）
    pg.click(".tabitem:has-text('功能')"); pg.wait_for_timeout(450)
    pg.screenshot(path=f'{OUT}/05_care_functions.png')

    # 6) 关怀模式 人员页（去全选/搜索/净值卡）
    pg.click(".tabitem:has-text('人员')"); pg.wait_for_timeout(450)
    pg.screenshot(path=f'{OUT}/06_care_persons.png')

    # 7) 标准模式 记一笔 —— 事由默认铺开
    s3 = json.loads(json.dumps(SEED))
    set_and_reload(pg, s3)
    pg.click(".tabitem:has-text('记录')"); pg.wait_for_timeout(300)
    pg.click("button[aria-label='记一笔']"); pg.wait_for_selector('text=记一笔'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/07_normal_editor_default.png')

    # 8) 标准模式 记一笔 —— 手动收起事由
    pg.click("button:has-text('收起')"); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/08_normal_editor_collapsed.png')
    x = pg.query_selector("button[aria-label='关闭']")
    if x: x.click(); pg.wait_for_timeout(350)

    # 9) 关怀模式 记一笔 —— 事由默认收起 + 姓名快捷 chip 隐藏
    s4 = json.loads(json.dumps(SEED)); s4['settings']['careMode']=True; s4['settings']['fontSize']='xxl'
    set_and_reload(pg, s4)
    pg.click(".tabitem:has-text('记录')"); pg.wait_for_timeout(300)
    pg.click("button[aria-label='记一笔']"); pg.wait_for_selector('text=记一笔'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/09_care_editor_default.png')
    b.close()
print("screenshots saved to", OUT)
