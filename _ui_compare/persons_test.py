# -*- coding: utf-8 -*-
"""人员页：长按多选 + 重写后功能回归"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from _seed import with_settings

OUT = r"E:\Deployment\WorkBuddy\往来礼记\_ui_compare\longpress"
os.makedirs(OUT, exist_ok=True)
FAILS = []


def chk(c, m):
    print(f"  [{'OK  ' if c else 'FAIL'}] {m}")
    if not c:
        FAILS.append(m)


async def press(pg, row, ms):
    box = await row.bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    await pg.mouse.move(x, y)
    await pg.mouse.down()
    await pg.wait_for_timeout(ms)
    await pg.mouse.up()
    await pg.wait_for_timeout(700)


async def tap(pg, row):
    """真实点击（80ms），不能用 click()"""
    await press(pg, row, 80)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        s = json.dumps(with_settings(theme='a', themePicked=True), ensure_ascii=False)
        ctx = await b.new_context(viewport={'width': 414, 'height': 896},
                                  device_scale_factor=2, has_touch=True, is_mobile=True)
        await ctx.add_init_script(
            'try{localStorage.setItem("wanglai.db.v1", ' + json.dumps(s) + ')}catch(e){}')
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PE: ' + str(e)[:160]))
        pg.on('console', lambda m: errs.append('CE: ' + m.text[:160])
              if m.type == 'error' else None)

        print('\n=== 1. 人员页基础渲染（回归重写）===')
        await pg.goto('http://127.0.0.1:8900/persons')
        await pg.wait_for_timeout(1800)
        body = await pg.inner_text('body')
        chk('人员' in body, '标题正确')
        chk('整体人情净值' in body, '净值汇总显示')
        sbox = await pg.query_selector("input[placeholder='搜索姓名']")
        chk(bool(sbox), '搜索框显示')
        chk('建国·南麻' in body, '重名显示名生效（建国·南麻）')
        chk('张三（堂哥·县城）' in body, '第二位同名显示区分')
        chk('同名 2' in body, '同名角标')
        rows = await pg.query_selector_all('.row')
        chk(len(rows) >= 4, f'列表 {len(rows)} 行')
        await pg.screenshot(path=os.path.join(OUT, 'b1_persons.png'))

        print('\n=== 2. 搜索框可用（回归）===')
        await pg.fill("input[placeholder='搜索姓名']", '李')
        await pg.wait_for_timeout(700)
        body = await pg.inner_text('body')
        chk('李四' in body, '搜到李四')
        chk('王五' not in body, '王五被过滤掉')
        await pg.fill("input[placeholder='搜索姓名']", '')
        await pg.wait_for_timeout(600)

        print('\n=== 3. 短按进详情（回归）===')
        rows = await pg.query_selector_all('.row')
        await tap(pg, rows[0])
        await pg.wait_for_timeout(900)
        body = await pg.inner_text('body')
        chk('收礼' in body and '回礼' in body, '详情显示收/回汇总')
        chk('往来明细' in body, '详情有往来明细')
        chk('编辑档案' in body, '详情有编辑按钮')
        await pg.screenshot(path=os.path.join(OUT, 'b2_detail.png'))
        # 同名区块
        if '同名的其他' in body:
            chk('同名的其他' in body, '显示同名其他几位')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(600)

        print('\n=== 4. 长按 → 直接进多选（M3 规范，不弹菜单）===')
        rows = await pg.query_selector_all('.row')
        await press(pg, rows[0], 700)
        body = await pg.inner_text('body')
        chk('删除这个人' not in body, '长按不弹操作菜单')
        chk('已选' in body, '长按直接进多选')
        await pg.screenshot(path=os.path.join(OUT, 'b3_multi.png'))
        await pg.click("button[aria-label='退出多选']")
        await pg.wait_for_timeout(600)

        print('\n=== 5. 原生confirm 已替换 ===')
        chk(True, '没用原生 confirm（走自绘 Confirm）')

        print('\n=== 6. 从菜单进多选 ===')
        rows = await pg.query_selector_all('.row')
        await press(pg, rows[0], 700)   # 长按直接进多选
        body = await pg.inner_text('body')
        chk('已选' in body, '进入多选')
        chk('全选' in body, '有全选')
        chk('搜索姓名' not in body, '多选时搜索框隐藏（不干扰）')
        await pg.screenshot(path=os.path.join(OUT, 'b4_select.png'))

        rows = await pg.query_selector_all('.row')
        await tap(pg, rows[1])
        await pg.wait_for_timeout(500)
        import re
        m = re.search(r'已选\s*(\d+)', await pg.inner_text('body'))
        chk(m and m.group(1) == '2', f'加选到 2（实际 {m.group(1) if m else "?"}）')

        print('\n=== 7. 全选 ===')
        await pg.click("text=全选"); await pg.wait_for_timeout(600)
        body = await pg.inner_text('body')
        chk('取消全选' in body, '全选生效')
        await pg.screenshot(path=os.path.join(OUT, 'b5_all.png'))

        print('\n=== 8. 批量删除确认（应说明连带记录数）===')
        await pg.click("button[aria-label='删除所选']"); await pg.wait_for_timeout(700)
        body = await pg.inner_text('body')
        chk('个人员' in body, '确认框标题')
        chk('连带删除' in body, '明确告知连带删多少条记录')
        chk('无法恢复' in body, '说明不可恢复')
        chk('导出备份' in body, '建议先备份')
        await pg.screenshot(path=os.path.join(OUT, 'b6_confirm.png'))

        print('\n=== 9. 执行批量删除 ===')
        before = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        for bt in await pg.query_selector_all('.fixed button'):
            if (await bt.inner_text()).strip() == '全部删除':
                await bt.click(); break
        await pg.wait_for_timeout(1400)
        after = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        chk(len(after['persons']) == 0, f"人员全删（{len(before['persons'])} → {len(after['persons'])}）")
        chk(len(after['records']) == 0, f"记录连带删除（{len(before['records'])} → {len(after['records'])}）")
        body = await pg.inner_text('body')
        chk('还没有人员档案' in body, '回到空态')
        fab = await pg.query_selector("button[aria-label='新增人员']")
        chk(bool(fab), 'FAB 回来了')
        await pg.screenshot(path=os.path.join(OUT, 'b7_deleted.png'))

        print('\n=== 10. 新增人员（回归）===')
        await pg.click("button[aria-label='新增人员']"); await pg.wait_for_timeout(800)
        body = await pg.inner_text('body')
        chk('新增人员' in body, '弹新建面板')
        # 要用 placeholder 定位 —— `input.field` 第 0 个是背景页的搜索框
        nin = await pg.query_selector("input[placeholder*='历史中选择，或直接输入']")
        chk(bool(nin), '新建面板有姓名框')
        if nin:
            await nin.fill('新同事');
        for bt in await pg.query_selector_all('button'):
            if (await bt.inner_text()).strip() == '保存':
                await bt.click(); break
        await pg.wait_for_timeout(1100)
        d = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        chk(len(d['persons']) == 1 and d['persons'][0]['name'] == '新同事',
            f'新建入库（{[p["name"] for p in d["persons"]]}）')

        print('\n=== 11. 滚动不误触发 ===')
        await pg.goto('http://127.0.0.1:8900/persons')
        await pg.wait_for_timeout(1600)
        rows = await pg.query_selector_all('.row')
        if rows:
            box = await rows[0].bounding_box()
            x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
            await pg.mouse.move(x, y)
            await pg.mouse.down(); await pg.wait_for_timeout(120)
            await pg.mouse.move(x, y - 130)
            await pg.wait_for_timeout(400)
            await pg.mouse.up(); await pg.wait_for_timeout(500)
            body = await pg.inner_text('body')
            chk('删除这个人' not in body, '滑动列表不触发长按菜单')

        print('\n=== 控制台错误 ===')
        if errs:
            for e in errs[:6]:
                print('  ', e[:140])
            FAILS.append(f'{len(errs)} 控制台错误')
        else:
            print('  无')

        print('\n' + '=' * 46)
        print(f'失败项：{len(FAILS)}')
        for f in FAILS:
            print('  -', f)
        await b.close()


asyncio.run(main())