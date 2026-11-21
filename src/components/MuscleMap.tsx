import { useMemo, useState } from 'react'
import { isRealSet } from '../lib'
import { useStore } from '../store'

/**
 * Anatomical front/back figure. Only the left half is drawn; the right half is
 * the same paths mirrored (translate(120) scale(-1,1)), so the figure stays
 * perfectly symmetric. Each muscle path glows brighter (chrome) the more sets
 * its group got. Group names match the `muscle` field of exercises.
 */
const SILHOUETTE =
  'M60 4 C53.5 4 49.5 9 49.5 16 C49.5 22.5 51.5 27 55 30 L55 34.5 C48 36 40.5 37.5 34.5 41 ' +
  'C28.5 44.5 26 50 25 57 L22.5 81 C21.5 91 19.5 100 17.5 110 L14.5 125 C13.5 130.5 15.5 133.5 18.5 132.5 ' +
  'L21.5 127 C23.5 117 26 107 28 97.5 L31.5 77 L33.5 92 C34 101 35.5 109 37.5 115.5 ' +
  'C35.5 126 35.5 137 36.5 149 C37.5 164 39.5 177.5 40.5 189 C41 203 40 216 41.5 226 ' +
  'L43.5 234.5 L52.5 234.5 C52.5 228 51 221 51 213.5 C51.5 199.5 53.5 186 55 170.5 L57 150 L60 141 Z'

type Region = { group: string; d: string }

const FRONT: Region[] = [
  // deltoid
  { group: 'Schultern', d: 'M34.5 41.5 C29 43.5 26.3 48.5 25.6 56 C27.8 60 30.6 61.2 33.3 60.4 C35.6 54.6 39 49.4 43 45.6 C40.4 42.6 37.6 41.4 34.5 41.5 Z' },
  // pectoral
  { group: 'Brust', d: 'M44.4 45 C49.6 42.6 54.8 42.2 59.4 43.6 L59.4 61.6 C55.4 65.6 47.6 66 42.6 62.4 C39 59 39 52.6 44.4 45 Z' },
  // biceps
  { group: 'Bizeps', d: 'M26.2 60.8 C28.8 62.6 31.4 62.8 33.2 61.8 C33.8 68.4 33 75.8 31 82.2 C29.4 84.2 27.2 84.2 25.4 82.6 C24.2 75.2 24.4 67.4 26.2 60.8 Z' },
  // forearm
  { group: 'Unterarme', d: 'M24.6 86.4 C27.2 86 29.8 86.2 31.2 87.8 C30.2 98.2 27.2 110 23.4 123.4 C21.6 124.6 19.6 124.6 18.4 123 C19 109.6 21.2 96.8 24.6 86.4 Z' },
  // abs (rectus blocks)
  { group: 'Bauch', d: 'M51.6 66.6 L58.8 66.6 L58.8 74.6 L51.6 75.6 Z' },
  { group: 'Bauch', d: 'M51.4 77.4 L58.8 76.6 L58.8 85.4 L51.4 86 Z' },
  { group: 'Bauch', d: 'M51.4 87.8 L58.8 87.2 L58.8 96.6 L51.6 97 Z' },
  { group: 'Bauch', d: 'M51.8 98.8 L58.8 98.4 L58.8 112 C55.6 110.4 53.2 106.4 51.8 98.8 Z' },
  // obliques
  { group: 'Bauch', d: 'M42.8 65.8 C45.6 69 48.4 71.6 49.6 75.6 L49.6 103.4 C46 103.4 42.8 99.6 40.8 93.6 C39.6 84.2 40.4 74 42.8 65.8 Z' },
  // quadriceps
  { group: 'Beine', d: 'M40 118.4 C44.4 116 50.4 117 56 122.2 C58 132.6 57.2 150.4 54.2 165.8 C52.2 173.8 48.2 176 45 172 C40.8 160 38 142 38.2 128 C38.4 124 39 120.6 40 118.4 Z' },
  // adductor
  { group: 'Beine', d: 'M57.4 124.6 C58.8 129 59.4 134.6 59.4 141.6 L57.6 148.4 C56.8 140 56.6 131.6 57.4 124.6 Z' },
  // tibialis / calf (front view)
  { group: 'Waden', d: 'M43 186.6 C46.2 184.4 49 185.4 50.8 190 C51 200.4 50 212 48.2 221.6 C46.4 223.6 44.4 223 43.4 220.2 C42 208.4 41.8 196.6 43 186.6 Z' },
]

const BACK: Region[] = [
  // trapezius
  { group: 'Nacken', d: 'M54.6 32 C50.4 36 44.4 38.4 38.4 41 C45 43.2 51 47.4 55 54 C57 58 59 62.6 59.6 67 L59.6 31.6 Z' },
  // rear deltoid
  { group: 'Schultern', d: 'M34.5 41.5 C29 43.5 26.3 48.5 25.6 56 C27.8 60 30.6 61.2 33.3 60.4 C34.6 55.6 36.4 50.6 38.6 46.4 C37.6 43.4 36.2 41.8 34.5 41.5 Z' },
  // latissimus
  { group: 'Rücken', d: 'M40.6 48.6 C46 49.6 51.8 54 55.6 60.4 L59.4 70 L59.4 99.6 C54 97.6 48.8 93.6 44.2 86.2 C40.2 76 38.4 61.8 40.6 48.6 Z' },
  // lower back (erectors)
  { group: 'Rücken', d: 'M52.6 100.4 C55 101.6 57.4 102.2 59.4 102.4 L59.4 117.6 C55.6 116.2 52.8 112 52.4 106.2 Z' },
  // triceps
  { group: 'Trizeps', d: 'M26 58.4 C28.8 58.4 31.6 59.4 33.8 62.2 C34 70.2 33 78 31 84.2 C29.2 86 26.8 85.6 25.2 83.2 C24 74.4 24.2 65.6 26 58.4 Z' },
  // forearm
  { group: 'Unterarme', d: 'M24.6 86.4 C27.2 86 29.8 86.2 31.2 87.8 C30.2 98.2 27.2 110 23.4 123.4 C21.6 124.6 19.6 124.6 18.4 123 C19 109.6 21.2 96.8 24.6 86.4 Z' },
  // glute
  { group: 'Beine', d: 'M41.8 116.4 C47.8 114 55 115.8 59.4 120.2 L59.4 136.4 C55.4 140.4 47.8 140.6 43 136 C39.8 130.2 39.8 122.2 41.8 116.4 Z' },
  // hamstrings
  { group: 'Beine', d: 'M40.8 142 C45.8 140.2 52 140.6 56.2 144.2 C57 156.2 55.2 168.2 53 176.2 C50.2 178.4 46.2 178.2 44 175.8 C41 165.8 39.8 153.6 40.8 142 Z' },
  // gastrocnemius
  { group: 'Waden', d: 'M41.8 184 C46 180.2 51 182 53 190 C53.2 200 51.4 208.2 48.4 214.2 C46.4 214.6 44.2 212.4 43 208.4 C41 200.2 40.8 192 41.8 184 Z' },
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
      <svg viewBox="8 0 104 240" role="img" aria-label={`Muskeln ${title}`} shapeRendering="geometricPrecision">
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
