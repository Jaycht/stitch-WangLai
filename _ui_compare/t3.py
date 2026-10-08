import asyncio, json
from playwright.async_api import async_playwright
OUT=r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare/v3"
import os; os.makedirs(OUT, exist_ok=True)
# 含 2 个同名「王建国」的数据
DB = {
 "schemaVersion":3,
 "persons":[
  {"id":"p1","name":"王建国","alias":"建国·南麻","relation":"表弟","group":"clan","phone":"13805331234","wechat":"wjg_888","region":"沂源南麻","note":"弟媳的哥哥","createdAt":"2026-01-02T08:00:00Z","updatedAt":"2026-01-02T08:00:00Z"},
  {"id":"p2","name":"王建国","relation":"堂哥","group":"clan","phone":"","wechat":"wjg_gb","region":"县城","note":"","createdAt":"2026-01-03T08:00:00Z","updatedAt":"2026-01-03T08:00:00Z"},
  {"id":"p3","name":"李国强","relation":"同事","group":"friend","phone":"","wechat":"lzg","region":"淄博","note":"","createdAt":"2026-01-04T08:00:00Z","updatedAt":"2026-01-04T08:00:00Z"},
  {"id":"p4","name":"陈永刚","relation":"同学","group":"friend","phone":"","wechat":"","region":"","note":"","createdAt":"2026-01-05T08:00:00Z","updatedAt":"2026-01-05T08:00:00Z"}],
 "records":[
  {"id":"r1","personId":"p1","received":{"channel":"wechat","amount":2000,"date":"2026-10-02","event":"wedding","place":"女方家","gift":"两瓶酒"},"returned":{"channel":"cash","amount":1000,"date":"2026-10-05","event":"full_month"},"remark":"满月酒","remindAt":"2026-10-08T18:00","createdAt":"2026-10-02T08:00:00Z","updatedAt":"2026-10-05T08:00:00Z"},
  {"id":"r2","personId":"p2","received":{"channel":"cash","amount":1500,"date":"2026-10-01","event":"moving"},"remark":"","createdAt":"2026-10-01T08:00:00Z","updatedAt":"2026-10-01T08:00:00Z"},
  {"id":"r3","personId":"p3","received":{"channel":"alipay","amount":600,"date":"2026-09-28","event":"custom_xh"},"remark":"","createdAt":"2026-09-28T08:00:00Z","updatedAt":"2026-09-28T08:00:00Z"},
  {"id":"r4","personId":"p4","received":{"channel":"cash","amount":1200,"date":"2026-09-20","event":"funeral"},"remark":"白事","createdAt":"2026-09-20T08:00:00Z","updatedAt":"2026-09-20T08:00:00Z"}],
 "todos":[
  {"id":"t1","title":"买礼金封","note":"红白喜事分开","due":"2026-10-05","done":False,"createdAt":"2026-10-01T08:00:00Z","updatedAt":"2026-10-01T08:00:00Z"},
  {"id":"t2","title":"问随礼名单","due":"2026-10-06","done":False,"createdAt":"2026-10-01T08:00:00Z","updatedAt":"2026-10-01T08:00:00Z"},
  {"id":"t3","title":"取现金","done":True,"createdAt":"2026-09-30T08:00:00Z","updatedAt":"2026-10-01T08:00:00Z","doneAt":"2026-10-01T08:00:00Z"}],
 "customEvents":[
  {"key":"custom_xh","label":"升学宴","tone":"fest","createdAt":"2026-01-01T00:00:00Z"},
  {"key":"custom_bs","label":"出殡","tone":"solemn","createdAt":"2026-01-01T00:00:00Z"}],
 "settings":{"accent":"#B3271E","bg":"#F4F2EE","appLock":False,"currency":"¥","weekStart":1,"remindLeadMin":60},
 "updatedAt":"2026-10-06T08:00:00Z"}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':414,'height':896}, device_scale_factor=2)
        pg = await ctx.new_page()
        errs=[]
        pg.on('pageerror', lambda e: errs.append('PE: '+str(e)))
        pg.on('console', lambda m: errs.append('CE: '+m.text) if m.type=='error' else None)
        s = json.dumps(DB, ensure_ascii=False)
        await pg.goto("http://127.0.0.1:8900/")
        await pg.wait_for_timeout(500)
        await pg.evaluate("d => localStorage.setItem('wanglai.db.v1', d)", s)
        for route,name in [('/','records'),('/persons','persons'),('/functions','functions'),('/todos','todos')]:
            await pg.goto(f"http://127.0.0.1:8900{route}")
            await pg.wait_for_timeout(1500)
            await pg.screenshot(path=rf"{OUT}\{name}.png")
            print("shot",name)
        # 录入面板
        await pg.goto("http://127.0.0.1:8900/")
        await pg.wait_for_timeout(1300)
        await pg.click("button[aria-label='记一笔']")
        await pg.wait_for_timeout(800)
        body = await pg.inner_text("body")
        for k in ['喜事','丧事 · 祭奠','自定义','酒席提醒','升学宴','出殡','设提醒']:
            print(f"  {k}: {'有' if k in body else '缺'}")
        await pg.screenshot(path=rf"{OUT}\editor.png")
        # 触发重名提示
        await pg.fill("input[placeholder='如：王建国']", '王建国')
        await pg.wait_for_timeout(600)
        dup = await pg.inner_text("body")
        print("  重名提示:", "已有 1 位" in dup or "选已有的人" in dup)
        await pg.screenshot(path=rf"{OUT}\dup.png")
        d = json.loads(await pg.evaluate("() => localStorage.getItem('wanglai.db.v1')"))
        print("数据: sv", d['schemaVersion'], "| 人", len(d['persons']), "| 待办", len(d['todos']), "| 自定义事由", len(d['customEvents']))
        print("errors:", errs if errs else "无")
        await b.close()
asyncio.run(main())
