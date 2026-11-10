const store = require('../../utils/store.js')
const settings = require('../../utils/settings.js')
const theme = require('../../utils/theme.js')
const app = getApp()
const tapfx = require('../../utils/tapfx.js')

function pad(n) { return n < 10 ? '0' + n : '' + n }
function lerp(a, b, t) { return a + (b - a) * t }

const STOPS = [
  { d: -180, c: [255, 243, 208] },
  { d: -40,  c: [240, 201, 135] },
  { d: 30,   c: [186, 190, 216] },
  { d: 120,  c: [169, 184, 221] },
  { d: 300,  c: [90, 110, 168] }
]

function colorForDelta(delta) {
  const d = Math.max(-180, Math.min(300, delta))
  let a = STOPS[0], z = STOPS[STOPS.length - 1]
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (d <= STOPS[i + 1].d) { a = STOPS[i]; z = STOPS[i + 1]; break }
  }
  const span = (z.d - a.d) || 1
  const t = Math.max(0, Math.min(1, (d - a.d) / span))
  return [
    Math.round(lerp(a.c[0], z.c[0], t)),
    Math.round(lerp(a.c[1], z.c[1], t)),
    Math.round(lerp(a.c[2], z.c[2], t))
  ]
}

function sizeFor(dur) {
  const d = Math.max(240, Math.min(620, dur))
  return Math.round(18 + (d - 240) / 380 * 28)
}

function wakeOffset(ts) {
  const d = new Date(ts)
  let m = d.getHours() * 60 + d.getMinutes() - 18 * 60
  if (m < 0) m += 1440
  return m
}

function labelFromOffset(off) {
  let m = Math.round(1080 + off) % 1440
  if (m < 0) m += 1440
  return pad(Math.floor(m / 60)) + ':' + pad(m % 60)
}

function parseKey(k) {
  const p = String(k).split('-').map(Number)
  return new Date(p[0], p[1] - 1, p[2])
}

function buildNightTimes(key, sleepMin, wakeMin) {
  const base = parseKey(key)
  const dayAfter = sleepMin < 4 * 60 ? 1 : 0
  const s = new Date(
    base.getFullYear(), base.getMonth(), base.getDate() + dayAfter,
    Math.floor(sleepMin / 60), sleepMin % 60, 0, 0
  ).getTime()
  let w = wakeMin
  if (w <= sleepMin) w += 1440
  return { sleepAt: s, wakeAt: s + (w - sleepMin) * 60000, durationMin: w - sleepMin }
}

/* ── 星河参数 ── */
const GALAXY = {
  loops: 1.5,
  amp: 0.34,
  topPad: 0.07,
  bottomPad: 0.20,
  yPow: 1.2,
  baseSize: 17,
  samples: 90,
  bgStars: 110,
  dust: 77,
  meteors: 2,
  nebulas: 8,
  nebulaPuffs: 8,
  farClusters: 3,
  fps: 24
}

/* 动画时间轴（毫秒） */
const ANIM = {
  line: 1150,
  morph: 1450,
  glow: 800
}

const STREAM_COLORS = [
  [230, 220, 255],
  [150, 200, 255],
  [190, 160, 240],
  [160, 210, 255],
  [180, 160, 255],
  [255, 238, 190],
  [255, 232, 172],
  [200, 175, 255],
  [170, 195, 255],
  [200, 220, 255],
  [235, 240, 255],
  [255, 248, 225]
]

const DUST_COLORS = [
  [255, 220, 150],
  [255, 240, 200],
  [255, 255, 255],
  [255, 200, 170],
  [255, 235, 170],
  [220, 230, 255],
  [255, 180, 220]
]

const NEBULA_PALETTE = [
  [80, 100, 195],
  [115, 85, 185],
  [75, 95, 180],
  [125, 90, 170],
  [70, 115, 200],
  [105, 80, 165]
]

const GLOW_LAYERS = [
  { w: 130, c: [255, 205, 130], a: 0.032 },
  { w: 88,  c: [255, 218, 150], a: 0.048 },
  { w: 56,  c: [255, 230, 172], a: 0.070 },
  { w: 32,  c: [255, 240, 196], a: 0.092 },
  { w: 16,  c: [255, 248, 222], a: 0.115 }
]

function galaxyPoint(t, W, H) {
  const amp = W * GALAXY.amp
  const x = W * 0.5 + amp * Math.cos(2 * Math.PI * GALAXY.loops * t)
  const top = H * GALAXY.topPad
  const bottom = H * (1 - GALAXY.bottomPad)
  const y = top + (bottom - top) * Math.pow(t, GALAXY.yPow)
  return { x, y }
}

function galaxyNormal(t, W, H) {
  const a = galaxyPoint(Math.max(0, t - 0.005), W, H)
  const b = galaxyPoint(Math.min(1, t + 0.005), W, H)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  return { nx: -dy / len, ny: dx / len }
}

/* 日历网格坐标：visualCol 是镜像后的视觉列，含 6px 浅弧 */
function calendarPoint(visualCol, row, rows, W, H) {
  const padX = W * 0.03
  const padY = H * 0.07
  const usableW = W - padX * 2
  const usableH = H - padY * 2
  const r = Math.max(1, rows)
  const u = (visualCol + 0.5) / 7
  const x = padX + u * usableW
  const y = padY + (row + 0.5) / r * usableH - 17 * Math.sin(Math.PI * u)
  return { x, y }
}

/* 三次缓动 */
function easeInOut3(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2
}

Page({
  data: {
    navTop: 20,
    isDay: false,
    weekNames: ['一', '二', '三', '四', '五', '六', '日'],

    year: 0,
    month: 0,
    monthLabel: '',
    canNext: false,

    stats: { avgBed: '—', avgWake: '—', avgDur: '—', earlyCount: '—' },
    cells: [],
    rows: 5,
    fieldStyle: '',
    recordCount: 0,
    anomalyCount: 0,
    insight: '',

    bubble: { show: false, left: '50%', top: '50%', transform: '', bed: '', wake: '', dur: '' },

    showSettings: false,
    earlySleepText: '23:30',
    earlyWakeText: '07:30',

    edit: {
      show: false, isNew: false, id: '', nightKey: '',
      sleepText: '23:00', wakeText: '07:00', durText: '8 小时'
    },

    galaxyShow: false,
    galaxyEmpty: false,
    tapFx: [],
    editHint: false
  },

  onLoad() {
    const now = new Date()
    this.setData({
      navTop: app.globalData.statusBarHeight || 20,
      year: now.getFullYear(),
      month: now.getMonth()
    })
    this._longPressed = false
  },

  onShow() { this.build(); this.maybeHint() },
  onHide() { 
    this.setData({ tapFx: [], editHint: false })
    this.stopGalaxy()  
    if (this.data.galaxyShow) {
    this.setData({ galaxyShow: false })
    this._galaxyAnim = null
    this._galaxyRunning = false
    try { wx.showTabBar({ animation: false }) } catch (e) {}
  } },
  onUnload() { this.stopGalaxy() },

  noop() {},
  onPageTap(e) {
    tapfx.fire(this, e, this.data.isDay)
  },

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
    if (wx.getStorageSync('hint_stats_edit')) return
    const self = this
    this.setData({ editHint: true })
    setTimeout(function () {
      self.setData({ editHint: false })
      try { wx.setStorageSync('hint_stats_edit', 1) } catch (e) {}
    }, 4300)
  },

  build() {
    const now = new Date()
    const vy = this.data.year, vm = this.data.month
    const isCurrent = vy === now.getFullYear() && vm === now.getMonth()

    const s = settings.getSettings()
    const all = store.getRecords()
    const isDay = theme.resolve(all, now.getTime()).mode === 'day'
    const nightsList = store.nights(all)
    const prefix = vy + '-' + pad(vm + 1)
    const monthNights = nightsList.filter(n => n.nightKey.indexOf(prefix) === 0)

    const month = this.buildMonth(monthNights, vy, vm, now)
    const stats = this.buildStats(monthNights)
    const insight = this.buildInsight(nightsList, monthNights, now, isCurrent)

    this.setData({
      isDay,
      monthLabel: vy + ' 年 ' + (vm + 1) + ' 月',
      canNext: !isCurrent,
      stats,
      cells: month.cells,
      rows: month.rows,
      fieldStyle: 'height: ' + (month.rows * 108) + 'rpx;',
      recordCount: monthNights.length,
      insight,
      earlySleepText: settings.minToText(s.earlySleep),
      earlyWakeText: settings.minToText(s.earlyWake),
      bubble: { show: false, left: '50%', top: '50%', transform: '', bed: '', wake: '', dur: '' }
    })

    this.applyTabBar(isDay)
  },

  buildMonth(monthNights, vy, vm, now) {
    const daysInMonth = new Date(vy, vm + 1, 0).getDate()
    const firstDow = (new Date(vy, vm, 1).getDay() + 6) % 7
    const rows = Math.ceil((firstDow + daysInMonth) / 7)

    const map = {}
    monthNights.forEach(n => { map[n.nightKey] = n })

    const todayKey = store.nightKey(now.getTime())
    const cells = []

    for (let d = 1; d <= daysInMonth; d++) {
      const key = vy + '-' + pad(vm + 1) + '-' + pad(d)
      const rec = map[key]
      const idx = firstDow + d - 1
      const col = idx % 7
      const row = Math.floor(idx / 7)

      const cell = {
        day: d, key, col, row,
        left: ((col + 0.5) / 7 * 100).toFixed(2) + '%',
        top: ((row + 0.5) / rows * 100).toFixed(2) + '%',
        hasRecord: !!rec,
        isToday: key === todayKey,
        size: 0, ring: 26, color: '#ffffff', glow: 'rgba(255,255,255,0.2)'
      }

      if (rec) {
        const rgb = colorForDelta(settings.earlyDelta(rec.sleepAt))
        cell.size = sizeFor(rec.durationMin)
        cell.ring = cell.size + 16
        cell.color = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'
        cell.glow = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.6)'
      }
      cells.push(cell)
    }
    return { cells, rows }
  },

  buildStats(monthNights) {
    if (!monthNights.length) {
      return { avgBed: '—', avgWake: '—', avgDur: '—', earlyCount: '—' }
    }
    const n = monthNights.length
    let bedSum = 0, wakeSum = 0, durSum = 0, early = 0
    monthNights.forEach(r => {
      bedSum += store.bedOffset(r.sleepAt)
      wakeSum += wakeOffset(r.wakeAt)
      durSum += r.durationMin
      if (settings.isEarlySleep(r.sleepAt)) early++
    })
    return {
      avgBed: labelFromOffset(bedSum / n),
      avgWake: labelFromOffset(wakeSum / n),
      avgDur: store.fmtDur(Math.round(durSum / n)),
      earlyCount: early + ' 晚'
    }
  },

  buildInsight(allNights, monthNights, now, isCurrent) {
    if (!monthNights.length) return '这个月还没有记录。'

    if (isCurrent) {
      const todayKey = store.nightKey(now.getTime())
      const today = monthNights.find(n => n.nightKey === todayKey)
      if (today && monthNights.length > 1) {
        let minBed = Infinity, maxBed = -Infinity, minDur = Infinity, maxDur = -Infinity
        monthNights.forEach(n => {
          const b = store.bedOffset(n.sleepAt)
          if (b < minBed) minBed = b
          if (b > maxBed) maxBed = b
          if (n.durationMin < minDur) minDur = n.durationMin
          if (n.durationMin > maxDur) maxDur = n.durationMin
        })
        const tb = store.bedOffset(today.sleepAt)
        if (tb === minBed) return '今天是这个月最早睡的一晚。'
        if (tb === maxBed) return '今天是这个月最晚睡的一晚。'
        if (today.durationMin === maxDur) return '今天是这个月睡得最久的一晚。'
        if (today.durationMin === minDur) return '今天是这个月睡得最短的一晚。'
      }

      const t = now.getTime()
      const last7 = allNights.filter(n => n.sleepAt >= t - 7 * 86400000)
      const prev7 = allNights.filter(n => n.sleepAt >= t - 14 * 86400000 && n.sleepAt < t - 7 * 86400000)
      if (last7.length >= 2 && prev7.length >= 2) {
        let a = 0, b = 0
        last7.forEach(n => { a += store.bedOffset(n.sleepAt) })
        prev7.forEach(n => { b += store.bedOffset(n.sleepAt) })
        const diff = Math.round(b / prev7.length - a / last7.length)
        if (Math.abs(diff) <= 3) return '最近 7 天，你的作息和前一周几乎一样。'
        if (diff > 0) return '最近 7 天，你比前 7 天平均早睡了 ' + diff + ' 分钟。'
        return '最近 7 天，你比前 7 天平均晚睡了 ' + (-diff) + ' 分钟。'
      }
      return '这个月，你正在慢慢记录自己的夜晚。'
    }

    let earliest = monthNights[0], longest = monthNights[0]
    monthNights.forEach(n => {
      if (store.bedOffset(n.sleepAt) < store.bedOffset(earliest.sleepAt)) earliest = n
      if (n.durationMin > longest.durationMin) longest = n
    })
    return '这个月你最早在 ' + new Date(earliest.sleepAt).getDate() + ' 号 ' +
           store.fmtTime(earliest.sleepAt) + ' 入睡，最长的一觉睡了 ' +
           store.fmtDur(longest.durationMin) + '。'
  },

  prevMonth() {
    let y = this.data.year, m = this.data.month - 1
    if (m < 0) { m = 11; y-- }
    this.setData({ year: y, month: m })
    this.build()
  },

  nextMonth() {
    if (!this.data.canNext) return
    let y = this.data.year, m = this.data.month + 1
    if (m > 11) { m = 0; y++ }
    this.setData({ year: y, month: m })
    this.build()
  },

  tapStar(e) {
    if (this._longPressed) { this._longPressed = false; return }
    const i = Number(e.currentTarget.dataset.i)
    const cell = this.data.cells[i]
    if (!cell || !cell.hasRecord) return

    if (this.data.bubble.show) {
      this.setData({ bubble: { show: false, left: '50%', top: '50%', transform: '', bed: '', wake: '', dur: '' } })
      return
    }

    const rec = store.nights(store.getRecords()).find(n => n.nightKey === cell.key)
    if (!rec) return

    let leftPct = (cell.col + 0.5) / 7 * 100
    leftPct = Math.max(18, Math.min(82, leftPct))
    const rows = this.data.rows
    const topPct = (cell.row + 0.5) / rows * 100
    const isTopRow = cell.row === 0

    this.setData({
      bubble: {
        show: true,
        left: leftPct.toFixed(2) + '%',
        top: isTopRow ? (topPct + 4).toFixed(2) + '%' : (topPct - 4).toFixed(2) + '%',
        transform: isTopRow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        bed: store.fmtTime(rec.sleepAt),
        wake: store.fmtTime(rec.wakeAt),
        dur: store.fmtDur(rec.durationMin)
      }
    })
  },

  closeBubble() {
    if (!this.data.bubble.show) return
    this.setData({ bubble: { show: false, left: '50%', top: '50%', transform: '', bed: '', wake: '', dur: '' } })
  },

  longStar(e) {
    this._longPressed = true
    this.closeBubble()
    const i = Number(e.currentTarget.dataset.i)
    const cell = this.data.cells[i]
    if (!cell) return
    if (!cell.hasRecord) { this.openAdd(cell.key); return }

    const rec = store.nights(store.getRecords()).find(n => n.nightKey === cell.key)
    if (!rec) return
    this.setData({
      edit: {
        show: true, isNew: false, id: rec.id, nightKey: cell.key,
        sleepText: store.fmtTime(rec.sleepAt),
        wakeText: store.fmtTime(rec.wakeAt),
        durText: store.fmtDur(rec.durationMin)
      }
    })
  },

  openAdd(key) {
    this.setData({
      edit: {
        show: true, isNew: true, id: '', nightKey: key,
        sleepText: '23:00', wakeText: '07:00', durText: '8 小时'
      }
    })
  },

  onEditTime(e) {
    const field = e.currentTarget.dataset.field
    const edit = Object.assign({}, this.data.edit)
    edit[field] = e.detail.value
    edit.durText = this.calcDur(edit.sleepText, edit.wakeText)
    this.setData({ edit })
  },

  calcDur(s, w) {
    let sm = settings.textToMin(s)
    let wm = settings.textToMin(w)
    if (wm <= sm) wm += 1440
    return store.fmtDur(wm - sm)
  },

  closeEdit() { this.setData({ edit: Object.assign({}, this.data.edit, { show: false }) }) },

  saveEdit() {
    const e = this.data.edit
    const times = buildNightTimes(e.nightKey, settings.textToMin(e.sleepText), settings.textToMin(e.wakeText))
    if (times.durationMin < 10) { wx.showToast({ title: '时长好像不太对', icon: 'none' }); return }
    const doSave = () => this.applyEdit(times)
    if (times.durationMin < store.MIN_NIGHT_MIN) {
      wx.showModal({
        title: '这一觉很短',
        content: '少于 ' + store.MIN_NIGHT_MIN + ' 分钟的记录不会计入星图，确定保存吗？',
        confirmText: '仍然保存',
        success: r => { if (r.confirm) doSave() }
      })
      return
    }
    if (times.durationMin > store.MAX_SLEEP_MIN) {
      wx.showToast({ title: '超过 16 小时，请检查时间', icon: 'none' })
      return
    }
    doSave()
  },

  applyEdit(times) {
    const e = this.data.edit
    const list = store.getRecords()
    if (e.isNew) {
      list.push({
        id: 'n' + Date.now(), sleepAt: times.sleepAt, wakeAt: times.wakeAt,
        durationMin: times.durationMin, mood: '', diary: '', lateReason: ''
      })
    } else {
      const rec = list.find(r => r.id === e.id)
      if (!rec) { this.closeEdit(); return }
      rec.sleepAt = times.sleepAt
      rec.wakeAt = times.wakeAt
      rec.durationMin = times.durationMin
    }
    store.setRecords(list)
    this.closeEdit()
    this.build()
    wx.showToast({ title: '已保存', icon: 'none' })
  },

  deleteEdit() {
    const e = this.data.edit
    if (!e.id) return
    wx.showModal({
      title: '删除这一晚',
      content: '这一晚的记录会被移除，无法恢复。',
      confirmText: '删除', confirmColor: '#e05a5a',
      success: r => {
        if (!r.confirm) return
        store.removeRecord(e.id)
        this.closeEdit()
        this.build()
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  },

  openSettings() { this.setData({ showSettings: true }) },
  closeSettings() { this.setData({ showSettings: false }) },

  onEarlySleepChange(e) {
    const m = settings.textToMin(e.detail.value)
    const s = settings.getSettings(); s.earlySleep = m; settings.setSettings(s)
    this.setData({ earlySleepText: settings.minToText(m) })
    this.build()
  },
  onEarlyWakeChange(e) {
    const m = settings.textToMin(e.detail.value)
    const s = settings.getSettings(); s.earlyWake = m; settings.setSettings(s)
    this.setData({ earlyWakeText: settings.minToText(m) })
    this.build()
  },

  /* ───────── 星河 ───────── */
  openGalaxy() {
    this.stopGalaxy()
    const vy = this.data.year, vm = this.data.month
    const prefix = vy + '-' + pad(vm + 1)
    const list = store.nights(store.getRecords())
      .filter(n => n.nightKey.indexOf(prefix) === 0)
      .sort((a, b) => a.sleepAt - b.sleepAt)

    if (!list.length) {
      wx.showToast({ title: '这个月还没有星星', icon: 'none' })
      return
    }

    this._galaxyNights = list
    const cellMap = {}
    this.data.cells.forEach(c => { if (c.hasRecord) cellMap[c.key] = c })
    this._galaxyCellMap = cellMap
    this._galaxyRows = this.data.rows

    this.setData({ galaxyShow: true, galaxyEmpty: false })
    wx.nextTick(() => this.queryGalaxy(0))
    wx.hideTabBar({ animation: false })  
  },

  queryGalaxy(retry) {
    wx.createSelectorQuery().in(this)
      .select('#galaxy-canvas')
      .fields({ node: true, size: true })
      .select('#galaxy-canvas')
      .boundingClientRect()
      .exec(res => {
        const item = res && res[0]
        const rect = res && res[1]

        if (!item || !item.node || !(item.width > 40) || !(item.height > 40)) {
          if (retry < 10) { setTimeout(() => this.queryGalaxy(retry + 1), 100); return }
          console.error('[galaxy] 画布不可用', res)
          this.setData({ galaxyEmpty: true })
          return
        }

        let dpr = 2
        try {
          const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
          dpr = info.pixelRatio || 2
        } catch (e) {}

        const W = Math.round(item.width)
        const H = Math.round(item.height)
        const canvas = item.node
        const ctx = canvas.getContext('2d')

        canvas.width = Math.round(W * dpr)
        canvas.height = Math.round(H * dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        this.galaxyCanvas = canvas
        this.galaxyCtx = ctx
        this.galaxySize = { W, H }
        this.galaxyRect = rect || null
        this.galaxyClickMeteors = []
        this._galaxyT0 = Date.now()
        this._galaxyLast = Date.now()
        this._galaxyPaintAt = 0
        this._galaxyErr = 0

        /* 时长跟着星星数量走：每段至少 95ms，总长最少 1.5 秒 */
        const segs = Math.max(1, (this._galaxyNights || []).length - 1)
        this._animLine = Math.max(900, segs * 55)
        this._animMorph = 777
        this._animGlow = 900

        this._galaxyAnim = { t0: Date.now() }

        this.galaxyData = this.buildGalaxyData(W, H, this._galaxyNights)
        this.startGalaxy()
      })
  },

  /* ── 动画进度 ── */
  computeAnim(now) {
    const a = this._galaxyAnim
    if (!a) return { lineT: 1, morphT: 1, glowT: 1 }
    const t = now - a.t0
    const lineDur = this._animLine || ANIM.line
    const morphDur = this._animMorph || ANIM.morph
    const glowDur = this._animGlow || ANIM.glow
    const lineT = Math.max(0, Math.min(1, t / lineDur))
    const morphT = Math.max(0, Math.min(1, (t - lineDur) / morphDur))
    const glowT = Math.max(0, Math.min(1, (t - lineDur - morphDur) / glowDur))
    return { lineT, morphT, glowT }
  },

  onGalaxyTap(e) {
    if (!this.galaxySize) return
    const d = (e && e.detail) || {}
    let x = d.x
    let y = d.y
    if (typeof x !== 'number' || typeof y !== 'number') return

    if (this.galaxyRect) {
      x -= this.galaxyRect.left
      y -= this.galaxyRect.top
    }
    if (x < 0 || y < 0 || x > this.galaxySize.W || y > this.galaxySize.H) return

    if (!this.galaxyClickMeteors) this.galaxyClickMeteors = []

    const vx = (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 80)
    const vy = 240 + Math.random() * 100

    this.galaxyClickMeteors.push({
      x: x, y: y, vx: vx, vy: vy,
      life: 1,
      decay: 1.15,
      tailLen: 34 + Math.random() * 28   // 直接存像素长度
    })
  },

  updateStarPositions(g, anim, time) {
    const stars = g.stars
    const e = easeInOut3(anim.morphT)

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i]

      const bx = s.calX + (s.x - s.calX) * e
      const by = s.calY + (s.y - s.calY) * e

      const bobY = Math.sin(time * s.bobSpeed + s.bobPhase) * s.bobAmpY
      const bobX = Math.cos(time * s.bobSpeed * 0.8 + s.bobPhase) * s.bobAmpX

      s.curX = bx + bobX
      s.curY = by + bobY
    }
  },

  buildGalaxyData(W, H, nights) {
    const n = nights.length
    const cellMap = this._galaxyCellMap || {}
    const rows = this._galaxyRows || 5

    let minDur = Infinity, maxDur = -Infinity
    nights.forEach(r => {
      if (r.durationMin < minDur) minDur = r.durationMin
      if (r.durationMin > maxDur) maxDur = r.durationMin
    })
    const durSpan = (maxDur - minDur) || 1
    const boost = n < 8 ? 1 + (8 - n) * 0.06 : 1

    const stars = nights.map((r, i) => {
      const tt = n === 1 ? 0.5 : i / (n - 1)
      const p = galaxyPoint(tt, W, H)
      const persp = 0.78 + 0.32 * tt
      const durF = 0.60 + 0.90 * ((r.durationMin - minDur) / durSpan)
      const rgb = colorForDelta(settings.earlyDelta(r.sleepAt))

      const cell = cellMap[r.nightKey]
      let calX, calY
      if (cell) {
        const isMirror = cell.row % 2 === 1
        const visualCol = isMirror ? (6 - cell.col) : cell.col
        const cp = calendarPoint(visualCol, cell.row, rows, W, H)
        calX = cp.x
        calY = cp.y
      } else {
        calX = p.x
        calY = p.y
      }

      return {
        x: p.x, y: p.y,
        calX, calY,
        curX: calX, curY: calY,
        tt,
        size: GALAXY.baseSize * persp * durF * boost,
        a: 0.85 + 0.15 * tt,
        c: rgb,
        tw: 0.8 + Math.random() * 1.2,
        ph: Math.random() * Math.PI * 2,
        bobAmpY: 1.2 + Math.random() * 1.4,
        bobAmpX: 0.4 + Math.random() * 0.8,
        bobSpeed: 0.8 + Math.random() * 0.6,
        bobPhase: Math.random() * Math.PI * 2
      }
    })

    const streams = []
    for (let s = 0; s < STREAM_COLORS.length; s++) {
      const u = s / (STREAM_COLORS.length - 1)
      const off = (u - 0.5) * 2
      const absOff = Math.abs(off)
      const centerBias = 1 - absOff

      streams.push({
        off,
        color: STREAM_COLORS[s],
        width: 0.45 + 1.25 * Math.pow(centerBias, 1.4),
        alpha: 0.06 + 0.52 * Math.pow(centerBias, 1.7),
        wobbleAmp: 2.5 + Math.random() * 6,
        wobbleFreq: 1.2 + Math.random() * 2.0,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.18 + Math.random() * 0.4,
        pulseSpeed: 0.030 + Math.random() * 0.045,
        pulsePhase: Math.random(),
        pulseLen: 0.050 + Math.random() * 0.030
      })
    }

    const bgStars = []
    for (let i = 0; i < GALAXY.bgStars; i++) {
      bgStars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.35 + Math.random() * 1.1,
        a: 0.12 + Math.random() * 0.42,
        sp: 0.5 + Math.random() * 1.8,
        ph: Math.random() * Math.PI * 2
      })
    }

    const farClusters = []
    for (let i = 0; i < GALAXY.farClusters; i++) {
      const cx = W * (0.10 + Math.random() * 0.80)
      const cy = H * (0.04 + Math.random() * 0.20)
      const radius = W * (0.055 + Math.random() * 0.035)
      const dots = []
      const cnt = 10 + Math.floor(Math.random() * 6)
      for (let k = 0; k < cnt; k++) {
        const ang = Math.random() * Math.PI * 2
        const dist = Math.pow(Math.random(), 1.5) * radius
        dots.push({
          dx: Math.cos(ang) * dist,
          dy: Math.sin(ang) * dist * 0.65,
          r: 0.4 + Math.random() * 0.9,
          a: 0.22 + Math.random() * 0.32,
          sp: 0.3 + Math.random() * 0.9,
          ph: Math.random() * Math.PI * 2
        })
      }
      farClusters.push({ cx, cy, radius, dots, ph: Math.random() * Math.PI * 2 })
    }

    const nebulas = []
    for (let i = 0; i < GALAXY.nebulas; i++) {
      const c = NEBULA_PALETTE[i % NEBULA_PALETTE.length]
      const baseR = W * (0.30 + Math.random() * 0.22)

      const puffs = []
      for (let k = 0; k < GALAXY.nebulaPuffs; k++) {
        const ang = Math.random() * Math.PI * 2
        const dist = Math.pow(Math.random(), 0.65) * baseR * 0.9
        puffs.push({
          dx: Math.cos(ang) * dist,
          dy: Math.sin(ang) * dist * 0.72,
          r: baseR * (0.28 + Math.random() * 0.38),
          w: 0.6 + Math.random() * 0.5,
          ph: Math.random() * Math.PI * 2,
          psp: 0.25 + Math.random() * 0.55
        })
      }

      nebulas.push({
        baseX: Math.random() * W,
        baseY: Math.random() * H,
        r: baseR,
        driftAmp: 18 + Math.random() * 26,
        driftSpeed: 0.05 + Math.random() * 0.06,
        ph: Math.random() * Math.PI * 2,
        a: 0.085 + Math.random() * 0.030,
        c,
        puffs,
        sScale: 0.30 + Math.random() * 0.18
      })
    }

    const dust = []
    for (let i = 0; i < GALAXY.dust; i++) {
      const big = Math.random() < 0.10
      dust.push({
        t: Math.random(),
        v: 0.015 + Math.random() * 0.045,
        r: big ? (1.4 + Math.random() * 0.7) : (0.42 + Math.random() * 0.70),
        spread: 6 + Math.random() * 26,
        side: Math.random() < 0.5 ? -1 : 1,
        ph: Math.random() * Math.PI * 2,
        sp: 0.6 + Math.random() * 1.8,
        szSp: 0.8 + Math.random() * 1.4,
        c: DUST_COLORS[Math.floor(Math.random() * DUST_COLORS.length)]
      })
    }

    const meteors = []
    for (let i = 0; i < GALAXY.meteors; i++) {
      meteors.push({
        x: Math.random() * W * 0.7,
        y: Math.random() * H * 0.35,
        len: 40 + Math.random() * 50,
        speed: 55 + Math.random() * 60,
        angle: Math.PI / 4 + (Math.random() - 0.5) * 0.35,
        cycle: 7 + Math.random() * 5,
        startOffset: Math.random() * 8
      })
    }

    return { stars, streams, bgStars, farClusters, nebulas, dust, meteors }
  },

  startGalaxy() {
    if (!this.galaxyCanvas || this._galaxyRunning) return
    this._galaxyRunning = true

    const step = () => {
      if (!this._galaxyRunning) return
      const now = Date.now()
      const dt = Math.min(0.12, (now - this._galaxyLast) / 1000)
      this._galaxyLast = now

      if (now - this._galaxyPaintAt >= 1000 / GALAXY.fps) {
        this._galaxyPaintAt = now
        try { this.paintGalaxy(dt, now) }
        catch (e) {
          if (!this._galaxyErr) {
            this._galaxyErr = 1
            console.error('[galaxy] 绘制报错：', (e && e.message) || e)
          }
        }
      }
      this._galaxyRaf = this.galaxyCanvas.requestAnimationFrame(step)
    }

    this._galaxyRaf = this.galaxyCanvas.requestAnimationFrame(step)
  },

  stopGalaxy() {
    this._galaxyRunning = false
    if (this.galaxyCanvas && this._galaxyRaf) {
      try { this.galaxyCanvas.cancelAnimationFrame(this._galaxyRaf) } catch (e) {}
    }
    this._galaxyRaf = null
  },

  paintGalaxy(dt, now) {
    const ctx = this.galaxyCtx
    const g = this.galaxyData
    if (!ctx || !g) return
    const W = this.galaxySize.W
    const H = this.galaxySize.H
    const time = (now - this._galaxyT0) / 1000
    const anim = this.computeAnim(now)

    ctx.clearRect(0, 0, W, H)

    /* ① 星云 */
    this.drawNebulas(ctx, g, time)

    /* ② 背景散星 */
    this.drawBgStars(ctx, g, time)

    /* ③ 远处光团 */
    this.drawFarClusters(ctx, g, time)

    /* ④ 流星 */
    this.drawMeteors(ctx, g, W, H, time)

    /* ⑤ 更新每颗星当前位置 */
    this.updateStarPositions(g, anim, time)

    const glowA = anim.glowT

    /* ⑥ 星河光晕（淡入） */
    if (glowA > 0.01) this.drawGalaxyGlow(ctx, W, H, time, glowA)

    /* ⑦ 支流 */
    if (glowA > 0.01) this.drawStreams(ctx, g, W, H, time, glowA)

    /* ⑧ 主线 */
    if (glowA > 0.01) this.drawMainLine(ctx, W, H, time, glowA)

    /* ⑨ 星屑（稍晚淡入） */
    const dustA = Math.max(0, (anim.glowT - 0.25) / 0.75)
    if (dustA > 0.01) this.drawDust(ctx, g, dt, time, dustA,W,H)

    /* ⑩ 金线：连线 → 变形全程可见 */
    this.drawLinkLine(ctx, g, anim, time,W)

    /* ⑪ 主星 */
    this.drawAllStars(ctx, g, time, anim)


    /* 点击流星 */
    if (this.galaxyClickMeteors && this.galaxyClickMeteors.length) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (let i = this.galaxyClickMeteors.length - 1; i >= 0; i--) {
        const mt = this.galaxyClickMeteors[i]
        mt.x += mt.vx * dt
        mt.y += mt.vy * dt
        mt.life -= dt * (mt.decay || 1.15)
        if (mt.life <= 0 || mt.y > H + 80 || mt.x < -80 || mt.x > W + 80) {
          this.galaxyClickMeteors.splice(i, 1)
          continue
        }

        const sp = Math.sqrt(mt.vx * mt.vx + mt.vy * mt.vy) || 1
        const tailLen = mt.tailLen || 38
        const tx = mt.x - (mt.vx / sp) * tailLen
        const ty = mt.y - (mt.vy / sp) * tailLen

        const lg = ctx.createLinearGradient(mt.x, mt.y, tx, ty)
        lg.addColorStop(0, 'rgba(255,255,255,' + (0.85 * mt.life).toFixed(3) + ')')
        lg.addColorStop(0.4, 'rgba(210,228,255,' + (0.30 * mt.life).toFixed(3) + ')')
        lg.addColorStop(1, 'rgba(200,220,255,0)')

        ctx.strokeStyle = lg
        ctx.lineWidth = 1.3
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(mt.x, mt.y)
        ctx.lineTo(tx, ty)
        ctx.stroke()

        ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * mt.life).toFixed(3) + ')'
        ctx.beginPath()
        ctx.arc(mt.x, mt.y, 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    /* ⑫ 暗角 */
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.46, W * 0.30, W * 0.5, H * 0.5, Math.max(W, H) * 1.0)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(0.55, 'rgba(0,0,0,0.02)')
    vg.addColorStop(0.80, 'rgba(0,0,0,0.12)')
    vg.addColorStop(1, 'rgba(0,0,0,0.34)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, W, H)
  },

  drawNebulas(ctx, g, time) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < g.nebulas.length; i++) {
      const nb = g.nebulas[i]
      const nx = nb.baseX + Math.sin(time * nb.driftSpeed + nb.ph) * nb.driftAmp
      const ny = nb.baseY + Math.cos(time * nb.driftSpeed * 0.82 + nb.ph) * nb.driftAmp * 0.65
      const breathe = 0.72 + 0.28 * Math.sin(time * nb.sScale + nb.ph)
      const scale = 1 + 0.05 * Math.sin(time * 0.30 + nb.ph)

      for (let k = 0; k < nb.puffs.length; k++) {
        const pf = nb.puffs[k]
        const pfp = 0.72 + 0.28 * Math.sin(time * pf.psp + pf.ph)
        const px = nx + pf.dx * scale
        const py = ny + pf.dy * scale
        const pr = pf.r * scale
        const a = nb.a * pf.w * breathe * pfp
        if (a <= 0.003) continue

        const grad = ctx.createRadialGradient(px, py, 0, px, py, pr)
        grad.addColorStop(0, 'rgba(' + nb.c[0] + ',' + nb.c[1] + ',' + nb.c[2] + ',' + a.toFixed(3) + ')')
        grad.addColorStop(0.40, 'rgba(' + nb.c[0] + ',' + nb.c[1] + ',' + nb.c[2] + ',' + (a * 0.75).toFixed(3) + ')')
        grad.addColorStop(0.72, 'rgba(' + nb.c[0] + ',' + nb.c[1] + ',' + nb.c[2] + ',' + (a * 0.28).toFixed(3) + ')')
        grad.addColorStop(1, 'rgba(' + nb.c[0] + ',' + nb.c[1] + ',' + nb.c[2] + ',0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(px, py, pr, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  },

  drawBgStars(ctx, g, time) {
    for (let i = 0; i < g.bgStars.length; i++) {
      const st = g.bgStars[i]
      const tw = 0.5 + 0.5 * Math.sin(time * st.sp + st.ph)
      ctx.fillStyle = 'rgba(255,255,255,' + (st.a * tw).toFixed(3) + ')'
      ctx.beginPath()
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2)
      ctx.fill()
    }
  },

  drawFarClusters(ctx, g, time) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < g.farClusters.length; i++) {
      const fc = g.farClusters[i]
      const breathe = 0.72 + 0.28 * Math.sin(time * 0.4 + fc.ph)

      const glow = ctx.createRadialGradient(fc.cx, fc.cy, 0, fc.cx, fc.cy, fc.radius * 2.0)
      glow.addColorStop(0, 'rgba(160,185,255,' + (0.14 * breathe).toFixed(3) + ')')
      glow.addColorStop(0.45, 'rgba(160,185,255,' + (0.07 * breathe).toFixed(3) + ')')
      glow.addColorStop(1, 'rgba(160,185,255,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(fc.cx, fc.cy, fc.radius * 2.0, 0, Math.PI * 2)
      ctx.fill()

      for (let k = 0; k < fc.dots.length; k++) {
        const d = fc.dots[k]
        const tw = 0.5 + 0.5 * Math.sin(time * d.sp + d.ph)
        const a = Math.min(1, d.a * tw * breathe * 1.8)
        ctx.fillStyle = 'rgba(225,235,255,' + a.toFixed(3) + ')'
        ctx.beginPath()
        ctx.arc(fc.cx + d.dx, fc.cy + d.dy, d.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  },

  drawMeteors(ctx, g, W, H, time) {
    for (let i = 0; i < g.meteors.length; i++) {
      const m = g.meteors[i]
      const cycle = ((time + m.startOffset) % m.cycle) / m.cycle
      if (cycle > 0.24) continue
      const p = cycle / 0.24
      const mx = m.x + Math.cos(m.angle) * m.speed * p * 3
      const my = m.y + Math.sin(m.angle) * m.speed * p * 3
      const tx = mx - Math.cos(m.angle) * m.len
      const ty = my - Math.sin(m.angle) * m.len
      const grad = ctx.createLinearGradient(mx, my, tx, ty)
      grad.addColorStop(0, 'rgba(255,255,255,0.7)')
      grad.addColorStop(0.4, 'rgba(200,220,255,0.20)')
      grad.addColorStop(1, 'rgba(200,220,255,0)')
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.1
      ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(tx, ty); ctx.stroke()
    }
  },

  drawGalaxyGlow(ctx, W, H, time, alpha) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const GN = GALAXY.samples
    const gTop = H * GALAXY.topPad
    const gBot = H * (1 - GALAXY.bottomPad)
    const glowPulse = 0.80 + 0.20 * Math.sin(time * 0.5)

    for (let L = 0; L < GLOW_LAYERS.length; L++) {
      const ly = GLOW_LAYERS[L]

      const gg = ctx.createLinearGradient(0, gTop - H * 0.06, 0, gBot + H * 0.04)
      gg.addColorStop(0.00, 'rgba(' + ly.c[0] + ',' + ly.c[1] + ',' + ly.c[2] + ',0)')
      gg.addColorStop(0.10, 'rgba(' + ly.c[0] + ',' + ly.c[1] + ',' + ly.c[2] + ',' + (ly.a * 0.28 * glowPulse * alpha).toFixed(3) + ')')
      gg.addColorStop(0.35, 'rgba(' + ly.c[0] + ',' + ly.c[1] + ',' + ly.c[2] + ',' + (ly.a * 0.58 * glowPulse * alpha).toFixed(3) + ')')
      gg.addColorStop(0.70, 'rgba(' + ly.c[0] + ',' + ly.c[1] + ',' + ly.c[2] + ',' + (ly.a * 0.90 * glowPulse * alpha).toFixed(3) + ')')
      gg.addColorStop(0.90, 'rgba(' + ly.c[0] + ',' + ly.c[1] + ',' + ly.c[2] + ',' + (ly.a * glowPulse * alpha).toFixed(3) + ')')
      gg.addColorStop(1.00, 'rgba(' + ly.c[0] + ',' + ly.c[1] + ',' + ly.c[2] + ',0)')

      ctx.beginPath()
      for (let i = 0; i <= GN; i++) {
        const t = i / GN
        const p = galaxyPoint(t, W, H)
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      }
      ctx.strokeStyle = gg
      ctx.lineWidth = ly.w
      ctx.stroke()
    }

    ctx.restore()
  },

  drawStreams(ctx, g, W, H, time, alpha) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const N = GALAXY.samples
    const yTop = H * GALAXY.topPad
    const yBot = H * (1 - GALAXY.bottomPad)

    for (let s = 0; s < g.streams.length; s++) {
      const st = g.streams[s]
      const c = st.color

      const A = function (v) {
        return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.max(0, v * alpha).toFixed(3) + ')'
      }

      const streamPulse = 0.88 + 0.12 * Math.sin(time * 0.6 + st.wobblePhase)
      const baseAlpha = st.alpha * streamPulse

      const grad = ctx.createLinearGradient(0, yTop - H * 0.05, 0, yBot + H * 0.03)
      grad.addColorStop(0.00, A(0))
      grad.addColorStop(0.13, A(baseAlpha * 0.20))
      grad.addColorStop(0.32, A(baseAlpha * 0.55))
      grad.addColorStop(0.60, A(baseAlpha * 0.85))
      grad.addColorStop(0.86, A(baseAlpha))
      grad.addColorStop(0.97, A(baseAlpha * 0.35))
      grad.addColorStop(1.00, A(0))

      ctx.beginPath()
      for (let i = 0; i <= N; i++) {
        const t = i / N
        const p = galaxyPoint(t, W, H)
        const nm = galaxyNormal(t, W, H)
        const spread = 6 + 66 * t
        const wobble = Math.sin(t * 4.5 + st.wobblePhase + time * st.wobbleSpeed) * st.wobbleAmp
        const offset = st.off * spread + wobble
        const x = p.x + nm.nx * offset
        const y = p.y + nm.ny * offset
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = grad
      ctx.lineWidth = st.width
      ctx.stroke()

      if (baseAlpha > 0.08) {
        const len = st.pulseLen
        const tp = len + ((time * st.pulseSpeed + st.pulsePhase) % (1 - len))
        const ta = tp - len

        const PS = 14
        ctx.beginPath()
        for (let k = 0; k <= PS; k++) {
          const tk = ta + (tp - ta) * (k / PS)
          const pp = this.offsetPoint(tk, st, W, H, time)
          if (k === 0) ctx.moveTo(pp.x, pp.y)
          else ctx.lineTo(pp.x, pp.y)
        }
        ctx.strokeStyle = A(baseAlpha * 0.95)
        ctx.lineWidth = st.width * 1.9
        ctx.stroke()

        const tailLen = len * 0.6
        if (ta - tailLen > 0) {
          ctx.beginPath()
          for (let k = 0; k <= PS; k++) {
            const tk = (ta - tailLen) + tailLen * (k / PS)
            const pp = this.offsetPoint(tk, st, W, H, time)
            if (k === 0) ctx.moveTo(pp.x, pp.y)
            else ctx.lineTo(pp.x, pp.y)
          }
          ctx.strokeStyle = A(baseAlpha * 0.38)
          ctx.lineWidth = st.width * 1.1
          ctx.stroke()
        }
      }
    }

    ctx.restore()
  },

  drawMainLine(ctx, W, H, time, alpha) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const N = GALAXY.samples
    const mainPulse = 0.85 + 0.15 * Math.sin(time * 0.5)

    ctx.beginPath()
    for (let i = 0; i <= N; i++) {
      const t = i / N
      const p = galaxyPoint(t, W, H)
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    ctx.strokeStyle = 'rgba(255,242,215,' + (0.16 * mainPulse * alpha).toFixed(3) + ')'
    ctx.lineWidth = 6
    ctx.stroke()

    ctx.strokeStyle = 'rgba(255,252,242,' + (0.45 * mainPulse * alpha).toFixed(3) + ')'
    ctx.lineWidth = 1.2
    ctx.stroke()

    ctx.restore()
  },

  drawDust(ctx, g, dt, time, alpha,W,H) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < g.dust.length; i++) {
      const d = g.dust[i]
      d.t += d.v * dt
      if (d.t > 1) d.t -= 1

      const p = galaxyPoint(d.t, W, H)
      const nm = galaxyNormal(d.t, W, H)
      const off = d.side * (d.spread * (0.25 + 0.75 * d.t) + Math.sin(d.t * 8 + d.ph) * 5)
      const x = p.x + nm.nx * off
      const y = p.y + nm.ny * off
      const fade = Math.min(1, Math.min(d.t / 0.10, (1 - d.t) / 0.10))
      const tw = 0.5 + 0.5 * Math.sin(time * d.sp + d.ph)
      const sz = 0.55 + 0.55 * (0.5 + 0.5 * Math.sin(time * d.szSp + d.ph))
      const size = d.r * (0.55 + 0.95 * d.t) * sz
      const a = Math.max(0, 0.18 + 0.82 * tw * fade) * alpha

      ctx.fillStyle = 'rgba(' + d.c[0] + ',' + d.c[1] + ',' + d.c[2] + ',' + (a * 0.20).toFixed(3) + ')'
      ctx.beginPath()
      ctx.arc(x, y, size * 2.6, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(' + d.c[0] + ',' + d.c[1] + ',' + d.c[2] + ',' + (a * 0.55).toFixed(3) + ')'
      ctx.beginPath()
      ctx.arc(x, y, size * 1.35, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(' + d.c[0] + ',' + d.c[1] + ',' + d.c[2] + ',' + a.toFixed(3) + ')'
      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  },

  drawLinkLine(ctx, g, anim, time, W) {
    const stars = g.stars
    const n = stars.length
    if (n < 2 || anim.lineT <= 0) return

    const totalSegs = n - 1
    const drawn = anim.lineT * totalSegs
    if (drawn < 0.02) return

    /* 随变形进度收回控制点：日历布局需要大弧，S 曲线只需要很小的弧 */
    const bendFade = Math.max(0, 1 - anim.morphT * 1.5)

    const SUB = 22
    const RX_RATIO = 0.19
    const H_SAG = 0.06
    const H_SAG_MAX = 3

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.beginPath()
    let started = false

    for (let k = 0; k < totalSegs; k++) {
      const segT = Math.max(0, Math.min(1, drawn - k))
      if (segT <= 0) break

      const a = stars[k]
      const b = stars[k + 1]
      const dx = b.curX - a.curX
      const dy = b.curY - a.curY
      const segLen = Math.sqrt(dx * dx + dy * dy)
      if (segLen < 0.5) continue

      let c1x, c1y, c2x, c2y

      const isCrossRow = Math.abs(dy) > Math.abs(dx) * 1.2

      if (isCrossRow && bendFade > 0.05) {
        /* 日历布局下的 U 形转弯：随变形逐渐收回 */
        const side = a.curX > W / 2 ? 1 : -1
        const room = side > 0 ? (W - a.curX - 4) : (a.curX - 4)
        const rx = Math.min(W * RX_RATIO, room / 0.75) * bendFade
        c1x = a.curX + rx * side
        c1y = a.curY
        c2x = b.curX + rx * side
        c2y = b.curY
      } else {
        /* S 曲线阶段：贴着两点之间的柔和切线，不会绕圈 */
        const h = Math.min(segLen * H_SAG, H_SAG_MAX) * bendFade
        c1x = a.curX + dx * 0.33
        c1y = a.curY + dy * 0.33 + h
        c2x = a.curX + dx * 0.67
        c2y = a.curY + dy * 0.67 + h
      }

      const steps = Math.max(4, Math.ceil(SUB * segT))
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * segT
        const mt = 1 - t
        const x = mt * mt * mt * a.curX + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * b.curX
        const y = mt * mt * mt * a.curY + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * b.curY
        if (!started) { ctx.moveTo(x, y); started = true }
        else ctx.lineTo(x, y)
      }
    }

    if (!started) { ctx.restore(); return }

    ctx.strokeStyle = 'rgba(255,210,140,0.40)'
    ctx.lineWidth = 3.2
    ctx.stroke()

    ctx.strokeStyle = 'rgba(255,242,210,0.94)'
    ctx.lineWidth = 1.1
    ctx.stroke()

    ctx.restore()
  },

  drawAllStars(ctx, g, time, anim) {
    const stars = g.stars
    const n = stars.length
    const totalSegs = Math.max(1, n - 1)

    for (let i = 0; i < n; i++) {
      const s = stars[i]

      /* 被线碰到时闪一下 */
      let flash = 0
      if (anim.lineT > 0) {
        const litAt = i / totalSegs
        const since = anim.lineT - litAt
        if (since >= 0 && since < 0.4) {
          flash = Math.exp(-since * 14)
        }
      }

      this.drawDataStarAt(ctx, s, time, s.curX, s.curY, flash)
    }
  },

  drawDataStarAt(ctx, s, time, x, y, flash) {
    const tw = 0.86 + 0.14 * Math.sin(time * s.tw + s.ph)
    const baseSize = s.size * (0.96 + 0.06 * Math.sin(time * s.tw + s.ph))
    const size = baseSize * (1 + flash * 0.70)
    const alpha = Math.min(1, s.a * tw + flash * 1.0)
    const rgb = s.c
    const fontPx = Math.max(9, Math.round(size * 1.4))

    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    /* 光晕 */
    ctx.globalCompositeOperation = 'lighter'
    ctx.font = Math.round(fontPx * 1.45) + 'px sans-serif'
    ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (alpha * (0.10 + flash * 0.3)).toFixed(3) + ')'
    ctx.fillText('✦', x, y)

    ctx.font = Math.round(fontPx * 1.16) + 'px sans-serif'
    ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (alpha * (0.26 + flash * 0.3)).toFixed(3) + ')'
    ctx.fillText('✦', x, y)

    /* 本体 */
    ctx.globalCompositeOperation = 'source-over'
    ctx.font = fontPx + 'px sans-serif'
    ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha.toFixed(3) + ')'
    ctx.fillText('✦', x, y)

    /* 白心 */
    ctx.font = Math.round(fontPx * 0.28) + 'px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,' + (alpha * (0.55 + flash * 0.4)).toFixed(3) + ')'
    ctx.fillText('✦', x, y)

    ctx.restore()
  },

  offsetPoint(t, st, W, H, time) {
    const p = galaxyPoint(t, W, H)
    const nm = galaxyNormal(t, W, H)
    const spread = 6 + 66 * t
    const wobble = Math.sin(t * 4.5 + st.wobblePhase + time * st.wobbleSpeed) * st.wobbleAmp
    const offset = st.off * spread + wobble
    return { x: p.x + nm.nx * offset, y: p.y + nm.ny * offset }
  },

  closeGalaxy() {
    this.stopGalaxy()
    this.galaxyClickMeteors = []
    this.galaxyCtx = null
    this.galaxyCanvas = null
    this.galaxyData = null
    this._galaxyErr = 0
    this._galaxyAnim = null
    this.setData({ galaxyShow: false })
    wx.showTabBar({ animation: false })  
  },

  goReport() {
    wx.setStorageSync('open_report', true)
    wx.switchTab({ url: '/pages/read/read' })
  }
})