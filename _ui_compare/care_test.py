# -*- coding: utf-8 -*-
import asyncio, json, os
from playwright.async_api import async_playwright
from _seed import with_settings
OUT = r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare/care"
os.makedirs(OUT, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        cases = [
            (with_settings(fontSize='off', careMode=False, theme='a'), '标准1x'),
            (with_settings(fontSize='md',  careMode=True,  theme='a'), '特大1.45x'),
            (with_settings(fontSize='xxl', careMode=True,  theme='a'), '最大2.10x'),
        ]
        for db, label in cases:
            s = json.dumps(db, ensure_ascii=False)
            ctx = await b.new_context(viewport={'width':414,'height':896}, device_scale_factor=2)
            # 用 add_script_tag 方式：先 goto 空页拿 origin，再注入后导航
            await ctx.add_init_script(
                "try{localStorage.setItem('wanglai.db.v1', " + json.dumps(s) + ")}catch(e){}"
            )
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(f'[{label}] {e}'))
            pg.on('console', lambda m: errs.append(f'[{label}] {m.text}') if m.type=='error' else None)
            for route, name in [('/', 'records'), ('/settings','settings'),
                                ('/almanac','almanac'), ('/taisui','taisui'), ('/todos','todos')]:
                await pg.goto(f"http://127.0.0.1:8900{route}")
                await pg.wait_for_timeout(1400)
                await pg.screenshot(path=os.path.join(OUT, f"{name}_{db['settings']['fontSize']}.png"),
                                    full_page=(route=='/'))
            info = await pg.evaluate("""() => {
              const de=document.documentElement;
              const btn=document.querySelector('.btn');
              const fld=document.querySelector('.field');
              const row=document.querySelector('.row');
              return {
                fs: de.getAttribute('data-fontsize'),
                care: de.getAttribute('data-care'),
                theme: de.getAttribute('data-theme'),
                bodyFs: getComputedStyle(document.body).fontSize,
                fLg: getComputedStyle(de).getPropertyValue('--f-lg').trim(),
                btnH: btn ? getComputedStyle(btn).height : '-',
                fldH: fld ? getComputedStyle(fld).height : '-',
                rowH: row ? getComputedStyle(row).minHeight : '-',
                hOverflow: de.scrollWidth > de.clientWidth + 1,
              };
            }""")
            print(f'  {label}:')
            for k,v in info.items(): print(f'      {k} = {v}')
            await ctx.close()
        print('errors:', errs[:5] if errs else '无')
        await b.close()
asyncio.run(main())
