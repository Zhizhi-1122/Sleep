const KEY = 'sleep_records'
const DAY = 86400000
const MIN_NIGHT_MIN = 20      // 少于 20 分钟视为误触
const MAX_SLEEP_MIN = 16 * 60 // 超过 16 小时视为异常（忘记点醒）

function pad(n) { return n < 10 ? '0' + n : '' + n }

function getRecords() {
  const list = wx.getStorageSync(KEY) || []
  return list.slice().sort((a, b) => a.sleepAt - b.sleepAt)
}
function setRecords(list) { wx.setStorageSync(KEY, list) }

function getOpen(list) {
  const l = list || getRecords()
  return l.find(r => r.sleepAt && !r.wakeAt) || null
}

function startSleep(extra) {
  const list = getRecords()
  if (getOpen(list)) return { ok: false, reason: 'open' }
  const rec = Object.assign({
    id: 'n' + Date.now(), sleepAt: Date.now(), wakeAt: null,
    durationMin: null, mood: '', diary: '', lateReason: ''
  }, extra || {})
  list.push(rec)
  setRecords(list)
  return { ok: true, record: rec }
}

// 超过 16 小时不自动写入，返回 too_long 交给页面处理
function endSleep(extra) {
  const list = getRecords()
  const open = getOpen(list)
  if (!open) return { ok: false, reason: 'none' }

  const now = Date.now()
  const dur = Math.max(0, Math.round((now - open.sleepAt) / 60000))

  if (dur > MAX_SLEEP_MIN) {
    return { ok: false, reason: 'too_long', record: open, rawDur: dur }
  }

  open.wakeAt = now
  open.durationMin = dur
  Object.assign(open, extra || {})
  setRecords(list)
  return { ok: true, record: open }
}

// 指定醒来时间，强行关闭一条未结束的记录
function closeSleep(id, wakeAt, extra) {
  const list = getRecords()
  const rec = list.find(r => r.id === id) || getOpen(list)
  if (!rec) return { ok: false, reason: 'none' }
  rec.wakeAt = wakeAt
  rec.durationMin = Math.max(0, Math.round((wakeAt - rec.sleepAt) / 60000))
  Object.assign(rec, extra || {})
  setRecords(list)
  return { ok: true, record: rec }
}

function removeRecord(id) {
  setRecords(getRecords().filter(r => r.id !== id))
}

function fmtTime(ms) {
  const d = new Date(ms)
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}
function fmtDur(min) {
  if (min == null) return '—'
  const h = Math.floor(min / 60), m = min % 60
  if (!h) return m + ' 分钟'
  return m ? (h + ' 小时 ' + m + ' 分钟') : (h + ' 小时')
}
function fmtGap(min) { return fmtDur(Math.abs(Math.round(min))) }

function nightKey(ts) {
  const d = new Date(ts)
  if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function bedOffset(ts) {
  const d = new Date(ts)
  let m = d.getHours() * 60 + d.getMinutes() - 18 * 60
  if (m < 0) m += 1440
  return m
}

function isAbnormal(r) {
  if (!r || !r.wakeAt) return false
  const d = r.durationMin
  return d == null || d < MIN_NIGHT_MIN || d > MAX_SLEEP_MIN
}

function isNight(r) {
  return !!(r && r.wakeAt && !isAbnormal(r))
}

// 按夜聚合：同一夜只留时长最长的那次
function nights(list) {
  const map = {}
  ;(list || getRecords()).filter(isNight).forEach(r => {
    const k = nightKey(r.sleepAt)
    if (!map[k] || r.durationMin > map[k].durationMin) map[k] = r
  })
  return Object.keys(map).sort().map(k => Object.assign({}, map[k], { nightKey: k }))
}

function anomalies(list) {
  return (list || getRecords()).filter(isAbnormal)
}

function purgeAnomalies() {
  const list = getRecords()
  const keep = list.filter(r => !isAbnormal(r))
  setRecords(keep)
  return list.length - keep.length
}

function clearAll() { wx.removeStorageSync(KEY) }

function seedDemo() {
  const list = []
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const rnd = () => Math.random()
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 2

  for (let i = 32; i >= 1; i--) {
    const night = new Date(now.getTime() - i * DAY)
    const dow = night.getDay()
    let bedMin = 23 * 60 + 20 + gauss() * 50
    if (dow === 5 || dow === 6) bedMin += 75
    if (rnd() < 0.1) bedMin += 110

    let dur = 405 + gauss() * 55
    if (dow === 0 || dow === 6) dur += 55
    dur = Math.round(Math.max(250, Math.min(620, dur)))

    const sleepAt = night.getTime() + Math.round(bedMin) * 60000
    list.push({
      id: 'demo' + i, sleepAt, wakeAt: sleepAt + dur * 60000,
      durationMin: dur, mood: '', diary: '', lateReason: ''
    })
  }
  setRecords(list)
  return list
}

module.exports = {
  MIN_NIGHT_MIN, MAX_SLEEP_MIN,
  getRecords, setRecords, getOpen, startSleep, endSleep, closeSleep, removeRecord,
  fmtTime, fmtDur, fmtGap, nightKey, bedOffset, isNight, isAbnormal, nights,
  anomalies, purgeAnomalies, clearAll, seedDemo
}