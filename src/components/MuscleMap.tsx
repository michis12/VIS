import { useMemo, useState } from 'react'
import { isRealSet } from '../lib'
import { useStore } from '../store'

/**
 * Anatomical front/back figure. Only the left half is drawn; the right half is
 * the same paths mirrored (translate(120) scale(-1,1)), so the figure stays
 * perfectly symmetric. Each muscle path glows brighter (chrome) the more sets
 * its group got. Group names match the `muscle` field of exercises.
 */
// Athletic V-taper (proportions taken from a reference anatomy chart): broad
// shoulders, narrow waist, full arms with hands, knees, calves and feet.
const SILHOUETTE =
  'M60 4 C54 4 50.5 8.5 50.5 15 C50.5 21 52 26 55 29.5 L56 33 C52 36 47 38.5 43 40 ' +
  'C37 41.5 32.5 42.5 29.5 45.5 C26.5 48.5 25.6 53 25 58 C24.2 64 23.8 70 23.2 76 ' +
  'C22.6 81 22 85 21.6 89 C21 95 21.4 101 22.4 108 C23.2 114 23.8 119 24 123 ' +
  'C23.2 127 22.6 131 24.2 134 C25.6 135.5 27.6 134.6 28.2 132.4 L28.8 128 ' +
  'C29.2 124 28.6 120 28.6 116 C29.2 110 30.2 104 31 98 C31.6 93 32 89 32.6 85 ' +
  'C33.4 79 35 72 36.6 66 C37.4 70 38.4 76 39.6 82 C41.2 88 43.2 92 43.6 97 ' +
  'C43.8 102 42.8 106 41.6 110 C40 115 38.6 120 37.6 126 C36.4 134 36 142 36.6 150 ' +
  'C37.2 156 38.6 161 39.8 165 C38.4 170 37 175 37 181 C37.4 190 39.4 198 41.2 206 ' +
  'C40 212 36 218 31.6 223 C30 225 30.6 228 33 228.6 C37 229 41 228.8 44.6 227.4 ' +
  'C46.6 226.4 46.8 224 46.4 221 C46 216 46.6 211 47.4 206 C48.6 198 50.2 190 50.6 182 ' +
  'C50.8 176 50.4 170 50.8 165 C52.6 158 54.6 150 55.8 142 C56.8 135 57.8 128 58.6 122 L60 119 Z'

type Region = { group: string; d: string }

const FOREARM = 'M22.6 88 C25.4 86.2 29.4 86.2 31.8 88.4 C31.2 96 29.4 106 27.6 116 C26.6 118.2 24.8 118.4 23.6 116.8 C22.4 108 21.6 98 22.6 88 Z'

const FRONT: Region[] = [
  // deltoid
  { group: 'Schultern', d: 'M43 40.5 C38 41.8 33 42.8 29.8 45.6 C27 48.4 25.8 52.6 25.4 57.6 C27.2 60.6 29.8 61.6 32.6 60.6 C34 55 36.6 49.6 40.6 45.4 C41.8 43.8 42.6 42 43 40.5 Z' },
  // pectoral
  { group: 'Brust', d: 'M44.6 42.6 C49.6 41.4 55 41.6 59.4 42.8 L59.4 58.6 C55.6 62.4 48.6 62.8 43.4 59.6 C39.6 57.2 37.8 53 38.6 49.4 C40 46.4 42 44.2 44.6 42.6 Z' },
  // biceps
  { group: 'Bizeps', d: 'M26 60.6 C28.6 62.6 31.6 63 33.6 62 C34.4 67.6 34 74.6 32.6 80.6 C31 83 28 83.2 25.8 81.4 C24.4 75 24.4 67.6 26 60.6 Z' },
  { group: 'Unterarme', d: FOREARM },
  // abs (rectus blocks)
  { group: 'Bauch', d: 'M51.4 63.4 L58.8 63.4 L58.8 71 L51.4 71.8 Z' },
  { group: 'Bauch', d: 'M51.2 73.4 L58.8 72.6 L58.8 80.8 L51.2 81.4 Z' },
  { group: 'Bauch', d: 'M51.2 83 L58.8 82.4 L58.8 91 L51.4 91.4 Z' },
  { group: 'Bauch', d: 'M51.6 93 L58.8 92.6 L58.8 106 C55.6 104.6 53 100.6 51.6 93 Z' },
  // obliques / serratus
  { group: 'Bauch', d: 'M42.6 62.6 C45.4 65 48 68 49.4 72 L49.6 98 C46.6 98.6 44.4 95.6 43.4 91 C42 82 41.6 72 42.6 62.6 Z' },
  // quadriceps
  { group: 'Beine', d: 'M42.4 112.6 C47 110.4 52.6 112 56.6 117.6 C58 128 56.8 144 53.6 157 C51.6 162.8 47.4 164.2 44 160.4 C40.2 152 38.4 138 38.8 126 C39.2 120.4 40.4 116 42.4 112.6 Z' },
  // adductor
  { group: 'Beine', d: 'M56.6 119 C58.4 124 59.4 130 59.4 136 L57.4 142 C56.4 134 56 126 56.6 119 Z' },
  // tibialis / calf (front view)
  { group: 'Waden', d: 'M40.4 170 C43.4 167.8 46.6 168.4 49 172 C49.6 182 48.6 194 46.8 204 C45.2 206.4 43 206 41.8 203.2 C39.6 192 39.2 180 40.4 170 Z' },
]

const BACK: Region[] = [
  // trapezius
  { group: 'Nacken', d: 'M55.8 32 C51 36.4 45 38.8 39.6 40.6 C46 42.4 52 46 55.8 52 C57.6 56 59 60.4 59.6 64.6 L59.6 31.4 Z' },
  // rear deltoid
  { group: 'Schultern', d: 'M43 40.5 C38 41.8 33 42.8 29.8 45.6 C27 48.4 25.8 52.6 25.4 57.6 C27.2 60.6 29.8 61.6 32.6 60.6 C34 56 35.8 51.4 38.2 47.4 C39.6 44.8 41.4 42.6 43 40.5 Z' },
  // latissimus (the V)
  { group: 'Rücken', d: 'M38.6 50 C44.6 50.6 51 54.6 55.6 61 L59.4 70 L59.4 96 C54 94.6 48.6 90.8 45 85 C42.2 79 39 66 37.8 58 C37.8 55 38 52.4 38.6 50 Z' },
  // lower back (erectors)
  { group: 'Rücken', d: 'M51.6 97.4 C54.4 98.6 57.2 99.2 59.4 99.4 L59.4 113.6 C55.4 112 52.4 107.8 51.6 102 Z' },
  // triceps
  { group: 'Trizeps', d: 'M26 58 C28.8 58 32 59.2 34 62 C34.4 69.8 33.6 77 31.8 82.6 C30 84.6 27.4 84.4 25.8 82.2 C24.4 74 24.4 65.6 26 58 Z' },
  { group: 'Unterarme', d: FOREARM },
  // glute
  { group: 'Beine', d: 'M41.6 110.4 C47.6 107.8 55 109.6 59.4 114 L59.4 130.6 C55.4 134.6 47.8 134.8 43 130.4 C39.8 124.6 39.6 116.2 41.6 110.4 Z' },
  // hamstrings
  { group: 'Beine', d: 'M39.8 135.8 C44.8 134 51.4 134.4 55.8 138 C56.6 148 55 158 52.6 164 C49.8 166.2 45.6 166 43.2 163.6 C40.2 155 38.8 145 39.8 135.8 Z' },
  // gastrocnemius
  { group: 'Waden', d: 'M38.6 171 C43 167 48.6 168.6 50.4 177 C50.6 187 48.8 195 45.8 200.6 C43.6 201 41.4 198.6 40.2 194.6 C38 186 37.6 178 38.6 171 Z' },
]

const PERIODS = [{ days: 7, label: '7 Tage', full: 12 }, { days: 30, label: '30 Tage', full: 45 }]
const MIRROR = 'translate(120 0) scale(-1 1)'

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
    return v > 0 ? `rgba(238,238,242,${(0.18 + 0.78 * v).toFixed(2)})` : 'rgba(255,255,255,0.06)'
  }

  const half = (regions: Region[]) =>
    regions.map((r, i) => (
      <path
        key={i}
        d={r.d}
        fill={fill(r.group)}
        stroke={sel === r.group ? '#fff' : '#050505'}
        strokeWidth={sel === r.group ? 0.9 : 0.7}
        strokeLinejoin="round"
        className="mm-region"
        onClick={() => setSel(sel === r.group ? null : r.group)}
      />
    ))

  const figure = (regions: Region[], title: string) => (
    <div className="mm-fig">
      <svg viewBox="16 0 88 234" role="img" aria-label={`Muskeln ${title}`} shapeRendering="geometricPrecision">
        <g>
          {/* outline first, then the fills on top – hides the seam where the halves meet */}
          <path d={SILHOUETTE} fill="none" stroke="#2e2e31" strokeWidth="1.4" />
          <path d={SILHOUETTE} fill="none" stroke="#2e2e31" strokeWidth="1.4" transform={MIRROR} />
          <path d={SILHOUETTE} fill="#151517" />
          <path d={SILHOUETTE} fill="#151517" transform={MIRROR} />
          {half(regions)}
          <g transform={MIRROR}>{half(regions)}</g>
        </g>
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
