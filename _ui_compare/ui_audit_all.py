#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全项目审查：找出与「删除按钮」同类的 UI 缺陷
（涛哥 2026-10-08 要求：改完要审查全项目还有没有类似问题）

三类要查的：
  A. 独立 CSS 类缺版式（只有颜色、没有 display/height/font-size）
     —— 就是 .btn-danger 当初的病根
  B. 底栏/工具条里写死 px 宽度的按钮
     —— 关怀模式大字下必然装不下字
  C. 高度写死 px 的可点元素（应改用 --h-* 变量随字号缩放）
"""
import io
import os
import re
import sys

ROOT = 'src'
problems = []


def read(p):
    return io.open(p, encoding='utf-8').read()


# ---------- A. 检查自定义类是否缺版式 ----------
def split_rules(css):
    """把 CSS 拆成 [(选择器, 声明dict)]，只取单类选择器"""
    out = []
    for m in re.finditer(r'(?m)^([^{}\n]+?)\s*\{([^}]*)\}', css):
        sel, body = m.group(1).strip(), m.group(2)
        decls = {}
        for d in body.split(';'):
            if ':' in d:
                k, v = d.split(':', 1)
                decls[k.strip()] = v.strip()
        out.append((sel, decls))
    return out


print('=' * 68)
print('全项目 UI 缺陷审查')
print('=' * 68)

css_path = os.path.join(ROOT, 'index.css')
css = read(css_path)
rules = split_rules(css)

# 「看起来像按钮」的类
BTN_LIKE = re.compile(r'\.(btn|pill|tgl|chip)(?!-)', re.I)
# 版式必需属性
LAYOUT = ['display', 'align-items', 'height', 'font-size']

print('\n[A] 自定义按钮类是否缺版式（缺了就会退化成浏览器默认样式）')
print('-' * 68)
for sel, decls in rules:
    if not BTN_LIKE.search(sel):
        continue
    if ':' in sel or ' ' in sel or ',' in sel:
        continue          # 组合/伪类选择器不算独立类
    if sel.startswith('.'):
        name = sel[1:].split(':')[0]
        # 变体类（ghost/danger/sm/xs 等）继承基类，单独出现才可疑
        VARIANTS = ('ghost', 'danger', 'sm', 'xs', 'lg', 'pill', 'active', 'disabled')
        if name.lower() in VARIANTS:
            continue
        missing = [p for p in LAYOUT if p not in decls]
        if missing:
            problems.append(f'A: .{name} 缺版式属性 {missing}')
            print(f'  !! .{name} 缺 {missing}')
        else:
            print(f'  OK  .{name} 版式完整')

# ---------- B. 底栏/工具条里的写死宽度 ----------
print('\n[B] 底栏/工具条按钮是否写死 px 宽度（大字模式会装不下字）')
print('-' * 68)
files = []
for base, _, names in os.walk(ROOT):
    for n in names:
        if n.endswith(('.tsx', '.ts')):
            files.append(os.path.join(base, n))

# 只查 footer 附近与工具条里的按钮
FIXED_W = re.compile(r'(btn|pill)[a-z-]*[^"]*\bw-\[(\d+)px\]')
for f in files:
    txt = read(f)
    for i, line in enumerate(txt.split('\n'), 1):
        for m in FIXED_W.finditer(line):
            wpx = int(m.group(2))
            problems.append(f'B: {f}:{i} 按钮写死 {wpx}px 宽 → {line.strip()[:60]}')
            print(f'  !! {f}:{i}  {wpx}px  {line.strip()[:56]}')

# ---------- C. 写死 px 高度的可点元素 ----------
print('\n[C] 是否有可点元素写死 px 高度（应改用 --h-* 随字号缩放）')
print('-' * 68)
for f in files:
    txt = read(f)
    for i, line in enumerate(txt.split('\n'), 1):
        # h-[NNpx] 出现在 button / 可点元素上
        if '<button' in line and re.search(r'h-\[(\d+)px\]', line):
            problems.append(f'C: {f}:{i} 可点元素写死高度 → {line.strip()[:60]}')
            print(f'  !! {f}:{i}  {line.strip()[:56]}')

# ---------- D. aria-label 完整性（可访问性） ----------
print('\n[D] 纯图标按钮是否有 aria-label（无障碍）')
print('-' * 68)


def has_visible_text(block):
    """判断按钮里是否有可见文字。

    ⚠️ 第一版用 `>[^<{]*[一-龥A-Za-z][^<{]*<` 判断，**误报了 4 处**：
    那些按钮是 `{o.title}` / `{s}` 这种**表达式文本**，
    正则匹配不到，于是被当成「纯图标按钮」。
    现在改成：只要 JSX 里有 {...} 表达式 children 就认为有文字。
    """
    # 表达式文本 {...} 或 {`...`}
    if re.search(r'\{[^{}]+\}', block):
        # 但要排除只有图标组件的情况，如 {idx === 0 && <X/>}
        for m in re.finditer(r'\{([^{}]+)\}', block):
            inner = m.group(1)
            # 纯表达式且内含 JSX 标签 → 不是文字
            if re.search(r'<[A-Z]', inner):
                continue
            return True
    # 字面文本
    return bool(re.search(r'>\s*[^<{\s][^<{}]*\s*<', block))


for f in files:
    txt = read(f)
    lines = txt.split('\n')
    for i, line in enumerate(lines, 1):
        if '<button' not in line:
            continue
        blk = []
        j = i - 1
        while j < len(lines) and j < i + 12:
            blk.append(lines[j])
            if '</button>' in lines[j]:
                break
            j += 1
        block = '\n'.join(blk)
        has_icon = re.search(r'<(Trash2|Plus|Check|X|Edit|Pencil|Calendar|Bell)\b', block)
        if has_icon and not has_visible_text(block) and 'aria-label' not in block:
            problems.append(f'D: {f}:{i} 图标按钮缺 aria-label')
            print(f'  !! {f}:{i} 纯图标按钮但无 aria-label')
            print(f'     {line.strip()[:56]}')

# ---------- 汇总 ----------
print('\n' + '=' * 68)
if problems:
    print(f'发现 {len(problems)} 处需处理：')
    for p in problems:
        print('  - ' + p)
else:
    print('未发现同类问题')
print('=' * 68)
sys.exit(1 if problems else 0)
