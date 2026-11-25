import { t } from '../i18n'
import { easeOut, reducedMotion } from '../anim'
import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { monthLabel, shortDate } from '../lib'

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(340)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function niceTicks(min: number, max: number, count = 4) {
  if (min === max) { min -= 1; max += 1 }
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6))
  return ticks
}

export interface Pt { x: number; y: number; note?: string }
export interface Band { from: number; to: number; color: string }

export function LineChart({ points, height = 200, yFmt = (v) => String(Math.round(v)), unit = '', bands = [], dots = false }: {
  points: Pt[]; height?: number; yFmt?: (v: number) => string; unit?: string; bands?: Band[]; dots?: boolean
}) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const gid = useId().replace(/:/g, '')
  if (points.length < 2) return <div ref={ref} className="faint" style={{ padding: 20, textAlign: 'center' }}>{t('Noch zu wenig Daten', 'Not enough data yet')}</div>

  const L = 36, R = 8, T = 12, B = 24
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y)
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys))
  const y0 = ticks[0], y1 = ticks[ticks.length - 1]
  const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (width - L - R)
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0 || 1)) * (height - T - B)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('')
  const area = `${d}L${sx(x1)},${height - B}L${sx(x0)},${height - B}Z`

  // ~4 month ticks
  const xt: number[] = []
  const span = x1 - x0
  for (let i = 0; i <= 3; i++) xt.push(x0 + (span * i) / 3)

  const onMove = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect()
    const x = x0 + ((e.clientX - r.left - L) / (width - L - R)) * (x1 - x0)
    let best = 0
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].x - x) < Math.abs(points[best].x - x)) best = i
    setHover(best)
  }
  const hp = hover != null ? points[hover] : null

  return (
    <div className="chart" ref={ref}>
      <svg height={height} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: 'pan-y' }}>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".16" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {bands.map((b, i) => (
          <rect key={i} x={sx(Math.max(b.from, x0))} y={T} width={Math.max(0, sx(Math.min(b.to, x1)) - sx(Math.max(b.from, x0)))} height={height - T - B} fill={b.color} opacity={0.1} />
        ))}
        <g className="grid">{ticks.map((t) => <line key={t} x1={L} x2={width - R} y1={sy(t)} y2={sy(t)} />)}</g>
        <g className="axis">
          {ticks.map((t) => <text key={t} x={L - 8} y={sy(t) + 4} textAnchor="end">{yFmt(t)}</text>)}
          {xt.map((t, i) => <text key={i} x={sx(t)} y={height - 6} textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}>{span > 200 * 864e5 ? monthLabel(new Date(t)) : shortDate(new Date(t).toISOString())}</text>)}
        </g>
        <path d={area} fill={`url(#${gid})`} />
        <path d={d} fill="none" stroke="#e5e5ea" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {dots && points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.5} fill="#e5e5ea" />)}
        {hp && (
          <g>
            <line x1={sx(hp.x)} x2={sx(hp.x)} y1={T} y2={height - B} stroke="rgba(255,255,255,.25)" />
            <circle cx={sx(hp.x)} cy={sy(hp.y)} r={5} fill="#fff" stroke="#000" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hp && (
        <div className="tooltip" style={{ left: Math.min(Math.max(sx(hp.x), 60), width - 60), top: sy(hp.y) - 6 }}>
          <b>{yFmt(hp.y)}{unit && ' ' + unit}</b>
          <div className="faint">{shortDate(new Date(hp.x).toISOString())} {new Date(hp.x).getFullYear()}{hp.note ? ' · ' + hp.note : ''}</div>
        </div>
      )}
    </div>
  )
}

/**
 * Heights that grow in on first show and glide from old to new values. When the
 * bars themselves change (other weeks / months, e.g. a new range), they grow
 * fresh from 0 instead: old heights belong to other bars and another scale.
 */
function useBarTween(values: number[], layout: string) {
  const [shown, setShown] = useState<number[]>(() => (reducedMotion() ? values : values.map(() => 0)))
  const cur = useRef<number[]>(shown)
  const lastLayout = useRef(layout)
  const fresh = lastLayout.current !== layout
  const key = values.join('|') + '#' + layout
  useEffect(() => {
    const restart = lastLayout.current !== layout
    lastLayout.current = layout
    if (reducedMotion()) { cur.current = values; setShown(values); return }
    const from = values.map((_, i) => (restart ? 0 : cur.current[i] ?? 0))
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 600)
      const e = easeOut(k)
      const next = values.map((v, i) => from[i] + (v - from[i]) * e)
      cur.current = next
      setShown(next)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  // the render right after a layout change already shows empty bars (the effect runs after paint)
  return fresh && !reducedMotion() ? values.map(() => 0) : shown
}

export function BarChart({ bars, height = 160, yFmt = (v) => String(Math.round(v)), unit = '' }: {
  bars: { label: string; value: number; tip?: string }[]; height?: number; yFmt?: (v: number) => string; unit?: string
}) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const L = 32, R = 4, T = 10, B = 22
  const max = Math.max(1, ...bars.map((b) => b.value))
  const anim = useBarTween(bars.map((b) => b.value), bars.map((b) => b.label).join('|'))
  const ticks = niceTicks(0, max, 3)
  const top = ticks[ticks.length - 1]
  const slot = (width - L - R) / Math.max(1, bars.length)
  const bw = Math.max(2, slot - 2)
  const sy = (v: number) => T + (1 - v / top) * (height - T - B)
  const labelEvery = Math.ceil(bars.length / 6)
  const hb = hover != null ? bars[hover] : null

  return (
    <div className="chart" ref={ref}>
      <svg height={height} onPointerLeave={() => setHover(null)}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={L} x2={width - R} y1={sy(t)} y2={sy(t)} />)}</g>
        <g className="axis">
          {ticks.map((t) => <text key={t} x={L - 6} y={sy(t) + 4} textAnchor="end">{yFmt(t)}</text>)}
          {bars.map((b, i) => (i % labelEvery === 0 ? <text key={i} x={L + i * slot + slot / 2} y={height - 6} textAnchor="middle">{b.label}</text> : null))}
        </g>
        {bars.map((b, i) => {
          // never taller than the chart, even mid-animation
          const y = sy(Math.min(top, anim[i] ?? b.value)), h = height - B - y
          const x = L + i * slot + (slot - bw) / 2
          const r = Math.min(4, bw / 2, h)
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={L + i * slot} y={T} width={slot} height={height - T - B} fill="transparent" />
              {(anim[i] ?? b.value) > 0 && h > 0.5 && (
                <path
                  d={`M${x},${height - B}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${height - B}Z`}
                  fill={hover === i ? '#ffffff' : '#c7c7cc'}
                  opacity={hover == null || hover === i ? 1 : 0.55}
                />
              )}
            </g>
          )
        })}
      </svg>
      {hb && hover != null && (
        <div className="tooltip" style={{ left: Math.min(Math.max(L + hover * slot + slot / 2, 60), width - 60), top: sy(hb.value) - 4 }}>
          <b>{yFmt(hb.value)}{unit && ' ' + unit}</b>
          <div className="faint">{hb.tip ?? hb.label}</div>
        </div>
      )}
    </div>
  )
}
