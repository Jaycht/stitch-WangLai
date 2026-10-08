# -*- coding: utf-8 -*-
"""Java 源码括号配平检查（正确处理字符串/字符/注释）"""
import pathlib, sys

def scan(path):
    s = path.read_text(encoding='utf-8')
    depth = 0; i = 0; n = len(s); line = 1; state = None
    while i < n:
        c = s[i]
        if c == '\n':
            line += 1
            if state == '//':
                state = None
            i += 1; continue
        if state is None:
            if s.startswith('//', i): state = '//'; i += 2; continue
            if s.startswith('/*', i): state = '/*'; i += 2; continue
            if c == '"': state = '"'; i += 1; continue
            if c == "'": state = "'"; i += 1; continue
            if c == '{': depth += 1
            elif c == '}':
                depth -= 1
                if depth < 0:
                    return depth, line
            i += 1; continue
        if state == '/*':
            if s.startswith('*/', i): state = None; i += 2; continue
            i += 1; continue
        #字符串或字符
        if c == '\\':
            i += 2; continue
        if (state == '"' and c == '"') or (state == "'" and c == "'"):
            state = None
        i += 1; continue
    return depth, line

base = pathlib.Path('android/app/src/main/java/com/lijiang/giftbook')
ok = True
for f in sorted(base.glob('*.java')):
    d, ln = scan(f)
    good = (d == 0)
    ok = ok and good
    print(f'{f.name}: 括号深度={d} {"OK" if good else f"不配平（最后处理到第 {ln} 行）"}')
sys.exit(0 if ok else 1)
