// 睡眠人格 · KMeans 聚类
// 特征：[入睡偏移(min), 睡眠时长(min)]，标准化后聚类
const TYPES = [
  { key: 0, name: '晨光型',     desc: '早睡早起，像跟着太阳走。',       color: '#ffd9a0' },
  { key: 1, name: '节律型',     desc: '入睡时间稳定，身体有准点。',     color: '#f0c987' },
  { key: 2, name: '轻眠型',     desc: '睡得浅、时长偏短，夜里容易醒。', color: '#a99bc4' },
  { key: 3, name: '潮汐型',     desc: '作息随日子起伏，时早时晚。',     color: '#8fb8d8' },
  { key: 4, name: '夜航型',     desc: '习惯在深夜才靠岸。',             color: '#7d93ad' },
  { key: 5, name: '报复性夜猫', desc: '白天被占满，夜里舍不得睡。',     color: '#c9a0d8' }
]

function pad(n) { return n < 10 ? '0' + n : '' + n }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
function mean(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0 }
function std(a) {
  if (a.length < 2) return 0
  const m = mean(a); let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m)
  return Math.sqrt(s / a.length)
}

// 一小时一分不差地转成文字
function durText(min) {
  min = Math.round(min)
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h <= 0) return m + ' 分钟'
  if (m < 5) return h + ' 小时'
  return h + ' 小时 ' + m + ' 分钟'
}
function clockText(off) {
  const total = ((18 * 60 + Math.round(off)) % 1440 + 1440) % 1440
  return pad(Math.floor(total / 60)) + ':' + pad(total % 60)
}

// 简化版 kmeans，固定种子，保证同数据同结果（答辩时能复现）
function kmeans(points, k, iters) {
  k = Math.min(k, points.length)
  const n = points.length
  const centroids = [points[0].slice()]
  while (centroids.length < k) {
    let best = 0, bestD = -1
    for (let i = 0; i < n; i++) {
      let dmin = Infinity
      for (let c = 0; c < centroids.length; c++) {
        const d = dist2(points[i], centroids[c])
        if (d < dmin) dmin = d
      }
      if (dmin > bestD) { bestD = dmin; best = i }
    }
    centroids.push(points[best].slice())
  }
  const assign = new Array(n).fill(0)
  for (let it = 0; it < (iters || 18); it++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      let bi = 0, bd = Infinity
      for (let c = 0; c < centroids.length; c++) {
        const d = dist2(points[i], centroids[c])
        if (d < bd) { bd = d; bi = c }
      }
      if (assign[i] !== bi) { assign[i] = bi; moved = true }
    }
    for (let c = 0; c < centroids.length; c++) {
      let sx = 0, sy = 0, cnt = 0
      for (let i = 0; i < n; i++) {
        if (assign[i] === c) { sx += points[i][0]; sy += points[i][1]; cnt++ }
      }
      if (cnt) { centroids[c][0] = sx / cnt; centroids[c][1] = sy / cnt }
    }
    if (!moved) break
  }
  return { centroids: centroids, assign: assign }
}
function dist2(a, b) { return (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) }

function analyze(records) {
  const list = (records || []).filter(function (r) { return r && r.sleepAt && r.durationMin > 0 })
  const n = list.length
  if (n < 3) {
    return { ready: false, total: n, need: 3 - n }
  }

  // 入睡偏移：以 18:00 为原点，跨零点继续累加
  function off(ts) {
    const d = new Date(ts)
    let m = d.getHours() * 60 + d.getMinutes() - 18 * 60
    if (m < 0) m += 1440
    return m
  }
  const beds = list.map(function (r) { return off(r.sleepAt) })
  const durs = list.map(function (r) { return r.durationMin })
  const wakes = list.map(function (r) { return (off(r.sleepAt) + r.durationMin) % 1440 })

  const bm = mean(beds), dm = mean(durs)
  const bsd = std(beds), dsd = std(durs)

  // 标准化
  const z = function (v, m, s) { return s > 1e-6 ? (v - m) / s : 0 }
  const pts = list.map(function (_, i) { return [z(beds[i], bm, bsd), z(durs[i], dm, dsd)] })

  const k = n >= 12 ? 3 : n >= 6 ? 2 : 1
  const km = kmeans(pts, k)

  // 最大簇
  const count = new Array(km.centroids.length).fill(0)
  for (let i = 0; i < km.assign.length; i++) count[km.assign[i]]++
  let dom = 0
  for (let c = 1; c < count.length; c++) if (count[c] > count[dom]) dom = c

  // 主簇样本的真实均值
  const idxs = []
  for (let i = 0; i < km.assign.length; i++) if (km.assign[i] === dom) idxs.push(i)
  const use = idxs.length ? idxs : list.map(function (_, i) { return i })
  const bedAvg = mean(use.map(function (i) { return beds[i] }))
  const durAvg = mean(use.map(function (i) { return durs[i] }))
  const lateRate = use.filter(function (i) { return beds[i] >= 360 }).length / use.length
  const reasonRate = use.filter(function (i) { return !!list[i].lateReason }).length / use.length

  let type = TYPES[3]
  if (bedAvg <= 210 && durAvg >= 360) type = TYPES[0]
  else if (bedAvg >= 480 && (reasonRate >= 0.35 || lateRate >= 0.6)) type = TYPES[5]
  else if (bedAvg >= 420) type = TYPES[4]
  else if (bsd <= 50 && durAvg >= 390) type = TYPES[1]
  else if (durAvg < 390 && bsd <= 80) type = TYPES[2]
  else type = TYPES[3]

  const regPct = clamp(Math.round(100 - (bsd / 180) * 100), 5, 99)

  const distribution = []
  for (let c = 0; c < km.centroids.length; c++) {
    const ids = []
    for (let i = 0; i < km.assign.length; i++) if (km.assign[i] === c) ids.push(i)
    if (!ids.length) continue
    distribution.push({
      pct: Math.round(ids.length / n * 100),
      bed: clockText(mean(ids.map(function (i) { return beds[i] }))),
      dur: durText(mean(ids.map(function (i) { return durs[i] })))
    })
  }
  distribution.sort(function (a, b) { return b.pct - a.pct })

  return {
    ready: true,
    total: n,
    name: type.name,
    desc: type.desc,
    color: type.color,
    key: type.key,
    avgBedLabel: clockText(bm),
    avgWakeLabel: clockText(mean(wakes)),
    avgDurLabel: durText(dm),
    regPct: regPct,
    bedSd: Math.round(bsd),
    k: km.centroids.length,
    distribution: distribution,
    types: TYPES
  }
}

module.exports = { analyze: analyze, TYPES: TYPES, durText: durText, clockText: clockText }