import asyncio, json
from playwright.async_api import async_playwright
S = {"accent":"#2F6B4F","bg":"#F4F2EE","appLock":False,"currency":"¥","weekStart":1,
     "remindLeadMin":60,"theme":"a","themePicked":True,"fontSize":"xxl","careMode":True}
DB={"schemaVersion":3,"persons":[],"records":[],"todos":[],"customEvents":[],"settings":S,"updatedAt":""}
s=json.dumps(DB,ensure_ascii=False)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context()
        pg=await ctx.new_page()
        # 在页面加载前拦一刀，看 React 到底往里写了什么
        await ctx.add_init_script("""
          window.__writes = [];
          try {
            const orig = Storage.prototype.setItem;
            Storage.prototype.setItem = function(k, v) {
              if (k === 'wanglai.db.v1') {
                try { const d = JSON.parse(v); window.__writes.push({fs:d.settings.fontSize, tp:d.settings.themePicked, cm:d.settings.careMode}); }
                catch(e) { window.__writes.push({err:String(e)}); }
              }
              return orig.call(this, k, v);
            };
          } catch(e){}
        """ + "try{localStorage.setItem('wanglai.db.v1', %s)}catch(e){}" % s)
        await pg.goto("http://127.0.0.1:8900/")
        await pg.wait_for_timeout(1800)
        w = await pg.evaluate("()=>window.__writes")
        for i,x in enumerate(w):
            print(f'  第{i+1}次写入:', x)
        await b.close()
asyncio.run(main())
