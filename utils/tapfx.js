// 点击光圈 · 星图 / 枕边共用
// 参数取自 index.js 的 paint()：日 54px / 夜 44px、667ms、线宽由粗到细
let seq = 0

function pointOf(e) {
  if (e.changedTouches && e.changedTouches.length) {
    const t = e.changedTouches[0]
    return { x: t.clientX, y: t.clientY }
  }
  if (e.touches && e.touches.length) {
    const t = e.touches[0]
    return { x: t.clientX, y: t.clientY }
  }
  if (e.detail && typeof e.detail.x === 'number') {
    return { x: e.detail.x, y: e.detail.y }
  }
  return null
}

function fire(page, e, isDay) {
  const p = pointOf(e)
  if (!p) return

  const maxR = isDay ? 54 : 44
  const id = ++seq

  const item = {
    id: id,
    x: Math.round(p.x),
    y: Math.round(p.y),
    size: maxR * 2,
    day: !!isDay
  }

  page.setData({ tapFx: (page.data.tapFx || []).concat([item]) })

  setTimeout(function () {
    const cur = (page.data.tapFx || []).filter(function (o) { return o.id !== id })
    page.setData({ tapFx: cur })
  }, 720)
}

module.exports = { fire: fire }