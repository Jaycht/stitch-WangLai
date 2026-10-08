# -*- coding: utf-8 -*-
"""v2.9.0 新增三项验收：动态提示词 / 删除按钮比例 / 待办+自定义事由长按"""
import asyncio, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from _seed import with_settings

OUT = r"E:\Deployment\WorkBuddy\往来礼记\_ui_compare\v29"
os.makedirs(OUT, exist_ok=True)
FAILS = []


def chk(c, m):
    print(f"  [{'OK  ' if c else 'FAIL'}] {m}")
    if not c:
        FAILS.append(m)


def seln(t):
    m = re.search(r'已选\s*(\d+)', t)
    return int(m.group(1)) if m else 0


async def press(pg, row, ms):
    box = await row.bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    await pg.mouse.move(x, y)
    await pg.mouse.down()
    await pg.wait_for_timeout(ms)
    await pg.mouse.up()
    await pg.wait_for_timeout(700)


async def tap(pg, row):
    # 注意：必须传入「刚重新查询到」的句柄。
    # React 重渲染会替换 DOM 节点，旧句柄会 detached。
    box = await row.bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    await pg.mouse.move(x, y)
    await pg.mouse.down()
    await pg.wait_for_timeout(80)
    await pg.mouse.up()
    await pg.wait_for_timeout(500)


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

        # ---------- 1. 动态提示词 ----------
        print('\n=== 1. 备注提示词随事由变化 ===')
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(1800)
        await pg.click("button[aria-label='记一笔']")
        await pg.wait_for_timeout(900)

        ta = await pg.query_selector('textarea.field-area')

        def ph():
            return ta.get_attribute('placeholder')

        # 默认已选中「结婚」（默认第一个喜事），提示词应即时生效
        base = await ph()
        chk('新人姓名' in (base or ''), f'默认选中结婚 → 新人姓名（{base}）')

        # 选「结婚」
        await pg.click("button:text-is('结婚')"); await pg.wait_for_timeout(500)
        p1 = await ph()
        chk('新人姓名' in (p1 or ''), f'结婚 → 新人姓名（{p1}）')

        # 换成「满月」
        await pg.click("button:text-is('满月')"); await pg.wait_for_timeout(500)
        p2 = await ph()
        chk('宝宝' in (p2 or ''), f'满月 → 宝宝小名（{p2}）')

        # 换成「乔迁」
        await pg.click("button:text-is('乔迁')"); await pg.wait_for_timeout(500)
        p3 = await ph()
        chk('地址' in (p3 or '') or '小区' in (p3 or ''), f'乔迁 → 新房地址（{p3}）')

        # 换成「升学」
        await pg.click("button:text-is('升学')"); await pg.wait_for_timeout(500)
        p4 = await ph()
        chk('学校' in (p4 or ''), f'升学 → 录取学校（{p4}）')
        await pg.screenshot(path=os.path.join(OUT, 'hint_school.png'))

        # ⚠️ 丧事系不给提示
        await pg.click("button:text-is('丧事')"); await pg.wait_for_timeout(600)
        p5 = await ph()
        chk('逝者' not in (p5 or '') and '随礼事项' in (p5 or ''),
            f'丧事 → 回落通用提示，无白事字眼（{p5}）')
        chk('宝宝' not in (p5 or '') and '新人' not in (p5 or ''),
            '丧事不残留上一个喜事的提示词')
        await pg.screenshot(path=os.path.join(OUT, 'hint_funeral.png'))

        # 忌日/祭祀 也不给
        for ev in ['忌日', '祭祀']:
            await pg.click(f"button:text-is('{ev}')"); await pg.wait_for_timeout(450)
            pp = await ph()
            chk('随礼事项' in (pp or ''), f'{ev} → 通用提示（{pp}）')

        # 关闭
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(600)

        # ---------- 2. 删除按钮比例 ----------
        print('\n=== 2. 人员详情删除按钮比例 ===')
        await pg.goto('http://127.0.0.1:8900/persons')
        await pg.wait_for_timeout(1800)
        rows = await pg.query_selector_all('.row')
        await tap(pg, rows[0]); await pg.wait_for_timeout(1100)
        size = await pg.evaluate("""() => {
          const btns=[...document.querySelectorAll('div.border-t.border-line button')]
            .filter(b=>b.getBoundingClientRect().width>4)
            .map(b=>{const r=b.getBoundingClientRect();
              return {t:(b.innerText||b.getAttribute('aria-label')||'').trim().slice(0,8),
                      w:Math.round(r.width),h:Math.round(r.height)};});
          return btns;
        }""")
        print('    footer 按钮:', size)
        if len(size) >= 2:
            ws = sorted(x['w'] for x in size)
            ratio = ws[-1] / ws[0]
            chk(3.5 <= ratio <= 6, f'宽度比例 1:{ratio:.1f}（目标 1:4~1:5）')
            dele = [x for x in size if '删除' in x['t'] or '删' in x['t']]
            if dele:
                chk(dele[0]['w'] >= 60, f'删除按钮宽 {dele[0]["w"]}px（≥60）')
                chk(len(dele[0]['t']) > 1, f'删除按钮有文字（{dele[0]["t"]}）')
        else:
            chk(False, '未量到 footer 按钮')
        await pg.screenshot(path=os.path.join(OUT, 'del_ratio.png'))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(600)

        # ---------- 3. 待办长按 ----------
        print('\n=== 3. 待办页长按多选 ===')
        await pg.goto('http://127.0.0.1:8900/todos')
        await pg.wait_for_timeout(1800)
        # 先建 3 条
        # 空态下没有输入框，必须先点右下角「+」打开新建面板
        for name in ['买礼金封', '定饭店', '问随礼名单']:
            await pg.click("button[aria-label='新增待办']")
            await pg.wait_for_timeout(800)
            inp = await pg.query_selector("input[placeholder*='如']")
            chk(bool(inp), '新建面板有输入框')
            if inp:
                await inp.fill(name)
                await pg.wait_for_timeout(600)
                # 按钮文案在canSave 前后会变（写点什么 → 保存），
                # 必须等状态更新后再点，否则点到禁用态
                for bt in await pg.query_selector_all('button.btn'):
                    txt = (await bt.inner_text()).strip()
                    if txt == '保存':
                        await bt.click(); break
                await pg.wait_for_timeout(1000)
                # 面板应已关闭
                mask = await pg.query_selector('.sheet-mask')
                chk(mask is None, f'「{name}」保存后面板已关闭')
        db = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        chk(len(db['todos']) >= 3, f"建成 {len(db['todos'])} 条待办")

        ab = await pg.query_selector("button[aria-label='全选并批量操作']")
        chk(bool(ab), '待办页标题栏有全选入口')
        await pg.screenshot(path=os.path.join(OUT, 'todos_list.png'))

        rows = await pg.query_selector_all('.row')
        await press(pg, rows[0], 700)
        body = await pg.inner_text('body')
        chk(seln(body) == 1, f'长按直接选中 1 条（{seln(body)}）')
        chk('已选' in body, '出现多选工具条')
        await pg.screenshot(path=os.path.join(OUT, 'todos_multi.png'))

        # React 会重渲染整列表，必须重新查询句柄
        rows = await pg.query_selector_all('.row')
        await tap(pg, rows[1])
        body = await pg.inner_text('body')
        chk(seln(body) == 2, f'点第二条 → 已选 2（{seln(body)}）')
        chk(len(await pg.query_selector_all('.sheet-mask')) == 0, '点选后没有弹出面板')

        await pg.click("[aria-label='全选']"); await pg.wait_for_timeout(700)
        body = await pg.inner_text('body')
        chk(seln(body) == 4, f'全选 → 已选 4（{seln(body)}）')
        await pg.screenshot(path=os.path.join(OUT, 'todos_all.png'))

        # 批量删除
        await pg.click("button[aria-label='删除所选']"); await pg.wait_for_timeout(700)
        body = await pg.inner_text('body')
        chk('无法恢复' in body, '批量删除有二次确认')
        for bt in await pg.query_selector_all('.fixed button'):
            if (await bt.inner_text()).strip() == '删除':
                await bt.click(); break
        await pg.wait_for_timeout(1300)
        db = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        chk(len(db['todos']) == 0, f"批量删除全部（剩 {len(db['todos'])}）")
        body = await pg.inner_text('body')
        chk(seln(body) == 0, '退出多选')

        # ---------- 4. 自定义事由长按 ----------
        print('\n=== 4. 自定义事由管理页长按 ===')
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(1800)
        await pg.click("button[aria-label='记一笔']"); await pg.wait_for_timeout(900)
        # 建 3 个自定义
        for nm in ['谢师宴', '进宅', '周年祭']:
            pluses = await pg.query_selector_all("button:text-is('自定义')")
            if pluses:
                await pluses[0].click(); await pg.wait_for_timeout(700)
                i2 = await pg.query_selector("input[placeholder*='如']")
                if i2:
                    await i2.fill(nm); await pg.wait_for_timeout(300)
                    for bt in await pg.query_selector_all('button'):
                        if '保存' in (await bt.inner_text()):
                            await bt.click(); break
                    await pg.wait_for_timeout(900)
        db = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        labels = [c['label'] for c in db['customEvents']]
        chk(all(nm in labels for nm in ['谢师宴', '进宅', '周年祭']),
            f'三个新建的事由都在（{labels}）')

        # 打开管理页
        n_evt = len(db['customEvents'])
        chk(n_evt >= 3, f'自定义事由共 {n_evt} 个：{[c["label"] for c in db["customEvents"]]}')

        mgr = await pg.query_selector("text=管理自定义事由")
        chk(bool(mgr), '有「管理自定义事由」入口')
        if mgr:
            await mgr.click(); await pg.wait_for_timeout(1000)
            # 只取管理Sheet 内的行（背景页也有 .row）
            rows = await pg.query_selector_all('.sheet .row')
            chk(len(rows) == n_evt, f'管理页有 {len(rows)} 行（应 {n_evt}）')
            await pg.screenshot(path=os.path.join(OUT, 'evt_list.png'))

            await press(pg, rows[0], 700)
            body = await pg.inner_text('body')
            chk(seln(body) == 1, f'长按选中 1 个（{seln(body)}）')
            await pg.screenshot(path=os.path.join(OUT, 'evt_multi.png'))

            rows = await pg.query_selector_all('.sheet .row')
            await tap(pg, rows[1])
            body = await pg.inner_text('body')
            chk(seln(body) == 2, f'加选到 2（{seln(body)}）')

            await pg.click("[aria-label='全选']"); await pg.wait_for_timeout(800)
            body = await pg.inner_text('body')
            chk(seln(body) == n_evt, f'全选 → {seln(body)}（应 {n_evt}）')

            await pg.click("button[aria-label='删除所选']"); await pg.wait_for_timeout(800)
            body = await pg.inner_text('body')
            chk('已有记录不受影响' in body, '确认框说明历史记录不受影响')
            await pg.screenshot(path=os.path.join(OUT, 'evt_confirm.png'))
            for bt in await pg.query_selector_all('.fixed button'):
                if (await bt.inner_text()).strip() == '删除':
                    await bt.click(); break
            await pg.wait_for_timeout(1400)
            db = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
            chk(len(db['customEvents']) == 0,
                f"批量删除（剩 {len(db['customEvents'])}）")

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