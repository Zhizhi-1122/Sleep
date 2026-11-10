const store = require('./store.js')
const settings = require('./settings.js')

const KEY = 'reports'
const WEEK = 7 * 86400000
const MIN_NIGHTS = 4
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

function pad(n) { return n < 10 ? '0' + n : '' + n }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
function md(ts) { const d = new Date(ts); return (d.getMonth() + 1) + '.' + d.getDate() }

function weekStart(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime() - ((d.getDay() + 6) % 7) * 86400000
}

function getReports() { try { return wx.getStorageSync(KEY) || [] } catch (e) { return [] } }
function setReports(l) { try { wx.setStorageSync(KEY, l) } catch (e) {} }
function hasWeek(ws) {
  return getReports().some(function (r) { return r.weekStart === ws })
}

function markRead(id) {
  const l = getReports()
  l.forEach(function (r) { if (r.id === id) r.read = true })
  setReports(l)
}

function nights() { try { return store.nights() || [] } catch (e) { return [] } }

function clock(off) {
  const t = ((18 * 60 + Math.round(off)) % 1440 + 1440) % 1440
  return pad(Math.floor(t / 60)) + ':' + pad(t % 60)
}

function durText(min) {
  min = Math.round(min)
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h <= 0) return m + ' 分钟'
  if (m < 5) return h + ' 小时'
  return h + ' 小时 ' + m + ' 分钟'
}

function cn(n) {
  if (n < 10) return CN[n]
  if (n < 20) return '十' + (n % 10 ? CN[n % 10] : '')
  if (n < 100) return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '')
  return '' + n
}

// 种子按“天”取，每周 +7，7 % 3 = 1、7 % 2 = 1，天然轮转
function dayNo(ws) { return Math.floor(ws / 86400000) }

function statsOf(ws) {
  const list = nights().filter(function (r) { return r.sleepAt >= ws && r.sleepAt < ws + WEEK })
  if (!list.length) return null
  let bed = 0, wake = 0, dur = 0, early = 0, earlyW = 0
  let latest = list[0]
  list.forEach(function (r) {
    const b = store.bedOffset(r.sleepAt)
    bed += b
    wake += store.bedOffset(r.wakeAt)
    dur += r.durationMin
    try {
      if (settings.isEarlySleep(r.sleepAt)) early++
      if (settings.isEarlyWake(r.wakeAt)) earlyW++
    } catch (e) {}
    if (b > store.bedOffset(latest.sleepAt)) latest = r
  })
  const n = list.length
  const avgBed = bed / n
  let v = 0
  list.forEach(function (r) {
    const d = store.bedOffset(r.sleepAt) - avgBed
    v += d * d
  })
  return {
    n: n,
    avgBed: avgBed,
    avgWake: wake / n,
    avgDur: dur / n,
    early: early,
    earlyW: earlyW,
    sd: Math.sqrt(v / n),
    latest: latest
  }
}

const OPEN = [
  [
    '这周你几乎每天在同一片海面靠岸，很难得。',
    '一周下来，你的作息像一条安静铺开的线，没怎么断。',
    '这七晚里，你大多在差不多的时间熄了灯。'
  ],
  [
    '这周的节奏时紧时松，整体还算站得住。',
    '有几晚漂得远了些，但大多还是回到了岸边。',
    '不算整齐，但你一直在往回收。'
  ],
  [
    '这周的夜有点散，像被风吹乱的星。',
    '入睡时间来回荡得厉害，身体大概也在找平衡。',
    '这周的每一天都不太一样，连困意也没商量好。'
  ]
]

const ADVICE = [
  [
    '保持住。如果有一晚提前醒了，也别急着补觉，让身体自己记住这个时间。',
    '试试把睡前最后半小时留给同一件小事——洗澡、读两页、关灯。重复会让困意变成习惯。'
  ],
  [
    '挑一天做实验：把手机放到伸手够不到的地方，看看那晚能不能早十分钟。',
    '某天特别晚的话，第二天别晚起太多，差值控制在半小时内更容易拉回来。'
  ],
  [
    '先别追求早睡，只挑一个固定时间点当作"该躺下"的提醒，哪怕躺着不睡。',
    '把最晚的那一晚单独想一想：那天是什么让你停不下来？改掉一个条件就够了。'
  ]
]

function build(ws, avoidOpen) {
  const s = statsOf(ws)
  if (!s || s.n < MIN_NIGHTS) return null
  const prev = statsOf(ws - WEEK)
  const score = clamp(Math.round(100 - s.sd * 0.55), 25, 100)
  const lvl = score >= 82 ? 0 : score >= 62 ? 1 : 2
  const seed = dayNo(ws)

  const L = OPEN[lvl]
  let idx = Math.abs(seed) % L.length
  let open = L[idx]
  if (avoidOpen && open === avoidOpen) {
    idx = (idx + 1) % L.length
    open = L[idx]
  }

  const A = ADVICE[lvl]
  const advice = A[Math.abs(seed + 1) % A.length]

  const paras = [open]

  if (prev) {
    const d = Math.round(prev.avgBed - s.avgBed)
    const dd = Math.round(s.avgDur - prev.avgDur)
    const seg = []
    if (Math.abs(d) >= 5) {
      seg.push(d > 0 ? '早了 ' + durText(Math.abs(d)) + '熄灯' : '晚了 ' + durText(Math.abs(d)) + '熄灯')
    }
    if (Math.abs(dd) >= 5) {
      seg.push(dd > 0 ? '每天多睡了 ' + durText(Math.abs(dd)) : '每天少睡了 ' + durText(Math.abs(dd)))
    }
    paras.push(seg.length
      ? '和上一周比，你' + seg.join('，') + '。'
      : '和上一周相比几乎没变——这本身就是一种稳定。')
  }

  const lt = s.latest
  let line = '最晚的一夜是' + WD[new Date(lt.sleepAt).getDay()] +
    '，' + clock(store.bedOffset(lt.sleepAt)) + ' 才熄灯'
  if (lt.lateReason) line += '——那天你写的是"' + lt.lateReason + '"'
  paras.push(line + '。')

  const all = nights()
  const first = all.length
    ? weekStart(Math.min.apply(null, all.map(function (r) { return r.sleepAt })))
    : ws
  const no = Math.floor((ws - first) / WEEK) + 1

  return {
    id: 'r_' + ws,
    weekStart: ws,
    weekEnd: ws + WEEK - 86400000,
    title: '第 ' + cn(no > 0 ? no : 1) + ' 周',
    range: md(ws) + ' – ' + md(ws + 6 * 86400000),
    read: false,
    createdAt: Date.now(),
    rows: [
      { k: '记录', v: s.n + ' 晚' + (s.n === 7 ? ' · 一晚没落' : '') },
      { k: '平均入睡', v: clock(s.avgBed) },
      { k: '平均时长', v: durText(s.avgDur) },
      { k: '平均醒来', v: clock(s.avgWake) },
      { k: '入睡波动', v: '± ' + Math.round(s.sd) + ' 分钟' },
      { k: '节律分', v: score + ' / 100' },
      { k: '早睡 · 早起', v: s.early + ' 次 · ' + s.earlyW + ' 次' }
    ],
    paras: paras,
    advice: advice
  }
}

// 一次补齐所有历史周；只有最近一封未读
function ensure(nowTs) {
  const now = nowTs || Date.now()
  const thisWeek = weekStart(now)
  const all = nights()
  if (!all.length) return false

  let ws = weekStart(Math.min.apply(null, all.map(function (r) { return r.sleepAt })))
  const list = getReports()
  let lastOpen = ''
  let added = false
  const fresh = []

  const existing = list.slice().sort(function (a, b) { return a.weekStart - b.weekStart })
  if (existing.length) lastOpen = (existing[existing.length - 1].paras || [''])[0]

  while (ws < thisWeek) {
    const exists = list.some(function (r) { return r.weekStart === ws })
    if (!exists) {
      const r = build(ws, lastOpen)
      if (r) {
        r.read = true
        list.push(r)
        fresh.push(r.id)
        lastOpen = r.paras[0]
        added = true
      }
    }
    ws += WEEK
  }

  // 没有新增：什么都不写，保留用户已读状态
  if (!added) return false

  list.sort(function (a, b) { return b.weekStart - a.weekStart })
  // 只有本次新生成里最新的那封标未读
  if (fresh.length && list[0] && fresh.indexOf(list[0].id) >= 0) {
    list[0].read = false
  }
  setReports(list)
  return true
}

module.exports = {
  weekStart: weekStart,
  getReports: getReports,
  setReports: setReports,
  markRead: markRead,
  ensure: ensure,
  statsOf: statsOf,
  durText: durText,
  MIN_NIGHTS: MIN_NIGHTS
}