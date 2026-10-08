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
        # 分两步：先在页面里写，再读，看读取本身有没有被改
        await ctx.add_init_script("try{localStorage.setItem('wanglai.db.v1', %s);localStorage.setItem('wanglai.themedetect', JSON.stringify({tier:'high',theme:'a',cores:8,mem:16,screenLoad:921600,fps:60,reason:'test'}))}catch(e){}" % s)
        pg=await ctx.new_page()
        await pg.goto("http://127.0.0.1:8900/")
        await pg.wait_for_timeout(300)
        early = await pg.evaluate("()=>{const d=JSON.parse(localStorage.getItem('wanglai.db.v1'));return {t:d.settings.themePicked,f:d.settings.fontSize,c:d.settings.careMode}}")
        print("300ms 时:", early)
        await pg.wait_for_timeout(1800)
        late = await pg.evaluate("()=>{const d=JSON.parse(localStorage.getItem('wanglai.db.v1'));return {t:d.settings.themePicked,f:d.settings.fontSize,c:d.settings.careMode,th:d.settings.theme}}")
        print("2s 后:", late)
        print("detect 缓存:", await pg.evaluate("()=>localStorage.getItem('wanglai.themedetect')"))
        await b.close()
asyncio.run(main())
