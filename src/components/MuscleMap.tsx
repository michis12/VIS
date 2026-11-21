import { useMemo, useState } from 'react'
import { isRealSet } from '../lib'
import { useStore } from '../store'

/**
 * Clean, stylised front/back figure. Each region glows brighter (chrome) the
 * more sets its muscle group got in the chosen period. Muscle names match the
 * `muscle` field of exercises.
 */
type Shape =
  | { t: 'e'; cx: number; cy: number; rx: number; ry: number; rot?: number }
  | { t: 'r'; x: number; y: number; w: number; h: number; r: number }
  | { t: 'p'; d: string }

const mirror = (s: Shape): Shape => {
  if (s.t === 'e') return { ...s, cx: 120 - s.cx, rot: s.rot ? -s.rot : undefined }
  if (s.t === 'r') return { ...s, x: 120 - s.x - s.w }
  return s
}
const pair = (s: Shape) => [s, mirror(s)]

// silhouette (both views share it)
const BASE: Shape[] = [
  { t: 'e', cx: 60, cy: 18, rx: 11, ry: 13 },
  { t: 'r', x: 54, y: 28, w: 12, h: 10, r: 4 },
  { t: 'r', x: 36, y: 38, w: 48, h: 76, r: 16 },
  ...pair({ t: 'e', cx: 29, cy: 76, rx: 7.5, ry: 26, rot: 8 }),
  ...pair({ t: 'e', cx: 23, cy: 118, rx: 6, ry: 20, rot: 6 }),
  { t: 'r', x: 40, y: 104, w: 40, h: 26, r: 10 },
  ...pair({ t: 'e', cx: 50, cy: 152, rx: 10.5, ry: 30 }),
  ...pair({ t: 'e', cx: 50, cy: 205, rx: 7.5, ry: 24 }),
]

const FRONT: Record<string, Shape[]> = {
  Schultern: pair({ t: 'e', cx: 37, cy: 46, rx: 10, ry: 8.5, rot: -20 }),
  Brust: pair({ t: 'p', d: 'M46 50 Q53 45 59 47 L59 66 Q51 70 44 64 Q42 56 46 50 Z' }).map((s, i) =>
    i === 0 ? s : { t: 'p', d: 'M74 50 Q67 45 61 47 L61 66 Q69 70 76 64 Q78 56 74 50 Z' } as Shape),
  Bizeps: pair({ t: 'e', cx: 29, cy: 70, rx: 5.5, ry: 13, rot: 8 }),
  Unterarme: pair({ t: 'e', cx: 23, cy: 116, rx: 4.5, ry: 15, rot: 6 }),
  Bauch: [{ t: 'r', x: 50, y: 70, w: 20, h: 40, r: 6 }],
  Beine: pair({ t: 'e', cx: 50, cy: 148, rx: 8.5, ry: 24 }),
  Waden: pair({ t: 'e', cx: 50, cy: 204, rx: 5, ry: 16 }),
}

const BACK: Record<string, Shape[]> = {
  Nacken: [{ t: 'p', d: 'M60 32 L72 44 L60 58 L48 44 Z' }],
  Schultern: pair({ t: 'e', cx: 37, cy: 46, rx: 9, ry: 8, rot: -20 }),
  Rücken: pair({ t: 'p', d: 'M46 52 Q55 56 59 62 L59 100 Q50 96 44 84 Q41 66 46 52 Z' }).map((s, i) =>
    i === 0 ? s : { t: 'p', d: 'M74 52 Q65 56 61 62 L61 100 Q70 96 76 84 Q79 66 74 52 Z' } as Shape),
  Trizeps: pair({ t: 'e', cx: 29, cy: 70, rx: 5.5, ry: 13, rot: 8 }),
  Unterarme: pair({ t: 'e', cx: 23, cy: 116, rx: 4.5, ry: 15, rot: 6 }),
  Beine: [...pair({ t: 'e', cx: 50, cy: 114, rx: 9, ry: 9 }), ...pair({ t: 'e', cx: 50, cy: 152, rx: 8, ry: 22 })],
  Waden: pair({ t: 'e', cx: 50, cy: 200, rx: 6, ry: 15 }),
}

function draw(s: Shape, props: React.SVGProps<SVGElement>, key: string | number) {
  if (s.t === 'e')
    return <ellipse key={key} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} transform={s.rot ? `rotate(${s.rot} ${s.cx} ${s.cy})` : undefined} {...(props as React.SVGProps<SVGEllipseElement>)} />
  if (s.t === 'r') return <rect key={key} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} {...(props as React.SVGProps<SVGRectElement>)} />
  return <path key={key} d={s.d} {...(props as React.SVGProps<SVGPathElement>)} />
}

const PERIODS = [{ days: 7, label: '7 Tage', full: 12 }, { days: 30, label: '30 Tage', full: 45 }]

export function MuscleMap() {
  const { workouts, exerciseById } = useStore()
  const [p, setP] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const period = PERIODS[p]

  const sets = useMemo(() => {
    const since = new Date(Date.now() - period.days * 864e5).toISOString().slice(0, 10)
    const m = new Map<string, number>()
    for (const w of workouts) {
      if (w.status !== 'done' || w.startedAt.slice(0, 10) < since) continue
      for (const e of w.exercises) {
        const g = exerciseById.get(e.exerciseId)?.muscle
        if (g) m.set(g, (m.get(g) ?? 0) + e.sets.filter(isRealSet).length)
      }
    }
    return m
  }, [workouts, exerciseById, period.days])

  const fill = (g: string) => {
    const v = Math.min(1, (sets.get(g) ?? 0) / period.full)
    return v > 0 ? `rgba(236,236,240,${(0.14 + 0.8 * v).toFixed(2)})` : 'rgba(255,255,255,0.05)'
  }

  const figure = (regions: Record<string, Shape[]>, title: string) => (
    <div className="mm-fig">
      <svg viewBox="0 0 120 232" role="img" aria-label={`Muskeln ${title}`}>
        {BASE.map((s, i) => draw(s, { fill: '#141416' }, 'b' + i))}
        {Object.entries(regions).map(([g, shapes]) => (
          <g key={g} onClick={() => setSel(sel === g ? null : g)} className={'mm-region' + (sel === g ? ' sel' : '')}>
            {shapes.map((s, i) => draw(s, { fill: fill(g), stroke: sel === g ? '#fff' : 'rgba(0,0,0,.6)', strokeWidth: sel === g ? 1.2 : 0.8 }, i))}
          </g>
        ))}
      </svg>
      <div className="faint mm-cap">{title}</div>
    </div>
  )

  const ranked = [...sets.entries()].sort((a, b) => b[1] - a[1])
  const neglected = ['Brust', 'Rücken', 'Schultern', 'Beine', 'Bizeps', 'Trizeps', 'Bauch'].filter((g) => !sets.get(g))

  return (
    <div className="card mm">
      <div className="chips" style={{ margin: 0, padding: 0 }}>
        {PERIODS.map((x, i) => <button key={x.days} className={'chip' + (i === p ? ' on' : '')} onClick={() => setP(i)}>{x.label}</button>)}
      </div>
      <div className="mm-figs">
        {figure(FRONT, 'Vorne')}
        {figure(BACK, 'Hinten')}
      </div>
      <div className="mm-info">
        {sel ? (
          <span><b>{sel}</b> · {sets.get(sel) ?? 0} Sätze</span>
        ) : ranked.length ? (
          <span className="muted">Am meisten: <b>{ranked[0][0]}</b> ({ranked[0][1]} Sätze){neglected.length ? ` · Ohne Sätze: ${neglected.slice(0, 3).join(', ')}` : ''}</span>
        ) : (
          <span className="faint">Keine Sätze in diesem Zeitraum</span>
        )}
      </div>
      <div className="mm-legend"><span>0</span><div className="mm-scale" /><span>{period.full}+ Sätze</span></div>
    </div>
  )
}
