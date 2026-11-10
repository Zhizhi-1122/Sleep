const store = require('../../utils/store.js')
const quotes = require('../../utils/quotes.js')
const theme = require('../../utils/theme.js')
const app = getApp()
const settings = require('../../utils/settings.js')

/* ───────── 小工具 ───────── */
function pad(n) { return n < 10 ? '0' + n : '' + n }
function lerp(a, b, t) { return a + (b - a) * t }
function ease(t) { return t * t * (3 - 2 * t) }
function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')' }
function mixArr(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t))
  ]
}
function mixRgb(a, b, t) {
  const c = mixArr(a, b, t)
  return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'
}

const NIGHT_TOP = [8, 14, 28]
const NIGHT_BOT = [20, 31, 60]
const DAY_TOP = [186, 216, 236]
const DAY_BOT = [247, 239, 226]

/* ───────── 月相 ───────── */
const SYNODIC = 29.530588853
const KNOWN_NEW = Date.UTC(2000, 0, 6, 18, 14)

function moonPhase(date) {
  const days = (date.getTime() - KNOWN_NEW) / 86400000
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC
  return age / SYNODIC
}

function phaseName(p) {
  if (p < 0.03 || p > 0.97) return '新月'
  if (p < 0.22) return '蛾眉月'
  if (p < 0.28) return '上弦月'
  if (p < 0.47) return '盈凸月'
  if (p < 0.53) return '满月'
  if (p < 0.72) return '亏凸月'
  if (p < 0.78) return '下弦月'
  return '残月'
}

function wakeOffset(ts) {
  const d = new Date(ts)
  let m = d.getHours() * 60 + d.getMinutes() - 18 * 60
  if (m < 0) m += 1440
  return m
}

const P_COLORS = [
  [240, 201, 135],
  [255, 246, 221],
  [200, 220, 255],
  [255, 255, 255]
]

Page({
  data: {
    navTop: 20,
    weather: 'clear',
    isDay: false,
    intro: true,
    dateText: '',
    greeting: '',
    subtitle: '',
    quote: '',
    quoteBy: '',
    phase: 0.5,
    phaseName: '',
    lastLabel: '最近一晚',
    lastValue: '',
    statusText: '',
    distText: '',
    orbStyle: '',
    moonLabelStyle: '',
    hintStyle: '',
    showHint: false,
    toastText: '',
    toastShow: false,
    canUndo: false,
    reasonShow: false,
    reasonOptions: [],
    reasonCustom: '',
    wakeAnomaly: { show: false, sleepText: '', rawText: '', manualText: '07:00' }
  },

  onLoad() {
    this.meteors = []
    this.particles = []
    this.ripples = []
    this.pageScrollTop = 0
    this.sunT = null
    this._undoId = null
    this._ready = false

    const today = new Date()
    const key = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate())
    const isFirstToday = wx.getStorageSync('intro_day') !== key
    wx.setStorageSync('intro_day', key)

    const savedWeather = wx.getStorageSync('sky_weather')

    // 首帧前只写一次数据，减少渲染层的压力
    this.setData({
      navTop: app.globalData.statusBarHeight || 20,
      intro: isFirstToday,
      weather: savedWeather || 'clear'
    })
  },

  onReady() {
    this._ready = true
    this.refresh()
    this.initSky()
  },

  onShow() {
    if (!this._ready) return
    this.refresh()
    if (this.ctx) this.startLoop()
  },

  onHide() { this.stopLoop() },

  onUnload() {
    this.stopLoop()
    clearTimeout(this._toastTimer)
    clearTimeout(this._hintTimer)
  },

  onPageScroll(e) { this.pageScrollTop = e.scrollTop || 0 },

  /* ───────── 画布初始化 ───────── */
  initSky() {
    this.stopLoop()
    this.trySky(0)
  },

  trySky(n) {
    wx.createSelectorQuery()
      .in(this)
      .select('#sky')
      .fields({ node: true, size: true })
      .exec(res => {
        try {
          const item = res && res[0]
          if (!item || !item.node) {
            console.warn('[sky] 第' + (n + 1) + '次：拿不到节点')
            if (n < 10) setTimeout(() => this.trySky(n + 1), 150)
            else console.error('[sky] 放弃：始终拿不到 canvas 节点')
            return
          }

          let W = item.width
          let H = item.height
          let info = null
          try {
            info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
          } catch (e) {}

          if (!(W > 50) || !(H > 50)) {
            W = (info && info.windowWidth) || 375
            H = (info && info.windowHeight) || 700
            console.warn('[sky] 节点尺寸异常，改用窗口尺寸', W, H)
          }

          const dpr = (info && info.pixelRatio) || 2
          const canvas = item.node
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            console.error('[sky] getContext 返回空')
            return
          }

          canvas.width = Math.round(W * dpr)
          canvas.height = Math.round(H * dpr)
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

          this.canvas = canvas
          this.ctx = ctx
          this.hasEllipse = typeof ctx.ellipse === 'function'
          this.t0 = Date.now()

          console.log('[sky] ok', Math.round(W), Math.round(H), 'dpr', dpr, 'ellipse', this.hasEllipse)

          this.buildScene(Math.round(W), Math.round(H))

          const mx = Math.round(W * 0.80)
          const my = Math.round(H * 0.19)
          const r = Math.max(26, W * 0.085)

          this.setData({
            orbStyle: 'left:' + (mx - 38) + 'px;top:' + (my - 38) + 'px;',
            moonLabelStyle: 'left:' + (mx - 26) + 'px;top:' + Math.round(my + r + 8) + 'px;',
            hintStyle: 'left:' + (mx - 38) + 'px;top:' + Math.round(my + r + 38) + 'px;'
          })

          if (!wx.getStorageSync('moon_hint')) {
            this.setData({ showHint: true })
            this._hintTimer = setTimeout(() => {
              this.setData({ showHint: false })
              wx.setStorageSync('moon_hint', 1)
            }, 2600)
          }

          this.startLoop()
        } catch (err) {
          console.error('[sky] 初始化异常：', err && err.message, err)
        }
      })
  },

  /* 生成整片天空的素材（星星、雾、云、雨、鸟、太阳月亮位置） */
  buildScene(W, H) {
    const stars = []
    const n = Math.max(60, Math.min(110, Math.round(W * H / 7000)))
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.96,
        r: Math.random() * 1.3 + 0.35,
        a: Math.random() * 0.5 + 0.22,
        ph: Math.random() * Math.PI * 2,
        tw: Math.random() * 1.4 + 0.5
      })
    }

    const fog = []
    for (let i = 0; i < 5; i++) {
      fog.push({
        x: Math.random() * W,
        y: H * (0.32 + Math.random() * 0.55),
        r: Math.max(20, (0.36 + Math.random() * 0.3) * W),
        vx: (3 + Math.random() * 5) * (Math.random() < 0.5 ? 1 : -1),
        a: 0.03 + Math.random() * 0.035
      })
    }

    const clouds = []
    for (let i = 0; i < 6; i++) {
      const puffs = []
      const pn = 3 + Math.floor(Math.random() * 2)
      for (let j = 0; j < pn; j++) {
        puffs.push({
          dx: (Math.random() - 0.5) * 1.8,
          dy: (Math.random() - 0.5) * 0.45,
          r: 0.45 + Math.random() * 0.5
        })
      }
      clouds.push({
        x: Math.random() * W,
        y: H * (0.05 + Math.random() * 0.32),
        r: Math.max(30, (0.13 + Math.random() * 0.15) * W),
        vx: (5 + Math.random() * 9) * (Math.random() < 0.5 ? 1 : -1),
        a: 0.5 + Math.random() * 0.3,
        ph: Math.random() * Math.PI * 2,
        sp: 0.25 + Math.random() * 0.35,
        puffs
      })
    }

    const drops = []
    for (let i = 0; i < 90; i++) {
      drops.push({
        x: Math.random() * W,
        y: Math.random() * H,
        len: 8 + Math.random() * 14,
        v: 320 + Math.random() * 280
      })
    }

    const birds = []
    for (let i = 0; i < 3; i++) {
      birds.push({
        x: Math.random() * W,
        y: H * (0.08 + Math.random() * 0.24),
        vx: -(16 + Math.random() * 16),
        s: 5 + Math.random() * 4,
        ph: Math.random() * Math.PI * 2
      })
    }

    this.scene = {
      W, H, stars, fog, clouds, drops, birds,
      moon: { x: W * 0.80, y: H * 0.19, r: Math.max(26, W * 0.085) },
      sun: { x: W * 0.80, y: H * 0.20, r: Math.max(22, W * 0.07) }
    }
  },

  startLoop() {
    if (this._looping || !this.canvas) return
    this._looping = true
    this.lastT = Date.now()
    const step = () => {
      if (!this._looping) return
      this.drawFrame()
      this._raf = this.canvas.requestAnimationFrame(step)
    }
    this._raf = this.canvas.requestAnimationFrame(step)
  },

  stopLoop() {
    this._looping = false
    if (this.canvas && this._raf) {
      try { this.canvas.cancelAnimationFrame(this._raf) } catch (e) {}
    }
  },

  drawFrame() {
    if (!this.scene) return
    try {
      this.paint()
    } catch (e) {
      if (!this._paintErr) {
        this._paintErr = 1
        console.error('[sky] 绘制报错：', (e && e.message) || e)
      }
    }
  },

  paint() {
    const s = this.scene
    const ctx = this.ctx
    const W = s.W, H = s.H
    const now = Date.now()
    const t = (now - this.t0) / 1000
    let dt = (now - (this.lastT || now)) / 1000
    this.lastT = now
    if (dt > 0.06) dt = 0.06
    if (dt < 0) dt = 0

    let k
    if (this.sunT != null) {
      this.sunT += dt / 1.5
      if (this.sunT >= 1) { this.sunT = null; k = 1 } else k = ease(this.sunT)
    } else {
      k = this.data.isDay ? 1 : 0
    }

    const rainTarget = this.data.weather === 'rain' ? 1 : 0
    this.rain = this.rain == null
      ? rainTarget
      : this.rain + (rainTarget - this.rain) * Math.min(1, dt * 3)
    const rain = this.rain

    ctx.clearRect(0, 0, W, H)

    /* 星星 */
    const starAlpha = 1 - k
    if (starAlpha > 0.01) {
      for (let i = 0; i < s.stars.length; i++) {
        const st = s.stars[i]
        const tw = 0.5 + 0.5 * Math.sin(t * st.tw + st.ph)
        const a = st.a * tw * starAlpha * (1 - rain * 0.8)
        if (a <= 0.012) continue
        ctx.globalAlpha = a
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    /* 月亮 */
    if (starAlpha > 0.01) {
      this.drawMoon(ctx, s.moon, starAlpha * (1 - rain * 0.4), this.data.phase)
    }

    /* 太阳 */
    if (k > 0.01) {
      let sy = s.sun.y
      if (this.sunT != null) {
        const p = Math.max(0, Math.min(1, (this.sunT - 0.12) / 0.88))
        sy = lerp(H * 0.62, s.sun.y, ease(p))
      }
      this.drawSun(ctx, s.sun.x, sy, s.sun.r, k)
    }

    /* 雾 */
    for (let i = 0; i < s.fog.length; i++) {
      const f = s.fog[i]
      f.x += f.vx * dt
      if (f.vx > 0 && f.x - f.r > W) f.x = -f.r
      if (f.vx < 0 && f.x + f.r < 0) f.x = W + f.r

      const col = mixArr([150, 176, 240], [255, 255, 255], k)
      const alpha = f.a * (1 + rain * 0.8) * (1 - k * 0.35)
      if (alpha <= 0.004) continue

      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r)
      g.addColorStop(0, rgba(col, alpha))
      g.addColorStop(1, rgba(col, 0))
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill()
    }

    /* 云：晴天白云和原来完全一样；下雨时白云退去，换成淡灰 / 蓝灰的柔边雨云 */
    for (let i = 0; i < s.clouds.length; i++) {
      const c = s.clouds[i]
      c.x += c.vx * dt
      if (c.vx > 0 && c.x - c.r * 2 > W) c.x = -c.r * 2
      if (c.vx < 0 && c.x + c.r * 2 < 0) c.x = W + c.r * 2

      const pulse = 0.62 + 0.38 * Math.sin(t * c.sp + c.ph)
      const whiteA = 0.30 * k * pulse * (1 - rain * 0.88)
      const rainA = c.a * rain * pulse
      if (rainA < 0.008 && whiteA < 0.008) continue

      const rc = mixArr([92, 104, 132], [150, 158, 172], k)

      for (let j = 0; j < c.puffs.length; j++) {
        const pf = c.puffs[j]
        const px = c.x + pf.dx * c.r
        const py = c.y + pf.dy * c.r
        const pr = Math.max(6, pf.r * c.r)

        if (whiteA > 0.008) {
          const g2 = ctx.createRadialGradient(px, py, 0, px, py, pr)
          g2.addColorStop(0, 'rgba(255,255,255,' + whiteA.toFixed(3) + ')')
          g2.addColorStop(0.6, 'rgba(255,255,255,' + (whiteA * 0.6).toFixed(3) + ')')
          g2.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.fillStyle = g2
          ctx.beginPath()
          ctx.arc(px, py, pr, 0, Math.PI * 2)
          ctx.fill()
        }

        if (rainA > 0.008) {
          const bigR = pr * 1.35
          const g = ctx.createRadialGradient(px, py, 0, px, py, bigR)
          g.addColorStop(0, rgba(rc, rainA * 0.42))
          g.addColorStop(0.45, rgba(rc, rainA * 0.22))
          g.addColorStop(0.78, rgba(rc, rainA * 0.06))
          g.addColorStop(1, rgba(rc, 0))
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(px, py, bigR, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    
    /* 飞鸟 */
    if (k > 0.25) {
      for (let i = 0; i < s.birds.length; i++) {
        const b = s.birds[i]
        b.x += b.vx * dt
        if (b.x < -40) b.x = W + 40
        const wf = 0.45 + 0.55 * Math.sin(t * 3 + b.ph)
        ctx.strokeStyle = 'rgba(72,96,130,' + (0.34 * k) + ')'
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(b.x - b.s, b.y + b.s * 0.4 * wf)
        ctx.quadraticCurveTo(b.x - b.s * 0.4, b.y - b.s * 0.35 * wf, b.x, b.y)
        ctx.quadraticCurveTo(b.x + b.s * 0.4, b.y - b.s * 0.35 * wf, b.x + b.s, b.y + b.s * 0.4 * wf)
        ctx.stroke()
      }
    }

    /* 自动流星 */
    if (k < 0.2 && rain < 0.25 && Math.random() < 0.0028) {
      this.meteors.push(this.makeMeteor(
        W * (0.1 + Math.random() * 0.8),
        H * (0.02 + Math.random() * 0.2),
        1
      ))
    }

    /* 流星（自动 + 点击） */
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const mt = this.meteors[i]
      mt.x += mt.vx * dt
      mt.y += mt.vy * dt
      mt.life -= dt * mt.decay
      if (mt.life <= 0 || mt.y > H + 60) {
        this.meteors.splice(i, 1)
        continue
      }
      const tx = mt.x - mt.vx * mt.trail
      const ty = mt.y - mt.vy * mt.trail
      const lg = ctx.createLinearGradient(mt.x, mt.y, tx, ty)
      lg.addColorStop(0, 'rgba(255,255,255,' + (0.85 * mt.life) + ')')
      lg.addColorStop(0.35, 'rgba(200,220,255,' + (0.38 * mt.life) + ')')
      lg.addColorStop(1, 'rgba(200,220,255,0)')
      ctx.strokeStyle = lg
      ctx.lineWidth = 1.6
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(mt.x, mt.y)
      ctx.lineTo(tx, ty)
      ctx.stroke()

      ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * mt.life) + ')'
      ctx.beginPath()
      ctx.arc(mt.x, mt.y, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }

    /* 涟漪 */
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rp = this.ripples[i]
      rp.r += (rp.maxR - rp.r) * Math.min(1, dt * 6)
      rp.life -= dt * 1.5
      if (rp.life <= 0) { this.ripples.splice(i, 1); continue }
      ctx.beginPath()
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2)
      ctx.strokeStyle = rp.day
      ? 'rgba(255,246,220,' + (0.5 * rp.life) + ')'
      : 'rgba(240,201,135,' + (0.55 * rp.life) + ')'
      ctx.lineWidth = 1.6 * rp.life
      ctx.stroke()
    }

    /* 星屑 */
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 0.94
      p.vy = p.vy * 0.94 + 26 * dt
      p.life -= dt * p.decay
      if (p.life <= 0) { this.particles.splice(i, 1); continue }
      const c = p.c
      const a = Math.max(0, p.life)

      ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a * 0.18) + ')'
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2); ctx.fill()

      ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
    }

    /* 雨 */
    if (rain > 0.02) {
      ctx.strokeStyle = 'rgba(178,205,255,' + (0.34 * rain) + ')'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i < s.drops.length; i++) {
        const d = s.drops[i]
        d.y += d.v * dt
        if (d.y > H + 20) { d.y = -20; d.x = Math.random() * W }
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x - 2.5, d.y + d.len)
      }
      ctx.stroke()
    }
  },

  drawMoon(ctx, m, dim, phase) {
    const x = m.x, y = m.y, r = m.r
    const p = phase == null ? 0.5 : phase

    const glow = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 5.5)
    glow.addColorStop(0, 'rgba(255,246,221,' + (0.26 * dim) + ')')
    glow.addColorStop(0.4, 'rgba(240,201,135,' + (0.09 * dim) + ')')
    glow.addColorStop(1, 'rgba(240,201,135,0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(x, y, r * 5.5, 0, Math.PI * 2); ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,' + (0.055 * dim) + ')'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()

    const body = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, Math.max(1, r * 0.1), x, y, r * 1.15)
    body.addColorStop(0, 'rgba(255,253,244,' + (0.97 * dim) + ')')
    body.addColorStop(1, 'rgba(242,217,164,' + (0.93 * dim) + ')')

    if (!this.hasEllipse) {
      ctx.fillStyle = body
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
      return
    }

    const kk = Math.cos(p * 2 * Math.PI)
    const waxing = p < 0.5
    const rx = Math.max(r * Math.abs(kk), 0.01)

    ctx.save()
    ctx.beginPath()
    if (waxing) {
      ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, false)
      ctx.ellipse(x, y, rx, r, 0, Math.PI / 2, -Math.PI / 2, kk > 0)
    } else {
      ctx.arc(x, y, r, Math.PI / 2, -Math.PI / 2, false)
      ctx.ellipse(x, y, rx, r, 0, -Math.PI / 2, Math.PI / 2, kk > 0)
    }
    ctx.closePath()
    ctx.fillStyle = body
    ctx.fill()
    ctx.restore()
  },

  drawSun(ctx, x, y, r, k) {
    const glow = ctx.createRadialGradient(x, y, Math.max(1, r * 0.3), x, y, r * 6)
    glow.addColorStop(0, 'rgba(255,246,214,' + (0.55 * k) + ')')
    glow.addColorStop(0.35, 'rgba(255,226,160,' + (0.22 * k) + ')')
    glow.addColorStop(1, 'rgba(255,226,160,0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(x, y, r * 6, 0, Math.PI * 2); ctx.fill()

    const body = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, Math.max(1, r * 0.1), x, y, r * 1.1)
    body.addColorStop(0, 'rgba(255,255,255,' + (0.98 * k) + ')')
    body.addColorStop(1, 'rgba(255,238,196,' + (0.95 * k) + ')')
    ctx.fillStyle = body
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  },

  makeMeteor(x, y, sc) {
    const s = sc == null ? 1 : sc
    return {
      x, y,
      vx: (Math.random() < 0.5 ? -1 : 1) * (150 + Math.random() * 110) * s,
      vy: (210 + Math.random() * 120) * s,
      life: 1,
      decay: 0.95,
      trail: 0.5 + Math.random() * 0.3
    }
  },

  /* ───────── 交互 ───────── */
  eventPos(e) {
    if (e && e.detail && typeof e.detail.x === 'number') {
      return { x: e.detail.x, y: e.detail.y - (this.pageScrollTop || 0) }
    }
    return null
  },

  onSkyTap(e) {
    const pos = this.eventPos(e)
    if (!pos) return

    if (this.data.isDay) {
      // 白天没有流星，只有一圈柔和的光
      this.ripples.push({ x: pos.x, y: pos.y, r: 0, maxR: 54, life: 1, day: true })
      return
    }

    this.meteors.push(this.makeMeteor(pos.x, pos.y, 0.9))
    this.ripples.push({ x: pos.x, y: pos.y, r: 0, maxR: 44, life: 1 })
  },

  burst(x, y) {
    if (x == null || y == null) return
    const n = 22
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.5
      const sp = 90 + Math.random() * 170
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 1,
        decay: 1.1 + Math.random() * 0.9,
        r: 1 + Math.random() * 2.2,
        c: P_COLORS[Math.floor(Math.random() * P_COLORS.length)]
      })
    }
    this.ripples.push({ x, y, r: 0, maxR: 70, life: 1 })
  },

  showMsg(text, ms) {
    this.setData({ toastText: text, toastShow: true })
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => {
      this.setData({ toastShow: false, canUndo: false })
    }, ms || 1900)
  },

  toggleWeather() {
    const next = this.data.weather === 'rain' ? 'clear' : 'rain'
    this.setData({ weather: next })
    wx.setStorageSync('sky_weather', next)
    if (this.data.isDay) {
      this.showMsg(next === 'rain' ? '飘起了雨。' : '云散了。')
    } else {
      this.showMsg(next === 'rain' ? '下雨了。' : '云散开了。')
    }
  },

  /* ───────── 数据 ───────── */
  refresh() {
    const now = new Date()
    const list = store.getRecords()
    const res = theme.resolve(list, now.getTime())
    const isDay = res.mode === 'day'
    const openValid = !!res.open && !res.stale
    const nights = store.nights(list)
    const last = nights.length ? nights[nights.length - 1] : null

    const week = '日一二三四五六'[now.getDay()]
    const h = now.getHours()

    let greeting = '夜深了'
    if (h >= 5 && h < 11) greeting = '早安'
    else if (h >= 11 && h < 14) greeting = '午安'
    else if (h >= 14 && h < 18) greeting = '下午好'
    else if (h >= 18 && h < 23) greeting = '晚上好'
    if (openValid && !isDay) greeting = '晚安'

    let subtitle = isDay ? '今天，也慢慢来。' : '今晚，也允许自己早点休息。'
    if (openValid && !isDay) subtitle = '睡吧，天亮了再叫你。'
    if (res.stale) subtitle = '昨晚好像忘记点醒来了。'

    const q = quotes.pickDaily(isDay ? quotes.MORNING : quotes.EVENING, now)
    const phase = moonPhase(now)

    const lastLabel = isDay ? '最近一早' : '最近一晚'
    let lastValue = ''
    if (last) {
      lastValue = isDay
        ? store.fmtTime(last.wakeAt) + ' 苏醒 · 睡了 ' + store.fmtDur(last.durationMin)
        : store.fmtTime(last.sleepAt) + ' 入睡 · 睡了 ' + store.fmtDur(last.durationMin)
    } else {
      lastValue = isDay ? '还没有记录，今天从早安开始。' : '还没有记录，今夜是第一晚'
    }

    let statusText = ''
    if (openValid) {
      statusText = isDay
        ? '你在 ' + store.fmtTime(res.open.sleepAt) + ' 记下了一觉。'
        : '你在 ' + store.fmtTime(res.open.sleepAt) + ' 说了晚安。'
    }

    this.setData({
      isDay,
      greeting,
      subtitle,
      dateText: now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' +
                now.getDate() + ' 日 · 星期' + week,
      quote: q.t,
      quoteBy: q.by || '',
      phase,
      phaseName: isDay ? '' : phaseName(phase),
      lastLabel,
      lastValue,
      statusText,
      distText: this.buildDist(nights, isDay)
    })

    this.applyTabBar(isDay)
  },

  buildDist(nights, isDay) {
    if (nights.length < 2) return isDay ? '今天，从早安开始' : '今夜，是第一晚'

    const a = nights[nights.length - 2]
    const b = nights[nights.length - 1]
    const va = isDay ? wakeOffset(a.wakeAt) : store.bedOffset(a.sleepAt)
    const vb = isDay ? wakeOffset(b.wakeAt) : store.bedOffset(b.sleepAt)
    const d = vb - va
    const word = isDay ? '苏醒' : '入睡'

    if (Math.abs(d) <= 2) return '距上次' + word + ' 几乎相同'
    return '距上次' + word + (d < 0 ? ' 提前 ' : ' 延迟 ') + store.fmtGap(d)
  },

  applyTabBar(isDay) {
    wx.setTabBarStyle({
      backgroundColor: isDay ? '#f5eee4' : '#080e1c',
      color: isDay ? '#8a97a8' : '#5f6f8f',
      selectedColor: isDay ? '#c08a3e' : '#f0c987',
      borderStyle: isDay ? 'white' : 'black'
    })
  },

  onSleep(e) {
    const pos = this.eventPos(e)
    const open = store.getOpen(store.getRecords())
    if (open) { this.showMsg('先点「我醒了」，结束上一晚'); return }

    if (pos) this.burst(pos.x, pos.y)
    const res = store.startSleep()
    if (!res.ok) { this.showMsg('今晚已经打过卡了'); return }

    this.refresh()

    if (settings.isLateNight(res.record.sleepAt)) {
      this._lateId = res.record.id
      this.setData({
        reasonShow: true,
        reasonCustom: '',
        reasonOptions: [
          '学业压力', '工作压力', '在赶一个 deadline',
          '刷手机停不下来', '追剧或打游戏', '情感纠结',
          '情绪低落或焦虑', '身体不舒服', '环境因素',
          '单纯睡不着', '说不清'
        ]
      })
      return
    }

    this.showMsg(quotes.pickDaily(quotes.EVENING_TOAST, new Date()))
  },

  onWake(e) {
    const pos = this.eventPos(e)
    const res = store.endSleep()

    if (!res.ok && res.reason === 'too_long') {
      if (pos) this.burst(pos.x, pos.y)
      const raw = res.rawDur
      const h = Math.floor(raw / 60), m = raw % 60
      this.setData({
        wakeAnomaly: {
          show: true,
          id: res.record.id,
          sleepText: store.fmtTime(res.record.sleepAt),
          rawText: h + ' 小时' + (m ? ' ' + m + ' 分钟' : ''),
          manualText: '07:00'
        }
      })
      return
    }

    if (!res.ok) { this.showMsg('先点「我睡了」'); return }
    if (pos) this.burst(pos.x, pos.y)

    const nightBed = theme.isNightBed(res.record.sleepAt)
    const nowDay = theme.isDayClock(new Date())

    if (nowDay && nightBed) {
      // 昨晚睡的，今早醒来 → 日出
      this.sunT = 0
      this.refresh()
      this.showMsg(quotes.pickDaily(quotes.MORNING_TOAST, new Date()))
    } else if (!nowDay) {
      // 还是半夜 → 不假装天亮
      if (pos) this.ripples.push({ x: pos.x, y: pos.y, r: 0, maxR: 90, life: 1 })
      this.showMsg('天还黑着，再睡会儿也可以。')
      this.refresh()
    } else {
      // 白天午睡醒来 → 安静记下
      this.refresh()
      this.showMsg('记下了。')
    }

    if (res.record.durationMin < store.MIN_NIGHT_MIN) {
      this._undoId = res.record.id
      this.setData({ canUndo: true })
      this.showMsg('这一觉很短 · 点此撤销', 6000)
    }
  },

  pickReason(e) {
    const i = Number(e.currentTarget.dataset.i)
    this.saveReason(this.data.reasonOptions[i])
  },

  onReasonInput(e) {
    this.setData({ reasonCustom: e.detail.value })
  },

  submitReason() {
    const v = (this.data.reasonCustom || '').trim()
    this.saveReason(v || '说不清')
  },

  saveReason(text) {
    if (this._lateId) {
      const list = store.getRecords()
      const rec = list.find(r => r.id === this._lateId)
      if (rec) {
        rec.lateReason = text
        store.setRecords(list)
      }
    }
    this._lateId = null
    this.setData({ reasonShow: false, reasonCustom: '' })
    this.showMsg('晚安，好梦。')
  },

  closeReason() {
    this._lateId = null
    this.setData({ reasonShow: false, reasonCustom: '' })
    this.showMsg(quotes.pickDaily(quotes.EVENING_TOAST, new Date()))
  },

  /* ── 忘记点醒 ── */
  anomalyForgot() {
    const a = this.data.wakeAnomaly
    const list = store.getRecords()
    const rec = list.find(r => r.id === a.id)
    if (!rec) { this.closeAnomaly(); return }
    store.closeSleep(a.id, rec.sleepAt + 8 * 3600 * 1000)
    this.closeAnomaly()
    this.refresh()
    this.showMsg('已按 8 小时补上')
  },

  onAnomalyManual(e) {
    this.setData({
      wakeAnomaly: Object.assign({}, this.data.wakeAnomaly, { manualText: e.detail.value })
    })
  },

  anomalyManual() {
    const a = this.data.wakeAnomaly
    const list = store.getRecords()
    const rec = list.find(r => r.id === a.id)
    if (!rec) { this.closeAnomaly(); return }

    const m = settings.textToMin(a.manualText)
    const s = new Date(rec.sleepAt)
    const w = new Date(
      s.getFullYear(), s.getMonth(), s.getDate(),
      Math.floor(m / 60), m % 60, 0, 0
    )
    if (w.getTime() <= rec.sleepAt) w.setDate(w.getDate() + 1)

    const span = Math.round((w.getTime() - rec.sleepAt) / 60000)
    if (span <= 0 || span > store.MAX_SLEEP_MIN) {
      wx.showToast({ title: '这个时间不太对，再试试', icon: 'none' })
      return
    }

    store.closeSleep(a.id, w.getTime())
    this.closeAnomaly()
    this.refresh()
    this.showMsg('已按你填的时间记录')
  },

  anomalyDiscard() {
    const a = this.data.wakeAnomaly
    if (a.id) store.removeRecord(a.id)
    this.closeAnomaly()
    this.refresh()
    this.showMsg('这一晚已移除')
  },

  closeAnomaly() {
    this.setData({ wakeAnomaly: { show: false, sleepText: '', rawText: '', manualText: '07:00' } })
  },

  onUndo() {
    if (!this.data.canUndo || !this._undoId) return
    store.removeRecord(this._undoId)
    this._undoId = null
    this.setData({ canUndo: false })
    this.showMsg('已撤销')
    this.refresh()
  },

  goStats() { wx.switchTab({ url: '/pages/stats/stats' }) }
})