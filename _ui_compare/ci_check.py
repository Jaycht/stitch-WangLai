# -*- coding: utf-8 -*-
"""CI 配置自检 —— 所有「依赖要求 vs CI 配置」一次性核对

背景：连续三次 CI 失败（Node 版本 / gradlew 权限 / JDK 版本），
都是版本或环境没对齐。这个脚本在推送前一次性查全。

用法：python _ui_compare/ci_check.py
"""
import re, os, json, subprocess, yaml


def read(p):
    return open(p, encoding='utf-8').read() if os.path.exists(p) else ''


def num(pat, text, default=0):
    """匹配返回数字组；无匹配返回 default。允许小数。"""
    m = re.search(pat, text)
    if not m:
        return default
    try:
        return float(m.group(1))
    except ValueError:
        return default


wf_raw = read('.github/workflows/build-apk.yml')
wf = yaml.safe_load(wf_raw)          # 用 YAML 解析，不靠正则
pkg = json.loads(read('package.json')) if read('package.json') else {}
cap = read('node_modules/@capacitor/android/capacitor/build.gradle')
bg = read('android/build.gradle')
ag = read('android/app/build.gradle')
vars_g = read('android/variables.gradle')

steps = {s['name']: s for s in wf['jobs']['build']['steps']}
node_ci = int(steps['Setup Node.js']['with']['node-version'])
jdk_ci = int(steps['Set up JDK']['with']['java-version'])

print('=== CI 配置自检 ===\n')
res = []


def mark(ok):
    res.append(bool(ok))
    return 'OK  ' if ok else 'FAIL'


# 1. Node
need_node = num(r'>=(\d+)', pkg.get('engines', {}).get('node', '>=22'), 22)
ok = node_ci >= need_node
print(f"  [{mark(ok)}] Node        要求>={need_node:.0f}   CI={node_ci}")

# 2. JDK
jdk_need = num(r'JavaVersion\.VERSION_(\d+)', cap, 21)
agp_minor = num(r'com\.android\.tools\.build:gradle:8\.(\d+)', bg)
agp_need = 17
ok = jdk_ci >= jdk_need and jdk_ci >= agp_need
print(f"  [{mark(ok)}] JDK         Capacitor 要>={jdk_need:.0f}"
      f"   AGP 8.{agp_minor:.0f} 要>={agp_need}   CI={jdk_ci}")

# 3. Gradle（仅展示）
gv = num(r'gradle-([\d.]+)-all', read('android/gradle/wrapper/gradle-wrapper.properties'))
print(f"  [INFO] Gradle {gv}")

# 4. gradlew 执行位
r = subprocess.run(['git', 'ls-files', '-s', 'android/gradlew'],
                   capture_output=True, text=True)
mode = r.stdout.split()[0] if r.stdout.strip() else '?'
ok = mode == '100755'
print(f"  [{mark(ok)}] gradlew     要求 100755   实际 {mode}")

# 5. chmod 兜底
ok = 'chmod +x' in wf_raw
print(f"  [{mark(ok)}] chmod 兜底   {'有' if ok else '没有'} chmod +x")

# 6. 签名文件
ks_local = (os.path.exists('android/keystore.properties')
            and os.path.exists('android/wanglai-release.p12'))
ks_git = bool(subprocess.run(['git', 'ls-files', 'android/wanglai-release.p12'],
                             capture_output=True, text=True).stdout.strip())
ok = ks_local and ks_git
print(f"  [{mark(ok)}] 签名文件     本地={ks_local}  已提交={ks_git}")

# 7. 签名降级保护
ok = 'signingConfigs.debug' in ag
print(f"  [{mark(ok)}] 签名降级保护  无 keystore 时退回 debug")

# 8. SDK 版本
mn = num(r'minSdkVersion\s*=\s*(\d+)', vars_g)
sdk = num(r'compileSdkVersion\s*=\s*(\d+)', vars_g)
tgt = num(r'targetSdkVersion\s*=\s*(\d+)', vars_g)
ok = sdk >= 34 and mn >= 21
print(f"  [{mark(ok)}] SDK         min={mn:.0f} compile={sdk:.0f} target={tgt:.0f}")

# 9. Gradle 缓存（不影响成败）
ok = 'actions/cache' in wf_raw or 'setup-gradle' in wf_raw
print(f"  [{mark(ok)}] Gradle 缓存   {'已启用' if ok else '未启用'}（只影响速度）")

must = res[:8]
print(f"\n必须项通过 {sum(must)}/{len(must)}")
print('✅ 全部对齐' if all(must) else '❌ 还有未对齐项')