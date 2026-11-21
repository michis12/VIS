/** Draws the shareable profile dashboard (1080 x 1350, story/feed friendly) onto a canvas. */

export interface ShareData {
  name: string
  avatar?: string
  rank: string
  stars: number
  maxStars: number
  since?: string
  kpis: { label: string; value: string; unit?: string }[]
  top: { name: string; stars: number; svg: string }[]
  months: { label: string; value: number }[]
}

const W = 1080
const H = 1350
const FONT = '-apple-system, "SF Pro Display", "Segoe UI Variable Display", "Segoe UI", Inter, system-ui, sans-serif'

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = src
  })

function chrome(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.3, '#c7c7cc')
  g.addColorStop(0.5, '#8e8e93')
  g.addColorStop(0.72, '#e5e5ea')
  g.addColorStop(1, '#aeaeb2')
  return g
}

function glassPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 36) {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fillStyle = 'rgba(255,255,255,0.055)'
  ctx.fill()
  const edge = ctx.createLinearGradient(x, y, x + w, y + h)
  edge.addColorStop(0, 'rgba(255,255,255,0.32)')
  edge.addColorStop(0.45, 'rgba(255,255,255,0.06)')
  edge.addColorStop(1, 'rgba(255,255,255,0.18)')
  ctx.strokeStyle = edge
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

function background(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  // soft light blobs as radial gradients (canvas `filter` is unreliable in iOS Safari)
  const spots: [number, number, number, number, number][] = [
    [180, 160, 620, 199, 0.55],
    [960, 640, 560, 142, 0.45],
    [880, 80, 360, 242, 0.35],
    [140, 1220, 560, 99, 0.6],
  ]
  for (const [x, y, r, v, a] of spots) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(${v},${v},${v + 5},${a})`)
    g.addColorStop(0.5, `rgba(${v},${v},${v + 5},${a * 0.35})`)
    g.addColorStop(1, `rgba(${v},${v},${v + 5},0)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  ctx.fillStyle = 'rgba(0,0,0,0.42)'
  ctx.fillRect(0, 0, W, H)
}

function stars(ctx: CanvasRenderingContext2D, cx: number, y: number, n: number, size = 22) {
  const gap = 6
  const total = 5 * size + 4 * gap
  let x = cx - total / 2
  for (let i = 0; i < 5; i++) {
    const s = new Path2D('M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8Z')
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(size / 24, size / 24)
    ctx.fillStyle = i < n ? '#f2f2f7' : '#3a3a3c'
    ctx.fill(s)
    ctx.restore()
    x += size + gap
  }
}

export async function renderShareCard(d: ShareData): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  background(ctx)
  const PAD = 72

  // ---- header: avatar, name, rank
  const AV = 176
  const ax = PAD, ay = 84
  ctx.save()
  ctx.beginPath(); ctx.arc(ax + AV / 2, ay + AV / 2, AV / 2 + 6, 0, Math.PI * 2)
  ctx.strokeStyle = chrome(ctx, ax, ay, ax + AV, ay + AV); ctx.lineWidth = 4; ctx.stroke()
  ctx.beginPath(); ctx.arc(ax + AV / 2, ay + AV / 2, AV / 2, 0, Math.PI * 2); ctx.clip()
  if (d.avatar) {
    ctx.drawImage(await loadImage(d.avatar), ax, ay, AV, AV)
  } else {
    ctx.fillStyle = '#1c1c1e'; ctx.fillRect(ax, ay, AV, AV)
    ctx.fillStyle = chrome(ctx, ax, ay, ax + AV, ay + AV)
    ctx.font = `800 70px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(d.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase(), ax + AV / 2, ay + AV / 2 + 4)
  }
  ctx.restore()

  const tx = ax + AV + 44
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#8e8e93'
  ctx.font = `600 26px ${FONT}`
  ctx.letterSpacing = '5px'
  ctx.fillText('RANG', tx, ay + 40)
  ctx.letterSpacing = '0px'
  ctx.font = `800 76px ${FONT}`
  ctx.fillStyle = chrome(ctx, tx, ay + 40, tx + 520, ay + 130)
  ctx.fillText(d.rank, tx, ay + 118)
  ctx.font = `650 38px ${FONT}`
  ctx.fillStyle = '#f5f5f7'
  ctx.fillText(d.name, tx, ay + 170)
  ctx.font = `500 26px ${FONT}`
  ctx.fillStyle = '#a1a1a6'
  ctx.fillText(`${d.stars} / ${d.maxStars} Sterne${d.since ? ' · seit ' + d.since : ''}`, tx, ay + 212)

  // ---- KPI grid 3 x 2
  const gy = 360, gap = 20
  const cw = (W - PAD * 2 - gap * 2) / 3, ch = 170
  d.kpis.slice(0, 6).forEach((k, i) => {
    const x = PAD + (i % 3) * (cw + gap)
    const y = gy + Math.floor(i / 3) * (ch + gap)
    glassPanel(ctx, x, y, cw, ch, 30)
    ctx.fillStyle = '#8e8e93'
    ctx.font = `650 21px ${FONT}`
    ctx.letterSpacing = '3px'
    ctx.fillText(k.label.toUpperCase(), x + 26, y + 46)
    ctx.letterSpacing = '0px'
    ctx.fillStyle = '#ffffff'
    ctx.font = `750 64px ${FONT}`
    ctx.fillText(k.value, x + 26, y + 126)
    if (k.unit) {
      const vw = ctx.measureText(k.value).width
      ctx.fillStyle = '#a1a1a6'
      ctx.font = `550 26px ${FONT}`
      ctx.fillText(k.unit, x + 26 + vw + 8, y + 126)
    }
  })

  // ---- top achievements
  const ty = 760
  glassPanel(ctx, PAD, ty, W - PAD * 2, 300)
  ctx.fillStyle = '#8e8e93'
  ctx.font = `650 21px ${FONT}`
  ctx.letterSpacing = '3px'
  ctx.fillText('TOP ACHIEVEMENTS', PAD + 32, ty + 50)
  ctx.letterSpacing = '0px'
  const slot = (W - PAD * 2) / 3
  for (let i = 0; i < d.top.length && i < 3; i++) {
    const a = d.top[i]
    const cx = PAD + slot * i + slot / 2
    try {
      const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(a.svg))
      ctx.drawImage(img, cx - 64, ty + 72, 128, 128)
    } catch { /* medal is decoration */ }
    ctx.textAlign = 'center'
    ctx.fillStyle = '#f5f5f7'
    ctx.font = `700 30px ${FONT}`
    ctx.fillText(a.name, cx, ty + 236)
    stars(ctx, cx, ty + 252, a.stars, 22)
    ctx.textAlign = 'left'
  }

  // ---- monthly workouts
  const my = 1090, mh = 170
  ctx.fillStyle = '#8e8e93'
  ctx.font = `650 21px ${FONT}`
  ctx.letterSpacing = '3px'
  ctx.fillText('WORKOUTS · LETZTE 12 MONATE', PAD, my + 20)
  ctx.letterSpacing = '0px'
  const max = Math.max(1, ...d.months.map((m) => m.value))
  const bw = (W - PAD * 2) / d.months.length
  d.months.forEach((m, i) => {
    const h = Math.max(4, (m.value / max) * (mh - 70))
    const x = PAD + i * bw + 8
    const y = my + mh - 24 - h
    ctx.beginPath()
    ctx.roundRect(x, y, bw - 16, h, [8, 8, 2, 2])
    ctx.fillStyle = chrome(ctx, x, y, x + bw, y + h)
    ctx.fill()
    ctx.fillStyle = '#636366'
    ctx.font = `600 20px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(m.label, x + (bw - 16) / 2, my + mh + 6)
    ctx.textAlign = 'left'
  })

  // ---- footer wordmark
  ctx.textAlign = 'right'
  ctx.font = `600 34px ${FONT}`
  ctx.letterSpacing = '10px'
  ctx.fillStyle = chrome(ctx, W - 260, H - 70, W - PAD, H - 40)
  ctx.fillText('VIS', W - PAD + 10, H - 48)
  ctx.letterSpacing = '0px'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#636366'
  ctx.font = `500 22px ${FONT}`
  ctx.fillText('Training · Fortschritt · Körper', PAD, H - 52)

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild fehlgeschlagen'))), 'image/png'))
}
