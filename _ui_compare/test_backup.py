import asyncio, re
from playwright.async_api import async_playwright
src = open('shot3.py', encoding='utf-8').read()
SEED = re.search(r'SEED = """(.*?)"""', src, re.S).group(1)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':414,'height':896}, device_scale_factor=2)
        pg = await ctx.new_page()
        errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE: '+m.text) if m.type=='error' else None)

        # 首次访问建种子（只用 localStorage，不走 init_script）
        await pg.goto("http://127.0.0.1:8900/")
        await pg.wait_for_timeout(600)
        await pg.evaluate("d => localStorage.setItem('wanglai.db.v1', d)", SEED)
        await pg.reload(); await pg.wait_for_timeout(1400)

        before = await pg.evaluate("() => JSON.parse(localStorage.getItem('wanglai.db.v1'))")
        print("=== v2 数据落盘 ===")
        print("  persons:", len(before['persons']), " records:", len(before['records']),
              " schemaVersion:", before['schemaVersion'])

        # 备份格式导出 + 校验和（走真实页面逻辑）
        bk = await pg.evaluate("""() => {
          const db = JSON.parse(localStorage.getItem('wanglai.db.v1'));
          let h=0x811c9dc5; const s=JSON.stringify(db);
          for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=(h+((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)))>>>0;}
          return {counts:{persons:db.persons.length,records:db.records.length},
                  checksum:'fnv1a:'+h.toString(16).padStart(8,'0')};
        }""")
        print("  备份计数:", bk['counts'], " 校验和:", bk['checksum'])

        # v1 旧结构迁移
        await pg.evaluate("""() => {
          localStorage.setItem('wanglai.db.v1', JSON.stringify({
            records: [
              {name:'老王', amount:1000, type:'received', scenario:'celebration', event:'结婚', date:'2024-11-20'},
              {name:'老李', amount:600,  type:'sent',     scenario:'solemn',      event:'白事', date:'2024-10-02'},
              {name:'老王', amount:500,  type:'received', scenario:'celebration', event:'满月', date:'2025-03-15'},
              {amount:300, type:'received', date:'2024-01-01'}
            ]
          }));
        }""")
        await pg.reload(); await pg.wait_for_timeout(1500)
        after = await pg.evaluate("() => JSON.parse(localStorage.getItem('wanglai.db.v1'))")
        print("=== v1 -> v2 迁移（应自动建 3 人、去重老王、孤立记录丢弃）===")
        print("  persons:", len(after['persons']), " records:", len(after['records']))
        names = {x['id']: x['name'] for x in after['persons']}
        for r in after['records']:
            ret = r.get('returned')
            print("   ", names.get(r['personId'],'??'),
                  "| 收", r['received']['amount'], r['received']['event'], r['received']['date'],
                  "| 回", (ret['amount'], ret['event']) if ret else '-')
        print("  人员:", list(names.values()))

        # 脏数据
        await pg.evaluate("""() => localStorage.setItem('wanglai.db.v1','{"persons":"x","records":123}')""")
        await pg.reload(); await pg.wait_for_timeout(1300)
        junk = await pg.evaluate("() => JSON.parse(localStorage.getItem('wanglai.db.v1'))")
        print("=== 脏数据容错 ===")
        print("  persons:", len(junk['persons']), " records:", len(junk['records']))
        body = await pg.inner_text("body")
        print("  空态显示:", "还没有任何记录" in body)

        # 空态截图
        await pg.screenshot(path=r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare/v2/empty.png")
        print("=== errors ===")
        for e in errs[:8]: print("  ", e)
        if not errs: print("   无")
        await b.close()
asyncio.run(main())
