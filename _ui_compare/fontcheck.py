from playwright.sync_api import sync_playwright
import json
SEED={'schemaVersion':3,'persons':[{'id':'p1','name':'王建国','createdAt':'2026-01-01T00:00:00.000Z','updatedAt':'2026-01-01T00:00:00.000Z'}],'records':[{'id':'r1','personId':'p1','received':{'channel':'cash','amount':1000,'date':'2026-10-01','event':'wedding'},'createdAt':'2026-01-01T00:00:00.000Z','updatedAt':'2026-01-01T00:00:00.000Z'}],'todos':[],'customEvents':[],'settings':{'accent':'#2F6B4F','bg':'#F4F2EE','appLock':False,'currency':'¥','weekStart':1,'theme':'a','themePicked':True,'fontSize':'off','careMode':False},'updatedAt':''}
with sync_playwright() as p:
    b=p.chromium.launch(headless=True); pg=b.new_page(viewport={'width':390,'height':780})
    pg.goto('http://127.0.0.1:3000/')
    pg.evaluate('(v)=>localStorage.setItem("wanglai.db.v1", v)', json.dumps(SEED))
    pg.reload(); pg.wait_for_selector('text=往来记录')
    r=pg.evaluate("""()=>{
      const out={};
      out.bodyFs = getComputedStyle(document.body).fontSize;
      // 按类名正则匹配 text-[var(--f-...)]
      const all=[...document.querySelectorAll('*')];
      const want=['f-num','f-lg','f-md','f-sm','f-xs'];
      const seen={};
      for(const e of all){
        if(typeof e.className!=='string') continue;
        for(const w of want){
          if(e.className.includes('text-[length:var(--'+w+')]') && !(w in seen)){
            seen[w]=getComputedStyle(e).fontSize;
          }
        }
      }
      for(const w of want){ out[w]= seen[w]||'NO-EL'; }
      return out;
    }""")
    print('FONTCHECK', json.dumps(r, ensure_ascii=False))
    b.close()
