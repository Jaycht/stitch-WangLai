# -*- coding: utf-8 -*-
"""模拟系统字体放大：
Chrome 无 textZoom，但可用 CDP 的 Emulation.setPageScaleFactor 不改字号。
改用「把 --fs-sys 直接设成 1.3」等价于系统放大的结果 ——
因为我们已经把系统和应用的倍率合并到这一个变量里。"""
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
        cases = [
            ('off', 1.0,  '标准1.0'),
            ('off', 1.30, '系统放大1.30（应用标准档）'),
            ('auto', 1.30, '跟随系统1.30'),
            ('md',   1.30, '应用1.45 vs 系统1.30 → 取大'),
        ]
        for fs, simSys, label in cases:
            db = with_settings(theme='a', themePicked=True,
                               fontSize=fs, careMode=(fs != 'off'))
            s = json.dumps(db, ensure_ascii=False)
            ctx = await b.new_context(viewport={'width':414,'height':896}, device_scale_factor=2)
            # 模拟「系统已经放大了」：在 app 代码跑之前把探测值预置
            await ctx.add_init_script(
                "try{localStorage.setItem('wanglai.db.v1', " + json.dumps(s) + ")}catch(e){}"
            )
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e,a=label: errs.append(f'[{a}] {e}'))
            await pg.goto("http://127.0.0.1:8900/")
            await pg.wait_for_timeout(1200)
            # 强行改 --fs-sys 模拟系统已放大
            await pg.evaluate(f"""() => {{
              document.documentElement.style.setProperty('--fs-sys', '{simSys}');
              if ({simSys} > 1.02) document.documentElement.setAttribute('data-fontsize-scaled','on');
            }}""")
            await pg.wait_for_timeout(400)
            info = await pg.evaluate("""() => {
              const de=document.documentElement;
              return {
                fs: getComputedStyle(de).getPropertyValue('--fs').trim(),
                bodyFs: getComputedStyle(document.body).fontSize,
                scaled: de.getAttribute('data-fontsize-scaled'),
                hOverflow: de.scrollWidth > de.clientWidth + 1,
              };
            }""")
            print(f"  {label}: fs={info['fs']} body={info['bodyFs']} scaled={info['scaled']} 溢出={info['hOverflow']}")
            await pg.goto("http://127.0.0.1:8900/")
            await pg.wait_for_timeout(1000)
            await pg.evaluate(f"""() => {{
              document.documentElement.style.setProperty('--fs-sys', '{simSys}');
              if ({simSys} > 1.02) document.documentElement.setAttribute('data-fontsize-scaled','on');
            }}""")
            await pg.wait_for_timeout(500)
            await pg.screenshot(path=os.path.join(OUT, f"sim_{fs}_{int(simSys*100)}.png"))
            await pg.goto("http://127.0.0.1:8900/settings")
            await pg.wait_for_timeout(1200)
            await pg.evaluate(f"""() => {{
              document.documentElement.style.setProperty('--fs-sys', '{simSys}');
              if ({simSys} > 1.02) document.documentElement.setAttribute('data-fontsize-scaled','on');
            }}""")
            await pg.wait_for_timeout(500)
            await pg.screenshot(path=os.path.join(OUT, f"simset_{fs}_{int(simSys*100)}.png"))
            await ctx.close()
        print("errors:", errs[:5] if errs else "无")
        await b.close()

asyncio.run(main())
