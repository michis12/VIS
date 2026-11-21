import { useId, useMemo, useState } from 'react'
import { ACHIEVEMENTS, computeMetrics, evaluate, fmtMetric, nextRank, rankFor, ULTIMATE, type AchievementState, type Glyph } from '../achievements'
import { Sheet } from '../components/ui'
import { dateLabel, fmtInt } from '../lib'
import { useStore } from '../store'

const TIER = [
  { name: 'Gesperrt', a: '#3a3a3c', b: '#1c1c1e' },
  { name: 'Bronze', a: '#e0a47a', b: '#7a4a2a' },
  { name: 'Silber', a: '#f2f2f7', b: '#7c7c82' },
  { name: 'Gold', a: '#f6d48f', b: '#9a6b22' },
  { name: 'Platin', a: '#d9f1fa', b: '#5f8fa3' },
  { name: 'Obsidian', a: '#ffffff', b: '#2a2a2e' },
]

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const GLYPHS: Record<Glyph, React.JSX.Element> = {
  katana: <g {...P}><path d="M7 25 25 7" /><path d="M9 19l4 4" /><path d="M5 27l3-3" /></g>,
  mountain: <g {...P}><path d="M4 25 13 11l5 7 3-4 7 11Z" /><path d="M11 14l2 2 2-2" /></g>,
  axe: <g {...P}><path d="M10 26 22 8" /><path d="M17 9c3-3 8-2 9 1-3 0-5 2-6 5-3-1-4-4-3-6Z" /></g>,
  shield: <g {...P}><path d="M16 4 26 8v7c0 6-4 11-10 13C10 26 6 21 6 15V8Z" /><path d="M16 9v14" /></g>,
  anvil: <g {...P}><path d="M6 11h17c0 3 2 4 4 4-2 1-5 1-7 1l-1 4h3v3H10v-3h3l-1-4c-3 0-6-2-6-5Z" /></g>,
  helm: <g {...P}><path d="M7 25V15a9 9 0 0 1 18 0v10" /><path d="M16 6v19" /><path d="M11 17h3M18 17h3" /></g>,
  fist: <g {...P}><path d="M9 14V10a2 2 0 0 1 4 0v3M13 12V9a2 2 0 0 1 4 0v4M17 12v-2a2 2 0 0 1 4 0v4" /><path d="M21 13a2 2 0 0 1 3 1v4c0 5-3 8-8 8s-8-3-8-7v-3c0-2 2-3 4-2" /></g>,
  hourglass: <g {...P}><path d="M9 5h14M9 27h14" /><path d="M11 5c0 6 10 7 10 11s-10 5-10 11M21 5c0 6-10 7-10 11s10 5 10 11" /></g>,
  moon: <g {...P}><path d="M22 20A9 9 0 0 1 12 8a9 9 0 1 0 10 12Z" /><path d="M23 7v4M21 9h4" /></g>,
  sun: <g {...P}><circle cx="16" cy="16" r="5" /><path d="M16 4v3M16 25v3M4 16h3M25 16h3M7.5 7.5l2 2M22.5 22.5l2 2M7.5 24.5l2-2M22.5 9.5l2-2" /></g>,
  bolt: <g {...P}><path d="M18 4 8 18h7l-2 10 10-14h-7Z" /></g>,
  scroll: <g {...P}><path d="M9 7h13a3 3 0 0 1 0 6H12" /><path d="M9 7a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h13V13" /><path d="M13 17h6M13 21h6" /></g>,
  eye: <g {...P}><circle cx="16" cy="16" r="10" /><circle cx="12.5" cy="13" r="2" /><circle cx="19" cy="19" r="2.6" /><circle cx="19.5" cy="11.5" r="1" /></g>,
  lotus: <g {...P}><path d="M16 25c-4-3-5-8-0-15 5 7 4 12 0 15Z" /><path d="M16 25c-6 0-10-4-11-9 5 0 8 3 11 9ZM16 25c6 0 10-4 11-9-5 0-8 3-11 9Z" /></g>,
  flame: <g {...P}><path d="M16 4c1 5 7 7 7 14a7 7 0 0 1-14 0c0-4 2-6 4-8 0 3 1 4 3 5 1-4 0-7 0-11Z" /></g>,
  phoenix: <g {...P}><path d="M16 26c-2-4-2-8 0-12 2 4 2 8 0 12Z" /><path d="M15 15C11 9 6 9 4 10c3 2 5 5 6 8M17 15c4-6 9-6 11-5-3 2-5 5-6 8" /><path d="M16 14V9M14 7l2 2 2-2" /></g>,
  crown: <g {...P}><path d="M5 23 7 10l6 6 3-8 3 8 6-6 2 13Z" /><path d="M6 27h20" /></g>,
}

export function Medal({ glyph, stars, size = 64, ultimate = false }: { glyph: Glyph; stars: number; size?: number; ultimate?: boolean }) {
  const id = useId().replace(/:/g, '')
  const t = TIER[stars]
  const locked = stars === 0
  const hex = 'M32 3 57 17.5v29L32 61 7 46.5v-29Z'
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={'medal' + (locked ? ' locked' : '') + (ultimate ? ' ultimate' : '')}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.a} />
          <stop offset=".5" stopColor={t.b} />
          <stop offset="1" stopColor={t.a} />
        </linearGradient>
        <radialGradient id={`f${id}`} cx=".5" cy=".3" r=".8">
          <stop offset="0" stopColor={locked ? '#1c1c1e' : '#26262a'} />
          <stop offset="1" stopColor="#09090a" />
        </radialGradient>
      </defs>
      <path d={hex} fill={`url(#f${id})`} stroke={`url(#g${id})`} strokeWidth={stars === 5 ? 3.2 : 2.2} />
      {stars >= 4 && <path d="M32 9 52 20.5v23L32 55 12 43.5v-23Z" fill="none" stroke={`url(#g${id})`} strokeWidth={0.8} opacity={0.6} />}
      <g transform="translate(16 16)" style={{ color: locked ? '#48484a' : t.a }}>{GLYPHS[glyph]}</g>
    </svg>
  )
}

export function Stars({ n, size = 11 }: { n: number; size?: number }) {
  return (
    <span className="stars" aria-label={`${n} von 5 Sternen`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" className={i < n ? 'on' : ''}>
          <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8Z" />
        </svg>
      ))}
    </span>
  )
}

export function useAchievements() {
  const { workouts, weights, exercises } = useStore()
  return useMemo(() => evaluate(computeMetrics(workouts, weights, exercises)), [workouts, weights, exercises])
}

export function Profile() {
  const { workouts } = useStore()
  const list = useAchievements()
  const [open, setOpen] = useState<AchievementState | null>(null)
  const [ultOpen, setUltOpen] = useState(false)

  const total = list.reduce((n, a) => n + a.stars, 0)
  const max = ACHIEVEMENTS.length * 5
  const rank = rankFor(total)
  const nr = nextRank(total)
  const maxed = list.filter((a) => a.stars === 5).length
  const ultimate = maxed === list.length
  const first = workouts.find((w) => w.status === 'done')
  const sorted = [...list].sort((a, b) => b.stars - a.stars || b.progress - a.progress)

  return (
    <div className="screen">
      <div className="eyebrow">Profil</div>
      <h1 className="title">Ehrenhalle</h1>

      <div className="card chrome-edge rank-card">
        <div className="rank-glow" />
        <div className="eyebrow">Rang</div>
        <div className="rank-name chrome-text">{rank.name}</div>
        <div className="muted num" style={{ marginTop: 2 }}>{total} / {max} Sterne{first ? ` · dabei seit ${dateLabel(first.startedAt)}` : ''}</div>
        <div className="progress" style={{ marginTop: 14 }}><div style={{ width: `${(total / max) * 100}%` }} /></div>
        <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
          {nr ? `Noch ${nr.min - total} Sterne bis ${nr.name}` : 'Höchster Rang erreicht'}
        </div>
      </div>

      <button className={'card ult-card' + (ultimate ? ' won' : '')} onClick={() => setUltOpen(true)}>
        <Medal glyph="crown" stars={ultimate ? 5 : 0} size={78} ultimate />
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div className="eyebrow">Ultimatives Achievement</div>
          <div style={{ fontSize: 22, fontWeight: 750 }} className={ultimate ? 'chrome-text' : ''}>{ULTIMATE.name}</div>
          <div className="muted" style={{ fontSize: 13 }}>{maxed} / {list.length} Achievements gemaxt</div>
          <div className="progress" style={{ marginTop: 8 }}><div style={{ width: `${(maxed / list.length) * 100}%` }} /></div>
        </div>
      </button>

      <div className="section-title"><h2>Achievements</h2><span className="faint" style={{ fontSize: 13 }}>{list.filter((a) => a.stars > 0).length} freigeschaltet</span></div>
      <div className="ach-grid">
        {sorted.map((a) => (
          <button key={a.def.id} className={'ach' + (a.stars === 0 ? ' locked' : '')} onClick={() => setOpen(a)}>
            <Medal glyph={a.def.glyph} stars={a.stars} />
            <div className="ach-name">{a.def.name}</div>
            <Stars n={a.stars} />
            <div className="ach-bar"><div style={{ width: `${a.progress * 100}%` }} /></div>
          </button>
        ))}
      </div>

      {open && (
        <Sheet onClose={() => setOpen(null)}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Medal glyph={open.def.glyph} stars={open.stars} size={84} />
            <div>
              <h3 style={{ fontSize: 24 }}>{open.def.name}</h3>
              <Stars n={open.stars} size={16} />
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{TIER[open.stars].name}</div>
            </div>
          </div>
          <p className="muted" style={{ margin: '14px 0' }}>{open.def.desc}</p>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="num" style={{ fontSize: 26, fontWeight: 750 }}>{fmtMetric(open.value)}</span>
              <span className="faint" style={{ fontSize: 13 }}>{open.def.unit}</span>
            </div>
            {open.next != null && (
              <>
                <div className="progress" style={{ marginTop: 10 }}><div style={{ width: `${open.progress * 100}%` }} /></div>
                <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>Noch {fmtInt(open.next - open.value)} bis {open.stars + 1} {open.stars + 1 === 1 ? 'Stern' : 'Sterne'}</div>
              </>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            {open.def.tiers.map((t, i) => (
              <div key={i} className="pr-row num">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Stars n={i + 1} />
                  <span className={open.stars > i ? '' : 'faint'}>{TIER[i + 1].name}</span>
                </span>
                <span className={open.stars > i ? '' : 'faint'}>{open.stars > i ? '✓ ' : ''}{fmtInt(t)}</span>
              </div>
            ))}
          </div>
        </Sheet>
      )}

      {ultOpen && (
        <Sheet onClose={() => setUltOpen(false)}>
          <div style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
            <Medal glyph="crown" stars={ultimate ? 5 : 0} size={110} ultimate />
            <h3 style={{ fontSize: 26, marginTop: 10 }} className={ultimate ? 'chrome-text' : ''}>{ULTIMATE.name}</h3>
            <p className="muted" style={{ margin: '6px 0 16px' }}>{ULTIMATE.desc}</p>
          </div>
          {[...list].sort((a, b) => b.stars - a.stars).map((a) => (
            <div key={a.def.id} className="pr-row"><span className={a.stars === 5 ? '' : 'muted'}>{a.def.name}</span><Stars n={a.stars} /></div>
          ))}
        </Sheet>
      )}
    </div>
  )
}
