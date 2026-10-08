import asyncio, re
from playwright.async_api import async_playwright
src = open('shot3.py', encoding='utf-8').read()
SEED = re.search(r'SEED = """(.*?)"""', src, re.S).group(1)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # 正确姿势：seed 必须在页面脚本执行前注入
        ctx = await b.new_context(viewport={'width':414,'height':896}, device_scale_factor=2)
        await ctx.add_init_script(f"window.localStorage.setItem('wanglai.db.v1', {SEED!r});")
        pg = await ctx.new_page()
        errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE: '+m.text) if m.type=='error' else None)

        await pg.goto("http://127.0.0.1:8900/")
        await pg.wait_for_timeout(1600)
        db = await pg.evaluate("() => JSON.parse(localStorage.getItem('wanglai.db.v1'))")
        print("=== 种子数据加载 ===")
        print("  persons:", len(db['persons']), "records:", len(db['records']), "sv:", db['schemaVersion'])
        names={x['id']:x['name'] for x in db['persons']}
        for r in db['records'][:2]:
            print("   ", names.get(r['personId']), r['received']['amount'], "回", (r['returned'] or {}).get('amount'))

        # 交互测试：打开录入面板
        await pg.click("button[aria-label='记一笔']")
        await pg.wait_for_timeout(700)
        sheet = await pg.inner_text("body")
        print("=== 录入面板 ===")
        for k in ['对方姓名','收礼（对方办的）','加回礼','金额','渠道']:
            print(f"   {k}: {'有' if k in sheet else '缺'}")
        await pg.screenshot(path=r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare/v2/editor.png")

        # 填数据并保存
        await pg.fill("input[placeholder='如：王建国']", '测试新人')
        inputs = await pg.query_selector_all("input[type=number]")
        await inputs[0].fill('888')
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare/v2/editor_filled.png")

        # 点保存
        btns = await pg.query_selector_all("button")
        for bt in btns:
            t = (await bt.inner_text()).strip()
            if t == '保存':
                await bt.click(); break
        await pg.wait_for_timeout(1200)
        db2 = await pg.evaluate("() => JSON.parse(localStorage.getItem('wanglai.db.v1'))")
        newp = [x for x in db2['persons'] if x['name']=='测试新人']
        print("=== 保存后 ===")
        print("  persons:", len(db2['persons']), "records:", len(db2['records']))
        print("  新建人员是否入库:", bool(newp))
        if newp:
            rec = [r for r in db2['records'] if r['personId']==newp[0]['id']]
            print("  关联记录:", rec[0]['received']['amount'] if rec else '无')

        # 关系计算实测
        await pg.goto("http://127.0.0.1:8900/relation")
        await pg.wait_for_timeout(1400)
        await pg.click("text=外婆的哥哥")
        await pg.wait_for_timeout(400)
        await pg.click("button[aria-label='计算']")
        await pg.wait_for_timeout(700)
        rel = await pg.inner_text("body")
        got = [l.strip() for l in rel.split('\n') if '舅外公' in l or '没有找到' in l or '未加载' in l]
        print("=== 关系计算 ===")
        print("  ", got[:3] if got else "(无结果行)")
        await pg.screenshot(path=r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare/v2/relation_result.png")

        print("=== errors ===")
        for e in errs[:8]: print("  ", e)
        if not errs: print("   无")
        await b.close()
asyncio.run(main())
