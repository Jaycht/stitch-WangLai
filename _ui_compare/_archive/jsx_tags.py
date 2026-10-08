# -*- coding: utf-8 -*-
"""找JSX 里重复/多余的标签（按行统计开闭配对）"""
import collections
import pathlib
import re
import sys

path = pathlib.Path('src/pages/RecordsPage.tsx')
lines = path.read_text(encoding='utf-8').split('\n')

# 只看 div/Section 这类容器标签
TAG = re.compile(r'<(/?)(div|section|SideEditor|FieldGroup|DupHint|EventPicker|SuggestBox)(?=[\s/>])((?:[^<>{}]|\{[^{}]*\})*?)(/?)>')

stack = []
for i, ln in enumerate(lines, 1):
    # 去掉行注释与块注释，避免注释里的标签干扰
    clean = re.sub(r'//.*$', '', ln)
    for m in TAG.finditer(clean):
        closing, name, attrs, self_close = m.group(1), m.group(2), m.group(3), m.group(4)
        if self_close:
            continue
        if closing:
            # 找栈里最近的同名
            if not stack:
                print(f'{i:>4} 多余的 </{name}>（栈空）')
                continue
            if stack[-1][0] != name:
                # 找栈里有没有这个 name
                hit = None
                for k in range(len(stack) - 1, -1, -1):
                    if stack[k][0] == name:
                        hit = k
                        break
                if hit is None:
                    print(f'{i:>4} </{name}> 没有对应的开标签'
                          f'（栈顶是 <{stack[-1][0]}> 于第 {stack[-1][1]} 行）')
                    continue
                else:
                    print(f'{i:>4} ⚠️ </{name}> 与栈顶 <{stack[-1][0]}> 不匹配'
                          f'（{stack[-1][0]} 开于第 {stack[-1][1]} 行，被跳过）')
                    while len(stack) > hit + 1:
                        n, ln2 = stack.pop()
                        print(f'      自动闭合遗漏的 <{n}>（开于第 {ln2} 行）')
                    stack.pop()
            else:
                stack.pop()
        else:
            stack.append((name, i))

print(f'\n结束时栈中还有 {len(stack)} 个未闭合：')
for n, ln2 in stack[:10]:
    print(f'  <{n}> 开于第 {ln2} 行')
