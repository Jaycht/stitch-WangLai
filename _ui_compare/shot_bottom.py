# -*- coding: utf-8 -*-
"""截取录入面板底部（回礼 + 提醒与备注两组）"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from _seed import with_settings

OUT = r"E:\Deployment\WorkBuddy\往来礼记\_ui_compare\v213"


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        s = json.dumps(with_settings(theme='a', themePicked=True), ensure_ascii=False)
        ctx = await b.new_context(viewport={'width': 412, 'height': 892},
                                  device_scale_factor=2)
        await ctx.add_init_script(
            'try{localStorage.setItem("wanglai.db.v1", ' + json.dumps(s) + ')}catch(e){}')
        pg = await ctx.new_page()
        await pg.goto('http://127.0.0.1:8900/')
        await pg.wait_for_timeout(2100)
        await pg.click("button[aria-label='记一笔']")
        await pg.wait_for_timeout(1500)
        h = await pg.evaluate("""()=>{
          const el = document.querySelector('.sheet .overflow-y-auto');
          return el ? el.scrollHeight : 0;
        }""")
        await pg.evaluate("""()=>{
          const el = document.querySelector('.sheet .overflow-y-auto');
          if (el) el.scrollTop = Math.max(0, el.scrollHeight - 620);
        }""")
        await pg.wait_for_timeout(700)
        await pg.screenshot(path=os.path.join(OUT, 'g_bottom.png'))
        print('scrollHeight =', h)
        await b.close()


asyncio.run(main())
