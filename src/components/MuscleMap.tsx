import { t } from '../i18n'
import { useMemo, useState } from 'react'
import { isRealSet } from '../lib'
import { muscleLabel, musclesFor } from '../muscles'
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
  'M60 4 C54 4 50.5 8.5 50.5 15 C50.5 21 52 26 55 29.5 L56 33 C51 35.5 45 37.5 40 39 ' +
  'C34 40 29 41 26 44 C23 47.5 22.4 52.5 22 58 C21.2 64 20.8 70 20.2 76 ' +
  'C19.6 81 19 85 18.6 89 C18 95 18.4 101 19.4 108 C20.2 114 20.8 119 21 123 ' +
  'C20.2 127 19.6 131 21.2 134 C22.6 135.5 24.6 134.6 25.2 132.4 L25.8 128 ' +
  'C26.2 124 25.6 120 25.6 116 C26.2 110 27.2 104 28 98 C28.6 93 29 89 29.6 85 ' +
  'C30.4 79 32 72 34.6 65 C36.4 70 38.4 76 39.8 82 C41.4 88 43.2 92 43.6 97 ' +
  'C43.8 102 42.8 106 41.6 110 C40 115 38.6 120 37.6 126 C36.4 134 36 142 36.6 150 ' +
  'C37.2 156 38.6 161 39.8 165 C38.4 170 37 175 37 181 C37.4 190 39.4 198 41.2 206 ' +
  'C40 212 36 218 31.6 223 C30 225 30.6 228 33 228.6 C37 229 41 228.8 44.6 227.4 ' +
  'C46.6 226.4 46.8 224 46.4 221 C46 216 46.6 211 47.4 206 C48.6 198 50.2 190 50.6 182 ' +
  'C50.8 176 50.4 170 50.8 165 C52.6 158 54.6 150 55.8 142 C56.8 135 57.8 128 58.6 122 L60 119 Z'

type Region = { group: string; d: string }

const FOREARM = 'M19.6 88 C22.4 86.2 26.4 86.2 28.8 88.4 C28.2 96 26.4 106 24.6 116 C23.6 118.2 21.8 118.4 20.6 116.8 C19.4 108 18.6 98 19.6 88 Z'

const FRONT: Region[] = [
  // deltoid
  { group: 'Schultern', d: 'M41 39.4 C35 40.4 30 41.4 26.8 44.4 C24 47.4 22.8 52 22.4 57.6 C24.2 60.8 27 62 30 61 C31.6 55 34.4 49.4 38.6 45 C39.8 43.2 40.6 41.2 41 39.4 Z' },
  // pectoral
  { group: 'Brust', d: 'M43 41.8 C48.6 40.8 54.6 41.2 59.4 42.6 L59.4 58.6 C55.6 62.4 48 62.8 42.4 59.8 C37.8 57.4 35.6 53 36.4 49.2 C38 45.8 40.2 43.4 43 41.8 Z' },
  // biceps
  { group: 'Bizeps', d: 'M23 60.6 C25.6 62.6 28.6 63 30.6 62 C31.4 67.6 31 74.6 29.6 80.6 C28 83 25 83.2 22.8 81.4 C21.4 75 21.4 67.6 23 60.6 Z' },
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
  { group: 'Nacken', d: 'M55.8 32 C50.6 36 44 38.6 37.4 40.2 C44.6 42.2 51.4 46 55.6 52 C57.6 56 59 60.4 59.6 64.6 L59.6 31.4 Z' },
  // rear deltoid
  { group: 'Schultern', d: 'M41 39.4 C35 40.4 30 41.4 26.8 44.4 C24 47.4 22.8 52 22.4 57.6 C24.2 60.8 27 62 30 61 C31.4 56 33.4 51.2 36 47 C37.6 44.2 39.4 41.6 41 39.4 Z' },
  // latissimus (the V)
  { group: 'Rücken', d: 'M35.8 50 C42.6 50.6 50.4 54.6 55.6 61 L59.4 70 L59.4 96 C54 94.6 48.6 90.8 45 85 C41.6 78 37 66 35.4 58 C35.2 55 35.2 52.4 35.8 50 Z' },
  // lower back (erectors)
  { group: 'Rücken', d: 'M51.6 97.4 C54.4 98.6 57.2 99.2 59.4 99.4 L59.4 113.6 C55.4 112 52.4 107.8 51.6 102 Z' },
  // triceps
  { group: 'Trizeps', d: 'M23 58 C25.8 58 29 59.2 31 62 C31.4 69.8 30.6 77 28.8 82.6 C27 84.6 24.4 84.4 22.8 82.2 C21.4 74 21.4 65.6 23 58 Z' },
  { group: 'Unterarme', d: FOREARM },
  // glute
  { group: 'Beine', d: 'M41.6 110.4 C47.6 107.8 55 109.6 59.4 114 L59.4 130.6 C55.4 134.6 47.8 134.8 43 130.4 C39.8 124.6 39.6 116.2 41.6 110.4 Z' },
  // hamstrings
  { group: 'Beine', d: 'M39.8 135.8 C44.8 134 51.4 134.4 55.8 138 C56.6 148 55 158 52.6 164 C49.8 166.2 45.6 166 43.2 163.6 C40.2 155 38.8 145 39.8 135.8 Z' },
  // gastrocnemius
  { group: 'Waden', d: 'M38.6 171 C43 167 48.6 168.6 50.4 177 C50.6 187 48.8 195 45.8 200.6 C43.6 201 41.4 198.6 40.2 194.6 C38 186 37.6 178 38.6 171 Z' },
]

const MAIN = ['Brust', 'Rücken', 'Schultern', 'Beine', 'Bizeps', 'Trizeps', 'Bauch']
const PERIODS = [{ days: 7, get label() { return t('7 Tage', '7 days') }, full: 12 }, { days: 30, get label() { return t('30 Tage', '30 days') }, full: 45 }]
const MIRROR = 'translate(120 0) scale(-1 1)'

/** Front + back figure; `fill` colors each muscle group, tapping selects a group. */
export function MuscleFigures({ fill, sel = null, onSel }: { fill: (group: string) => string; sel?: string | null; onSel?: (g: string | null) => void }) {
  const half = (regions: Region[]) =>
    regions.map((r, i) => (
      <path
        key={i}
        d={r.d}
        fill={fill(r.group)}
        stroke={sel === r.group ? '#fff' : '#050505'}
        strokeWidth={sel === r.group ? 0.9 : 0.7}
        strokeLinejoin="round"
        className={onSel ? 'mm-region' : undefined}
        onClick={onSel ? () => onSel(sel === r.group ? null : r.group) : undefined}
      />
    ))

  const figure = (regions: Region[], title: string) => (
    <div className="mm-fig">
      <svg viewBox="12 0 96 234" role="img" aria-label={`Muskeln ${title}`} shapeRendering="geometricPrecision">
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

  return (
    <div className="mm-figs">
      {figure(FRONT, t('Vorne', 'Front'))}
      {figure(BACK, t('Hinten', 'Back'))}
    </div>
  )
}

/**
 * Exercise icon: one small figure (front or back, whichever shows the main
 * muscle) with the primary group in chrome and the secondary ones dimmer.
 */
const BACK_FIRST = ['Rücken', 'Trizeps', 'Nacken']
export function MuscleIcon({ primary, secondary = [], name = '', size = 44 }: { primary: string; secondary?: string[]; name?: string; size?: number }) {
  const n = name.toLowerCase()
  const back = BACK_FIRST.includes(primary) || (primary === 'Beine' && /deadlift|hamstring|leg curl|hip thrust|glute|good morning|nordic|kickback|pull through/.test(n))
  const regions = back ? BACK : FRONT
  const fill = (g: string) => (g === primary ? 'url(#mi-chrome)' : secondary.includes(g) ? '#6a6a70' : '#2b2b30')
  // zoom into the part of the body that matters, so the muscle is big enough to read
  const view = primary === 'Beine' || primary === 'Waden' ? '6 104 108 130' : primary === 'Bauch' ? '10 34 100 82' : '8 10 104 108'
  const half = regions.map((r, i) => <path key={i} d={r.d} fill={fill(r.group)} stroke="#050505" strokeWidth="0.8" strokeLinejoin="round" />)
  return (
    <span className="muscle-icon" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox={view} width={size - 6} height={size - 6} preserveAspectRatio="xMidYMid meet" shapeRendering="geometricPrecision">
        <defs>
          <linearGradient id="mi-chrome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" /><stop offset=".55" stopColor="#d1d1d6" /><stop offset="1" stopColor="#8e8e93" />
          </linearGradient>
        </defs>
        <path d={SILHOUETTE} fill="#1f1f23" />
        <path d={SILHOUETTE} fill="#1f1f23" transform={MIRROR} />
        {half}
        <g transform={MIRROR}>{half}</g>
      </svg>
    </span>
  )
}

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

  const ranked = [...sets.entries()].sort((a, b) => b[1] - a[1])

  // main groups you normally train but haven't for a while (≥ 8 days); secondary
  // muscles count too – dips train the triceps even when filed under chest
  const neglected = useMemo(() => {
    const lastDay = new Map<string, number>()
    for (const w of workouts) {
      if (w.status !== 'done') continue
      const ts = new Date(w.startedAt).getTime()
      for (const e of w.exercises) {
        if (!e.sets.some(isRealSet)) continue
        const { primary, secondary } = musclesFor(exerciseById.get(e.exerciseId))
        for (const g of [primary, ...secondary]) lastDay.set(g, Math.max(lastDay.get(g) ?? 0, ts))
      }
    }
    return MAIN
      .map((g) => ({ g, days: lastDay.has(g) ? Math.floor((Date.now() - lastDay.get(g)!) / 864e5) : null }))
      .filter((x): x is { g: string; days: number } => x.days != null && x.days >= 8 && x.days <= 90)
      .sort((a, b) => b.days - a.days)
      .slice(0, 2)
  }, [workouts, exerciseById])

  return (
    <div className="card mm">
      <div className="chips" style={{ margin: 0, padding: 0 }}>
        {PERIODS.map((x, i) => <button key={x.days} className={'chip' + (i === p ? ' on' : '')} onClick={() => setP(i)}>{x.label}</button>)}
      </div>
      <MuscleFigures fill={fill} sel={sel} onSel={setSel} />
      <div className="mm-info">
        {sel ? (
          <span><b>{muscleLabel(sel)}</b> · {sets.get(sel) ?? 0} {t('Sätze', 'sets')}</span>
        ) : ranked.length ? (
          <span className="muted">{t('Am meisten', 'Most')}: <b>{muscleLabel(ranked[0][0])}</b> ({ranked[0][1]} {t('Sätze', 'sets')})</span>
        ) : (
          <span className="faint">{t('Keine Sätze in diesem Zeitraum', 'No sets in this period')}</span>
        )}
      </div>
      {neglected.length > 0 && (
        <div className="hint" style={{ justifyContent: 'center' }}>
          <span>{neglected.map((x, i) => <span key={x.g}>{i ? ' · ' : ''}<b>{muscleLabel(x.g)}</b> {t(`seit ${x.days} Tagen`, `for ${x.days} days`)}</span>)} {t('nicht trainiert', 'not trained')}</span>
        </div>
      )}
      <div className="mm-legend"><span>0</span><div className="mm-scale" /><span>{period.full}+ {t('Sätze', 'sets')}</span></div>
    </div>
  )
}
