# -*- coding: utf-8 -*-
"""
按钮/元素尺寸平衡扫描
目的：找出同级元素之间尺寸比例失衡的地方，输出清单给涛哥决定。
方法：真机渲染后量 getBoundingClientRect，不靠读代码猜。
"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from _seed import with_settings

OUT = r"E:\Deployment\WorkBuddy\往来礼记\_ui_compare\audit"
os.makedirs(OUT, exist_ok=True)

# 同级按钮的语义分组：同组内应同宽同高
PAGES = [
    ('/', '记录', 'records'),
    ('/persons', '人员', 'persons'),
    ('/todos', '待办', 'todos'),
    ('/settings', '我的', 'settings'),
]


async def measure(pg):
    """量所有可见按钮/输入框/图标，返回尺寸清单"""
    return await pg.evaluate("""() => {
      const rows = [];
      const push = (el, tag) => {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return;
        if (r.bottom < 0 || r.top > innerHeight * 1.4) return;
        const cs = getComputedStyle(el);
        rows.push({
          tag,
          text: (el.innerText || el.placeholder || el.getAttribute('aria-label') || '')
            .trim().slice(0, 14),
          w: Math.round(r.width),
          h: Math.round(r.height),
          cls: (el.className || '').toString().slice(0, 46),
          aria: el.getAttribute('aria-label') || '',
        });
      };
      document.querySelectorAll('button').forEach(e => push(e, 'button'));
      document.querySelectorAll('input, select, textarea').forEach(e => push(e, 'input'));
      return rows;
    }""")


def fmt(items):
    return '\n'.join(
        f"    {i['tag']:6} {i['w']:>4}×{i['h']:<3} {i['text'][:16]:<18} {i['cls'][:40]}"
        for i in items)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        s = json.dumps(with_settings(theme='a', themePicked=True), ensure_ascii=False)
        ctx = await b.new_context(viewport={'width': 414, 'height': 896},
                                  device_scale_factor=2, has_touch=True, is_mobile=True)
        await ctx.add_init_script(
            'try{localStorage.setItem("wanglai.db.v1", ' + json.dumps(s) + ')}catch(e){}')
        pg = await ctx.new_page()

        print('=' * 70)
        print('一、各页面主按钮清单（高度应一致，同级应同宽）')
        print('=' * 70)
        all_data = {}
        for route, name, key in PAGES:
            await pg.goto(f'http://127.0.0.1:8900{route}')
            await pg.wait_for_timeout(1700)
            items = await measure(pg)
            btns = [i for i in items if i['tag'] == 'button']
            inputs = [i for i in items if i['tag'] == 'input']
            all_data[key] = (btns, inputs)
            print(f'\n【{name}】{route}')
            print('  按钮:')
            print(fmt(btns) if btns else '    （无）')
            print('  输入框:')
            print(fmt(inputs) if inputs else '    （无）')

        print('\n' + '=' * 70)
        print('二、同一footer 内的按钮组（编辑面板/详情面板）')
        print('=' * 70)
        # 打开录入面板
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(1600)
        await pg.click("button[aria-label='记一笔']")
        await pg.wait_for_timeout(1000)
        items = await measure(pg)
        print('\n【记录编辑面板 footer】')
        print(fmt(items))
        await pg.screenshot(path=os.path.join(OUT, 'editor_footer.png'))
        # 只量 footer 内的按钮
        fbtns = await pg.evaluate("""() => {
          const out = [];
          document.querySelectorAll('.fixed button, .fixed .btn').forEach(e => {
            const r = e.getBoundingClientRect();
            if (r.width > 4) out.push({
              text: (e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,10),
              w: Math.round(r.width), h: Math.round(r.height),
            });
          });
          return out;
        }""")
        print('\n  footer 内按钮:')
        for x in fbtns:
            print(f"    {x['w']:>4}×{x['h']:<3} {x['text']}")
        await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(600)

        # 人员详情
        await pg.goto('http://127.0.0.1:8900/persons')
        await pg.wait_for_timeout(1700)
        rows = await pg.query_selector_all('.row')
        if rows:
            box = await rows[0].bounding_box()
            await pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
            await pg.mouse.down(); await pg.wait_for_timeout(80); await pg.mouse.up()
            await pg.wait_for_timeout(1100)
            fbtns = await pg.evaluate("""() => {
              const out = [];
              document.querySelectorAll('.fixed button, .fixed .btn').forEach(e => {
                const r = e.getBoundingClientRect();
                if (r.width > 4) out.push({
                  text: (e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,10),
                  w: Math.round(r.width), h: Math.round(r.height),
                });
              });
              return out;
            }""")
            print('\n【人员详情 footer】')
            for x in fbtns:
                print(f"    {x['w']:>4}×{x['h']:<3} {x['text']}")
            await pg.screenshot(path=os.path.join(OUT, 'detail_footer.png'))

        print('\n' + '=' * 70)
        print('三、失衡判定（同高度分组，宽度差异 > 2.2倍 且非刻意设计）')
        print('=' * 70)
        issues = []
        for route, name, key in PAGES:
            btns, inputs = all_data[key]
            # 按高度分组
            byh = {}
            for x in btns:
                byh.setdefault(x['h'], []).append(x)
            for h, group in byh.items():
                if len(group) < 2:
                    continue
                ws = sorted({g['w'] for g in group})
                if len(ws) < 2:
                    continue
                ratio = max(ws) / min(ws)
                if ratio > 2.2:
                    issues.append((name, h, ws, ratio, group))
        if issues:
            for name, h, ws, ratio, group in issues:
                print(f'\n  [{name}] 高度 {h}px 的按钮宽度跨度 {min(ws)}~{max(ws)}'
                      f'（{ratio:.1f}倍）')
                for g in group:
                    print(f"      {g['w']:>4}×{g['h']:<3} {g['text'][:14]:<16} {g['cls'][:36]}")
        else:
            print('\n  未发现宽度比例失衡（同高度按钮宽度差均 < 2.2 倍）')

        print('\n' + '=' * 70)
        print('四、控件高度统一性检查')
        print('=' * 70)
        heights = {}
        for route, name, key in PAGES:
            btns, inputs = all_data[key]
            for x in btns + inputs:
                heights.setdefault(x['h'], []).append(f"{name}:{x['text'][:10]}")
        print('\n  各高度出现的次数:')
        for h in sorted(heights):
            n = len(heights[h])
            mark = '' if n >= 5 else '  ← 零散'
            print(f"    {h:>3}px : {n:>2} 次{mark}")

        await b.close()


asyncio.run(main())