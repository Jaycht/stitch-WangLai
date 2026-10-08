import asyncio, json
from playwright.async_api import async_playwright
DB = {"schemaVersion":3,"persons":[],"records":[],"todos":[],"customEvents":[],
 "settings":{"accent":"#2F6B4F","bg":"#F4F2EE","appLock":False,"currency":"¥","weekStart":1,
             "remindLeadMin":60,"theme":"a","themePicked":True},
 "updatedAt":"2026-10-06T08:00:00Z"}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context()
        pg = await ctx.new_page()
        await pg.goto("http://127.0.0.1:8900/")
        await pg.wait_for_timeout(400)
        await pg.evaluate("d => localStorage.setItem('wanglai.db.v1', d)", json.dumps(DB,ensure_ascii=False))
        await pg.reload(); await pg.wait_for_timeout(1500)
        d = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        print("落盘 settings:", json.dumps(d['settings'], ensure_ascii=False))
        print("检测缓存:", await pg.evaluate("()=>localStorage.getItem('wanglai.themedetect')"))
        print("data-theme:", await pg.evaluate("()=>document.documentElement.getAttribute('data-theme')"))
        await b.close()
asyncio.run(main())
