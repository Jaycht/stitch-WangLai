import asyncio, os
from playwright.async_api import async_playwright
OUT = r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # 1) 我方
        pg = await b.new_page(viewport={'width':430,'height':932}, device_scale_factor=2)
        for route, name in [('/', 'dash'), ('/add','add'), ('/settings','settings'), ('/history','history'), ('/about','about')]:
            await pg.goto(f"http://127.0.0.1:8899/index.html#/{route.lstrip('/')}")
            await pg.wait_for_timeout(1500)
            await pg.screenshot(path=os.path.join(OUT, f"mine_{name}.png"))
            print("mine", name)
        await pg.close()
        # 2) 对方
        pg2 = await b.new_page(viewport={'width':2320,'height':1100}, device_scale_factor=2)
        await pg2.goto("file:///" + os.path.join(OUT,"theirs.html").replace("\\","/"))
        await pg2.wait_for_timeout(1000)
        await pg2.screenshot(path=os.path.join(OUT,"theirs_all.png"), full_page=True)
        print("theirs done")
        await b.close()

asyncio.run(main())
