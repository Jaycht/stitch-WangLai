# -*- coding: utf-8 -*-
"""v2.13.0 验收：录入面板分组卡片"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from _seed import with_settings

OUT = r"E:\Deployment\WorkBuddy\往来礼记\_ui_compare\v213"
os.makedirs(OUT, exist_ok=True)
FAILS = []


def chk(cond, msg):
    print(f"  [{'OK  ' if cond else 'FAIL'}] {msg}")
    if not cond:
        FAILS.append(msg)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        s = json.dumps(with_settings(theme='a', themePicked=True), ensure_ascii=False)
        ctx = await b.new_context(viewport={'width': 412, 'height': 892},
                                  device_scale_factor=2, has_touch=True, is_mobile=True)
        await ctx.add_init_script(
            'try{localStorage.setItem("wanglai.db.v1", ' + json.dumps(s) + ')}catch(e){}')
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PE: ' + str(e)[:110]))
        pg.on('console', lambda m: errs.append('CE: ' + m.text[:110]) if m.type == 'error' else None)

        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(2100)
        await pg.click("button[aria-label='记一笔']")
        await pg.wait_for_timeout(1500)

        print('\n=== 1. 分组标题齐全 ===')
        titles = await pg.evaluate(
            "()=>[...document.querySelectorAll('.sheet .sec-title')].map(e=>e.textContent)")
        print('   ', titles)
        for want in ['基本信息', '礼金与日期', '事由与地点', '回礼（我方办的）', '提醒与备注']:
            chk(want in titles, f'有分组「{want}」')

        print('\n=== 2. 每组都是独立卡片 ===')
        cards = await pg.evaluate("""()=>{
          const ts=[...document.querySelectorAll('.sheet .sec-title')];
          return ts.map(t=>{
            const card=t.parentElement.nextElementSibling;
            if(!card) return null;
            const cs=getComputedStyle(card);
            const inner=card.querySelectorAll(':scope > div').length;
            return {title:t.textContent, radius:cs.borderRadius,
                    bg:cs.backgroundColor, fields:inner};
          });
        }""")
        for c in cards:
            if c:
                print(f"    {c['title']:<14} 圆角={c['radius']:<8} 字段数={c['fields']}")
        chk(all(c and c['radius'] != '0px' for c in cards if c), '每组都有圆角')
        chk(all(c and c['fields'] >= 1 for c in cards if c), '每组都包到了内容')

        print('\n=== 3. 关键字段都在 ===')
        body = await pg.inner_text('body')
        for f in ['对方姓名', '金额（元）', '日期', '事由', '地点 / 办方', '礼物',
                  '回礼（我方办的）', '备注']:
            chk(f in body, f'字段「{f}」存在')

        print('\n=== 4. compact 生效：收礼组里不该重复出现日期/事由 ===')
        # 第 2 组内只应有「金额 + 渠道 + 日期」，不该有事由/地点
        g2 = await pg.evaluate("""()=>{
          const ts=[...document.querySelectorAll('.sheet .sec-title')];
          const t=ts.find(x=>x.textContent.includes('礼金与日期'));
          const card=t.parentElement.nextElementSibling;
          return card?card.innerText:'';
        }""")
        chk('金额（元）' in g2, '第2组有金额')
        chk('日期' in g2, '第2组有日期')
        chk('事由' not in g2, '第2组不重复事由（已移到第3组）')
        chk('地点' not in g2, '第2组不重复地点')
        chk(len(g2.strip().split('\n')) <= 5, f'第2组内容精简（{len(g2.strip().split(chr(10)))} 行）')

        print('\n=== 5. 分组不重不漏 ===')
        # 每个标签只出现一次
        for f in ['事由', '地点 / 办方', '备注']:
            n = await pg.evaluate(
                f"()=>[...document.querySelectorAll('.sheet label')]"
                f".filter(e=>e.textContent.trim()==='{f}').length")
            chk(n == 1, f'「{f}」标签只出现 1 次（实际 {n}）')

        print('\n=== 6. 录入流程仍然可用 ===')
        ni = await pg.query_selector("input[placeholder*='历史中选择']")
        chk(bool(ni), '姓名框在')
        if ni:
            await ni.fill('张三')
            await pg.wait_for_timeout(400)
        amt = await pg.query_selector("input[type='tel']")
        chk(bool(amt), '金额框在')
        if amt:
            await amt.fill('2000')
            await pg.wait_for_timeout(400)
        # 选事由
        for ev in ['结婚', '满月']:
            el = await pg.query_selector(f"button:text-is('{ev}')")
            if el:
                await el.click()
                await pg.wait_for_timeout(400)
                break
        ph = await pg.evaluate("()=>{const t=document.querySelector('textarea');return t?t.placeholder:''}")
        chk('新人姓名' in ph, f'动态提示词仍生效（{ph}）')
        await pg.screenshot(path=os.path.join(OUT, 'group_top.png'))
        # 滚到各组截图
        for name, top in [('mid', 620), ('bottom', 99999)]:
            await pg.evaluate(f"()=>{{const el=document.querySelector('.sheet > div'); if(el) el.scrollTop={top};}}")
            await pg.wait_for_timeout(600)
            await pg.screenshot(path=os.path.join(OUT, f'group_{name}.png'))
        # 保存
        btns = await pg.query_selector_all('button')
        for bt in btns:
            if (await bt.inner_text()).strip() == '保存':
                await bt.click()
                break
        await pg.wait_for_timeout(1400)
        db = json.loads(await pg.evaluate("()=>localStorage.getItem('wanglai.db.v1')"))
        chk(len(db['records']) == 5, f'保存成功（记录数 {len(db["records"])}）')

        print('\n=== 7. 控制台错误 ===')
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
