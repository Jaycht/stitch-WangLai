# -*- coding: utf-8 -*-
import asyncio, json, os, sys
sys.path.insert(0, '.')
from playwright.async_api import async_playwright
from _seed import with_settings
OUT = r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare/suggest"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        s = json.dumps(with_settings(theme='a', themePicked=True), ensure_ascii=False)
        ctx = await b.new_context(viewport={'width':414,'height':896}, device_scale_factor=2)
        await ctx.add_init_script("try{localStorage.setItem('wanglai.db.v1', "+json.dumps(s)+")}catch(e){}")
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto("http://127.0.0.1:8900/")
        await pg.wait_for_timeout(1400)
        await pg.click("button[aria-label='记一笔']")
        await pg.wait_for_timeout(700)
        ni = await pg.query_selector("input[placeholder*='历史']")

        # 1. 触屏：刚弹出时第一项不应高亮
        await ni.click(); await pg.wait_for_timeout(600)
        hi0 = await pg.evaluate("()=>document.querySelectorAll('[role=option].bg-accent-soft').length")
        print(f"触屏弹出时高亮项数（应为0）: {hi0}")
        await pg.screenshot(path=os.path.join(OUT,"final_touch.png"))

        # 2. 键盘：按↓出现高亮，且落在第一项
        await pg.keyboard.press("ArrowDown"); await pg.wait_for_timeout(300)
        hi1 = await pg.evaluate("""()=>{
          const a=[...document.querySelectorAll('[role=option]')];
          return {n:a.filter(x=>x.classList.contains('bg-accent-soft')).length,
                  which:a.findIndex(x=>x.classList.contains('bg-accent-soft'))};
        }""")
        print(f"按↓后: 高亮数={hi1['n']} 位置={hi1['which']}（应为 1 / 0）")
        await pg.screenshot(path=os.path.join(OUT,"final_key1.png"))

        # 3. 再按↓移到第二项
        await pg.keyboard.press("ArrowDown"); await pg.wait_for_timeout(250)
        w2 = await pg.evaluate("""()=>[...document.querySelectorAll('[role=option]')].findIndex(x=>x.classList.contains('bg-accent-soft'))""")
        print(f"再按↓位置={w2}（应为 1）")

        # 4. ↑ 从无到有应落到最后一项
        await pg.evaluate("""()=>{const i=document.querySelector('input[placeholder*=\\"历史\\"]');i.value='';i.dispatchEvent(new Event('input',{bubbles:true}));}""")
        await pg.wait_for_timeout(500)
        await pg.click("input[placeholder*='历史']"); await pg.wait_for_timeout(400)
        await pg.keyboard.press("ArrowUp"); await pg.wait_for_timeout(250)
        w3 = await pg.evaluate("""()=>{const a=[...document.querySelectorAll('[role=option]')];
          return a.findIndex(x=>x.classList.contains('bg-accent-soft'))+'/'+a.length;}""")
        print(f"首次按↑位置/总数={w3}（应为 3/4，即最后一项）")

        # 5. Enter 确认
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(600)
        print("Enter 后输入框值:", await ni.input_value())

        # 6. Esc 关闭
        await ni.click(); await pg.wait_for_timeout(500)
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(400)
        n_open = await pg.evaluate("()=>document.querySelectorAll('[role=option]').length")
        print(f"Esc 后列表项数（应为0）: {n_open}")

        print("errors:", errs[:5] if errs else "无")
        await b.close()

asyncio.run(main())
