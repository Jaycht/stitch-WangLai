# -*- coding: utf-8 -*-
"""系统字体缩放兼容实测：
用 CDP 的 Emulation.setPageScaleFactor 不行，改用注入 CSS 模拟 textZoom。
Android WebView 的 textZoom 实际行为是「把页面按比例放大」，
我们用 CSS transform: scale() 模拟其对字号的影响，验证 --fs-sys 逻辑。"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from _seed import with_settings

OUT = r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare/sysfont"
os.makedirs(OUT, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        for fs, sysScale, label in [
            ('off', 1.0,  '标准 + 系统1.0'),
            ('auto', 1.0, '跟随系统 + 系统1.0'),
            ('auto', 1.30, '跟随系统 + 系统1.30'),
            ('md',   1.30, '应用1.45 + 系统1.30'),
            ('xxl',  1.0,  '应用2.10 + 系统1.0'),
        ]:
            db = with_settings(theme='a', themePicked=True,
                               fontSize=fs, careMode=(fs != 'off'))
            s = json.dumps(db, ensure_ascii=False)
            ctx = await b.new_context(viewport={'width':414,'height':896}, device_scale_factor=2)
            await ctx.add_init_script("try{localStorage.setItem('wanglai.db.v1', "+json.dumps(s)+")}catch(e){}")
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e,a=label: errs.append(f'[{a}] {e}'))
            await pg.goto("http://127.0.0.1:8900/")
            await pg.wait_for_timeout(1300)
            info = await pg.evaluate("""() => {
              const de=document.documentElement;
              const cs=getComputedStyle(de);
              return {
                fsApp: cs.getPropertyValue('--fs-app').trim(),
                fsSys: cs.getPropertyValue('--fs-sys').trim(),
                fs: cs.getPropertyValue('--fs').trim(),
                fLg: cs.getPropertyValue('--f-lg').trim(),
                bodyFs: getComputedStyle(document.body).fontSize,
                hOverflow: de.scrollWidth > de.clientWidth + 1,
              };
            }""")
            print(f"  {label}:")
            for k,v in info.items(): print(f"      {k} = {v}")
            await pg.screenshot(path=os.path.join(OUT, f"sys_{fs}_{int(sysScale*100)}.png"))
            await ctx.close()
        print("errors:", errs[:5] if errs else "无")
        await b.close()

asyncio.run(main())
