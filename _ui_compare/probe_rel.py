import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        await pg.goto("http://127.0.0.1:8900/")
        await pg.wait_for_timeout(800)
        res = await pg.evaluate("""() => {
          const r = window.relationship;
          const tests = ['外婆的哥哥','爸爸的妈妈','外婆的哥哥是谁','外婆的哥哥叫啥','妈妈的姑姑','爸爸的姐姐','哥哥的老婆','姐姐的女儿'];
          const out = [];
          for (const t of tests) {
            let a,b2;
            try { a = JSON.stringify(r(t)); } catch(e){ a='ERR:'+e.message; }
            try { b2 = JSON.stringify(r({text:t})); } catch(e){ b2='ERR:'+e.message; }
            out.push({t, positional:a, opts:b2});
          }
          return out;
        }""")
        for x in res:
            print(x['t'])
            print('   positional:', x['positional'])
            print('   opts      :', x['opts'])
        await b.close()
asyncio.run(main())
