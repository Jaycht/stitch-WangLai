import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width':414,'height':896}, device_scale_factor=2)
        errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto("http://127.0.0.1:8900/relation")
        await pg.wait_for_timeout(1200)
        has = await pg.evaluate("typeof window.relationship")
        print("window.relationship =", has)
        # 点第一个示例
        await pg.click("text=外婆的哥哥")
        await pg.wait_for_timeout(600)
        await pg.click("button[aria-label='计算']")
        await pg.wait_for_timeout(700)
        txt = await pg.inner_text("body")
        # 找结果区
        for line in txt.split("\n"):
            if "舅外祖" in line or "计算结果" in line or "没有找到" in line or "未加载" in line:
                print("  >", line.strip())
        await pg.screenshot(path=r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare/v2/relation_result.png")
        print("errors:", errs)
        await b.close()
asyncio.run(main())
