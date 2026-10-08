import asyncio, json
from playwright.async_api import async_playwright
DB = {
 "schemaVersion":2,
 "persons":[
  {"id":"p1","name":"王建国","relation":"表弟","group":"clan","phone":"13805331234","wechat":"wjg_888","region":"沂源南麻","note":"弟媳的哥哥","createdAt":"2026-01-02T08:00:00Z","updatedAt":"2026-01-02T08:00:00Z"},
  {"id":"p2","name":"李国强","relation":"同事","group":"friend","phone":"","wechat":"lzg_work","region":"淄博","note":"","createdAt":"2026-01-03T08:00:00Z","updatedAt":"2026-01-03T08:00:00Z"},
  {"id":"p3","name":"刘晓梅","relation":"侄女","group":"clan","phone":"","wechat":"","region":"沂源","note":"","createdAt":"2026-01-04T08:00:00Z","updatedAt":"2026-01-04T08:00:00Z"},
  {"id":"p4","name":"陈永刚","relation":"同学","group":"friend","phone":"","wechat":"","region":"","note":"","createdAt":"2026-01-05T08:00:00Z","updatedAt":"2026-01-05T08:00:00Z"},
  {"id":"p5","name":"张淑芬","relation":"姑姑","group":"aunt","phone":"","wechat":"","region":"沂源","note":"","createdAt":"2026-01-06T08:00:00Z","updatedAt":"2026-01-06T08:00:00Z"}],
 "records":[
  {"id":"r1","personId":"p1","received":{"channel":"wechat","amount":2000,"date":"2026-10-02","event":"wedding","place":"女方家·沂源县城","gift":"两瓶酒"},"returned":{"channel":"cash","amount":1000,"date":"2026-10-05","event":"full_month","place":"","gift":""},"remark":"孩子满月酒","createdAt":"2026-10-02T08:00:00Z","updatedAt":"2026-10-05T08:00:00Z"},
  {"id":"r2","personId":"p2","received":{"channel":"alipay","amount":600,"date":"2026-10-01","event":"moving","place":"","gift":""},"remark":"","createdAt":"2026-10-01T08:00:00Z","updatedAt":"2026-10-01T08:00:00Z"},
  {"id":"r3","personId":"p3","received":{"channel":"cash","amount":800,"date":"2026-09-28","event":"full_month","place":"","gift":"红包"},"remark":"","createdAt":"2026-09-28T08:00:00Z","updatedAt":"2026-09-28T08:00:00Z"},
  {"id":"r4","personId":"p4","received":{"channel":"cash","amount":1200,"date":"2026-09-20","event":"funeral","place":"","gift":""},"remark":"白事","createdAt":"2026-09-20T08:00:00Z","updatedAt":"2026-09-20T08:00:00Z"},
  {"id":"r5","personId":"p5","received":{"channel":"wechat","amount":1500,"date":"2026-08-15","event":"birthday","place":"","gift":""},"returned":{"channel":"wechat","amount":1000,"date":"2026-08-20","event":"birthday","place":"","gift":""},"remark":"","createdAt":"2026-08-15T08:00:00Z","updatedAt":"2026-08-20T08:00:00Z"}],
 "settings":{"accent":"#B3271E","bg":"#F4F2EE","appLock":False,"currency":"¥","weekStart":1},
 "updatedAt":"2026-10-06T08:00:00Z"}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':414,'height':896}, device_scale_factor=2)
        await ctx.add_init_script("window.localStorage.setItem('wanglai.db.v1', %s);" % json.dumps(DB, ensure_ascii=False))
        pg = await ctx.new_page()
        errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE: '+m.text) if m.type=='error' else None)
        OUT=r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare/v2"
        for route,name in [('/','records'),('/persons','persons'),('/functions','functions'),
                           ('/almanac','almanac'),('/lucky','lucky'),('/taisui','taisui'),
                           ('/relation','relation'),('/settings','settings')]:
            await pg.goto(f"http://127.0.0.1:8900{route}")
            await pg.wait_for_timeout(1500)
            await pg.screenshot(path=rf"{OUT}\{name}.png")
        db = await pg.evaluate("() => JSON.parse(localStorage.getItem('wanglai.db.v1'))")
        print("数据:", len(db['persons']),"人",len(db['records']),"条  sv:",db['schemaVersion'])
        body = await pg.inner_text("body")
        print("页面渲染:", "OK" if "往来礼记" in body or "我的" in body else "空")
        print("errors:", errs if errs else "无")
        await b.close()
asyncio.run(main())
