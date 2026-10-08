# -*- coding: utf-8 -*-
"""v2.12.0 验收：侧滑先回主页 + Tab 栏磨砂 + 金额框键盘"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from _seed import with_settings

OUT = r"E:\Deployment\WorkBuddy\往来礼记\_ui_compare\v212"
os.makedirs(OUT, exist_ok=True)
FAILS = []


def chk(cond, msg):
    print(f"  [{'OK  ' if cond else 'FAIL'}] {msg}")
    if not cond:
        FAILS.append(msg)


async def back(pg):
    """完全模拟原生层：调 window.__wlOnBack() 读返回值"""
    return await pg.evaluate("()=>window.__wlOnBack__ ? window.__wlOnBack__() : 'MISSING'")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        s = json.dumps(with_settings(theme='a', themePicked=True), ensure_ascii=False)
        ctx = await b.new_context(viewport={'width': 412, 'height': 892},
                                  has_touch=True, is_mobile=True)
        await ctx.add_init_script(
            'try{localStorage.setItem("wanglai.db.v1", ' + json.dumps(s) + ')}catch(e){}')
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PE: ' + str(e)[:110]))
        pg.on('console', lambda m: errs.append('CE: ' + m.text[:110]) if m.type == 'error' else None)

        print('\n=== 1. 三个 Tab 页：按返回先切到记录页 ===')
        for label, url in [('人员', '/persons'), ('功能', '/functions'), ('我的', '/settings')]:
            await pg.goto('http://127.0.0.1:8900' + url)
            await pg.wait_for_timeout(1900)
            r = await back(pg)
            chk(r == 'handled', f'{label} 按返回 → {r}（应 handled，不退出应用）')
            await pg.wait_for_timeout(1000)
            path = await pg.evaluate('()=>location.pathname')
            chk(path == '/', f'{label} → 已切到记录页（当前 {path}）')
            chk('收礼合计' in await pg.inner_text('body'), f'{label} → 记录页内容正确')
            # 记录页再按才弹退出提醒
            r2 = await back(pg)
            chk(r2 == 'ask-exit', f'记录页再按 → {r2}（应ask-exit）')
            await pg.wait_for_timeout(600)
            chk('再按一次退出' in await pg.inner_text('body'), '退出提醒已显示')
            await pg.screenshot(path=os.path.join(OUT, f'back_{url[1:]}.png'))

        print('\n=== 2. 二级页仍按原逻辑返回上一级 ===')
        for label, url in [('待办', '/todos'), ('万年黄历', '/almanac'), ('亲缘', '/relation')]:
            await pg.goto('http://127.0.0.1:8900/functions')
            await pg.wait_for_timeout(1700)
            await pg.goto('http://127.0.0.1:8900' + url)
            await pg.wait_for_timeout(1800)
            r = await back(pg)
            chk(r == 'handled', f'{label} 按返回 → {r}（应 handled）')
            await pg.wait_for_timeout(900)
            path = await pg.evaluate('()=>location.pathname')
            chk(path == '/functions', f'{label} → 已退回功能页（当前 {path}）')

        print('\n=== 3. Tab 栏：磨砂 + 高度 + 图标不顶天 ===')
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(2000)
        m = await pg.evaluate("""()=>{
          const tb = document.querySelector('.tabbar');
          const cs = getComputedStyle(tb);
          const ti = document.querySelector('.tabitem');
          const ic = ti.querySelector('.tabicon');
          const tr = tb.getBoundingClientRect();
          const ir = ic.getBoundingClientRect();
          return {
            h: Math.round(tr.height),
            bg: cs.backgroundColor,
            blur: cs.backdropFilter,
            shadow: cs.boxShadow.slice(0, 60),
            iconTopGap: Math.round(ir.top - tr.top),
            iconBottomGap: Math.round(tr.bottom - ir.bottom),
          };
        }""")
        for k, v in m.items():
            print(f'    {k} = {v}')
        chk(m['h'] >= 62, f"Tab 栏高度 {m['h']}px（应≥62）")
        chk('0.88' in m['bg'] or '0.9' in m['bg'], f"背景不透明度 {m['bg']}")
        # headless Chromium 不实现 backdrop-filter（真机有效），
        # 所以这里只能验证「降级路径的不透明度够高」——
        # 真机上 blur 生效时会用 0.94/0.95，降级时用 0.984。
        chk(m['bg'].endswith('0.984)') or '0.98' in m['bg'],
            f"降级路径底色 {m['bg']}（必须接近不透明）")
        chk('inset' in m['shadow'], '有内阴影（磨砂边缘高光）')
        chk(m['iconTopGap'] >= 8, f"图标距顶 {m['iconTopGap']}px（应≥8）")
        chk(m['iconBottomGap'] >= 20, f"图标距底 {m['iconBottomGap']}px")
        await pg.screenshot(path=os.path.join(OUT, 'tab_frost.png'))

        print('\n=== 4. Tab 栏不能遮内容（滚到底）===')
        await pg.goto('http://127.0.0.1:8900/functions')
        await pg.wait_for_timeout(1900)
        r = await pg.evaluate("""()=>{
          window.scrollTo(0, document.body.scrollHeight);
          const tb = document.querySelector('.tabbar').getBoundingClientRect();
          const cards = [...document.querySelectorAll('.card')];
          const last = cards[cards.length-1];
          if(!last) return {none:true};
          return {lastBottom: Math.round(last.getBoundingClientRect().bottom),
                  tabTop: Math.round(tb.top),
                  covered: last.getBoundingClientRect().bottom > tb.top + 1};
        }""")
        chk(not r.get('covered'), f"滚到底不遮挡（last={r.get('lastBottom')} tab顶={r.get('tabTop')}）")
        await pg.screenshot(path=os.path.join(OUT, 'scroll_bottom.png'))

        print('\n=== 5. 金额框 type=tel（WebView 数字键盘）===')
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(1900)
        await pg.click("button[aria-label='记一笔']")
        await pg.wait_for_timeout(1100)
        t = await pg.evaluate("""()=>{
          const i = document.querySelector('input[inputmode="decimal"]');
          return i ? {type: i.type, im: i.inputMode} : null;
        }""")
        chk(bool(t), '金额框存在')
        if t:
            chk(t['type'] == 'tel', f"type={t['type']}（应 tel，WebView 才弹数字键盘）")
        # 小数点仍可输入
        ni = await pg.query_selector("input[inputmode='decimal']")
        if ni:
            await ni.fill('1234.56')
            await pg.wait_for_timeout(500)
            v = await ni.input_value()
            chk(v == '1234.56', f'小数点可正常输入（{v}）')
            await ni.fill('12a3.4b5')
            await pg.wait_for_timeout(500)
            v2 = await ni.input_value()
            chk(v2 == '123.45', f'字母被过滤（{v2}）')

        print('\n=== 6. 控制台错误 ===')
        if errs:
            for e in errs[:5]:
                print('   ', e[:110])
            FAILS.append(f'{len(errs)} 错误')
        else:
            print('    无')

        print('\n' + '=' * 46)
        print(f'失败项：{len(FAILS)}')
        for f in FAILS:
            print('  -', f)
        await b.close()


asyncio.run(main())
