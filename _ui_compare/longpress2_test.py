# -*- coding: utf-8 -*-
"""长按改造后验收：长按=进多选（不再弹菜单）+ 标题栏全选入口"""
import asyncio, json, os, re, sys
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


def sel_count(t):
    m = re.search(r'已选\s*(\d+)', t)
    return int(m.group(1)) if m else 0


async def test_records(pg, errs, tag):
    print(f'\n=== {tag}：记录页 ===')
    await pg.goto('http://127.0.0.1:8900/')
    await pg.wait_for_timeout(1800)
    body = await pg.inner_text('body')

    # 标题栏全选入口
    allbtn = await pg.query_selector("button[aria-label='全选并批量操作']")
    chk(bool(allbtn), '标题栏有「全选」入口（可发现性）')

    # 长按不再弹菜单，直接进多选
    rows = await pg.query_selector_all('.row')
    await press(pg, rows[0], 700)
    body = await pg.inner_text('body')
    chk('编辑这条记录' not in body, '长按不再弹操作菜单（M3 规范）')
    chk(sel_count(body) == 1, f'长按直接选中该条（已选 {sel_count(body)}）')
    marks = await pg.query_selector_all('span[aria-hidden]')
    chk(len(marks) >= 1, '选中行有勾选标记')
    await pg.screenshot(path=os.path.join(OUT, f'{tag}_1_longpress.png'))

    # 多选模式下每行都有圆框（选中/未选中）
    boxes = await pg.evaluate("""() => {
      const rows=[...document.querySelectorAll('.row')];
      return rows.map(r => {
        const m=r.querySelector('span[aria-hidden]');
        const inset = r.style.boxShadow || '';
        return {hasMark: !!m, selected: inset.includes('inset')};
      });
    }""")
    if boxes:
        chk(all(b['hasMark'] for b in boxes),
            f'多选模式下每行都有圆框（共 {len(boxes)} 行）')
        chk(any(b['selected'] for b in boxes)
            and any(not b['selected'] for b in boxes),
            '圆框区分已选/未选两种状态')

    # 顶部工具条
    chk('全选' in body, '工具条有全选')
    chk('编辑' in body, '工具条有编辑')
    chk('删除' in body, '工具条有删除')

    # 继续点选第二条
    rows = await pg.query_selector_all('.row')
    box = await rows[1].bounding_box()
    await pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    await pg.mouse.down(); await pg.wait_for_timeout(80); await pg.mouse.up()
    await pg.wait_for_timeout(500)
    body = await pg.inner_text('body')
    chk(sel_count(body) == 2, f'点第二条后已选 2（实际 {sel_count(body)}）')

    # 编辑按钮：多于1条时应禁用
    edit = await pg.query_selector("button[aria-label='编辑所选']")
    disabled = await edit.get_attribute('disabled') if edit else None
    chk(edit is not None and disabled is not None,
        '选中 2 条时「编辑」禁用（无法决定编辑谁）')

    # 取消第一条
    rows = await pg.query_selector_all('.row')
    box = await rows[0].bounding_box()
    await pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    await pg.mouse.down(); await pg.wait_for_timeout(80); await pg.mouse.up()
    await pg.wait_for_timeout(500)
    body = await pg.inner_text('body')
    chk(sel_count(body) == 1, f'再点第一条取消选中（已选 {sel_count(body)}）')

    # 选中1条时编辑可用
    edit = await pg.query_selector("button[aria-label='编辑所选']")
    disabled = await edit.get_attribute('disabled') if edit else None
    chk(edit is not None and disabled is None,
        '选中 1 条时「编辑」可用')
    await pg.screenshot(path=os.path.join(OUT, f'{tag}_2_selectbar.png'))

    # 编辑能打开面板
    await pg.click("button[aria-label='编辑所选']")
    await pg.wait_for_timeout(1000)
    body = await pg.inner_text('body')
    chk('收礼（对方办的）' in body, '点「编辑」打开编辑面板')
    chk(sel_count(body) == 0, '编辑后退出多选')
    await pg.keyboard.press('Escape')
    await pg.wait_for_timeout(500)

    # 标题栏全选
    await pg.goto('http://127.0.0.1:8900/')
    await pg.wait_for_timeout(1700)
    await pg.click("button[aria-label='全选并批量操作']")
    await pg.wait_for_timeout(800)
    body = await pg.inner_text('body')
    chk(sel_count(body) == 4, f'标题栏全选选中 4 条（实际 {sel_count(body)}）')
    await pg.screenshot(path=os.path.join(OUT, f'{tag}_3_selectall.png'))

    # 批量删除
    before = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
    await pg.click("button[aria-label='删除所选']")
    await pg.wait_for_timeout(700)
    body = await pg.inner_text('body')
    chk('无法恢复' in body, '二次确认说明不可恢复')
    for bt in await pg.query_selector_all('.fixed button'):
        if (await bt.inner_text()).strip() == '删除':
            await bt.click()
            break
    await pg.wait_for_timeout(1400)
    after = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
    chk(len(after['records']) == 0,
        f'批量删除全部（{len(before["records"])} → {len(after["records"])}）')
    await pg.screenshot(path=os.path.join(OUT, f'{tag}_4_deleted.png'))

    # 退出多选后标题栏全选按钮回来
    allbtn = await pg.query_selector("button[aria-label='全选并批量操作']")
    chk(allbtn is None, '删空后全选按钮自动隐藏')


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
        pg.on('pageerror', lambda e: errs.append('PE: ' + str(e)[:150]))
        pg.on('console', lambda m: errs.append('CE: ' + m.text[:150])
              if m.type == 'error' else None)

        await test_records(pg, errs, 'r')

        # 人员页
        print('\n=== 人员页 ===')
        await pg.goto('http://127.0.0.1:8900/persons')
        await pg.wait_for_timeout(1800)
        allbtn = await pg.query_selector("button[aria-label='全选并批量操作']")
        chk(bool(allbtn), '人员页标题栏有全选入口')
        rows = await pg.query_selector_all('.row')
        await press(pg, rows[0], 700)
        body = await pg.inner_text('body')
        chk('删除这个人' not in body, '人员页长按也不弹菜单')
        chk(sel_count(body) == 1, f'长按选中 1 人（实际 {sel_count(body)}）')
        await pg.screenshot(path=os.path.join(OUT, 'p1_longpress.png'))
        # 取消
        await pg.click("button[aria-label='退出多选']")
        await pg.wait_for_timeout(600)
        body = await pg.inner_text('body')
        chk(sel_count(body) == 0, 'X 退出多选')

        # 滚动不误触发
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(1700)
        rows = await pg.query_selector_all('.row')
        box = await rows[0].bounding_box()
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        await pg.mouse.move(x, y)
        await pg.mouse.down(); await pg.wait_for_timeout(120)
        await pg.mouse.move(x, y - 130)
        await pg.wait_for_timeout(400)
        await pg.mouse.up(); await pg.wait_for_timeout(600)
        body = await pg.inner_text('body')
        chk(sel_count(body) == 0, '滑动列表不误触发选择')

        print('\n=== 控制台错误 ===')
        if errs:
            for e in errs[:6]:
                print('  ', e[:130])
            FAILS.append(f'{len(errs)} 控制台错误')
        else:
            print('  无')

        print('\n' + '=' * 46)
        print(f'失败项：{len(FAILS)}')
        for f in FAILS:
            print('  -', f)
        await b.close()


asyncio.run(main())