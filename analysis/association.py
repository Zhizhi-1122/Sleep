#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
枕星月眠 · 关联分析（Apriori 单项规则）
仅使用 Python 标准库。

用法：
    python3 association.py sleep_data.json

输入（从微信开发者工具 Console 导出）：
    {"nights": [...], "notes": [...]}

输出：
    清洗日志 / 单项支持度 / 关联规则表 / rules.md
"""

import json
import sys
import datetime
from itertools import combinations
from collections import defaultdict

# ---------- 参数 ----------
MIN_DUR       = 20      # 少于 20 分钟 → 误触
MAX_DUR       = 16 * 60 # 超过 16 小时 → 忘记点醒
MIN_SUP       = 0.09    # 最小支持度
MIN_CONF      = 0.50    # 最小置信度
NIGHT_SHIFT_H = 4       # 凌晨 4 点前归入前一夜
TZ_OFFSET_H   = 8       # 固定北京时间，保证不同机器结果一致

WEEKDAY = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
MOOD = {'calm': '安宁', 'warm': '温柔', 'tired': '疲惫', 'low': '低落', 'bright': '明亮'}


def beijing(ts_ms):
    """毫秒时间戳 → 北京时间（naive datetime）"""
    return (datetime.datetime(1970, 1, 1)
            + datetime.timedelta(milliseconds=ts_ms)
            + datetime.timedelta(hours=TZ_OFFSET_H))


def night_key(dt):
    """以凌晨 4 点为界，4 点前的入睡归入前一夜"""
    return (dt - datetime.timedelta(hours=NIGHT_SHIFT_H)).date()


def bed_offset_h(dt):
    """入睡偏移：以 18:00 为原点，跨零点连续累加，返回小时数"""
    mins = dt.hour * 60 + dt.minute - 18 * 60
    if mins < 0:
        mins += 1440
    return mins / 60.0


def duration_band(minutes):
    if minutes < 7 * 60:
        return '时长=短'
    if minutes <= 10 * 60:
        return '时长=中'
    return '时长=长'


def bed_band(offset_h):
    if offset_h < 4.0:      # 18:00 – 22:00
        return '入睡=早'
    if offset_h < 6.0:      # 22:00 – 00:00
        return '入睡=正常'
    return '入睡=晚'         # 00:00 之后


def load(path):
    raw = open(path, encoding='utf-8').read().strip()
    if raw.startswith('"') and raw.endswith('"'):
        raw = json.loads(raw)          # Console 复制出来的带引号字符串
    return json.loads(raw)


def clean(records):
    log = ['原始记录：%d 条' % len(records)]

    stage = []
    for r in records:
        d = int(r.get('durationMin') or 0)
        if d < MIN_DUR:
            log.append('  剔除误触（%d 分钟）: %s' % (d, r.get('id')))
            continue
        if d > MAX_DUR:
            log.append('  剔除超时（%d 分钟，疑似忘点醒）: %s' % (d, r.get('id')))
            continue
        stage.append(r)
    log.append('剔除异常后：%d 条' % len(stage))

    by_night = {}
    for r in stage:
        dt = beijing(int(r['sleepAt']))
        k = night_key(dt)
        cur = by_night.get(k)
        if cur is None:
            by_night[k] = r
        elif int(r['durationMin']) > int(cur['durationMin']):
            log.append('  同一夜 %s：保留 %d 分钟，丢弃 %d 分钟'
                       % (k, int(r['durationMin']), int(cur['durationMin'])))
            by_night[k] = r
        else:
            log.append('  同一夜 %s：保留 %d 分钟，丢弃 %d 分钟'
                       % (k, int(cur['durationMin']), int(r['durationMin'])))

    nights = [by_night[k] for k in sorted(by_night)]
    log.append('按夜聚合后：%d 晚' % len(nights))
    return nights, log


def build_transactions(nights, notes):
    mood_by_date = {}
    for n in notes:
        dk = n.get('dateKey')
        mk = n.get('mood')
        if dk and mk:
            mood_by_date[dk] = mk

    trans, detail = [], []
    for r in nights:
        dt = beijing(int(r['sleepAt']))
        k = night_key(dt)
        off = bed_offset_h(dt)

        items = set()
        items.add('星期=' + WEEKDAY[dt.weekday()])
        items.add(bed_band(off))
        items.add(duration_band(int(r['durationMin'])))
        if r.get('lateReason'):
            items.add('原因=' + str(r['lateReason']))
        mk = mood_by_date.get(k.isoformat())
        if mk in MOOD:
            items.add('心情=' + MOOD[mk])

        trans.append(items)
        detail.append({
            'date': k.isoformat(),
            'weekday': WEEKDAY[dt.weekday()],
            'bed': round(off, 2),
            'min': int(r['durationMin']),
            'items': sorted(items),
        })
    return trans, detail


def mine(trans):
    n = len(trans)
    cnt = defaultdict(int)
    for t in trans:
        for i in t:
            cnt[i] += 1

    sup1 = {i: c / n for i, c in cnt.items() if c / n >= MIN_SUP}
    sup2 = {}
    for a, b in combinations(sorted(sup1), 2):
        s = sum(1 for t in trans if {a, b} <= t) / n
        if s >= MIN_SUP:
            sup2[(a, b)] = s

    rules = []
    for (a, b), s in sup2.items():
        c = s / sup1[a]
        if c >= MIN_CONF:
            rules.append({'ante': a, 'cons': b, 'sup': s,
                          'conf': c, 'lift': c / sup1[b]})
        c = s / sup1[b]
        if c >= MIN_CONF:
            rules.append({'ante': b, 'cons': a, 'sup': s,
                          'conf': c, 'lift': c / sup1[a]})

    rules.sort(key=lambda r: (-r['lift'], -r['sup']))
    return sup1, rules


def pct(v):
    return '%.1f%%' % (v * 100)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'sleep_data.json'
    data = load(path)
    nights, log = clean(data.get('nights', []))
    for line in log:
        print(line)
    print()

    trans, detail = build_transactions(nights, data.get('notes', []))
    n = len(trans)
    print('事务数：%d\n' % n)
    for d in detail:
        print('  %s %-3s %-2.2fh %3dmin  %s'
              % (d['date'], d['weekday'], d['bed'], d['min'], ' | '.join(d['items'])))
    print()

    sup1, rules = mine(trans)

    print('=== 单项支持度（≥ %.0f%%）===' % (MIN_SUP * 100))
    for i, s in sorted(sup1.items(), key=lambda x: -x[1]):
        print('  %-14s %6s   (%d/%d)' % (i, pct(s), round(s * n), n))
    print()

    print('=== 关联规则（支持度 ≥ %.0f%%，置信度 ≥ %.0f%%）==='
          % (MIN_SUP * 100, MIN_CONF * 100))
    if not rules:
        print('  未发现达阈值规则，可下调 MIN_SUP / MIN_CONF')
    for r in rules:
        print('  {%s} → {%s}   支持 %s   置信 %s   提升 %.2f'
              % (r['ante'], r['cons'], pct(r['sup']), pct(r['conf']), r['lift']))
    print()

    md = ['# 关联分析结果\n',
          '- 有效样本：%d 晚' % n,
          '- 最小支持度：%.1f%%' % (MIN_SUP * 100),
          '- 最小置信度：%.1f%%' % (MIN_CONF * 100),
          '', '## 规则表\n',
          '| 规则 | 支持度 | 置信度 | 提升度 |',
          '|---|---|---|---|']
    for r in rules:
        md.append('| {%s} → {%s} | %s | %s | %.2f |'
                  % (r['ante'], r['cons'], pct(r['sup']), pct(r['conf']), r['lift']))
    open('rules.md', 'w', encoding='utf-8').write('\n'.join(md))
    print('已写出 rules.md')


if __name__ == '__main__':
    main()