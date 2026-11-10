const KEY = 'notes'

const MOODS = [
  { k: 'calm',   name: '安宁', c: '#8fb8d8' },
  { k: 'warm',   name: '温柔', c: '#f0c987' },
  { k: 'tired',  name: '疲惫', c: '#a99bc4' },
  { k: 'low',    name: '低落', c: '#7d93ad' },
  { k: 'bright', name: '明亮', c: '#ffd9a0' }
]

function pad(n) { return n < 10 ? '0' + n : '' + n }

function colorOf(k) {
  for (let i = 0; i < MOODS.length; i++) if (MOODS[i].k === k) return MOODS[i].c
  return ''
}

function keyOf(ts) {
  const d = new Date(ts)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function shortOf(k) {
  const p = String(k).split('-')
  return (+p[1]) + '.' + (+p[2])
}

function validKey(k) { return /^\d{4}-\d{2}-\d{2}$/.test(String(k)) }
function todayKey() { return keyOf(Date.now()) }

function getNotes() {
  try { return wx.getStorageSync(KEY) || [] } catch (e) { return [] }
}
function setNotes(l) {
  try { wx.setStorageSync(KEY, l) } catch (e) {}
}

function addNote(text, mood, dateKey) {
  const t = (text || '').trim()
  if (!t) return null
  const now = Date.now()
  const k = validKey(dateKey) ? dateKey : keyOf(now)
  const list = getNotes()
  const note = {
    id: 'n' + now + Math.floor(Math.random() * 1000),
    dateKey: k,
    text: t,
    mood: mood || '',
    backfill: k !== keyOf(now),
    createdAt: now
  }
  list.push(note)
  setNotes(list)
  return note
}

function updateNote(id, text, mood, dateKey) {
  const list = getNotes()
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      list[i].text = (text || '').trim()
      list[i].mood = mood || ''
      if (validKey(dateKey)) {
        list[i].dateKey = dateKey
        list[i].backfill = dateKey !== keyOf(list[i].createdAt)
      }
    }
  }
  setNotes(list)
}

function removeNote(id) {
  setNotes(getNotes().filter(function (n) { return n.id !== id }))
}

function noteById(id) {
  const l = getNotes()
  for (let i = 0; i < l.length; i++) if (l[i].id === id) return l[i]
  return null
}

// 按日期分组，最新在前（dateKey 是零填充字符串，字典序即时间序）
function groups() {
  const map = {}
  getNotes().forEach(function (n) {
    if (!map[n.dateKey]) map[n.dateKey] = { dateKey: n.dateKey, items: [] }
    map[n.dateKey].items.push(n)
  })
  const arr = Object.keys(map).map(function (k) {
    const g = map[k]
    g.items.sort(function (a, b) { return b.createdAt - a.createdAt })
    g.chars = g.items.reduce(function (s, n) { return s + n.text.length }, 0)
    g.mood = g.items[0].mood || ''
    g.moodColor = colorOf(g.mood)
    let lv = 1
    if (g.mood) lv++
    if (g.chars >= 45 || g.items.length > 1) lv++
    g.level = Math.min(3, lv)
    g.preview = g.items[0].text
    g.short = shortOf(g.dateKey)
    return g
  })
  arr.sort(function (a, b) {
    if (a.dateKey < b.dateKey) return 1
    if (a.dateKey > b.dateKey) return -1
    return 0
  })
  return arr
}

// 最早的在前（藤蔓从左往右长）
function vine() { return groups().slice().reverse() }

function byKey(k) {
  const g = groups()
  for (let i = 0; i < g.length; i++) if (g[i].dateKey === k) return g[i]
  return null
}

function totalDays() { return groups().length }

module.exports = {
  MOODS: MOODS,
  getNotes: getNotes,
  addNote: addNote,
  updateNote: updateNote,
  removeNote: removeNote,
  noteById: noteById,
  groups: groups,
  vine: vine,
  byKey: byKey,
  totalDays: totalDays,
  keyOf: keyOf,
  shortOf: shortOf,
  colorOf: colorOf,
  validKey: validKey,
  todayKey: todayKey
}