import asyncio, json
from playwright.async_api import async_playwright
DB={"schemaVersion":2,"persons":[{"id":"p1","name":"王建国","relation":"表弟","createdAt":"2026-01-02T08:00:00Z","updatedAt":"2026-01-02T08:00:00Z"}],"records":[],"settings":{"accent":"#B3271E","bg":"#F4F2EE","appLock":False,"currency":"¥","weekStart":1},"updatedAt":"2026-10-06T08:00:00Z"}
s = json.dumps(DB, ensure_ascii=False)
print("JSON片段:", s[:120])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context()
        await ctx.add_init_script("window.localStorage.setItem('wanglai.db.v1', %s);" % s)
        pg = await ctx.new_page()
        await pg.goto("http://127.0.0.1:8900/")
        await pg.wait_for_timeout(1500)
        raw = await pg.evaluate("() => window.localStorage.getItem('wanglai.db.v1')")
        print("落盘:", (raw or '')[:160])
        await b.close()
asyncio.run(main())
