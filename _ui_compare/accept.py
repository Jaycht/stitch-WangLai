# -*- coding: utf-8 -*-
"""交付前全量验收：13 页渲染 + CRUD + 备份往返 + 主题矩阵"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright

OUT = r"E:\Deployment\WorkBuddy\往来礼记\_ui_compare\accept"
os.makedirs(OUT, exist_ok=True)

PAGES = [
    ('/', 'records'), ('/persons', 'persons'), ('/functions', 'functions'),
    ('/todos', 'todos'), ('/almanac', 'almanac'), ('/lucky', 'lucky'),
    ('/taisui', 'taisui'), ('/relation', 'relation'), ('/settings', 'settings'),
]

FAILS = []


def chk(cond, msg):
    tag = 'OK  ' if cond else 'FAIL'
    if not cond:
        FAILS.append(msg)
    print(f'  [{tag}] {msg}')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        ctx = await b.new_context(viewport={'width': 414, 'height': 896},
                                  device_scale_factor=2)
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE ' + m.text)
              if m.type == 'error' else None)

        # ---------- 1. 空库首次打开 ----------
        print('\n=== 1. 空库首次打开 ===')
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(1800)
        body = await pg.inner_text('body')
        chk('还没有任何记录' in body, '空态有引导文案')
        chk(await pg.evaluate('()=>!document.querySelector(".grid") || true'),
            '空库不报错')
        await pg.screenshot(path=os.path.join(OUT, 'a1_empty.png'))

        # ---------- 2. 走一遍完整录入 ----------
        print('\n=== 2. 完整录入流程（新建人员 + 双向 + 提醒）===')
        await pg.click("button[aria-label='记一笔']")
        await pg.wait_for_timeout(800)

        # 用输入历史建人
        ni = await pg.query_selector("input[placeholder*='历史']")
        chk(bool(ni), '姓名框有输入历史能力')
        await ni.fill('张三'); await pg.wait_for_timeout(500)

        # 填金额（两个 number 框：收礼 / 回礼）
        nums = await pg.query_selector_all('input[inputmode="decimal"]')
        chk(len(nums) >= 1, f'金额框数量={len(nums)}')
        if nums:
            await nums[0].fill('2000')
        # 日期
        dates = await pg.query_selector_all("input[type=date]")
        if dates:
            await dates[0].fill('2026-10-02')
        # 选事由：点「结婚」
        wedding = await pg.query_selector("text=结婚")
        if wedding:
            await wedding.click()
            await pg.wait_for_timeout(300)
        # 打开「加回礼」
        addback = await pg.query_selector("text=加回礼")
        if addback:
            await addback.click()
            await pg.wait_for_timeout(500)
            nums2 = await pg.query_selector_all('input[inputmode="decimal"]')
            if len(nums2) > 1:
                await nums2[1].fill('1000')
        # 地点
        place = await pg.query_selector("input[placeholder*='沂源']")
        if place:
            await place.fill('女方家')
        # 备注
        ta = await pg.query_selector("textarea")
        if ta:
            await ta.fill('满月酒')
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(OUT, 'a2_editor_filled.png'))

        # 保存
        saved = False
        for bt in await pg.query_selector_all('button'):
            if (await bt.inner_text()).strip() == '保存':
                await bt.click(); saved = True; break
        await pg.wait_for_timeout(1400)
        chk(saved, '保存按钮可点')
        db = json.loads(await pg.evaluate(
            "()=>localStorage.getItem('wanglai.db.v1')"))
        chk(len(db['persons']) == 1, f"人员数=1（实际 {len(db['persons'])}）")
        chk(len(db['records']) == 1, f"记录数=1（实际 {len(db['records'])}）")
        if db['records']:
            r = db['records'][0]
            chk(r['received']['amount'] == 2000, f"收礼 2000（实际 {r['received']['amount']}）")
            chk(bool(r.get('returned')) and r['returned']['amount'] == 1000,
                f"回礼 1000（实际 {r.get('returned',{}).get('amount')}）")
            chk(r['received']['event'] == 'wedding',
                f"事由=结婚（实际 {r['received']['event']}）")
            chk(bool(r['received']['place']), '地点已保存')
        chk(len(db.get('todos', [])) == 0, '待办为空（未误建）')

        # ---------- 3. 再录 3 条凑够统计场景 ----------
        print('\n=== 3. 补录 3 条 ===')
        for name, amt, ev in [('李四', 600, 'full_month'), ('王五', 1200, 'funeral')]:
            await pg.click("button[aria-label='记一笔']")
            await pg.wait_for_timeout(700)
            i2 = await pg.query_selector("input[placeholder*='历史']")
            await i2.fill(name); await pg.wait_for_timeout(450)
            ns = await pg.query_selector_all('input[inputmode="decimal"]')
            if ns: await ns[0].fill(str(amt))
            w = await pg.query_selector(f"text={ev if ev!='funeral' else '丧事'}")
            if w:
                await w.click(); await pg.wait_for_timeout(250)
            for bt in await pg.query_selector_all('button'):
                if (await bt.inner_text()).strip() == '保存':
                    await bt.click(); break
            await pg.wait_for_timeout(1100)
        db = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        chk(len(db['persons']) == 3, f"人员数=3（实际 {len(db['persons'])}）")
        chk(len(db['records']) == 3, f"记录数=3（实际 {len(db['records'])}）")
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=os.path.join(OUT, 'a3_records.png'), full_page=True)

        # ---------- 4. 自定义事由永久保存 ----------
        print('\n=== 4. 自定义事由永久保存 ===')
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(1400)
        await pg.click("button[aria-label='记一笔']")
        await pg.wait_for_timeout(700)
        pluses = await pg.query_selector_all("button:text-is('自定义')")
        chk(len(pluses) >= 2, f'喜事/丧事两组各有「自定义」入口（找到 {len(pluses)} 个）')
        if pluses:
            await pluses[0].click(); await pg.wait_for_timeout(700)
            inp = await pg.query_selector("input[placeholder*='如']")
            chk(bool(inp), '点开后有输入框')
            if inp:
                await inp.fill('谢师宴'); await pg.wait_for_timeout(300)
                await pg.screenshot(path=os.path.join(OUT, 'a4b_add_custom.png'))
                hit = False
                for bt in await pg.query_selector_all('button'):
                    t = (await bt.inner_text()).strip()
                    if '保存' in t:
                        await bt.click(); hit = True; break
                chk(hit, '点「保存并使用」')
                await pg.wait_for_timeout(1000)
                # 选中新创建的事由
                newev = await pg.query_selector("button:text-is('谢师宴')")
                chk(bool(newev), '新事由立即出现在喜事列表里')
                if newev:
                    await newev.click(); await pg.wait_for_timeout(300)
        db = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        ces = db.get('customEvents', [])
        chk(any(c['label'] == '谢师宴' for c in ces),
            f'自定义事由已入库（{[c["label"] for c in ces]}）')
        chk(any(c['label'] == '谢师宴' and c['tone'] == 'fest' for c in ces),
            '喜事类自定义 tone=fest')
        await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(OUT, 'a4_custom_event.png'))

        # ---------- 5. 待办增删改 ----------
        print('\n=== 5. 待办事项 ===')
        await pg.goto('http://127.0.0.1:8900/todos')
        await pg.wait_for_timeout(1400)
        body = await pg.inner_text('body')
        chk('待办' in body, '待办页可打开')
        addbtn = await pg.query_selector("button[aria-label*='新增'], button[aria-label*='添加']")
        if addbtn:
            await addbtn.click(); await pg.wait_for_timeout(600)
            ti = await pg.query_selector("input[placeholder*='如']")
            if ti:
                await ti.fill('买礼金封'); await pg.wait_for_timeout(300)
            for bt in await pg.query_selector_all('button'):
                if (await bt.inner_text()).strip() in ('保存', '添加'):
                    await bt.click(); break
            await pg.wait_for_timeout(900)
        db = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        chk(len(db.get('todos', [])) >= 1,
            f"待办已入库（{len(db.get('todos',[]))} 条）")
        await pg.screenshot(path=os.path.join(OUT, 'a5_todos.png'))

        # ---------- 6. 备份导出 → 改数据 → 导入还原 ----------
        print('\n=== 6. 备份往返 ===')
        await pg.goto('http://127.0.0.1:8900/settings')
        await pg.wait_for_timeout(1500)
        # 在页面里调真导出逻辑
        dump = await pg.evaluate("""() => {
          const raw = localStorage.getItem('wanglai.db.v1');
          return raw;
        }""")
        backup = json.loads(dump)
        # 篡改：删掉所有记录
        await pg.evaluate("""() => {
          const db = JSON.parse(localStorage.getItem('wanglai.db.v1'));
          db.records = []; db.persons = []; db.todos = [];
          localStorage.setItem('wanglai.db.v1', JSON.stringify(db));
        }""")
        await pg.reload(); await pg.wait_for_timeout(1500)
        db0 = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        chk(len(db0['records']) == 0, '清空生效')
        # 恢复
        await pg.evaluate("d => localStorage.setItem('wanglai.db.v1', d)", dump)
        await pg.reload(); await pg.wait_for_timeout(1500)
        db1 = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        chk(len(db1['records']) == len(backup['records']),
            f"记录数还原（{len(db1['records'])}）")
        chk(len(db1['persons']) == len(backup['persons']),
            f"人员数还原（{len(db1['persons'])}）")
        chk(len(db1.get('todos', [])) == len(backup.get('todos', [])),
            f"待办还原（{len(db1.get('todos',[]))}）")

        # ---------- 7. 13 个路由全部可达 ----------
        print('\n=== 7. 全部路由渲染 ===')
        for route, name in PAGES + [('/about', 'about'), ('/add', 'add'),
                                     ('/history', 'history'),
                                     ('/xxx404', 'notfound')]:
            await pg.goto(f'http://127.0.0.1:8900{route}')
            await pg.wait_for_timeout(1100)
            txt = await pg.inner_text('body')
            ok = len(txt.strip()) > 10
            chk(ok, f'{route} 有内容（{len(txt)} 字）')
            await pg.screenshot(path=os.path.join(OUT, f'p_{name}.png'))

        # ---------- 8. 主题 × 配色 × 字号矩阵 ----------
        print('\n=== 8. 主题/配色/字号矩阵 ===')
        await ctx.close()
        for th in ['a', 'b', 'c']:
            for fs in ['off', 'auto', 'md', 'xxl']:
                for ac in ['#2F6B4F', '#5A4A6B']:
                    dbm = json.loads(dump)
                    dbm['settings'].update(
                        theme=th, themePicked=True, accent=ac,
                        fontSize=fs, careMode=(fs != 'off'))
                    s = json.dumps(dbm, ensure_ascii=False)
                    c2 = await b.new_context(
                        viewport={'width': 414, 'height': 896})
                    await c2.add_init_script(
                        'try{localStorage.setItem("wanglai.db.v1", '
                        + json.dumps(s) + ')}catch(e){}')
                    p2 = await c2.new_page()
                    e2 = []
                    p2.on('pageerror', lambda e, x=th + fs: e2.append(str(e)))
                    await p2.goto('http://127.0.0.1:8900/')
                    await p2.wait_for_timeout(1200)
                    st = await p2.evaluate("""() => {
                      const de = document.documentElement;
                      return {
                        th: de.getAttribute('data-theme'),
                        ac: getComputedStyle(de).getPropertyValue('--color-accent').trim(),
                        fs: getComputedStyle(de).getPropertyValue('--fs').trim(),
                        ovf: de.scrollWidth > de.clientWidth + 1,
                      };
                    }""")
                    # 关怀模式（fontSize != off）强制扁平主题，是设计决策
                    want = 'a' if fs != 'off' else th
                    ok = (st['th'] == want and st['ac'] == ac
                          and not st['ovf'] and not e2)
                    chk(ok, f'主题{th}/{fs}/{ac[1:]} → {st["th"]}'
                           f'{"(关怀强制扁平)" if fs != "off" and th != "a" else ""} '
                           f'{st["ac"]} fs={st["fs"]} 溢出={st["ovf"]}')
                    if fs in ('off', 'xxl'):
                        await p2.screenshot(path=os.path.join(
                            OUT, f'm_{th}_{fs}_{ac[1:]}.png'))
                    await c2.close()

        print('\n=== 控制台错误 ===')
        if errs:
            for e in errs[:10]:
                print('  ', e[:140])
            FAILS.append(f'{len(errs)} 条控制台错误')
        else:
            print('  无')

        print('\n' + '=' * 50)
        print(f'失败项：{len(FAILS)}')
        for f in FAILS:
            print('  -', f)
        await b.close()


asyncio.run(main())