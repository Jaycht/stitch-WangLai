#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.13.1 提醒逻辑回归 —— 不依赖 Android，直接验证时间计算与分支判断。

重点验证三件事：
1. scheduleTodo 的触发时刻：有 dueTime 用时刻减提前量，没有则退回提前 1 天
2. 「时间已过」能被正确识别（这是本次修的静默失败 bug）
3. needExactWarn 只在「准点 + 有通知权限 + 无精确闹钟权限」时成立
"""
import re
import sys
from datetime import datetime, timedelta

# ---------- 被测逻辑：从 notify.ts 原样翻译 ----------
LEAD_MIN = {0: 0, 15: 15, 30: 30, 60: 60, 180: 180, 1440: 1440}


def fire_todo(due, due_time, lead_min, default_lead=60, now=None):
    """返回 (是否排上, 原因, 触发时刻)"""
    if not due:
        return False, 'no-time', None
    y, mo, d = map(int, due.split('-'))
    if due_time:
        hh, mi = map(int, due_time.split(':'))
        base = datetime(y, mo, d, hh, mi, 0)
        lead = lead_min if lead_min is not None else default_lead
    else:
        # 无时刻：退回「当天 9:00 往前 1 天」
        base = datetime(y, mo, d, 9, 0)
        lead = 1440
    when = base - timedelta(minutes=lead)
    ref = now or datetime.now()
    if when <= ref:
        return False, 'past', when
    return True, None, when


def need_exact_warn(lead_min, can_post, can_exact):
    return lead_min == 0 and can_post and not can_exact


PASS, FAIL = [], []


def check(name, cond, detail=''):
    (PASS if cond else FAIL).append(name)
    print(('  PASS  ' if cond else '  FAIL  ') + name + (('  -> ' + detail) if detail else ''))


def main():
    print('=' * 62)
    print('v2.13.1 提醒逻辑回归')
    print('=' * 62)

    now = datetime(2026, 10, 8, 12, 0)

    print('\n[1] 待办触发时刻计算')
    ok, why, w = fire_todo('2026-10-09', '08:00', 0, now=now)
    check('填时刻+准点 -> 触发=当天08:00', ok and w == datetime(2026, 10, 9, 8, 0), str(w))

    ok, why, w = fire_todo('2026-10-09', '08:00', 60, now=now)
    check('填时刻+提前1小时 -> 触发=07:00', ok and w == datetime(2026, 10, 9, 7, 0), str(w))

    ok, why, w = fire_todo('2026-10-12', '08:00', 1440, now=now)
    check('填时刻+提前1天 -> 触发=前一天08:00',
          ok and w == datetime(2026, 10, 11, 8, 0), str(w))

    # 无时刻时退回「提前 1 天」，用远离当前时间的日期来避免基准冲突
    ok, why, w = fire_todo('2026-12-25', '', None, now=now)
    check('无时刻 -> 沿用提前1天(当天09:00往前1天)',
          ok and w == datetime(2026, 12, 24, 9, 0), str(w))

    # 老行为回归：截止日就是今天、没填时刻 -> 触发点是昨天09:00，必须被拒
    ok, why, w = fire_todo('2026-10-08', '', None, now=now)
    check('截止=今天且无时刻 -> 触发点已过，应拒绝并标记 past',
          (not ok) and why == 'past', f'ok={ok} why={why}')
    print('\n[2] 「时间已过」必须被识别（本次修的静默失败 bug）')
    ok, why, w = fire_todo('2026-10-08', '08:00', 0, now=now)
    check('今天08:00已过12:00 -> 拒绝并标记 past',
          (not ok) and why == 'past', f'ok={ok} why={why}')

    ok, why, w = fire_todo('2026-10-09', '08:00', 2880, now=now)
    check('明天08:00但提前2天 -> 拒绝并标记 past',
          (not ok) and why == 'past', f'ok={ok} why={why}')

    ok, why, w = fire_todo('2026-10-09', '08:00', 60, now=now)
    check('明天08:00提前1小时 -> 仍应排上', ok, f'ok={ok} why={why}')

    print('\n[3] 准点提醒的权限告警（方案B）')
    check('准点+有通知+无精确闹钟 -> 必须告警',
          need_exact_warn(0, True, False) is True)
    check('准点+两项都有 -> 不告警',
          need_exact_warn(0, True, True) is False)
    check('非准点+无精确闹钟 -> 不告警（延迟无所谓）',
          need_exact_warn(60, True, False) is False)
    check('准点+无通知权限 -> 不重复告警（通知根本没到，无所谓准不准）',
          need_exact_warn(0, False, False) is False)

    print('\n[4] notify.ts 与TodosPage.tsx 关键逻辑存在性')
    base = 'src/'
    with open(base + 'lib/notify.ts', encoding='utf-8') as f:
        nt = f.read()
    with open(base + 'pages/TodosPage.tsx', encoding='utf-8') as f:
        tp = f.read()

    checks = [
        ('notify.ts 已删除 dueReminders（应用内提醒）',
         'dueReminders' not in nt),
        ('notify.ts 排期失败带原因（不再静默）',
         "reason?: 'no-time' | 'past' | 'no-permission' | 'error'" in nt),
        ('notify.ts 有 scheduleTodo（待办也能通知）',
         'export async function scheduleTodo' in nt),
        ('notify.ts 读取 exact_alarm 权限',
         'exact_alarm' in nt),
        ('notify.ts 有 needExactWarn（准点告警）',
         'export function needExactWarn' in nt),
        ('notify.ts 捕获 schedule 返回的 warning',
         'warning' in nt),
        ('TodosPage 引入 scheduleTodo',
         'scheduleTodo' in tp),
        ('TodosPage 有提醒时刻输入框',
         'type="time"' in tp),
        ('TodosPage 保存 dueTime',
         'dueTime' in tp),
        ('TodosPage 首次设提醒时申请权限',
         'ensurePermission' in tp),
    ]
    for name, cond in checks:
        check(name, cond)

    print('\n' + '=' * 62)
    print(f'通过 {len(PASS)} / {len(PASS) + len(FAIL)}')
    if FAIL:
        print('失败项：')
        for f in FAIL:
            print('  - ' + f)
    print('=' * 62)
    return 1 if FAIL else 0


if __name__ == '__main__':
    sys.exit(main())
