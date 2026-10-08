import asyncio, json
from playwright.async_api import async_playwright
S = {"accent":"#2F6B4F","bg":"#F4F2EE","appLock":False,"currency":"¥","weekStart":1,
     "remindLeadMin":60,"theme":"a","themePicked":True,"fontSize":"xxl","careMode":True}
DB={"schemaVersion":3,"persons":[],"records":[],"todos":[],"customEvents":[],"settings":S,"updatedAt":""}
s=json.dumps(DB,ensure_ascii=False)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context()
        await ctx.add_init_script("try{localStorage.setItem('wanglai.db.v1', %s)}catch(e){}" % s)
        pg=await ctx.new_page()
        await pg.goto("http://127.0.0.1:8900/")
        # 在页面里再写一次，然后立刻 reload，看第二次是否保留
        await pg.evaluate("d => localStorage.setItem('wanglai.db.v1', d)", s)
        before = await pg.evaluate("()=>{const d=JSON.parse(localStorage.getItem('wanglai.db.v1'));return d.settings.fontSize}")
        print("evaluate 写入后:", before)
        await pg.reload(); await pg.wait_for_timeout(1500)
        after = await pg.evaluate("()=>{const d=JSON.parse(localStorage.getItem('wanglai.db.v1'));return d.settings.fontSize}")
        print("reload 后:", after)
        await b.close()
asyncio.run(main())
