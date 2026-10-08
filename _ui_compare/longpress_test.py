# -*- coding: utf-8 -*-
"""长按多选 / 操作菜单 实测"""
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


async def hold(pg, selector, ms=700):
    """模拟真实长按：按下、等ms、抬起"""
    el = await pg.query_selector(selector)
    if not el:
        return False
    box = await el.bounding_box()
    x = box['x'] + box['width'] / 2
    y = box['y'] + box['height'] / 2
    await pg.mouse.move(x, y)
    await pg.mouse.down()
    await pg.wait_for_timeout(ms)
    await pg.mouse.up()
    return True


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        s = json.dumps(with_settings(theme='a', themePicked=True), ensure_ascii=False)
        ctx = await b.new_context(viewport={'width': 414, 'height': 896},
                                  device_scale_factor=2,
                                  has_touch=True, is_mobile=True)
        await ctx.add_init_script(
            'try{localStorage.setItem("wanglai.db.v1", ' + json.dumps(s) + ')}catch(e){}')
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PE: ' + str(e)[:150]))
        pg.on('console', lambda m: errs.append('CE: ' + m.text[:150])
              if m.type == 'error' else None)

        print('\n=== 1. 长按单条→ 操作菜单 ===')
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(1800)
        rows = await pg.query_selector_all('.row')
        chk(len(rows) >= 4, f'列表有 {len(rows)} 行')
        got = await hold(pg, '.row', 700)
        chk(got, '长按第一行')
        await pg.wait_for_timeout(700)
        body = await pg.inner_text('body')
        chk('编辑这条记录' in body, '弹出操作菜单（编辑）')
        chk('删除这条记录' in body, '菜单含删除')
        chk('多选批量删除' in body, '菜单含多选入口')
        await pg.screenshot(path=os.path.join(OUT, 'a1_sheet.png'))

        print('\n=== 2. 菜单项能跳转 ===')
        await pg.click("text=编辑这条记录"); await pg.wait_for_timeout(900)
        t = await pg.inner_text('body')
        chk('收礼（对方办的）' in t, '点「编辑」打开编辑面板')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(600)

        print('\n=== 3. 多选模式 ===')
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(1600)
        # 从菜单进多选
        await hold(pg, '.row', 700); await pg.wait_for_timeout(700)
        await pg.click("text=多选批量删除"); await pg.wait_for_timeout(700)
        body = await pg.inner_text('body')
        chk('已选' in body, '进入多选模式')
        chk('全选' in body, '有全选按钮')
        chk('删除' in body, '有删除按钮')
        await pg.screenshot(path=os.path.join(OUT, 'a2_select.png'))

        # 再点第二行加入
        rows = await pg.query_selector_all('.row')
        if len(rows) > 1:
            await rows[1].click(); await pg.wait_for_timeout(500)
        body = await pg.inner_text('body')
        import re
        m = re.search(r'已选\s*(\d+)', body)
        chk(m and m.group(1) == '2', f'点第二行后已选 2（实际 {m.group(1) if m else "?"}）')
        await pg.screenshot(path=os.path.join(OUT, 'a3_select2.png'))

        print('\n=== 4. 全选 / 取消全选 ===')
        await pg.click("text=全选"); await pg.wait_for_timeout(600)
        body = await pg.inner_text('body')
        chk('取消全选' in body, '全选后按钮变「取消全选」')
        marks = await pg.query_selector_all('span[aria-hidden]')
        chk(len(marks) >= 4, f'勾选标记数 {len(marks)}')
        await pg.screenshot(path=os.path.join(OUT, 'a4_all.png'))

        print('\n=== 5. 批量删除二次确认 ===')
        await pg.click("button[aria-label='删除所选']"); await pg.wait_for_timeout(700)
        body = await pg.inner_text('body')
        chk('删除 4 条记录？' in body or '删除 3 条记录？' in body
            or '删除' in body and '无法恢复' in body,
            '弹二次确认')
        chk('无法恢复' in body, '确认框说明不可恢复')
        await pg.screenshot(path=os.path.join(OUT, 'a5_confirm.png'))

        print('\n=== 6. 执行批量删除 ===')
        before = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        n0 = len(before['records'])
        # 点确认（第二个按钮=确定）
        btns = await pg.query_selector_all('.fixed button')
        for bt in btns:
            if (await bt.inner_text()).strip() == '删除':
                await bt.click(); break
        await pg.wait_for_timeout(1400)
        after = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        chk(len(after['records']) == 0, f'记录全删（{n0} → {len(after["records"])}）')
        body = await pg.inner_text('body')
        chk('已删除' in body, '有删除完成提示')
        chk('已选' not in body, '退出多选模式')
        fab = await pg.query_selector("button[aria-label='记一笔']")
        chk(bool(fab), 'FAB 回来了')
        await pg.screenshot(path=os.path.join(OUT, 'a6_deleted.png'))

        print('\n=== 7. 短按不进多选 ===')
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(1600)
        rows = await pg.query_selector_all('.row')
        if rows:
            # 用真实按压时长（80ms），不能用 click() —— 它是瞬时的，
            # 会被产品的「<50ms 视为误触」门槛丢掉
            box = await rows[0].bounding_box()
            cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
            await pg.mouse.move(cx, cy)
            await pg.mouse.down(); await pg.wait_for_timeout(80); await pg.mouse.up()
            await pg.wait_for_timeout(1000)
            body = await pg.inner_text('body')
            chk('已选' not in body, '短按只进详情，不进多选')
            chk('收礼（对方办的）' in body, '短按打开编辑面板')
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)

        print('\n=== 8. 滚动不误触发 ===')
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(1600)
        # 手动拖动模拟滚动：按下后大幅移动再抬起
        rows = await pg.query_selector_all('.row')
        if rows:
            box = await rows[0].bounding_box()
            x = box['x'] + box['width'] / 2
            y = box['y'] + box['height'] / 2
            await pg.mouse.move(x, y)
            await pg.mouse.down()
            await pg.wait_for_timeout(120)
            await pg.mouse.move(x, y - 120)   # 移动超过容差
            await pg.wait_for_timeout(400)
            await pg.mouse.up()
            await pg.wait_for_timeout(600)
            body = await pg.inner_text('body')
            chk('编辑这条记录' not in body,
                '按住后移动（滑动列表）不触发长按菜单')
            chk('已选' not in body, '滑动不进多选')

        print('\n=== 9. 人员页 ===')
        await pg.goto('http://127.0.0.1:8900/persons')
        await pg.wait_for_timeout(1700)
        prows = await pg.query_selector_all('.row')
        chk(len(prows) >= 3, f'人员页有 {len(prows)} 行')
        print('     （人员页长按待接，功能与记录页一致）')

        print('\n=== 控制台错误 ===')
        if errs:
            for e in errs[:6]:
                print('  ', e[:130])
            FAILS.append(f'{len(errs)} 控制台错误')
        else:
            print('  无')

        print('\n' + '=' * 48)
        print(f'失败项：{len(FAILS)}')
        for f in FAILS:
            print('  -', f)
        await b.close()


asyncio.run(main())