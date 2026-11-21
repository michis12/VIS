import { useId } from 'react'

/** 240° arc gauge for a 0–99 score, chrome fill on a dark track. */
export function ScoreGauge({ score, size = 180, label, sub }: { score: number; size?: number; label?: string; sub?: string }) {
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
  const frac = Math.max(0, Math.min(1, score / 99))
  const end = START + SWEEP * frac
  const [kx, ky] = pt(end)
  return (
    <svg width={size} height={size * 0.82} viewBox="0 6 200 164" className="gauge" role="img" aria-label={`Wochenscore ${score} von 99`}>
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
      <text x="100" y="104" textAnchor="middle" className="gauge-num">{score}</text>
      {label && <text x="100" y="128" textAnchor="middle" className="gauge-label">{label}</text>}
      {sub && <text x="100" y="146" textAnchor="middle" className="gauge-sub">{sub}</text>}
    </svg>
  )
}
