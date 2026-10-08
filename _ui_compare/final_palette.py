# -*- coding: utf-8 -*-
import asyncio, json, os, sys
sys.path.insert(0,'.')
from playwright.async_api import async_playwright
from _seed import with_settings
OUT=r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare/palette2"
os.makedirs(OUT,exist_ok=True)
ACCENTS=['#2F6B4F','#3B6E8F','#3A5A8C','#5A4A6B','#8A6D1F','#9E3B32','#A8342A','#4A7A45','#4A5450','#7A5C48']
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        errs=[]
        for ac in ACCENTS:
            s=json.dumps(with_settings(accent=ac, theme='a', themePicked=True), ensure_ascii=False)
            ctx=await b.new_context(viewport={'width':414,'height':896}, device_scale_factor=2)
            await ctx.add_init_script("try{localStorage.setItem('wanglai.db.v1', "+json.dumps(s)+")}catch(e){}")
            pg=await ctx.new_page()
            pg.on('pageerror', lambda e,a=ac: errs.append(f'[{a}] {e}'))
            await pg.goto("http://127.0.0.1:8900/")
            await pg.wait_for_timeout(1200)
            await pg.screenshot(path=os.path.join(OUT,f"acc_{ac[1:]}.png"))
            got = await pg.evaluate("()=>getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()")
            ok = got.lower()==ac.lower()
            print(f"  {ac} -> 实际 {got} {'✓' if ok else '✗'}")
            await ctx.close()
        print('errors:', errs[:4] if errs else '无')
        await b.close()
asyncio.run(main())
