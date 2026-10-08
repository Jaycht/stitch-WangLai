# -*- coding: utf-8 -*-
"""
本地校验：SafFilePlugin 用到的 Capacitor / AndroidX API 是否真实存在。

为什么需要这个：本机没有 JDK，Java 只能静态检查，编译错误要等 CI 才发现。
本脚本**直接读 node_modules 里的 Capacitor 源码**核对方法签名，
把「等 CI 报错」变成「推之前就报错」。

新增/修改原生插件后必跑。
"""
import pathlib
import re
import sys

CAP = pathlib.Path('node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor')
PLUGIN_JAVA = CAP / 'Plugin.java'
ACTIVITY_JAVA = CAP / 'BridgeActivity.java'   # load() / registerPlugin 在这里
MY_JAVA = pathlib.Path(
    'android/app/src/main/java/com/lijiang/giftbook/SafFilePlugin.java')

FAILS = []
CHECKS = 0


def chk(cond, msg, detail=''):
    global CHECKS
    CHECKS += 1
    print(f"  [{'OK  ' if cond else 'FAIL'}] {msg}")
    if detail:
        print(f"         {detail}")
    if not cond:
        FAILS.append(msg)


def main():
    if not PLUGIN_JAVA.exists():
        print('找不到 Capacitor 源码，先跑 npm install')
        sys.exit(1)
    plugin_src = PLUGIN_JAVA.read_text(encoding='utf-8')
    activity_src = (ACTIVITY_JAVA.read_text(encoding='utf-8')
                    if ACTIVITY_JAVA.exists() else '')
    my = MY_JAVA.read_text(encoding='utf-8')

    print('=== 1. Plugin 基类确实没有 registerForActivityResult ===')
    # 只在 Plugin.java 自身里找方法定义（不是内部调用 bridge.xxx）
    has_own = re.search(
        r'\b(public|protected|private)\s+[\w<>,\s\[\]]*\s+registerForActivityResult\s*\(',
        plugin_src)
    chk(not has_own,
        'Plugin 基类无 registerForActivityResult 方法（用它是编译不过的）',
        '内部是 bridge.registerForActivityResult(...)')

    print('\n=== 2. startActivityForResult 存在且是 public ===')
    m = re.search(r'(public|protected)\s+void\s+startActivityForResult\s*\(\s*'
                  r'PluginCall\s+\w+\s*,\s*Intent\s+\w+\s*,\s*String\s+\w+\s*\)',
                  plugin_src)
    chk(bool(m), 'startActivityForResult(PluginCall, Intent, String) 签名匹配')
    if m:
        chk(m.group(1) == 'public', f'可见性是 {m.group(1)}')

    print('\n=== 3. @ActivityCallback 注解存在 ===')
    ann = CAP / 'annotation' / 'ActivityCallback.java'
    chk(ann.exists(), 'annotation/ActivityCallback.java 存在')

    print('\n=== 4. ActivityResult 的包名 ===')
    imp = re.search(r'^import\s+(androidx\.activity\.result\.[\w.]+);',
                    plugin_src, re.M)
    chk(bool(imp) and 'ActivityResult' in imp.group(1),
        f'Capacitor 自己 import 的是 {imp.group(1) if imp else "?"}')
    chk('import androidx.activity.result.ActivityResult;' in my,
        '我的插件 import 同一个包')

    print('\n=== 5. 回调方法名与 startActivityForResult 的字符串一致 ===')
    # 先剥掉注释，只在真实代码里找（注释里有错误示例，不能算）
    my_code = re.sub(r'/\*.*?\*/', '', my, flags=re.S)
    my_code = re.sub(r'//[^\n]*', '', my_code)
    calls = re.findall(
        r'startActivityForResult\s*\(\s*\w+\s*,\s*\w+\s*,\s*"(\w+)"\s*\)',
        my_code)
    methods = re.findall(r'@ActivityCallback\s*\n\s*private\s+void\s+(\w+)\s*'
                         r'\(\s*PluginCall\s+\w+\s*,\s*ActivityResult\s+\w+\s*\)',
                         my_code)
    chk(len(calls) > 0, f'找到 {len(calls)} 处startActivityForResult')
    for c in calls:
        chk(c in methods, f'callbackName "{c}" 有对应的 @ActivityCallback 方法')
    chk(len(set(calls)) == len(calls), 'callbackName 不重复')

    print('\n=== 6. 没用错已废弃的 API ===')
    code = my_code  # 第 5 段已剥好注释
    chk('registerForActivityResult' not in code,
        '代码里没有 registerForActivityResult（注释示例不算）')
    chk('ActivityResultLauncher' not in code, '代码里没有 ActivityResultLauncher')
    chk('ActivityResultContracts' not in code, '代码里没有 ActivityResultContracts')
    chk('onActivityResult' not in code,
        '没有用已废弃的 onActivityResult（Android 15 起不支持）')

    print('\n=== 7. 旧式手动保存 call 的字段不该存在 ===')
    # startActivityForResult 内部会 bridge.saveCall，会自动带回
    for f in ['pendingCall', 'pendingContent']:
        chk(f not in code, f'没有多余的 {f} 字段')

    print('\n=== 8. ⚠️ 插件注册时序（踩过：plugin is not implemented）===')
    act = pathlib.Path('android/app/src/main/java/com/lijiang/giftbook/MainActivity.java')
    act_code = act.read_text(encoding='utf-8')
    # 剥掉注释
    act_code = re.sub(r'/\*.*?\*/', '', act_code, flags=re.S)
    act_code = re.sub(r'//[^\n]*', '', act_code)

    # 8.1 必须在 load() 里往 initialPlugins 加，而不是 onCreate 里 registerPlugin
    has_load = re.search(r'protected\s+void\s+load\s*\(\s*\)', act_code)
    chk(bool(has_load), '覆盖了 load() 方法')
    if has_load:
        body = act_code[has_load.end():]
        body = body[:body.find('}')] if '}' in body else body
        chk('initialPlugins.add' in body,
            'load() 里往 initialPlugins.add(插件) —— 这是唯一有效的时机')
        chk('super.load()' in body, 'load() 里调用了 super.load()')
        # 顺序必须正确：add 在 super.load() 之前
        if 'initialPlugins.add' in body and 'super.load()' in body:
            chk(body.index('initialPlugins.add') < body.index('super.load()'),
                'initialPlugins.add 在 super.load() 之前（顺序反了无效）')

    # 8.2 onCreate 里不能有 registerPlugin（Bridge 已经建好，来不及了）
    oc = re.search(r'public\s+void\s+onCreate\s*\([^)]*\)\s*\{', act_code)
    if oc:
        oc_body = act_code[oc.end():]
        oc_body = oc_body[:oc_body.find('\n    }')] if '\n    }' in oc_body else oc_body[:600]
        chk('registerPlugin' not in oc_body,
            'onCreate 里没有 registerPlugin（那样 Bridge 已建好，无效）')

    # 8.3 确认 Capacitor 的 load() 确实是 protected 且会先建 Bridge
    # 用字符串查找而不是正则（正则的 \s+ 匹配缩进容易出问题）
    chk(bool(activity_src), '读到了 BridgeActivity.java')
    load_idx = activity_src.find('protected void load()')
    chk(load_idx > 0, 'BridgeActivity.load() 是 protected（可被子类覆盖）')
    if load_idx > 0:
        seg = activity_src[load_idx:load_idx + 400]
        chk('create()' in seg,
            'load() 内部会 create() 建 Bridge —— 所以必须在此之前注册')
        chk('initialPlugins' in seg,
            'load() 会把 initialPlugins 传给 builder —— 官方给自定义插件的入口')
        # 反证：registerPlugin 只改 builder，在 load() 之后调用无效
        rp = activity_src.find('public void registerPlugin')
        if rp > 0:
            rp_seg = activity_src[rp:rp + 220]
            chk('bridgeBuilder.addPlugin' in rp_seg and 'create()' not in rp_seg,
                'registerPlugin 只改 builder（不建 Bridge）—— 这就是踩过的坑')

    print('\n=== 9. 括号配平 ===')
    for f in sorted(pathlib.Path(
            'android/app/src/main/java/com/lijiang/giftbook').glob('*.java')):
        chk(*brace_balanced(f))

    print(f'\n通过 {CHECKS - len(FAILS)}/{CHECKS}')
    if FAILS:
        print('\n失败项：')
        for f in FAILS:
            print('  -', f)
        sys.exit(1)
    print('✅ 原生 API 全部对齐')


def brace_balanced(path):
    """逐字符扫描配平，正确处理字符串/字符/注释"""
    s = path.read_text(encoding='utf-8')
    depth = 0
    i = 0
    n = len(s)
    state = None
    while i < n:
        c = s[i]
        if c == '\n':
            if state == '//':
                state = None
            i += 1
            continue
        if state is None:
            if s.startswith('//', i):
                state = '//'
                i += 2
                continue
            if s.startswith('/*', i):
                state = '/*'
                i += 2
                continue
            if c == '"':
                state = '"'
                i += 1
                continue
            if c == "'":
                state = "'"
                i += 1
                continue
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            i += 1
            continue
        if state == '/*':
            if s.startswith('*/', i):
                state = None
                i += 2
                continue
            i += 1
            continue
        if c == '\\':
            i += 2
            continue
        if (state == '"' and c == '"') or (state == "'" and c == "'"):
            state = None
        i += 1
    return depth == 0, f'{path.name} 括号配平（深度={depth}）'


if __name__ == '__main__':
    main()
