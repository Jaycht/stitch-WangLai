"""v2.14.2 运行时冒烟测试 —— 真实浏览器验证 4 处改动（涛哥铁律：只跑 tsc/build 不算修复）
用已装好的 chromium（LOCALAPPDATA/ms-playwright/chromium-1243）。
"""
import json, sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:3000/"

SEED = {
  "schemaVersion": 3,
  "persons": [
    {"id":"p1","name":"王建国","relation":"同事","region":"南麻","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"},
    {"id":"p2","name":"王秀兰","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"},
  ],
  "records": [
    {"id":"r1","personId":"p1","received":{"channel":"cash","amount":1000,"date":"2026-10-01","event":"wedding"},"createdAt":"2026-10-01T00:00:00.000Z","updatedAt":"2026-10-01T00:00:00.000Z"},
    {"id":"r2","personId":"p2","received":{"channel":"wechat","amount":600,"date":"2026-10-02","event":"birthday"},"returned":{"channel":"cash","amount":300,"date":"2026-10-03","event":"birthday"},"createdAt":"2026-10-02T00:00:00.000Z","updatedAt":"2026-10-02T00:00:00.000Z"},
  ],
  "todos": [],
  "customEvents": [],
  "settings": {"accent":"#2F6B4F","bg":"#F4F2EE","appLock":False,"currency":"¥","weekStart":1,"theme":"a","themePicked":True,"fontSize":"off","careMode":False},
  "updatedAt": "",
}

results = []
def ok(name, cond, detail=""):
    results.append((name, cond, detail))
    print(("PASS" if cond else "FAIL"), name, detail)

def close_sheet(pg):
    x = pg.query_selector("button[aria-label='关闭']")
    if x: x.click()
    pg.wait_for_timeout(350)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width":390,"height":780})

    # ---- 标准模式 ----
    pg.goto(URL)
    pg.evaluate("(v)=>localStorage.setItem('wanglai.db.v1', v)", json.dumps(SEED))
    pg.reload()
    pg.wait_for_selector("text=往来记录", timeout=8000)

    # 1) 时间输入框默认当前时刻（新记一笔）
    pg.click("button[aria-label='记一笔']")
    pg.wait_for_selector("text=记一笔", timeout=5000)
    tval = pg.eval_on_selector("input[type=time]", "el => el.value")
    ok("时间框默认有值(新记录)", bool(tval) and len(tval)==5, f"value={tval!r}")
    close_sheet(pg)

    # 2) 删除有二次确认弹窗 —— 用 delay 让 pointerdown/up 间隔 >50ms（逼近真实点按）
    # 用稍长的按住，触发列表行的 onClick（打开编辑），而非长按
    row = pg.query_selector("text=王建国")
    row.click(delay=120)
    pg.wait_for_timeout(500)
    del_btn = pg.query_selector("button.btn-danger:has-text('删除')")
    ok("编辑页存在删除按钮", del_btn is not None)
    if del_btn:
        del_btn.click()
        pg.wait_for_timeout(400)
        dlg = pg.query_selector("text=删除这条记录？")
        ok("编辑页删除有确认弹窗", dlg is not None)
        if dlg:
            pg.click("button:has-text('取消')")
            pg.wait_for_timeout(250)
    close_sheet(pg)

    # 3) 建议框字号变大（f-lg=14px，旧为 f-md=13px）
    pg.click("button[aria-label='记一笔']")
    pg.wait_for_selector("text=记一笔")
    name_input = pg.query_selector("input[placeholder*='历史']")
    name_input.click()
    name_input.fill("王")
    pg.wait_for_timeout(450)
    box = pg.query_selector("div.fixed.z-50")
    if box:
        cls = box.inner_html()
        has_lg = "var(--f-lg)" in cls
        fs = pg.eval_on_selector("div.fixed.z-50 .flex-1.min-w-0 > div:first-child",
                                 "el => getComputedStyle(el).fontSize")
        dbg = pg.evaluate("""() => {
            const r = getComputedStyle(document.documentElement);
            const el = document.querySelector('div.fixed.z-50 .flex-1.min-w-0 > div:first-child');
            return { fLg: r.getPropertyValue('--f-lg'), fs: r.getPropertyValue('--fs'),
                     fsSys: r.getPropertyValue('--fs-sys'),
                     cls: el ? el.className : 'NONE' };
        }""")
        ok("建议框含 f-lg 类", has_lg)
        ok("建议框主文本字号≥14px", fs and float(fs.replace('px',''))>=14, f"fontSize={fs} dbg={dbg}")
    else:
        ok("建议框出现", False, "未找到建议框")
    close_sheet(pg)

    # ---- 关怀模式 ----
    seed2 = json.loads(json.dumps(SEED))
    seed2["settings"]["careMode"]=True; seed2["settings"]["fontSize"]="xxl"
    pg.evaluate("(v)=>localStorage.setItem('wanglai.db.v1', v)", json.dumps(seed2))
    pg.reload()
    pg.wait_for_selector("text=往来记录")
    pg.wait_for_timeout(600)
    care_hidden = {
        "人员按钮(TopBar)": pg.query_selector("button.btn-ghost:has-text('人员')") is None,
        "全选按钮": pg.query_selector("button:has-text('全选')") is None,
        "合计卡": pg.query_selector("text=收礼合计") is None,
        "筛选标签": pg.query_selector("button:has-text('全部')") is None,
        "搜索框": pg.query_selector("input[placeholder*='筛选']") is None,
    }
    for k,v in care_hidden.items():
        ok(f"关怀模式隐藏[{k}]", v)
    lst = pg.query_selector("text=王建国")
    ok("关怀模式列表保留", lst is not None)

    # ---- 设置页关怀模式精简 ----
    pg.click(".tabitem:has-text('我的')")
    pg.wait_for_timeout(450)
    set_hidden = {
        "数据概览": pg.query_selector("text=本机数据") is None,
        "界面风格": pg.query_selector("text=界面风格") is None,
        "配色": pg.query_selector("text=配色") is None,
    }
    for k, v in set_hidden.items():
        ok(f"关怀模式设置页隐藏[{k}]", v)
    set_keep = {
        "备份与恢复": pg.query_selector("text=备份与恢复") is not None,
        "关怀模式切换": pg.query_selector("text=关怀模式") is not None,
        "关于": pg.query_selector("text=关于往来礼记") is not None,
    }
    for k, v in set_keep.items():
        ok(f"关怀模式设置页保留[{k}]", v)

    # ---- 功能页关怀模式精简 ----
    pg.click(".tabitem:has-text('功能')")
    pg.wait_for_timeout(450)
    fn_hidden = {
        "待办事项": pg.query_selector("text=待办事项") is None,
        "渠道分布": pg.query_selector("text=渠道分布") is None,
        "事由分布": pg.query_selector("text=事由分布") is None,
        "往来最多": pg.query_selector("text=往来最多") is None,
    }
    for k, v in fn_hidden.items():
        ok(f"关怀模式功能页隐藏[{k}]", v)
    fn_keep = {
        "工具入口(万年黄历)": pg.query_selector("text=万年黄历") is not None,
        "人情概览": pg.query_selector("text=人情概览") is not None,
    }
    for k, v in fn_keep.items():
        ok(f"关怀模式功能页保留[{k}]", v)

    # ---- 人员页关怀模式精简 ----
    pg.click(".tabitem:has-text('人员')")
    pg.wait_for_timeout(450)
    per_hidden = {
        "全选入口": pg.query_selector("button:has-text('全选')") is None,
        "搜索框": pg.query_selector("input[placeholder*='搜索']") is None,
        "整体人情净值": pg.query_selector("text=整体人情净值") is None,
    }
    for k, v in per_hidden.items():
        ok(f"关怀模式人员页隐藏[{k}]", v)
    per_keep = {
        "列表": pg.query_selector("text=王建国") is not None,
        "新增按钮": pg.query_selector("button[aria-label='新增人员']") is not None,
    }
    for k, v in per_keep.items():
        ok(f"关怀模式人员页保留[{k}]", v)

    b.close()

fails = [r for r in results if not r[1]]
print("\n==== 结果 ====")
print(f"总 {len(results)}，通过 {len(results)-len(fails)}，失败 {len(fails)}")
sys.exit(1 if fails else 0)
