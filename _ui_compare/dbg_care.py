import asyncio, json
from playwright.async_api import async_playwright
DB={"schemaVersion":3,"persons":[],"records":[],"todos":[],"customEvents":[],
 "settings":{"accent":"#2F6B4F","bg":"#F4F2EE","appLock":False,"currency":"¥","weekStart":1,
             "remindLeadMin":60,"theme":"a","themePicked":True,"fontSize":"xxl","careMode":True},
 "updatedAt":"2026-10-06T08:00:00Z"}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context()
        await ctx.add_init_script("try{localStorage.clear();localStorage.setItem('wanglai.db.v1', %s)}catch(e){}" % json.dumps(DB,ensure_ascii=False))
        pg=await ctx.new_page()
        await pg.goto("http://127.0.0.1:8900/")
        await pg.wait_for_timeout(1600)
        d=json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        print("落盘 settings:", json.dumps({k:v for k,v in d['settings'].items() if k in ('theme','themePicked','fontSize','careMode','accent')}, ensure_ascii=False))
        print("data-fontsize:", await pg.evaluate("()=>document.documentElement.getAttribute('data-fontsize')"))
        print("data-theme:", await pg.evaluate("()=>document.documentElement.getAttribute('data-theme')"))
        print("body font-size:", await pg.evaluate("()=>getComputedStyle(document.body).fontSize"))
        print("--fs:", await pg.evaluate("()=>getComputedStyle(document.documentElement).getPropertyValue('--fs')"))
        print("--f-lg:", await pg.evaluate("()=>getComputedStyle(document.documentElement).getPropertyValue('--f-lg')"))
        await b.close()
asyncio.run(main())
