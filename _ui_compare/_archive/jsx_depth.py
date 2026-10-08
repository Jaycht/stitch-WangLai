# -*- coding: utf-8 -*-
"""列出 FieldGroup 的开闭行及其缩进，肉眼核对配对"""
import pathlib

path = pathlib.Path('src/pages/RecordsPage.tsx')
lines = path.read_text(encoding='utf-8').split('\n')
depth = 0
for i, ln in enumerate(lines, 1):
    if 'FieldGroup' not in ln:
        continue
    ind = len(ln) - len(ln.lstrip())
    if '</FieldGroup>' in ln:
        depth -= 1
        print(f'{i:>4} [{ind:>2}] depth {depth:<2} CLOSE  {ln.strip()[:52]}')
    elif '<FieldGroup' in ln:
        title = ''
        if 'title=' in ln:
            title = ln.split('title="', 1)[1].split('"', 1)[0] if '"' in ln else ''
        print(f'{i:>4} [{ind:>2}] depth {depth:<2} OPEN   {title or "(多行)"}')
        depth += 1
print(f'\n最终深度 {depth}')
