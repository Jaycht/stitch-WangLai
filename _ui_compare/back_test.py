# -*- coding: utf-8 -*-
"""返回栈验收：三键返回 / 侧滑 / Esc 三条路径行为必须一致

模拟 Android MainActivity 的做法：直接调 window.__wlOnBack__()
并读它返回的字符串，这是原生层唯一能看到的东西。
"""
import asyncio, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from _seed import with_settings

OUT = r"E:\Deployment\WorkBuddy\往来礼记\_ui_compare\back"
os.makedirs(OUT, exist_ok=True)
FAILS = []


def chk(cond, msg):
    print(f"  [{'OK  ' if cond else 'FAIL'}] {msg}")
    if not cond:
        FAILS.append(msg)


async def press(pg, row, ms=700):
    box = await row.bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    await pg.mouse.move(x, y)
    await pg.mouse.down()
    await pg.wait_for_timeout(ms)
    await pg.mouse.up()
    await pg.wait_for_timeout(600)


async def tap(pg, row, ms=90):
    box = await row.bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    await pg.mouse.move(x, y)
    await pg.mouse.down()
    await pg.wait_for_timeout(ms)
    await pg.mouse.up()
    await pg.wait_for_timeout(700)


async def back(pg):
    """完全模拟原生层：调window.__wlOnBack__ 并返回结果字符串"""
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
        pg.on('pageerror', lambda e: errs.append('PE: ' + str(e)[:120]))
        pg.on('console', lambda m: errs.append('CE: ' + m.text[:120]) if m.type == 'error' else None)

        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(2100)

        print('\n=== 0. 原生桥存在 ===')
        chk(await pg.evaluate("()=>typeof window.__wlOnBack__") == 'function',
            'window.__wlOnBack__ 已挂载（MainActivity 靠它拿结果）')

        print('\n=== 1. Tab 根页：两次返回才退出 ===')
        r1 = await back(pg)
        chk(r1 == 'ask-exit', f'第 1 次按返回 → {r1}（应ask-exit，弹提示不退出）')
        await pg.wait_for_timeout(400)
        body = await pg.inner_text('body')
        chk('再按一次退出' in body, '提示「再按一次退出往来礼记」已显示')
        await pg.screenshot(path=os.path.join(OUT, 'exit_ask.png'))
        r2 = await back(pg)
        chk(r2 == 'exit-now', f'2 秒内第 2 次按 → {r2}（应 exit-now，原生 finish）')
        await pg.wait_for_timeout(400)
        chk('再按一次退出' not in await pg.inner_text('body'), '提示已消失')

        print('\n=== 2. 超时后重新计时（防误触） ===')
        await back(pg)                      # 第一次
        await pg.wait_for_timeout(2600)     # 等提示自动消失
        chk('再按一次退出' not in await pg.inner_text('body'), '2 秒后提示自动消失')
        r3 = await back(pg)
        chk(r3 == 'ask-exit', f'超时后再按 → {r3}（应重新询问，不是真退出）')

        print('\n=== 3. 弹层优先于路由（Sheet 拦截） ===')
        await pg.click("button[aria-label='记一笔']")
        await pg.wait_for_timeout(1100)
        chk('收礼（对方办的）' in await pg.inner_text('body'), '编辑面板已打开')
        rb = await back(pg)
        chk(rb == 'handled', f'弹层打开时按返回 → {rb}（应 handled，不是 exit）')
        await pg.wait_for_timeout(700)
        body = await pg.inner_text('body')
        chk('收礼（对方办的）' not in body, '弹层已关闭（没退出应用）')
        chk(len(await pg.query_selector_all('.row')) > 0, '列表还在')

        print('\n=== 4. 确认框也拦截（危险操作不能被返回静默取消） ===')
        # 走人员页：更短路径（列表 → 长按进多选 → 详情 → 编辑 → 删除）
        await pg.goto('http://127.0.0.1:8900/persons')
        await pg.wait_for_timeout(1900)
        rows = await pg.query_selector_all('.row')
        await tap(pg, rows[0])
        await pg.wait_for_timeout(1000)
        body = await pg.inner_text('body')
        chk('往来明细' in body or '复制微信号' in body or '设区分名' in body,
            '人员详情已打开（用详情专属内容判定，不用「删除」二字）')
        # 详情页的删除按钮
        hit = False
        for bt in await pg.query_selector_all('button'):
            if (await bt.inner_text()).strip() == '删除':
                await bt.click(); hit = True; break
        chk(hit, '点「删除」')
        await pg.wait_for_timeout(900)
        btns = [(await x.inner_text()).strip() for x in await pg.query_selector_all('button')]
        chk('取消' in btns and any('删除' in t for t in btns),
            f'删除二次确认框已弹出（按钮={btns[-4:]}）')
        await pg.screenshot(path=os.path.join(OUT, 'confirm_back.png'))
        rc = await back(pg)
        chk(rc == 'handled', f'确认框打开时按返回 → {rc}（应 handled）')
        await pg.wait_for_timeout(700)
        btns2 = [(await x.inner_text()).strip() for x in await pg.query_selector_all('button')]
        chk('取消' not in btns2[-4:],
            f'确认框已关闭（返回键当「取消」，不静默确认删除）后按钮={btns2[-4:]}')
        # 数据没被删
        db2 = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        chk(len(db2['records']) == 4, f'记录数仍为 4（没被误删）')

        print('\n=== 5. 多选模式优先于返回路由 ===')
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(1800)
        rows = await pg.query_selector_all('.row')
        await press(pg, rows[0])
        body = await pg.inner_text('body')
        m = re.search(r'已选\s*(\d+)', body)
        chk(bool(m) and m.group(1) == '1', f'长按进多选（已选 {m.group(1) if m else 0}）')
        rm = await back(pg)
        chk(rm == 'handled', f'多选时按返回 → {rm}（应 handled）')
        await pg.wait_for_timeout(600)
        body = await pg.inner_text('body')
        chk('已选' not in body, '多选已退出（没返回上一页）')
        chk(len(await pg.query_selector_all('.row')) > 0, '仍在记录页')
        await pg.screenshot(path=os.path.join(OUT, 'multi_back.png'))

        print('\n=== 6. 多级：弹层 > 多选 优先级 ===')
        rows = await pg.query_selector_all('.row')
        await press(pg, rows[0])
        await pg.wait_for_timeout(600)
        await pg.click("button[aria-label='删除所选']")
        await pg.wait_for_timeout(800)
        body = await pg.inner_text('body')
        chk('？' in body, '多选状态下打开了批量删除确认框')
        r1 = await back(pg)
        chk(r1 == 'handled', f'第 1 次返回 → {r1}（应关确认框）')
        await pg.wait_for_timeout(600)
        body = await pg.inner_text('body')
        chk('已选' in body, '确认框关了，但仍在多选（两层没串）')
        r2 = await back(pg)
        chk(r2 == 'handled', f'第 2 次返回 → {r2}（应退多选）')
        await pg.wait_for_timeout(600)
        chk('已选' not in await pg.inner_text('body'), '多选已退出')
        r3 = await back(pg)
        chk(r3 == 'ask-exit', f'第 3 次返回 → {r3}（应到根页退出确认）')
        await pg.screenshot(path=os.path.join(OUT, 'layered.png'))

        print('\n=== 7. 二级页：返回上一级而不是退出 ===')
        await pg.goto('http://127.0.0.1:8900/functions')
        await pg.wait_for_timeout(1700)
        for label, url in [('待办', '/todos'), ('万年黄历', '/almanac'),
                           ('吉日良辰', '/lucky'), ('关系计算', '/relation')]:
            await pg.goto('http://127.0.0.1:8900' + url)
            await pg.wait_for_timeout(1700)
            has_back = bool(await pg.query_selector("button[aria-label='返回']"))
            chk(has_back, f'{label} 顶栏有返回按钮')
            rb2 = await back(pg)
            chk(rb2 == 'handled', f'{label} 按返回 → {rb2}（应 handled，退回功能页）')
            await pg.wait_for_timeout(700)
            chk('功能' in await pg.inner_text('body'), f'{label} 已退回功能页')

        print('\n=== 8. Tab 根页顶栏无返回（M3 规范） ===')
        for label, url in [('记录', '/'), ('人员', '/persons'),
                           ('功能', '/functions'), ('我的', '/settings')]:
            await pg.goto('http://127.0.0.1:8900' + url)
            await pg.wait_for_timeout(1600)
            n = len(await pg.query_selector_all("button[aria-label='返回']"))
            chk(n == 0, f'{label}（Tab 根页）顶栏无返回箭头')

        print('\n=== 9. Esc 与返回键等价（模拟器调试路径） ===')
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(1800)
        await pg.click("button[aria-label='记一笔']")
        await pg.wait_for_timeout(1000)
        await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(700)
        chk('收礼（对方办的）' not in await pg.inner_text('body'),
            'Esc 能关弹层（与返回键同行为）')

        print('\n=== 控制台错误 ===')
        if errs:
            for e in errs[:6]:
                print('   ', e[:110])
            FAILS.append(f'{len(errs)} 个控制台错误')
        else:
            print('    无')

        print('\n' + '=' * 46)
        print(f'失败项：{len(FAILS)}')
        for f in FAILS:
            print('  -', f)
        await b.close()


asyncio.run(main())
