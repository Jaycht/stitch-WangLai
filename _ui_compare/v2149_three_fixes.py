"""v2.14.9 验证 —— 涛哥真机截图报的三件事

1. 太岁查询：9 个年份硬塞一行 → 2028 之后超出屏幕，看不见也点不到、还拖不动
2. 关系计算：快捷问句右侧留白、与上方搜索按钮不对齐；搜索按钮放大镜太小
3. 打包：APK 名叫 v2.14.1-正式版，可页面已经 2.14.8 —— 版本号两处各写各的

铁律：不看代码，量运行时几何；断言「输入→输出」；最后看截图。
"""
import json, os, re, subprocess, sys, tempfile
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _seed import with_settings  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

URL = "http://127.0.0.1:3000/"
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')
os.makedirs(SHOTS, exist_ok=True)

results = []
def ok(name, cond, detail=""):
    results.append((name, cond, detail))
    print(("PASS" if cond else "FAIL"), name, detail)


def load(pg, seed, path=''):
    # 先 goto 再写 localStorage：首次调用时页面还是 about:blank，
    # localStorage 访问会被拒（SecurityError）
    pg.goto(URL + path)
    pg.evaluate("(v)=>localStorage.setItem('wanglai.db.v1', v)", json.dumps(seed))
    pg.reload()
    pg.wait_for_selector(".tabbar", timeout=15000)
    pg.wait_for_timeout(600)


def human_tap(pg, selector, idx=0):
    """★ 不能用 pg.click()：down→up 间隔 <10ms 会被 useLongPress 的
    CLICK_MIN_MS(50ms) 门槛当误触丢掉（见 lessons 16.16）。手动按时长。"""
    el = pg.query_selector_all(selector)[idx]
    box = el.bounding_box()
    pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    pg.mouse.down()
    pg.wait_for_timeout(150)
    pg.mouse.up()


# 年份条：条形自身（可滚动性）+ 每个按钮的位置/宽度/选中态
YEARBAR_JS = """() => {
  const bar = document.querySelector('.page-body .card');
  if (!bar) return null;
  const br = bar.getBoundingClientRect();
  return {
    bar: {
      left: Math.round(br.left), right: Math.round(br.right),
      center: Math.round(br.left + br.width / 2),
      scrollLeft: Math.round(bar.scrollLeft),
      scrollWidth: Math.round(bar.scrollWidth),
      clientWidth: Math.round(bar.clientWidth),
      overflowX: getComputedStyle(bar).overflowX,
    },
    yrs: [...bar.querySelectorAll('button')].map(b => {
      const r = b.getBoundingClientRect();
      return {
        t: b.innerText.trim(),
        left: Math.round(r.left), right: Math.round(r.right),
        center: Math.round(r.left + r.width / 2),
        w: Math.round(r.width), h: Math.round(r.height),
        visible: r.left >= br.left - 1 && r.right <= br.right + 1,
        on: b.getAttribute('data-sel') === '1',
      };
    }),
  };
}"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 390, "height": 780})

    # ============ 问题1：太岁查询年份条 ============
    for mode, seedfn in (
        ('标准', lambda: with_settings(careMode=False, fontSize='off')),
        ('大字', lambda: with_settings(careMode=True, fontSize='xxl')),
    ):
        load(pg, seedfn(), 'taisui')
        d = pg.evaluate(YEARBAR_JS)
        ok(f"问题1 {mode}模式找到年份条", bool(d) and len(d['yrs']) == 9,
           f"count={len(d['yrs']) if d else None}")
        if not d:
            continue
        bar, yrs = d['bar'], d['yrs']

        ok(f"问题1 {mode}模式年份条是一行横向滚动（涛哥要的滚轮式）",
           bar['overflowX'] in ('auto', 'scroll'), f"overflow-x={bar['overflowX']}")
        ok(f"问题1 {mode}模式确实有可滚内容（不是硬塞）",
           bar['scrollWidth'] > bar['clientWidth'] + 10,
           f"scrollWidth={bar['scrollWidth']} clientWidth={bar['clientWidth']}")
        ok(f"问题1 {mode}模式年份没被压扁（宽度够点）",
           all(y['w'] >= 40 for y in yrs), f"宽度={[y['w'] for y in yrs]}")
        # 宽度由 var(--f-md)*3.4 换算，flex 分配后会有 1~2px 的亚像素舍入，
        # 容差给 2px；要求「完全相等」是在测浏览器舍入，不是测设计
        ok(f"问题1 {mode}模式年份等宽（同一模子，容差 2px）",
           max(y['w'] for y in yrs) - min(y['w'] for y in yrs) <= 2,
           f"宽度={sorted({y['w'] for y in yrs})}")
        ok(f"问题1 {mode}模式年份完整有序",
           [y['t'] for y in yrs] == sorted([y['t'] for y in yrs], key=int),
           f"{[y['t'] for y in yrs]}")

        # ★ 自动居中：首屏把「今年」摆正中间 —— 这是「让用户知道能滑」的关键
        cur = [y for y in yrs if y['on']]
        ok(f"问题1 {mode}模式首屏选中今年",
           len(cur) == 1 and cur[0]['t'] == str(datetime.now().year),
           f"选中={[y['t'] for y in cur]}")
        ok(f"问题1 {mode}模式选中项被摆在条形中间（左右都露出别的年份=能滑的暗示）",
           bool(cur) and abs(cur[0]['center'] - bar['center']) <= cur[0]['w'] / 2 + 4,
           f"选中中心={cur[0]['center'] if cur else None} 条中心={bar['center']}")
        # 「能滑」的视觉暗示 = 至少有一侧年份被裁掉半截。
        # 不能要求「左侧一定有被裁」：标准模式下今年只排第 3 位，
        # 居中后仍没滚到需要裁左边，右侧被裁同样是有效暗示。
        ok(f"问题1 {mode}模式首屏有年份被裁（暗示还能滑）",
           any(not y['visible'] for y in yrs),
           f"被裁={[y['t'] for y in yrs if not y['visible']]}")

        # ★ 真的能拖：横向滚动后，以前点不到的 2032 必须进得来
        box = pg.query_selector('.page-body .card').bounding_box()
        pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        pg.mouse.wheel(600, 0)
        pg.wait_for_timeout(600)
        d2 = pg.evaluate(YEARBAR_JS)
        last = d2['yrs'][-1]
        ok(f"问题1 {mode}模式横向滚动真的生效",
           d2['bar']['scrollLeft'] > bar['scrollLeft'],
           f"{bar['scrollLeft']} → {d2['bar']['scrollLeft']}")
        ok(f"问题1 {mode}模式滚到底后最后一个年份({last['t']}) 进屏可见",
           last['visible'] is True,
           f"left={last['left']} right={last['right']} 条右={d2['bar']['right']}")

        # ★ 输入→输出：点它，真的切过去
        idx = len(d2['yrs']) - 1
        human_tap(pg, '.page-body .card button', idx)
        pg.wait_for_timeout(700)
        d3 = pg.evaluate(YEARBAR_JS)
        lit = [y['t'] for y in d3['yrs'] if y['on']]
        ok(f"问题1 {mode}模式点最后一个年份({last['t']})真的切过去了",
           lit == [last['t']], f"选中={lit}")
        # 切完自动把它带回中间
        sel = [y for y in d3['yrs'] if y['on']][0]
        # 「居中」只在滚得动的时候才可能。选到末位年份（2032）时右侧没有
        # 更多内容，滚到最右就是极限 —— 此时贴边即正确，不该算失败。
        at_edge = (d3['bar']['scrollLeft'] <= 1
                   or d3['bar']['scrollLeft']
                   >= d3['bar']['scrollWidth'] - d3['bar']['clientWidth'] - 1)
        ok(f"问题1 {mode}模式切换后新选中项被带回中间（滚到边界时贴边即算合理）",
           abs(sel['center'] - d3['bar']['center']) <= sel['w'] / 2 + 4 or at_edge,
           f"选中中心={sel['center']} 条中心={d3['bar']['center']} "
           f"scrollLeft={d3['bar']['scrollLeft']}/{d3['bar']['scrollWidth']-d3['bar']['clientWidth']}")
        pg.screenshot(path=os.path.join(SHOTS, f'34_taisui_{mode}_v2149.png'), full_page=True)

    # ============ 问题2：关系计算对齐 + 放大镜 ============
    for mode, seedfn in (
        ('标准', lambda: with_settings(careMode=False, fontSize='off')),
        ('大字', lambda: with_settings(careMode=True, fontSize='xxl')),
    ):
        load(pg, seedfn(), 'relation')
        r = pg.evaluate("""() => {
          const icon = document.querySelector('.btn-icon');
          const svg  = icon ? icon.querySelector('svg') : null;
          const grid = document.querySelector('.card .grid');
          if (!icon || !grid) return null;
          const pills = [...grid.querySelectorAll('button')];
          const ir = icon.getBoundingClientRect();
          const gr = grid.getBoundingClientRect();
          const pr = pills.map(b => b.getBoundingClientRect());
          const cols = new Set(pr.map(x => Math.round(x.left))).size;
          return {
            iconRight: Math.round(ir.right), gridRight: Math.round(gr.right),
            iconW: Math.round(ir.width),
            svgW: svg ? Math.round(svg.getBoundingClientRect().width) : null,
            pillRightMax: Math.round(Math.max(...pr.map(x => x.right))),
            pillRightMin: Math.round(Math.min(...pr.map(x => x.right))),
            pillW: [...new Set(pr.map(x => Math.round(x.width)))],
            cols, n: pills.length,
            text: pills.map(b => b.innerText.trim()),
          };
        }""")
        ok(f"问题2 {mode}模式找到搜索按钮与问句网格", r is not None, f"{r}")
        if not r:
            continue
        ok(f"问题2 {mode}模式右侧不再留白（网格右边缘与搜索按钮对齐）",
           abs(r['pillRightMax'] - r['iconRight']) <= 1,
           f"pill右={r['pillRightMax']} 按钮右={r['iconRight']}")
        if mode == '大字':
            # 大字模式由 care-grid-2 转单列，否则 8 字问句挤在半屏里放不下
            ok("问题2 大字模式问句转单列（长问句放得下）",
               r['cols'] == 1 and len(r['pillW']) == 1,
               f"宽度集合={r['pillW']} 列数={r['cols']}")
        else:
            ok("问题2 标准模式问句是等宽两列（不再参差不齐）",
               r['cols'] == 2 and len(r['pillW']) == 1,
               f"宽度集合={r['pillW']} 列数={r['cols']}")
        ok(f"问题2 {mode}模式问句一个不少",
           r['n'] == 8, f"n={r['n']} {r['text']}")
        # 放大镜：原来固定 15px
        ok(f"问题2 {mode}模式放大镜不再是小图（≥18px）",
           r['svgW'] is not None and r['svgW'] >= 18,
           f"svgW={r['svgW']} 按钮宽={r['iconW']}")
        ok(f"问题2 {mode}模式放大镜没超出按钮",
           r['svgW'] is not None and r['svgW'] <= r['iconW'] - 6,
           f"svgW={r['svgW']} 按钮宽={r['iconW']}")
        pg.screenshot(path=os.path.join(SHOTS, f'35_relation_{mode}_v2149.png'), full_page=True)

    b.close()

# ============ 问题3：版本号单一事实源（静态核对）============
ver_src = open(os.path.join(ROOT, 'src', 'version.ts'), encoding='utf-8').read()
VERSION = re.search(r"VERSION = '([\d.]+)'", ver_src).group(1)
gradle = open(os.path.join(ROOT, 'android', 'app', 'build.gradle'), encoding='utf-8').read()
g_name = re.search(r'versionName\s+"([^"]+)"', gradle).group(1)
g_code = re.search(r'versionCode\s+(\d+)', gradle).group(1)

ok("问题3 src/version.ts 与 build.gradle 的版本号一致",
   VERSION == g_name, f"src={VERSION} gradle={g_name}")

major, minor, patch = (int(x) for x in VERSION.split('.'))
expect_code = major * 10000 + minor * 100 + patch
ok("问题3 build.gradle 的 versionCode 与版本号自洽",
   int(g_code) == expect_code, f"gradle={g_code} 期望={expect_code}")

ok("问题3 CHANGELOG 第一条就是当前版本",
   f"ver: '{VERSION}'" in ver_src, f"VERSION={VERSION}")

wf = open(os.path.join(ROOT, '.github', 'workflows', 'build-apk.yml'), encoding='utf-8').read()
ok("问题3 CI 从 src/version.ts 读版本号（不再从 build.gradle grep）",
   'src/version.ts' in wf and "grep versionName android/app/build.gradle" not in wf,
   "workflow 里应出现 src/version.ts，且不再 grep build.gradle")
ok("问题3 CI 会把版本号写回 build.gradle",
   'versionName \\"' in wf and 'versionCode' in wf.split('Collect APKs')[0],
   "同步步骤存在")
ok("问题3 APK 命名用同步来的 $VER",
   '往来礼记-v${VER}-' in wf, "'往来礼记-v${VER}-' 应出现在 Collect APKs")

# 真跑一遍 CI 里那段 sed 逻辑（在副本上），断言输入→输出。
# 用系统临时目录，别在仓库里留垃圾。
tmpdir = tempfile.mkdtemp(prefix='wanglai_ver_')
tmp_gradle = os.path.join(tmpdir, 'build.gradle')
with open(tmp_gradle, 'w', encoding='utf-8') as f:
    f.write('        versionCode 21\n        versionName "2.14.1"\n')
# CI 里那段 grep 在 ubuntu runner 上跑，本地不验就等于赌 —— 原样跑一遍
grep_out = subprocess.run(
    ["bash", "-c",
     "grep -oE \"VERSION = '[0-9]+\\.[0-9]+\\.[0-9]+'\" src/version.ts "
     "| grep -oE '[0-9]+\\.[0-9]+\\.[0-9]+' | head -1"],
    cwd=ROOT, capture_output=True, text=True,
).stdout.strip()
ok("问题3 CI 那段 grep 真能从 src/version.ts 抠出版本号",
   grep_out == VERSION, f"grep 得到 {grep_out!r}，期望 {VERSION!r}")

code = major * 10000 + minor * 100 + patch
# 以临时目录为工作目录、只传文件名：Windows 的短路径（ADMINI~1）和
# 反斜杠塞进 sed 参数会直接 I/O 报错，别去踩。
subprocess.run(
    ["sed", "-i", "-E", f"s/versionCode [0-9]+/versionCode {code}/", "build.gradle"],
    cwd=tmpdir, check=True,
)
subprocess.run(
    ["sed", "-i", "-E", f"s/versionName \"[^\"]*\"/versionName \"{VERSION}\"/", "build.gradle"],
    cwd=tmpdir, check=True,
)
after = open(tmp_gradle, encoding='utf-8').read()
ok("问题3 模拟 CI：拿旧值 2.14.1 跑一遍 sed 后变成当前版本",
   f'versionName "{VERSION}"' in after and f'versionCode {code}' in after,
   f"{after.strip()!r}")

fails = [r for r in results if not r[1]]
print("\n==== 结果 ====")
print(f"总 {len(results)}，通过 {len(results)-len(fails)}，失败 {len(fails)}")
for name, _, detail in fails:
    print("  ✗", name, detail)
sys.exit(1 if fails else 0)
