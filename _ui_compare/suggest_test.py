# -*- coding: utf-8 -*-
"""输入历史下拉 + 系统字体兼容 实测"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from _seed import with_settings

OUT = r"E:\Deployment\WorkBuddy\往来礼记\_ui_compare\suggest"
os.makedirs(OUT, exist_ok=True)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        s = json.dumps(with_settings(theme='a', themePicked=True), ensure_ascii=False)
        ctx = await b.new_context(viewport={'width': 414, 'height': 896}, device_scale_factor=2)
        await ctx.add_init_script("try{localStorage.setItem('wanglai.db.v1', " + json.dumps(s) + ")}catch(e){}")
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PE: ' + str(e)))
        pg.on('console', lambda m: errs.append('CE: ' + m.text) if m.type == 'error' else None)

        # ---------- 1. 点击姓名框应弹出历史 ----------
        await pg.goto("http://127.0.0.1:8900/")
        await pg.wait_for_timeout(1500)
        await pg.click("button[aria-label='记一笔']")
        await pg.wait_for_timeout(800)
        name_in = await pg.query_selector("input[placeholder*='历史']")
        print("姓名框存在:", bool(name_in))
        await name_in.click()
        await pg.wait_for_timeout(600)
        opts = await pg.query_selector_all("[role='option']")
        print(f"点击后弹出选项数: {len(opts)}")
        texts = [ (await o.inner_text()).replace('\n',' / ') for o in opts ]
        for t in texts[:6]:
            print("   ", t)
        await pg.screenshot(path=os.path.join(OUT, "s1_focus.png"))

        # ---------- 2. 边打边检索 ----------
        await pg.fill("input[placeholder*='历史']", "李")
        await pg.wait_for_timeout(600)
        opts2 = await pg.query_selector_all("[role='option']")
        print(f"输入「李」后选项: {[ (await o.inner_text()).split(chr(10))[0] for o in opts2 ]}")

        # ---------- 3. 无匹配自动收起 ----------
        await pg.fill("input[placeholder*='历史']", "zzz不存在")
        await pg.wait_for_timeout(600)
        opts3 = await pg.query_selector_all("[role='option']")
        print(f"输入无匹配后选项数（应为0）: {len(opts3)}")
        await pg.screenshot(path=os.path.join(OUT, "s2_nomatch.png"))

        # ---------- 4. 键盘导航 + 回车选中 ----------
        await pg.fill("input[placeholder*='历史']", "")
        await pg.wait_for_timeout(400)
        await name_in.click()
        await pg.wait_for_timeout(500)
        await pg.keyboard.press("ArrowDown")
        await pg.keyboard.press("ArrowDown")
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(OUT, "s3_keyboard.png"))
        await pg.keyboard.press("Enter")
        await pg.wait_for_timeout(600)
        val = await name_in.input_value()
        print(f"键盘选中后输入框值: 「{val}」")

        # ---------- 5. 关系框历史 ----------
        rel_in = await pg.query_selector("input[placeholder*='历史']")
        # 关系框是第二个历史占位符
        all_h = await pg.query_selector_all("input[placeholder*='历史']")
        print(f"历史型输入框数量: {len(all_h)}（姓名1 + 关系1 = 2）")
        if len(all_h) >= 2:
            await all_h[1].click()
            await pg.wait_for_timeout(500)
            ropts = await pg.query_selector_all("[role='option']")
            print("关系历史:", [ (await o.inner_text()).replace('\n',' / ') for o in ropts ])
            await pg.screenshot(path=os.path.join(OUT, "s4_relation.png"))
            await pg.keyboard.press("Escape")

        # ---------- 6. 选中已有档案应自动带上关系与 personId ----------
        await pg.goto("http://127.0.0.1:8900/")
        await pg.wait_for_timeout(1400)
        await pg.click("button[aria-label='记一笔']")
        await pg.wait_for_timeout(700)
        ni = await pg.query_selector("input[placeholder*='历史']")
        await ni.click(); await pg.wait_for_timeout(500)
        await pg.keyboard.press("ArrowDown"); await pg.keyboard.press("ArrowDown")
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(600)
        vals = await pg.query_selector_all("input[placeholder*='历史']")
        print("选中第2项后 姓名/关系 =", await vals[0].input_value(), "/",
              await vals[1].input_value() if len(vals)>1 else '-')

        print("errors:", errs[:6] if errs else "无")
        await b.close()


asyncio.run(main())