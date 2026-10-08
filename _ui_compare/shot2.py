import asyncio, os
from playwright.async_api import async_playwright
OUT = r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width':430,'height':932}, device_scale_factor=2)
        for route,name in [('/','dash'),('/add','add'),('/settings','settings'),('/history','history'),('/about','about')]:
            await pg.goto(f"http://127.0.0.1:8900{route}")
            await pg.wait_for_timeout(1800)
            await pg.screenshot(path=os.path.join(OUT,f"mine_{name}.png"))
            print("ok",name)
        await b.close()
asyncio.run(main())
