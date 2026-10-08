import asyncio, json
from playwright.async_api import async_playwright
OUT=r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare/theme"
import os; os.makedirs(OUT, exist_ok=True)
DB = {
 "schemaVersion":3,
 "persons":[
  {"id":"p1","name":"张三","alias":"建国·南麻","relation":"表弟","group":"clan","phone":"13805331234","wechat":"wjg888","region":"沂源南麻","note":"","createdAt":"2026-01-02T08:00:00Z","updatedAt":"2026-01-02T08:00:00Z"},
  {"id":"p2","name":"张三","relation":"堂哥","group":"clan","phone":"","wechat":"wjggb","region":"县城","note":"","createdAt":"2026-01-03T08:00:00Z","updatedAt":"2026-01-03T08:00:00Z"},
  {"id":"p3","name":"李四","relation":"同事","group":"friend","phone":"","wechat":"ls","region":"淄博","note":"","createdAt":"2026-01-04T08:00:00Z","updatedAt":"2026-01-04T08:00:00Z"},
  {"id":"p4","name":"王五","relation":"同学","group":"friend","phone":"","wechat":"","region":"","note":"","createdAt":"2026-01-05T08:00:00Z","updatedAt":"2026-01-05T08:00:00Z"}],
 "records":[
  {"id":"r1","personId":"p1","received":{"channel":"wechat","amount":2000,"date":"2026-10-02","event":"wedding","place":"女方家","gift":"两瓶酒"},"returned":{"channel":"cash","amount":1000,"date":"2026-10-05","event":"full_month"},"remark":"满月酒","remindAt":"2026-10-08T18:00","createdAt":"2026-10-02T08:00:00Z","updatedAt":"2026-10-05T08:00:00Z"},
  {"id":"r2","personId":"p2","received":{"channel":"cash","amount":1500,"date":"2026-10-01","event":"moving"},"remark":"","createdAt":"2026-10-01T08:00:00Z","updatedAt":"2026-10-01T08:00:00Z"},
  {"id":"r3","personId":"p3","received":{"channel":"alipay","amount":600,"date":"2026-09-28","event":"custom_xh"},"remark":"","createdAt":"2026-09-28T08:00:00Z","updatedAt":"2026-09-28T08:00:00Z"},
  {"id":"r4","personId":"p4","received":{"channel":"cash","amount":1200,"date":"2026-09-20","event":"funeral"},"remark":"白事","createdAt":"2026-09-20T08:00:00Z","updatedAt":"2026-09-20T08:00:00Z"}],
 "todos":[{"id":"t1","title":"买礼金封","note":"","due":"2026-10-05","done":False,"createdAt":"2026-10-01T08:00:00Z","updatedAt":"2026-10-01T08:00:00Z"}],
 "customEvents":[{"key":"custom_xh","label":"升学宴","tone":"fest","createdAt":"2026-01-01T00:00:00Z"}],
 "settings":{"accent":"#2F6B4F","bg":"#F4F2EE","appLock":False,"currency":"¥","weekStart":1,"remindLeadMin":60,"theme":"a","themePicked":True},
 "updatedAt":"2026-10-06T08:00:00Z"}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs=[]
        for theme,label in [('a','A青瓷扁平'),('b','B柔光玻璃'),('c','C澎湃卡片')]:
            ctx = await b.new_context(viewport={'width':414,'height':896}, device_scale_factor=2)
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(f'[{theme}] PE: '+str(e)))
            pg.on('console', lambda m: errs.append(f'[{theme}] CE: '+m.text) if m.type=='error' else None)
            db2 = json.loads(json.dumps(DB))
            db2['settings']['theme'] = theme
            s = json.dumps(db2, ensure_ascii=False)
            await ctx.add_init_script(
                "try{localStorage.clear();localStorage.setItem('wanglai.db.v1', %s)}catch(e){}"
                % json.dumps(s, ensure_ascii=False)
            )
            await pg.goto("http://127.0.0.1:8900/")
            await pg.wait_for_timeout(1600)
            attr = await pg.evaluate("()=>document.documentElement.getAttribute('data-theme')+'/'+document.documentElement.getAttribute('data-perf')")
            await pg.screenshot(path=rf"{OUT}\theme_{theme}.png")
            await pg.goto("http://127.0.0.1:8900/settings")
            await pg.wait_for_timeout(1500)
            await pg.screenshot(path=rf"{OUT}\settings_{theme}.png")
            print(f'  方案{theme}: data-theme={attr}')
            await ctx.close()
        # 设备检测报告
        ctx = await b.new_context(viewport={'width':414,'height':896})
        pg = await ctx.new_page()
        await pg.goto("http://127.0.0.1:8900/")
        await pg.wait_for_timeout(500)
        det = await pg.evaluate("""() => {
          return {
            cores: navigator.hardwareConcurrency,
            mem: navigator.deviceMemory || 0,
            dpr: window.devicePixelRatio,
            screen: [screen.width, screen.height],
            supportsBlur: CSS.supports('backdrop-filter','blur(2px)')
          };
        }""")
        print('\n=== 本机检测数据 ===')
        print(' ', det)
        print('errors:', errs if errs else '无')
        await b.close()
asyncio.run(main())
