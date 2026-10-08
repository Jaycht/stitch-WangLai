# -*- coding: utf-8 -*-
"""种子数据：单独成文件，避免脚本内 JSON 转义踩坑"""
import copy

DB = {
 "schemaVersion": 3,
 "persons": [
  {"id":"p1","name":"张三","alias":"建国·南麻","relation":"表弟","group":"clan","phone":"13805331234","wechat":"wjg888","region":"沂源南麻","note":"弟媳的哥哥","createdAt":"2026-01-02T08:00:00Z","updatedAt":"2026-01-02T08:00:00Z"},
  {"id":"p2","name":"张三","relation":"堂哥","group":"clan","phone":"","wechat":"wjggb","region":"县城","note":"","createdAt":"2026-01-03T08:00:00Z","updatedAt":"2026-01-03T08:00:00Z"},
  {"id":"p3","name":"李四","relation":"同事","group":"friend","phone":"","wechat":"ls","region":"淄博","note":"","createdAt":"2026-01-04T08:00:00Z","updatedAt":"2026-01-04T08:00:00Z"},
  {"id":"p4","name":"王五","relation":"同学","group":"friend","phone":"","wechat":"","region":"","note":"","createdAt":"2026-01-05T08:00:00Z","updatedAt":"2026-01-05T08:00:00Z"}],
 "records": [
  {"id":"r1","personId":"p1","received":{"channel":"wechat","amount":2000,"date":"2026-10-02","event":"wedding","place":"女方家·沂源县城","gift":"两瓶酒"},"returned":{"channel":"cash","amount":1000,"date":"2026-10-05","event":"full_month"},"remark":"孩子满月酒","remindAt":"2026-10-08T18:00","createdAt":"2026-10-02T08:00:00Z","updatedAt":"2026-10-05T08:00:00Z"},
  {"id":"r2","personId":"p2","received":{"channel":"cash","amount":1500,"date":"2026-10-01","event":"moving"},"remark":"","createdAt":"2026-10-01T08:00:00Z","updatedAt":"2026-10-01T08:00:00Z"},
  {"id":"r3","personId":"p3","received":{"channel":"alipay","amount":600,"date":"2026-09-28","event":"custom_xh"},"remark":"","createdAt":"2026-09-28T08:00:00Z","updatedAt":"2026-09-28T08:00:00Z"},
  {"id":"r4","personId":"p4","received":{"channel":"cash","amount":1200,"date":"2026-09-20","event":"funeral"},"remark":"白事","createdAt":"2026-09-20T08:00:00Z","updatedAt":"2026-09-20T08:00:00Z"}],
 "todos": [{"id":"t1","title":"买礼金封","note":"红白喜事分开","due":"2026-10-05","done":False,"createdAt":"2026-10-01T08:00:00Z","updatedAt":"2026-10-01T08:00:00Z"}],
 "customEvents": [{"key":"custom_xh","label":"升学宴","tone":"fest","createdAt":"2026-01-01T00:00:00Z"}],
 "settings": {"accent":"#2F6B4F","bg":"#F4F2EE","appLock":False,"currency":"¥","weekStart":1,
              "remindLeadMin":60,"theme":"a","themePicked":True,
              "fontSize":"off","careMode":False,"useCalendar":False},
 "updatedAt": "2026-10-06T08:00:00Z",
}

def with_settings(**over):
    d = copy.deepcopy(DB)
    d['settings'].update(over)
    return d
