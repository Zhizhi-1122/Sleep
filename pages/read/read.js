const app = getApp()
const portrait = require('../../utils/portrait.js')
const notesApi = require('../../utils/notes.js')
const reportApi = require('../../utils/report.js')
const store = require('../../utils/store.js')
const theme = require('../../utils/theme.js')
const tapfx = require('../../utils/tapfx.js')

const MIN_W = 900
const SP = 132
const RIGHT_PAD = 128
const BASE_Y = 118
const AMP = 20
const TRACK_H = 320
const SEG_STEP = 14
const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/* 看全部 · 连续蛇形参数 */
const A_TOP = 84
const A_GAP = 268
const A_BULGE = 88
const A_PADX = 96
const A_SAG = 9

function r1(n) { return Math.round(n * 10) / 10 }
function pad2(n) { return n < 10 ? '0' + n : '' + n }

function safe(fn, d) {
  try {
    const v = fn()
    return (v === undefined || v === null) ? d : v
  } catch (e) {
    return d
  }
}

function prettyDate(k) {
  const p = String(k).split('-')
  const d = new Date(+p[0], +p[1] - 1, +p[2])
  return (+p[1]) + ' 月 ' + (+p[2]) + ' 日 · ' + WEEK_CN[d.getDay()]
}

function moonPhase(ts) {
  const SYN = 29.530588853
  const KNOWN = Date.UTC(2000, 0, 6, 18, 14)
  let p = ((ts - KNOWN) / 86400000 % SYN) / SYN
  if (p < 0) p += 1
  return p
}

function rng(seed) {
  let s = seed || 7
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function hexRgb(h) {
  const s = String(h || '').replace('#', '')
  if (s.length !== 6) return [240, 201, 135]
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}

/* 星星：夜里发光，白天压深，保证浅底上看得清 */
function starColors(moodColor, isDay) {
  const base = moodColor || '#f0c987'
  if (!isDay) {
    const c = hexRgb(base)
    const a = c[0] + ',' + c[1] + ',' + c[2]
    return {
      color: base,
      glow: '0 0 20rpx rgba(' + a + ',0.60), 0 0 6rpx rgba(' + a + ',0.50)'
    }
  }
  const c = hexRgb(base)
  const d = [Math.round(c[0] * 0.66), Math.round(c[1] * 0.66), Math.round(c[2] * 0.66)]
  return {
    color: 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')',
    glow: '0 0 12rpx rgba(' + d[0] + ',' + d[1] + ',' + d[2] + ',0.42)'
  }
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  }
}

function sampleCurve(P, step) {
  const out = []
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)]
    const p1 = P[i]
    const p2 = P[i + 1]
    const p3 = P[Math.min(P.length - 1, i + 2)]
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const len = Math.sqrt(dx * dx + dy * dy)
    const cnt = Math.max(2, Math.round(len / step))
    for (let k = 0; k < cnt; k++) out.push(catmull(p0, p1, p2, p3, k / cnt))
  }
  out.push(P[P.length - 1])
  return out
}

function segsFrom(pts) {
  const segs = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 0.2) continue
    segs.push({
      x: r1(a.x),
      y: r1(a.y),
      w: r1(len + 1.4),
      rot: r1(Math.atan2(dy, dx) * 180 / Math.PI)
    })
  }
  return segs
}

function withFade(segs, fadeIn, fadeOut) {
  const n = segs.length
  if (!n) return segs
  let total = 0
  for (let i = 0; i < n; i++) total += segs[i].w
  let acc = 0
  for (let i = 0; i < n; i++) {
    const start = acc
    const end = acc + segs[i].w
    let op = 1
    if (fadeIn > 0 && start < fadeIn) op = Math.min(op, 0.05 + 0.95 * (start / fadeIn))
    if (fadeOut > 0 && end > total - fadeOut) op = Math.min(op, 0.05 + 0.95 * ((total - end) / fadeOut))
    segs[i].op = Math.round(Math.max(0.04, op) * 100) / 100
    acc = end
  }
  return segs
}

function buildLeaves(dense, seed, maxCount) {
  const n = dense.length
  const out = []
  if (n < 10) return out
  const rand = rng(seed)
  const count = Math.max(5, Math.min(maxCount || 12, Math.round(n / 26)))
  for (let i = 0; i < count; i++) {
    const u = (i + 0.55) / count
    const idx = Math.min(n - 2, Math.floor(u * n))
    const a = dense[idx]
    const b = dense[idx + 1]
    const ang = Math.atan2(b.y - a.y, b.x - a.x)
    const roll = rand()
    const side = roll < 0.44 ? 1 : (roll < 0.88 ? -1 : (i % 2 ? 1 : -1))
    const jitter = (rand() - 0.5) * 0.5
    const dir = ang + side * (Math.PI / 2 + 0.28 + jitter)
    const len = 16 + rand() * 14
    out.push({
      x: r1(a.x + Math.cos(dir) * len * 0.5),
      y: r1(a.y + Math.sin(dir) * len * 0.5),
      w: r1(len),
      h: r1(len * 0.48),
      rot: r1(dir * 180 / Math.PI),
      op: (0.34 + rand() * 0.22).toFixed(2),
      delay: (-(rand() * 5)).toFixed(2)
    })
  }
  return out
}

function armStyle(x, y, rot) {
  return 'left:' + r1(x) + 'rpx;top:' + r1(y) + 'rpx;transform:rotate(' + r1(rot) + 'deg)'
}

function swayStyle(delay, dur) {
  return 'animation-delay:' + delay.toFixed(2) + 's;animation-duration:' + dur.toFixed(2) + 's'
}

function pushArm(arms, dates, a, g, i, isDay) {
  const lean = (i % 3 === 0 ? -1 : 1) * (3 + (i % 3) * 3)
  const h1 = 54 + (i % 3) * 9
  const h2 = 30
  const bend = (i % 2 ? 1 : -1) * 11

  const ang1 = lean * Math.PI / 180
  const ang2 = (lean + bend) * Math.PI / 180
  const sx = a.x - Math.sin(ang1) * h1 - Math.sin(ang2) * h2
  const sy = a.y + Math.cos(ang1) * h1 + Math.cos(ang2) * h2

  const sc = starColors(g.moodColor, isDay)

  arms.push({
    dateKey: g.dateKey,
    style: armStyle(a.x, a.y, lean),
    h1: h1,
    h2: h2,
    bend: bend,
    color: sc.color,
    glow: sc.glow,
    size: g.level === 3 ? 34 : g.level === 2 ? 28 : 23,
    swayStyle: swayStyle(-((i * 0.71) % 2.9), 4.9 + (i % 3) * 0.55)
  })

  dates.push({
    dateKey: g.dateKey,
    short: g.short,
    x: r1(sx),
    y: r1(sy + 28)
  })
}

/* ---------- 看全部：一根连续光滑的蛇形藤蔓 ---------- */
function buildAllVine(groups, W, isDay) {
  const n = groups.length
  if (!n) return { segs: [], arms: [], dates: [], leaves: [], twigs: [], h: 440 }

  const runL = A_PADX
  const runR = W - A_PADX
  const runLen = runR - runL
  const rows = Math.ceil(n / 3)
  const R = A_GAP / 2

  const path = []
  const anchors = []
  const twigs = []

  function push(x, y) { path.push({ x: x, y: y }) }

  /* 入口：从左上屏幕外圆滑落进来 */
  const e0x = -72, e0y = A_TOP - 74
  const c1x = -20, c1y = A_TOP - 14
  const c2x = runL - 70, c2y = A_TOP
  for (let s = 0; s <= 16; s++) {
    const t = s / 16
    const mt = 1 - t
    push(
      mt * mt * mt * e0x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * runL,
      mt * mt * mt * e0y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * A_TOP
    )
  }

  let gi = 0
  for (let k = 0; k < rows; k++) {
    const right = k % 2 === 0
    const y0 = A_TOP + k * A_GAP
    const cnt = Math.min(3, n - gi)

    const steps = Math.max(10, Math.round(runLen / 12))
    for (let s = 1; s <= steps; s++) {
      const u = s / steps
      const x = right ? runL + runLen * u : runR - runLen * u
      const sag = A_SAG * Math.sin(Math.PI * u) * Math.sin(Math.PI * u)
      push(x, y0 + sag)
    }

    for (let i = 0; i < cnt && gi < n; i++, gi++) {
      const u = (i + 0.5) / cnt
      const x = right ? runL + runLen * u : runR - runLen * u
      const sag = A_SAG * Math.sin(Math.PI * u) * Math.sin(Math.PI * u)
      anchors.push({ x: x, y: y0 + sag, g: groups[gi] })
    }

    const tu = [0.08, 0.34, 0.66, 0.92]
    for (let t = 0; t < tu.length; t++) {
      const u = tu[t]
      const x = right ? runL + runLen * u : runR - runLen * u
      const sag = A_SAG * Math.sin(Math.PI * u) * Math.sin(Math.PI * u)
      twigs.push({
        x: r1(x),
        y: r1(y0 + sag),
        len: r1(22 + ((t + k) % 3) * 9),
        rot: (t % 2 ? 1 : -1) * (9 + ((t + k) % 3) * 4)
      })
    }

    if (k < rows - 1) {
      const cxTurn = right ? runR : runL
      const sgn = right ? 1 : -1
      for (let s = 1; s <= 26; s++) {
        const a = -Math.PI / 2 + Math.PI * (s / 26)
        push(cxTurn + sgn * A_BULGE * Math.cos(a), y0 + R + R * Math.sin(a))
      }
    }
  }

  /* 尾部：四分之一椭圆转为竖直，再圆滑下垂 */
  const lastRight = (rows - 1) % 2 === 0
  const lastX = lastRight ? runR : runL
  const lastY = A_TOP + (rows - 1) * A_GAP
  const sgn = lastRight ? 1 : -1

  for (let s = 1; s <= 18; s++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (s / 18)
    push(lastX + sgn * A_BULGE * Math.cos(a), lastY + R + R * Math.sin(a))
  }

  const tailX = lastX + sgn * A_BULGE
  const tailY = lastY + R
  const tc1x = tailX, tc1y = tailY + 54
  const tc2x = tailX - sgn * 30, tc2y = tailY + 112
  const teX = tailX - sgn * 44, teY = tailY + 150
  for (let s = 1; s <= 16; s++) {
    const t = s / 16
    const mt = 1 - t
    push(
      mt * mt * mt * tailX + 3 * mt * mt * t * tc1x + 3 * mt * t * t * tc2x + t * t * t * teX,
      mt * mt * mt * tailY + 3 * mt * mt * t * tc1y + 3 * mt * t * t * tc2y + t * t * t * teY
    )
  }

  const segs = withFade(segsFrom(path), 120, 160)
  const leaves = buildLeaves(path, 131 + n, 16)

  const arms = []
  const dates = []
  for (let i = 0; i < anchors.length; i++) {
    pushArm(arms, dates, anchors[i], anchors[i].g, i, isDay)
  }

  return {
    segs: segs,
    arms: arms,
    dates: dates,
    leaves: leaves,
    twigs: twigs,
    h: tailY + 200
  }
}

Page({
  data: {
    navTop: 20,
    isDay: false,
    nightCount: 0,

    p: { ready: false },
    types: portrait.TYPES,
    avatarKey: -1,
    hint: '',

    nodes: [],
    segs: [],
    leaves: [],
    vineW: MIN_W,
    trackH: TRACK_H,
    scrollLeft: 0,
    noteDays: 0,

    reports: [],
    reportTotal: 0,

    pShow: false,

    composeShow: false,
    draft: '',
    mood: '',
    dateKey: '',
    dateText: '',
    editId: '',
    moods: notesApi.MOODS,
    todayStr: '',

    dayShow: false,
    dayKey: '',
    dayTitle: '',
    dayItems: [],

    allShow: false,
    tlSegs: [],
    tlArms: [],
    tlDates: [],
    tlLeaves: [],
    tlTwigs: [],
    tlH: 440,

    lettersShow: false,
    letterShow: false,
    letterStage: 0,
    letter: null,
    moonStyle: '',
    tapFx: [],
    noteHint: false,
    guideShow: false,
    guide: [
      {
        page: '望月',
        rows: [
          '长按月亮或太阳 —— 切换晴天 / 雨天',
          '点一下空白处 —— 看一圈光',
          '我睡了 / 我醒了 —— 记录这一晚'
        ]
      },
      {
        page: '星图',
        rows: [
          '长按格子 —— 补录或修改那一晚',
          '「作息标准」—— 决定星星颜色和早睡统计',
          '「✦ 星河」—— 把这个月的夜连成一条河'
        ]
      },
      {
        page: '枕边',
        rows: [
          '「写一句 +」—— 可以改日期，补写以前的夜晚',
          '长按一句话 —— 修改或删除',
          '藤蔓左右拖 —— 看更早的夜',
          '信封堆 —— 只有最上面那封能点开'
        ]
      }
    ]
    
  },

  onLoad() {
    let navTop = 20
    try {
      navTop = (app && app.globalData && app.globalData.statusBarHeight) || 20
    } catch (e) {}
    this.setData({
      navTop: navTop,
      todayStr: notesApi.todayKey(),
      vineW: MIN_W
    })
    try {
      wx.showShareMenu({
        withShareTicket: false,
        menus: ['shareAppMessage', 'shareTimeline']
      })
    } catch (e) {}
  },
  

  onShow() {
    safe(function () { reportApi.ensure() }, false)
    this.loadTheme()
    this.loadPortrait()
    this.refresh()
    this.maybeHint()
    try { wx.showTabBar({ animation: false }) } catch (e) {}
  },

  onHide() {
    this.setData({
      tapFx: [],
      noteHint: false,
      guideShow: false,
      pShow: false,
      composeShow: false,
      dayShow: false,
      allShow: false,
      lettersShow: false,
      letterShow: false,
      letterStage: 0
    })
    try { wx.showTabBar({ animation: false }) } catch (e) {}
  },

  loadTheme() {
    const recs = safe(function () { return store.getRecords() }, [])
    const t = safe(function () { return theme.resolve(recs, Date.now()) }, { mode: 'night' })
    const isDay = !!(t && t.mode === 'day')
    this.setData({ isDay: isDay })
    this.applyTabBar(isDay)
  },

  loadPortrait() {
    const recs = safe(function () { return store.getRecords() }, [])
    const p = safe(
      function () { return portrait.analyze(recs) },
      { ready: false, total: 0, need: 3 }
    )
    const total = safe(function () { return store.nights().length }, 0)
    let key = -1
    if (p.ready) {
      for (let i = 0; i < portrait.TYPES.length; i++) {
        if (portrait.TYPES[i].name === p.name) key = i
      }
    }
    this.setData({
      p: p,
      avatarKey: key,
      nightCount: total,
      hint: p.ready
        ? ''
        : '已记录 ' + total + ' 晚，再记 ' + Math.max(0, 3 - total) + ' 晚就能认出你'
    })
  },

  refresh() {
    const days = safe(function () { return notesApi.vine() }, [])
    const built = this.buildVine(days)

    const reports = safe(function () { return reportApi.getReports() }, [])
      .slice()
      .sort(function (a, b) { return b.weekStart - a.weekStart })

    this.setData({
      nodes: built.nodes,
      segs: built.segs,
      leaves: built.leaves,
      vineW: built.width,
      trackH: TRACK_H,
      scrollLeft: Math.max(0, built.width - 682),
      noteDays: days.length,
      reports: reports,
      reportTotal: reports.length
    })
  },

  buildVine(days) {
    const n = days.length
    const isDay = this.data.isDay
    if (!n) return { nodes: [], segs: [], leaves: [], width: MIN_W }

    const width = Math.max(MIN_W, 260 + n * SP + RIGHT_PAD)
    const stars = []
    for (let i = 0; i < n; i++) {
      const fromRight = n - 1 - i
      const x = width - RIGHT_PAD - fromRight * SP
      const y = BASE_Y + Math.sin(i * 1.1 + 0.5) * AMP
      stars.push({ x: x, y: y })
    }

    const P = [{ x: 8, y: BASE_Y + 26 }]
    P.push({ x: stars[0].x - SP * 0.62, y: BASE_Y - 14 })
    for (let i = 0; i < n; i++) P.push(stars[i])
    P.push({ x: width - 12, y: BASE_Y - 10 })

    const dense = sampleCurve(P, SEG_STEP)
    const segs = withFade(segsFrom(dense), 70, 96)

    const nodes = []
    for (let i = 0; i < n; i++) {
      const d = days[i]
      const full = 84 + (d.chars % 26)
      const h1 = Math.round(full * 0.58)
      const h2 = Math.round(full * 0.42)
      const rot = (i % 2 ? 1 : -1) * (4 + (i * 3) % 5)
      const sc = starColors(d.moodColor, isDay)

      nodes.push({
        dateKey: d.dateKey,
        short: d.short,
        level: d.level,
        x: r1(stars[i].x),
        y: r1(stars[i].y),
        h1: h1,
        h2: h2,
        bend: r1(rot * 0.5),
        style: armStyle(stars[i].x, stars[i].y, rot),
        swayStyle: swayStyle(-((i * 0.72) % 2.8), 4.8 + (i % 3) * 0.6),
        color: sc.color,
        glow: sc.glow,
        size: d.level === 3 ? 38 : d.level === 2 ? 32 : 26
      })
    }

    return {
      nodes: nodes,
      segs: segs,
      leaves: buildLeaves(dense, 97 + n, 10),
      width: width
    }
  },

  openDay(e) {
    const k = e.currentTarget.dataset.key
    if (!k) return
    const g = safe(function () { return notesApi.byKey(k) }, null)
    if (!g || !g.items.length) return
    const items = g.items.map(function (it) {
      const d = new Date(it.createdAt)
      return {
        id: it.id,
        text: it.text,
        moodColor: notesApi.colorOf(it.mood),
        time: it.backfill ? '' : (pad2(d.getHours()) + ':' + pad2(d.getMinutes()))
      }
    })
    this.setData({
      dayShow: true,
      dayKey: k,
      dayTitle: prettyDate(k),
      dayItems: items
    })
    this.hideBar()
  },

  closeDay() {
    this.setData({ dayShow: false })
    this.afterClose()
  },

  rebuildDay() {
    if (!this.data.dayShow) return
    const key = this.data.dayKey
    const g = safe(function () { return notesApi.byKey(key) }, null)
    if (!g || !g.items.length) {
      this.setData({ dayShow: false })
      this.afterClose()
      return
    }
    const items = g.items.map(function (it) {
      const d = new Date(it.createdAt)
      return {
        id: it.id,
        text: it.text,
        moodColor: notesApi.colorOf(it.mood),
        time: it.backfill ? '' : (pad2(d.getHours()) + ':' + pad2(d.getMinutes()))
      }
    })
    this.setData({ dayItems: items })
  },

  longNote(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const self = this
    wx.showActionSheet({
      itemList: ['修改这一句', '删除这一句'],
      success: function (r) {
        if (r.tapIndex === 0) self.editNote(id)
        else if (r.tapIndex === 1) self.confirmDelete(id)
      }
    })
  },

  confirmDelete(id) {
    const self = this
    wx.showModal({
      title: '删除这一句',
      content: '删掉就找不回来了。',
      confirmText: '删除',
      confirmColor: '#e05a5a',
      success: function (r) {
        if (!r.confirm) return
        notesApi.removeNote(id)
        self.refresh()
        self.rebuildDay()
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  },

  openCompose() {
    const k = notesApi.todayKey()
    this.setData({
      composeShow: true,
      editId: '',
      draft: '',
      mood: '',
      dateKey: k,
      dateText: prettyDate(k)
    })
    this.hideBar()
  },

  editNote(id) {
    const n = safe(function () { return notesApi.noteById(id) }, null)
    if (!n) return
    this.setData({
      composeShow: true,
      dayShow: false,
      editId: n.id,
      draft: n.text,
      mood: n.mood || '',
      dateKey: n.dateKey,
      dateText: prettyDate(n.dateKey)
    })
    this.hideBar()
  },

  closeCompose() {
    this.setData({ composeShow: false, editId: '' })
    this.afterClose()
  },

  onDraft(e) { this.setData({ draft: e.detail.value }) },

  onPickDate(e) {
    const k = e.detail.value
    this.setData({ dateKey: k, dateText: prettyDate(k) })
  },

  pickMood(e) {
    const k = e.currentTarget.dataset.k
    this.setData({ mood: this.data.mood === k ? '' : k })
  },

  saveNote() {
    const t = (this.data.draft || '').trim()
    if (!t) return
    const k = this.data.dateKey
    const editing = this.data.editId
    if (editing) notesApi.updateNote(editing, t, this.data.mood, k)
    else notesApi.addNote(t, this.data.mood, k)

    this.setData({ composeShow: false, draft: '', mood: '', editId: '' })
    this.refresh()
    this.rebuildDay()
    wx.showToast({ title: editing ? '已更新' : '点亮了', icon: 'none' })
    this.afterClose()
  },

  openPortrait() {
    this.setData({ pShow: true })
    this.hideBar()
  },

  closePortrait() {
    this.setData({ pShow: false })
    this.afterClose()
  },

  openAll() {
    const g = safe(function () { return notesApi.groups() }, [])
    const s = buildAllVine(g, 682, this.data.isDay)
    this.setData({
      allShow: true,
      tlSegs: s.segs,
      tlArms: s.arms,
      tlDates: s.dates,
      tlLeaves: s.leaves,
      tlTwigs: s.twigs,
      tlH: s.h
    })
    this.hideBar()
  },

  closeAll() {
    this.setData({ allShow: false })
    this.afterClose()
  },

  openLetters() {
    if (!this.data.reports.length) {
      wx.showToast({ title: '第一封信还在路上', icon: 'none' })
      return
    }
    this.setData({ lettersShow: true })
    this.hideBar()
  },

  closeLetters() {
    this.setData({ lettersShow: false })
    this.afterClose()
  },

  openLatest() {
    const l = this.data.reports
    if (l.length) this.showLetter(l[0].id)
  },

  openLetter(e) { this.showLetter(e.currentTarget.dataset.id) },

  showLetter(id) {
    if (!id) return
    const list = this.data.reports
    let idx = -1
    for (let i = 0; i < list.length; i++) if (list[i].id === id) idx = i
    if (idx < 0) return

    reportApi.markRead(id)
    const r = list[idx]
    const letter = {
      id: r.id,
      title: r.title,
      range: r.range,
      rows: r.rows || [],
      paras: r.paras || [],
      advice: r.advice || '',
      prevId: list[idx + 1] ? list[idx + 1].id : '',
      nextId: list[idx - 1] ? list[idx - 1].id : ''
    }
    const ph = moonPhase(Date.now())

    this.setData({
      letter: letter,
      letterShow: true,
      letterStage: 1,
      lettersShow: false,
      moonStyle: 'transform:translateX(' + Math.round(-Math.cos(ph * 2 * Math.PI) * 100) + '%)'
    })
    this.hideBar()

    const self = this
    setTimeout(function () { self.setData({ letterStage: 2 }) }, 40)
    setTimeout(function () { self.setData({ letterStage: 3 }) }, 460)

    this.refresh()
  },

  closeLetter() {
    this.setData({ letterStage: 2 })
    const self = this
    setTimeout(function () { self.setData({ letterStage: 1 }) }, 260)
    setTimeout(function () {
      self.setData({ letterShow: false, letter: null, letterStage: 0 })
      self.afterClose()
    }, 620)
  },

  prevLetter() {
    const l = this.data.letter
    if (l && l.prevId) this.showLetter(l.prevId)
  },

  nextLetter() {
    const l = this.data.letter
    if (l && l.nextId) this.showLetter(l.nextId)
  },

  noop() {},

  applyTabBar(isDay) {
    try {
      wx.setTabBarStyle({
        backgroundColor: isDay ? '#f5eee4' : '#080e1c',
        color: isDay ? '#8a97a8' : '#5f6f8f',
        selectedColor: isDay ? '#c08a3e' : '#f0c987',
        borderStyle: isDay ? 'white' : 'black'
      })
    } catch (e) {}
  },

  maybeHint() {
    if (wx.getStorageSync('hint_read_backfill')) return
    const self = this
    this.setData({ noteHint: true })
    setTimeout(function () {
      self.setData({ noteHint: false })
      try { wx.setStorageSync('hint_read_backfill', 1) } catch (e) {}
    }, 4300)
  },

  openGuide() {
    this.setData({ guideShow: true })
    this.hideBar()
  },

  closeGuide() {
    this.setData({ guideShow: false })
    if (this.data.pShow) return
    this.afterClose()
  },

  onPageTap(e) {
    tapfx.fire(this, e, this.data.isDay)
  },
  
  onShareAppMessage() {
    return {
      title: '枕星月眠 · 想说的话，挂成藤蔓上的星星。',
      path: '/pages/index/index'
    }
  },

  onShareTimeline() {
    return {
      title: '枕星月眠 · 想说的话，挂成藤蔓上的星星。'
    }
  },

  hideBar() {
    try { wx.hideTabBar({ animation: false }) } catch (e) {}
  },

  afterClose() {
    const d = this.data
    if (d.pShow || d.composeShow || d.dayShow || d.allShow || d.lettersShow || d.letterShow || d.guideShow) return
    try { wx.showTabBar({ animation: false }) } catch (e) {}
  }
})