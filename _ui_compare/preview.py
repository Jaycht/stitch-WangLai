# -*- coding: utf-8 -*-
import asyncio, os
from playwright.async_api import async_playwright
OUT = r"E:/Deployment/WorkBuddy/往来礼记/_ui_compare/preview"
os.makedirs(OUT, exist_ok=True)

HTML = r"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>配色预览</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#EDEBE7;font-family:"PingFang SC","Microsoft YaHei",sans-serif;padding:36px 28px}
.row{display:flex;gap:26px;margin-bottom:52px;flex-wrap:wrap}
.colw{width:372px}
.hd{margin-bottom:12px}
.hd h2{font-size:17px;color:#1a1a1a;margin-bottom:3px}
.hd p{font-size:12px;color:#777;line-height:1.5}
.ph{width:372px;height:620px;border-radius:34px;overflow:hidden;position:relative;
  box-shadow:0 18px 44px rgba(0,0,0,.16),0 0 0 10px #1b1b1b,0 0 0 11.5px #3a3a3a}
.sb{height:40px;display:flex;align-items:center;justify-content:space-between;
  padding:0 20px;font-size:12px;font-weight:600;position:relative;z-index:3}
.sbr{display:flex;gap:4px;font-size:10px}
.top{height:46px;display:flex;align-items:center;padding:0 14px;position:relative;z-index:3}
.top h3{font-size:16px;font-weight:700}
.top .sub{font-size:10.5px;opacity:.6;margin-top:1px}
.mid{flex:1;overflow:hidden;padding:8px 12px 68px;position:relative;z-index:2}
.tab{position:absolute;bottom:0;left:0;right:0;height:56px;display:flex;z-index:3}
.tab div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:10px}
.tab svg{width:18px;height:18px}

/* ---------- A 青瓷扁平（当前 v2.2 方向） ---------- */
.A{background:#F2F5F3}
.A .sb,.A .top{color:#1C2420}
.A .card{background:#fff;border-radius:10px;margin-bottom:8px;
  box-shadow:0 1px 2px rgba(28,36,32,.05)}
.A .sum{background:#fff;border-radius:10px;padding:11px 13px;margin-bottom:9px;
  box-shadow:0 1px 2px rgba(28,36,32,.05)}
.A .sum .t{font-size:10px;color:#7E8A85}
.A .sum .n{font-size:19px;font-weight:700;color:#2F6B4F;margin-top:1px}
.A .sum .d{font-size:10px;color:#7E8A85;margin-top:1px}
.A .row2{display:flex;gap:9px;margin-bottom:9px}
.A .row2>div{flex:1}
.A .rec{background:#fff;border-radius:10px;padding:10px 12px;display:flex;gap:9px;align-items:center;
  margin-bottom:1px;box-shadow:0 1px 2px rgba(28,36,32,.05)}
.A .rec:nth-child(even){background:#FAFCFB}
.A .bar{width:3px;align-self:stretch;border-radius:2px;background:#A8342A;min-height:32px}
.A .bar.b{background:#3B6E8F}
.A .nm{font-size:14px;font-weight:600;color:#1C2420}
.A .ev{font-size:10.5px;color:#7E8A85;margin-top:2px}
.A .tg{font-size:10px;padding:1px 5px;border-radius:4px;background:#E2EDE7;color:#2F6B4F;display:inline-block;margin-top:2px}
.A .tg.s{background:rgba(43,47,44,.1);color:#2B2F2C}
.A .amt{margin-left:auto;font-size:14px;font-weight:700;color:#A8342A}
.A .amt.b{color:#3B6E8F}
.A .tab{background:#fff;border-top:1px solid #DEE5E1}
.A .tab div{color:#7E8A85}
.A .tab div.on{color:#2F6B4F;font-weight:600}
.A .tab div.on::before{content:"";position:absolute;top:0;left:50%;transform:translateX(-50%);
  width:20px;height:2px;background:#2F6B4F;border-radius:0 0 2px 2px}

/* ---------- B 澎湃柔光玻璃 ---------- */
.B{background:linear-gradient(160deg,#DCE9E2 0%,#EAF1ED 40%,#E3EAF2 100%)}
.B::after{content:"";position:absolute;inset:0;
  background:radial-gradient(120% 70% at 15% 8%,rgba(47,107,79,.16),transparent 60%),
             radial-gradient(100% 60% at 90% 100%,rgba(59,110,143,.14),transparent 60%);
  pointer-events:none;z-index:1}
.B .sb,.B .top{color:#16301F}
.B .glass{background:rgba(255,255,255,.62);backdrop-filter:blur(20px) saturate(1.5);
  -webkit-backdrop-filter:blur(20px) saturate(1.5);
  border:1px solid rgba(255,255,255,.72);border-radius:18px;
  box-shadow:0 6px 20px rgba(28,60,45,.09)}
.B .sum{padding:12px 14px;margin-bottom:10px}
.B .sum .t{font-size:10px;color:#4A6455}
.B .sum .n{font-size:20px;font-weight:700;color:#245740;margin-top:2px}
.B .sum .d{font-size:10px;color:#4A6455;margin-top:2px}
.B .rec{padding:11px 13px;display:flex;gap:10px;align-items:center;margin-bottom:8px}
.B .bar{width:3px;align-self:stretch;border-radius:2px;background:#A8342A;min-height:34px}
.B .bar.b{background:#3B6E8F}
.B .nm{font-size:14px;font-weight:600;color:#16301F}
.B .ev{font-size:10.5px;color:#4A6455;margin-top:2px}
.B .tg{font-size:10px;padding:2px 6px;border-radius:8px;display:inline-block;margin-top:3px;
  background:rgba(47,107,79,.13);color:#245740}
.B .tg.s{background:rgba(43,47,44,.1);color:#2B2F2C}
.B .amt{margin-left:auto;font-size:14px;font-weight:700;color:#A8342A}
.B .amt.b{color:#3B6E8F}
.B .tab{background:rgba(255,255,255,.72);backdrop-filter:blur(24px);
  -webkit-backdrop-filter:blur(24px);border-top:1px solid rgba(255,255,255,.6)}
.B .tab div{color:#6B7F72}
.B .tab div.on{color:#245740;font-weight:600}
.B .pill{background:rgba(255,255,255,.66);border:1px solid rgba(255,255,255,.7);
  border-radius:14px;padding:5px 11px;font-size:11px;color:#245740;display:inline-block;
  margin:0 5px 5px 0;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.B .pill.on{background:#2F6B4F;color:#fff;border-color:#2F6B4F}

/* ---------- C 澎湃卡片（更通透+ 光效） ---------- */
.C{background:linear-gradient(165deg,#E8F0EA 0%,#F0F4F1 50%,#E9EEF5 100%)}
.C::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:1;
  background:radial-gradient(90% 55% at 85% 5%,rgba(214,168,80,.20),transparent 55%),
             radial-gradient(80% 50% at 5% 95%,rgba(47,107,79,.18),transparent 55%)}
.C .sb,.C .top{color:#12291C}
.C .card{background:rgba(255,255,255,.55);backdrop-filter:blur(24px) saturate(1.6);
  -webkit-backdrop-filter:blur(24px) saturate(1.6);
  border-radius:22px;border:1px solid rgba(255,255,255,.65);
  box-shadow:0 10px 28px rgba(30,70,52,.10),inset 0 1px 0 rgba(255,255,255,.9);
  margin-bottom:9px}
.C .sum{padding:13px 15px}
.C .sum .t{font-size:10px;color:#4A6455}
.C .sum .n{font-size:21px;font-weight:700;color:#245740;margin-top:2px}
.C .sum .d{font-size:10px;color:#4A6455;margin-top:2px}
.C .rec{padding:12px 14px;display:flex;gap:10px;align-items:center}
.C .bar{width:3px;align-self:stretch;border-radius:2px;background:#A8342A;min-height:34px}
.C .bar.b{background:#3B6E8F}
.C .nm{font-size:14px;font-weight:600;color:#12291C}
.C .ev{font-size:10.5px;color:#4A6455;margin-top:2px}
.C .tg{font-size:10px;padding:2px 7px;border-radius:9px;display:inline-block;margin-top:3px;
  background:rgba(47,107,79,.14);color:#245740}
.C .tg.s{background:rgba(43,47,44,.1);color:#2B2F2C}
.C .amt{margin-left:auto;font-size:15px;font-weight:700;color:#A8342A}
.C .amt.b{color:#3B6E8F}
.C .tab{background:rgba(255,255,255,.55);backdrop-filter:blur(26px);
  -webkit-backdrop-filter:blur(26px);border-top:1px solid rgba(255,255,255,.55)}
.C .tab div{color:#6B7F72}
.C .tab div.on{color:#245740;font-weight:600}
</style></head><body>

<div class="row">
<div class="colw">
  <div class="hd"><h2>方案 A · 青瓷扁平</h2><p>纯色底 + 白卡 + 极轻阴影。信息密度最高，最不像人情礼簿。跟现在 diff 最小。</p></div>
  <div class="ph A">
    <div class="sb"><span>9:41</span><span class="sbr">●●●● WiFi ▮</span></div>
    <div class="top"><div><h3>往来记录</h3><div class="sub">5 人 · 5 条</div></div></div>
    <div class="mid">
      <div class="sum"><div class="t">收礼合计</div><div class="n">¥6,100</div><div class="d">人情净值尚欠 ¥1,100</div></div>
      <div class="card">
        <div class="rec"><div class="bar"></div><div><div class="nm">张三·南麻</div><div class="tg">结婚</div><div class="ev">10月02日 · 微信 · 两瓶酒</div></div><div class="amt">+2000</div></div>
        <div class="rec"><div class="bar b"></div><div><div class="nm">张三（堂哥·县城）</div><div class="tg">乔迁</div><div class="ev">10月01日 · 现金</div></div><div class="amt b">+1500</div></div>
        <div class="rec"><div class="bar"></div><div><div class="nm">李四</div><div class="tg">升学宴</div><div class="ev">09月28日 · 支付宝</div></div><div class="amt">+600</div></div>
        <div class="rec"><div class="bar b"></div><div><div class="nm">王五</div><div class="tg s">丧事</div><div class="ev">09月20日 · 现金</div></div><div class="amt b">+1200</div></div>
        <div class="rec"><div class="bar"></div><div><div class="nm">赵六</div><div class="tg">满月</div><div class="ev">08月15日 · 微信</div></div><div class="amt">+800</div></div>
      </div>
    </div>
    <div class="tab"><div class="on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 3v18M3 5h4M3 19h4M11 3h8a2 2 0 012 2v14a2 2 0 01-2 2h-8z"/></svg>记录</div><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.4"/><path d="M3 20c0-3.4 2.7-5.4 6-5.4s6 2 6 5.4M16 5.5a3 3 0 010 6M18 20c0-2.6-.9-4.2-2.4-5.2"/></svg>人员</div><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>功能</div><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c0-4 3.4-6.4 7.5-6.4s7.5 2.4 7.5 6.4"/></svg>我的</div></div>
  </div>
</div>

<div class="colw">
  <div class="hd"><h2>方案 B · 澎湃柔光玻璃</h2><p>青瓷绿渐层底 + 磨砂玻璃卡 + 顶部指示线Tab。接近澎湃 4 的Soft Light Glass，但克制不花。</p></div>
  <div class="ph B">
    <div class="sb"><span>9:41</span><span class="sbr">●●●● WiFi ▮</span></div>
    <div class="top"><div><h3>往来记录</h3><div class="sub">5 人 · 5 条</div></div></div>
    <div class="mid">
      <div class="glass sum"><div class="t">收礼合计</div><div class="n">¥6,100</div><div class="d">人情净值 尚欠 ¥1,100</div></div>
      <div class="glass rec"><div class="bar"></div><div><div class="nm">张三·南麻</div><div class="tg">结婚</div><div class="ev">10月02日 · 微信 · 两瓶酒</div></div><div class="amt">+2000</div></div>
      <div class="glass rec"><div class="bar b"></div><div><div class="nm">张三（堂哥·县城）</div><div class="tg">乔迁</div><div class="ev">10月01日 · 现金</div></div><div class="amt b">+1500</div></div>
      <div class="glass rec"><div class="bar"></div><div><div class="nm">李四</div><div class="tg">升学宴</div><div class="ev">09月28日 · 支付宝</div></div><div class="amt">+600</div></div>
      <div class="glass rec"><div class="bar b"></div><div><div class="nm">王五</div><div class="tg s">丧事</div><div class="ev">09月20日 · 现金</div></div><div class="amt b">+1200</div></div>
      <div class="pill">婚宴</div><div class="pill">满月</div><div class="pill">升学</div><div class="pill on">丧事</div>
    </div>
    <div class="tab"><div class="on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 3v18M3 5h4M3 19h4M11 3h8a2 2 0 012 2v14a2 2 0 01-2 2h-8z"/></svg>记录</div><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.4"/><path d="M3 20c0-3.4 2.7-5.4 6-5.4s6 2 6 5.4M16 5.5a3 3 0 010 6M18 20c0-2.6-.9-4.2-2.4-5.2"/></svg>人员</div><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>功能</div><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c0-4 3.4-6.4 7.5-6.4s7.5 2.4 7.5 6.4"/></svg>我的</div></div>
  </div>
</div>

<div class="colw">
  <div class="hd"><h2>方案 C · 澎湃卡片（通透+光效）</h2><p>22px 大圆角玻璃 + 环境光斑+ 内高光。最接近澎湃 4 视觉，但度最高。</p></div>
  <div class="ph C">
    <div class="sb"><span>9:41</span><span class="sbr">●●●● WiFi ▮</span></div>
    <div class="top"><div><h3>往来记录</h3><div class="sub">5 人 · 5 条</div></div></div>
    <div class="mid">
      <div class="card sum"><div class="t">收礼合计</div><div class="n">¥6,100</div><div class="d">人情净值 尚欠 ¥1,100</div></div>
      <div class="card rec"><div class="bar"></div><div><div class="nm">张三·南麻</div><div class="tg">结婚</div><div class="ev">10月02日 · 微信 · 两瓶酒</div></div><div class="amt">+2000</div></div>
      <div class="card rec"><div class="bar b"></div><div><div class="nm">张三（堂哥·县城）</div><div class="tg">乔迁</div><div class="ev">10月01日 · 现金</div></div><div class="amt b">+1500</div></div>
      <div class="card rec"><div class="bar"></div><div><div class="nm">李四</div><div class="tg">升学宴</div><div class="ev">09月28日 · 支付宝</div></div><div class="amt">+600</div></div>
      <div class="card rec"><div class="bar b"></div><div><div class="nm">王五</div><div class="tg s">丧事</div><div class="ev">09月20日 · 现金</div></div><div class="amt b">+1200</div></div>
      <div class="card" style="padding:11px 14px"><div class="tg" style="margin:0 0 5px">今日宜</div><div class="ev">嫁娶 · 出行 · 交易</div></div>
    </div>
    <div class="tab"><div class="on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 3v18M3 5h4M3 19h4M11 3h8a2 2 0 012 2v14a2 2 0 01-2 2h-8z"/></svg>记录</div><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.4"/><path d="M3 20c0-3.4 2.7-5.4 6-5.4s6 2 6 5.4M16 5.5a3 3 0 010 6M18 20c0-2.6-.9-4.2-2.4-5.2"/></svg>人员</div><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>功能</div><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c0-4 3.4-6.4 7.5-6.4s7.5 2.4 7.5 6.4"/></svg>我的</div></div>
  </div>
</div>
</div>
</body></html>"""

async def main():
    html = os.path.join(OUT, 'palette.html')
    open(html,'w',encoding='utf-8').write(HTML)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width':1280,'height':900}, device_scale_factor=2)
        await pg.goto("file:///" + html.replace("\\","/"))
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=os.path.join(OUT,'palette.png'), full_page=True)
        print("saved")
        await b.close()
asyncio.run(main())
