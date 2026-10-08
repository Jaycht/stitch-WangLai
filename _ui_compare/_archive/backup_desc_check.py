# -*- coding: utf-8 -*-
"""确认浏览器环境下走的是降级文案（isNativeAndroid = false）"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from _seed import with_settings

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        s = json.dumps(with_settings(theme='a', themePicked=True), ensure_ascii=False)
        ctx = await b.new_context(viewport={'width': 412, 'height': 892})
        await ctx.add_init_script(
            'try{localStorage.setItem("wanglai.db.v1", ' + json.dumps(s) + ')}catch(e){}')
        pg = await ctx.new_page()
        await pg.goto('http://127.0.0.1:8900/settings')
        await pg.wait_for_timeout(2100)

        # 恢复按钮所在行的完整文案
        d = await pg.evaluate("""()=>{
          const all=[...document.querySelectorAll('*')].filter(
            x => x.children.length === 0 && x.textContent && x.textContent.includes('从备份恢复'));
          const btn = all[0];
          if(!btn) return 'not found';
          // 往上找带 desc 的容器
          let p = btn;
          for (let i=0;i<4 && p;i++){ p = p.parentElement; if(!p) break;
            if (p.innerText && p.innerText.length > 10) return p.innerText; }
          return btn.textContent;
        }""")
        print('恢复区文案:', repr(d))

        # 导出按钮
        e = await pg.evaluate("""()=>{
          const all=[...document.querySelectorAll('*')].filter(
            x => x.children.length === 0 && x.textContent && x.textContent.includes('导出备份文件'));
          let p = all[0];
          if(!p) return 'not found';
          for (let i=0;i<4 && p;i++){ p = p.parentElement; if(!p) break;
            if (p.innerText && p.innerText.length > 10) return p.innerText; }
          return 'x';
        }""")
        print('导出区文案:', repr(e))
        await b.close()

asyncio.run(main())
