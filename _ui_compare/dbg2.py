import asyncio, json
from playwright.async_api import async_playwright
DB={"schemaVersion":3,"persons":[],"records":[],"todos":[],"customEvents":[],
 "settings":{"accent":"#2F6B4F","bg":"#F4F2EE","appLock":False,"currency":"¥","weekStart":1,
             "remindLeadMin":60,"theme":"a","themePicked":True,"fontSize":"xxl","careMode":True},
 "updatedAt":"2026-10-06T08:00:00Z"}
s=json.dumps(DB,ensure_ascii=False)
print("注入脚本片段:", ("localStorage.setItem('wanglai.db.v1', " + s[:80]))
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context()
        await ctx.add_init_script("try{localStorage.clear();localStorage.setItem('wanglai.db.v1', %s)}catch(e){}" % s)
        pg=await ctx.new_page()
        await pg.goto("http://127.0.0.1:8900/")
        got = await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')")
        if got:
            d=json.loads(got)
            print("注入后 settings:", json.dumps(d['settings'],ensure_ascii=False))
        else:
            print("注入失败：localStorage 为空")
        await b.close()
asyncio.run(main())
