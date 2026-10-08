#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Java 静态检查 —— 本机无 JDK 时，CI 失败前的最后一道防线
（2026-10-08 CI 上真实炸过一次：cannot find symbol: getPackageManager()）

★ 关键教训：脚本本身也会骗人 ★
  首版用「去注释后数花括号」，结果被字符串字面量里的
  `i.setType("**/}")` 骗了，误报 SafFilePlugin「括号不配平」。
  → 所以必须**先剥掉字符串字面量**再数括号，否则审查结果不可信。
"""
import io
import re
import sys

JAVA_DIR = 'android/app/src/main/java/com/lijiang/giftbook'

# Plugin 不是 Activity，没有这些方法 —— 裸调必然编译失败
CONTEXT_ONLY = ['getPackageManager', 'getSystemService', 'getResources',
                'findViewById', 'getWindow', 'getString', 'getSharedPreferences']


def strip_comments_and_literals(code: str) -> str:
    """
    正确剥离注释与字符串字面量。

    ★踩过两次坑，必须记住★
    坑 1：先剥注释时，`i.setType("*/*")` 里的 `*/*` 被当成块注释开始标记，
          从那里往后整段被吞掉 → 误报 SafFilePlugin「花括号不配平」。
          **Java 代码本身是配平的（原始 25/25）。**
    坑 2：不剥字符串字面量时，`i.setType("**/}")` 里的 `}` 被数成代码括号。

    正解：**单趟扫描**，一次处理完字符串和注释，
    遇到 `"` / `'` 先吃掉整个字面量，遇到 `//` / `/*` 再吃掉注释。
    顺序错了或分两趟都会出错。
    """
    out = []
    i = 0
    n = len(code)
    while i < n:
        c = code[i]
        nxt = code[i + 1] if i + 1 < n else ''

        # 行注释
        if c == '/' and nxt == '/':
            while i < n and code[i] != '\n':
                i += 1
            continue
        # 块注释
        if c == '/' and nxt == '*':
            i += 2
            while i < n - 1:
                if code[i] == '*' and code[i + 1] == '/':
                    i += 2
                    break
                i += 1
            else:
                i = n
            continue
        # 双引号字符串
        if c == '"':
            i += 1
            while i < n:
                if code[i] == '\\':
                    i += 2
                    continue
                if code[i] == '"':
                    i += 1
                    break
                i += 1
            out.append('""')
            continue
        # 单引号字符字面量
        if c == "'":
            i += 1
            while i < n:
                if code[i] == '\\':
                    i += 2
                    continue
                if code[i] == "'":
                    i += 1
                    break
                i += 1
            out.append("''")
            continue

        out.append(c)
        i += 1
    return ''.join(out)


problems = []
print('=' * 66)
print('Java 静态检查（CI 失败前的兜底）')
print('=' * 66)

import os
for fn in sorted(os.listdir(JAVA_DIR)):
    if not fn.endswith('.java'):
        continue
    p = os.path.join(JAVA_DIR, fn)
    src = io.open(p, encoding='utf-8').read()
    code = strip_comments_and_literals(src)     # ★单趟剥离注释+字符串★

    print(f'\n--- {fn} ---')
    ok_brace = code.count('{') == code.count('}')
    print(f'  花括号配平: {"OK" if ok_brace else "不配平 <<<"}  ({code.count("{")}/{code.count("}")})')
    if not ok_brace:
        problems.append(f'{fn}: 花括号不配平')

    ok_paren = code.count('(') == code.count(')')
    print(f'  圆括号配平: {"OK" if ok_paren else "不配平 <<<"}')
    if not ok_paren:
        problems.append(f'{fn}: 圆括号不配平')

    bare = []
    for api in CONTEXT_ONLY:
        # 前面不是 . 也不是字母数字 → 是裸调用
        if re.search(r'(?<![.\w])' + api + r'\s*\(', code):
            bare.append(api)
    if bare:
        print(f'  裸调 Context 级API: {bare} <<< Plugin 不是 Activity，会编译失败')
        problems.append(f'{fn}: 裸调 {bare}')
    else:
        print('  裸调 Context 级 API: 无 OK')

    # 检查 package 与目录是否一致（Capacitor 要求）
    m = re.search(r'^\s*package\s+([\w.]+);', src, re.M)
    if m:
        # package 只对应**目录路径**，不含类名
        src_dir = os.path.dirname(p)
        parts = [x for x in src_dir.replace('\\', '/').split('/java/')[-1].split('/') if x]
        expect = '.'.join(parts)
        if m.group(1) != expect:
            print(f'  package 与目录不一致 <<< {m.group(1)} != {expect}')
            problems.append(f'{fn}: package 不一致')
        else:
            print(f'  package 正确 OK  ({m.group(1)})')

print('\n' + '=' * 66)
if problems:
    print(f'发现 {len(problems)} 处问题：')
    for x in problems:
        print('  - ' + x)
    sys.exit(1)
else:
    print('全部通过')
print('=' * 66)