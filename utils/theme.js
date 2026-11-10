// 昼夜判断 + 「还没点醒」的特殊规则
const DAY_START = 5 * 60 + 30
const DAY_END = 18 * 60
const STALE = 16 * 3600 * 1000

function isDayClock(date) {
  const m = date.getHours() * 60 + date.getMinutes()
  return m >= DAY_START && m < DAY_END
}

// 这一次入睡，是不是发生在夜里（18:00 之后，或 5:30 之前）
function isNightBed(ts) {
  const d = new Date(ts)
  const m = d.getHours() * 60 + d.getMinutes()
  return m >= DAY_END || m < DAY_START
}

function resolve(records, nowTs) {
  const now = new Date(nowTs)
  const open = (records || []).find(r => r.sleepAt && !r.wakeAt) || null

  if (open) {
    const tooLong = nowTs - open.sleepAt >= STALE

    // 只有「夜里入睡、还没点醒、且没超时」才强制夜色。
    // 白天入睡（午睡）不改变背景，按真实时钟走。
    if (!tooLong && isNightBed(open.sleepAt)) {
      return { mode: 'night', open, stale: false, morning: isDayClock(now) }
    }

    return {
      mode: isDayClock(now) ? 'day' : 'night',
      open,
      stale: tooLong,
      morning: isDayClock(now)
    }
  }

  return {
    mode: isDayClock(now) ? 'day' : 'night',
    open: null,
    stale: false,
    morning: isDayClock(now)
  }
}

module.exports = { isDayClock, isNightBed, resolve, DAY_START, DAY_END }