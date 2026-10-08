import asyncio, json
from playwright.async_api import async_playwright
OUT=r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare/v3"
DB = json.loads(open('db3.json',encoding='utf-8').read()) if __import__('os').path.exists('db3.json') else None
import t3
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':414,'height':896}, device_scale_factor=2)
        pg = await ctx.new_page()
        errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        s = json.dumps(t3.DB if hasattr(t3,'DB') else DB, ensure_ascii=False)
        await pg.goto("http://127.0.0.1:8900/?v="+str(asyncio.get_event_loop().time()))
        await pg.wait_for_timeout(500)
        await pg.evaluate("d => localStorage.setItem('wanglai.db.v1', d)", s)
        await pg.goto("http://127.0.0.1:8900/")
        await pg.wait_for_timeout(1600)
        d = json.loads(await pg.evaluate("() => localStorage.getItem('wanglai.db.v1')"))
        print("customEvents:", [c['label'] for c in d['customEvents']])
        print("r3 event:", [r['received']['event'] for r in d['records'] if r['id']=='r3'])
        body = await pg.inner_text("body")
        print("列表显示升学宴:", "升学宴" in body)
        await pg.screenshot(path=rf"{OUT}\records_fixed.png")
        print("errors:", errs if errs else "无")
        await b.close()
asyncio.run(main())
