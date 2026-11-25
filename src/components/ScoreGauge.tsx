import { t } from '../i18n'
import { useId, type ReactNode } from 'react'
import { useTween } from '../anim'

/** 240° arc gauge for a 0–99 score, chrome fill on a dark track. */
export function ScoreGauge({ score, size = 180, label }: { score: number; size?: number; label?: string }) {
  const id = useId().replace(/:/g, '')
  const r = 80
  const cx = 100
  const cy = 100
  const START = 150 // degrees, clockwise from +x
  const SWEEP = 240
  const pt = (deg: number) => {
    const a = (deg * Math.PI) / 180
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  }
  const arc = (from: number, to: number) => {
    const [x1, y1] = pt(from)
    const [x2, y2] = pt(to)
    const large = to - from > 180 ? 1 : 0
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`
  }
  const shown = useTween(score, { from: 0, ms: 900, intro: `gauge-${label ?? size}` })
  const frac = Math.max(0, Math.min(1, shown / 99))
  const end = START + SWEEP * frac
  const [kx, ky] = pt(end)
  return (
    <svg width={size} height={size * 0.74} viewBox="0 6 200 148" className="gauge" role="img" aria-label={t(`Wochenscore ${score} von 99`, `Week score ${score} of 99`)}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#8e8e93" />
          <stop offset=".45" stopColor="#e5e5ea" />
          <stop offset=".7" stopColor="#aeaeb2" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      <path d={arc(START, START + SWEEP)} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="12" strokeLinecap="round" />
      {frac > 0.005 && (
        <path d={arc(START, end)} fill="none" stroke={`url(#g${id})`} strokeWidth="12" strokeLinecap="round" className="gauge-fill" />
      )}
      {frac > 0.005 && <circle cx={kx} cy={ky} r="4" fill="#fff" />}
      <text x="100" y="108" textAnchor="middle" className="gauge-num">{Math.round(shown)}</text>
      {label && <text x="100" y="132" textAnchor="middle" className="gauge-label">{label}</text>}
    </svg>
  )
}

/** Small round score badge (workout score): chrome ring filled to score/99. */
export function ScorePill({ score: target, size = 34, animate = false }: { score: number; size?: number; animate?: boolean }) {
  const tw = useTween(target, { from: animate ? 0 : target, ms: 1000 })
  const score = Math.round(tw)
  const r = 13
  const c = 2 * Math.PI * r
  return (
    <span className="score-pill" style={{ width: size, height: size }} title={t(`Workout-Score ${score}/99`, `Workout score ${score}/99`)}>
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
        <circle cx="16" cy="16" r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="2.6" />
        <circle cx="16" cy="16" r={r} fill="none" stroke="#e5e5ea" strokeWidth="2.6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, score / 99)))} transform="rotate(-90 16 16)" />
      </svg>
      <span className="score-pill-n" style={{ fontSize: size * 0.38 }}>{score}</span>
    </span>
  )
}

/** Gauge with a caption line below it (kept outside the arc). */
export function ScoreGaugeWithSub({ sub, ...rest }: { score: number; size?: number; label?: string; sub: ReactNode }) {
  return (
    <div>
      <ScoreGauge {...rest} />
      <div className="gauge-caption">{sub}</div>
    </div>
  )
}
