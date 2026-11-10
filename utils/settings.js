const KEY = 'user_settings'
const DEFAULTS = { earlySleep: 23 * 60 + 30, earlyWake: 7 * 60 + 30 }
const DAY_START = 5 * 60 + 30
const DAY_END = 18 * 60

function pad(n) { return n < 10 ? '0' + n : '' + n }

function getSettings() {
  let s = {}
  try { s = wx.getStorageSync(KEY) || {} } catch (e) {}
  return {
    earlySleep: typeof s.earlySleep === 'number' ? s.earlySleep : DEFAULTS.earlySleep,
    earlyWake: typeof s.earlyWake === 'number' ? s.earlyWake : DEFAULTS.earlyWake
  }
}

function setSettings(s) {
  wx.setStorageSync(KEY, { earlySleep: s.earlySleep, earlyWake: s.earlyWake })
}

function minToText(m) {
  const h = Math.floor(m / 60) % 24
  return pad(h) + ':' + pad(m % 60)
}

function textToMin(t) {
  const p = String(t).split(':')
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0)
}

function bedOffset(ts) {
  const d = new Date(ts)
  let m = d.getHours() * 60 + d.getMinutes() - 18 * 60
  if (m < 0) m += 1440
  return m
}

function standardOffset() {
  const s = getSettings()
  let t = s.earlySleep - 18 * 60
  if (t < 0) t += 1440
  return t
}

function earlyDelta(ts) {
  return bedOffset(ts) - standardOffset()
}

function isDayBed(ts) {
  const d = new Date(ts)
  const m = d.getHours() * 60 + d.getMinutes()
  return m >= DAY_START && m < DAY_END
}

// 白天入睡永远不算晚睡
function isLateNight(ts) {
  if (isDayBed(ts)) return false
  return earlyDelta(ts) > 0
}

// 白天入睡也不算「早睡」（不进统计）
function isEarlySleep(ts) {
  if (isDayBed(ts)) return false
  return !isLateNight(ts)
}

function isEarlyWake(ts) {
  const s = getSettings()
  const d = new Date(ts)
  return d.getHours() * 60 + d.getMinutes() <= s.earlyWake
}

module.exports = {
  DEFAULTS, getSettings, setSettings, minToText, textToMin,
  bedOffset, standardOffset, earlyDelta, isDayBed,
  isLateNight, isEarlySleep, isEarlyWake
}