import { t } from '../i18n'
import { useMemo, useState } from 'react'
import { isRealSet } from '../lib'
import { muscleLabel, musclesFor } from '../muscles'
import { useStore } from '../store'
import anatomyUrl from '../assets/anatomy.webp'
import anatomyFemaleUrl from '../assets/anatomy-f.webp'
import { ANATOMY, ANATOMY_H, ANATOMY_W } from '../data/anatomy'
import { ANATOMY_F, ANATOMY_F_H, ANATOMY_F_W } from '../data/anatomyFemale'

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


// Detailed anatomy, left half (the right half is mirrored). Every muscle is its
// own segment with a dark seam around it, so the figure reads like an anatomy
// chart; the group decides the heat colour.
const FRONT: Region[] = [
  // neck: sternocleidomastoid + the trapezius slope
  { group: 'Nacken', d: 'M55.4 29.6 C56.6 33 57.6 36.6 58.4 40.6 L56.8 41.4 C55.6 37.6 54.6 33.8 54.2 30.4 Z' },
  { group: 'Nacken', d: 'M54 31.6 C51.8 34.8 46.8 37.4 40.8 39.2 C46 39.6 51.2 40 55.2 41 C54.8 37.8 54.4 34.6 54 31.6 Z' },
  // deltoid: lateral and front head
  { group: 'Schultern', d: 'M38.6 39.6 C32.4 40.2 27.8 42 25.4 45.4 C22.8 49.4 22.2 54.4 22.4 58.6 C24.4 61.2 27.2 62.4 29.8 62 C29.8 56 30.8 50 33.6 45.6 C35 43.2 36.8 41.2 38.6 39.6 Z' },
  { group: 'Schultern', d: 'M40.6 39.8 C36.8 41.4 33.6 44.8 32.4 49.6 C31.6 53.6 31.8 57.6 32.8 61.2 C34.6 57.4 37 53.6 39.4 50.4 C41.2 47.2 41.8 43.2 40.6 39.8 Z' },
  // pectoralis: clavicular (upper) and sternal (lower) part
  { group: 'Brust', d: 'M42 41.4 C47.6 40.6 53.6 41 59.4 42.2 L59.4 48.4 C53.4 47.2 46.8 47.4 40.8 49.4 C40.8 46.4 41 43.8 42 41.4 Z' },
  { group: 'Brust', d: 'M40.8 50.6 C46.8 48.6 53.4 48.4 59.4 49.6 L59.4 58.4 C55.4 62 48.4 62.6 43.2 60.2 C39.2 58.2 37.2 54.8 37.4 52.6 C38.4 51.8 39.6 51.1 40.8 50.6 Z' },
  // serratus anterior: three fingers along the ribs
  { group: 'Bauch', d: 'M38.8 61.6 L43.2 62.6 L42.8 65.2 L38.4 64.6 Z' },
  { group: 'Bauch', d: 'M38.4 66.4 L42.6 67 L42.4 69.8 L38.2 69.2 Z' },
  { group: 'Bauch', d: 'M38.6 71 L42.4 71.6 L42.2 74.6 L39 74.2 Z' },
  // external oblique
  { group: 'Bauch', d: 'M44.2 62.6 C46.6 64.6 48.8 67.6 50.2 71.6 L50.4 97.4 C47.6 98.2 45.2 95.6 44.2 91 C43.4 86 43.6 80.4 43 76 C42.8 71.4 43.2 66.8 44.2 62.6 Z' },
  // rectus abdominis: six-pack + lower abs
  { group: 'Bauch', d: 'M51.6 62.8 L58.8 63 L58.8 70.6 L51.6 71.4 Z' },
  { group: 'Bauch', d: 'M51.4 73 L58.8 72.4 L58.8 80.6 L51.4 81.2 Z' },
  { group: 'Bauch', d: 'M51.4 82.8 L58.8 82.2 L58.8 90.8 L51.6 91.2 Z' },
  { group: 'Bauch', d: 'M51.8 92.8 L58.8 92.4 L58.8 107 C55.6 105.4 53 101 51.8 92.8 Z' },
  // biceps: long (outer) and short (inner) head
  { group: 'Bizeps', d: 'M23.2 61.4 C25 63 27.2 63.6 28.8 63.2 C28.4 69 27.6 75.6 26.4 81.6 C25 83.2 23.4 83 22.6 81.4 C21.8 75 22 68 23.2 61.4 Z' },
  { group: 'Bizeps', d: 'M29.6 63 C30.8 63.2 31.6 62.8 32.2 62.4 C31.8 69.4 30.8 76.4 29.4 82 C28.4 83.6 27.4 83.4 27 82.4 C28 76 28.8 69.4 29.6 63 Z' },
  // forearm: brachioradialis (outer) and flexors (inner)
  { group: 'Unterarme', d: 'M19.6 88.4 C21 86.8 23.2 86.4 24.6 87.2 C23.8 96 22.6 106 21.4 115.4 C20.6 116.6 19.8 116.2 19.6 114.8 C19 106 18.8 96 19.6 88.4 Z' },
  { group: 'Unterarme', d: 'M25.6 87.4 C27 87.2 28.2 87.8 28.8 88.8 C28.2 96 26.8 105 25 114.4 C24 116.8 22.6 117 22 115.8 C23.4 106 24.6 96 25.6 87.4 Z' },
  // hip and thigh: tensor fasciae latae, outer / middle / inner quad, adductors
  { group: 'Beine', d: 'M43.2 100 C41.8 104 41 108 41.2 112.4 C42.4 113.4 43.8 113.6 45 113 C45 109 44.6 104.4 43.2 100 Z' },
  { group: 'Beine', d: 'M41.4 114.4 C43.6 113.8 45.6 114.6 46.6 117 C47 128 46.4 142 45.2 154 C44.4 159 42.6 160.4 41.2 158.4 C39.2 150 38.4 138 38.6 126 C38.8 121 39.8 117 41.4 114.4 Z' },
  { group: 'Beine', d: 'M47.8 115 C50.8 116 53 119.4 53.8 124 C54.2 134 53.4 145 51.8 154 C50.8 158 48.6 158.6 47.4 156 C46.6 146 47 132 47.8 115 Z' },
  { group: 'Beine', d: 'M54.8 141 C56.6 145 57 151 55.6 156.4 C54.2 160.6 51.6 162 50.2 160.4 C51.6 155 53.2 148 54.8 141 Z' },
  { group: 'Beine', d: 'M54.8 119.6 C57 122.6 58.6 127 59 132 L59 138 C57.8 139.6 56.6 140 55.6 139.4 C54.8 133 54.6 126 54.8 119.6 Z' },
  // lower leg: tibialis anterior and the inner calf seen from the front
  { group: 'Waden', d: 'M40.6 171.6 C42 169.8 43.6 169.4 44.8 170.6 C44.8 181 44 192 42.8 202 C42 203.6 41.2 203.4 40.8 202 C39.6 192 39.4 181 40.6 171.6 Z' },
  { group: 'Waden', d: 'M46.2 170.4 C48.2 170.2 49.8 172 50.4 175 C50.6 183 49.4 192 47.2 199.4 C46.4 200.8 45.4 200.6 45.2 199 C45.6 189 45.8 179 46.2 170.4 Z' },
]

const BACK: Region[] = [
  // trapezius: upper part and the middle/lower diamond
  { group: 'Nacken', d: 'M55.6 30.6 C53 34.6 47 37.6 40.2 39.4 C45.4 40.4 50.8 43 54.8 47.2 C57.2 50 58.6 53.4 59.4 57 L59.4 30.6 Z' },
  { group: 'Nacken', d: 'M54.6 49 C56.8 52 58.4 56.2 59.4 60.6 L59.4 80 C57.2 76 55.2 70.4 53.8 64.2 C53 58.8 53.2 53.4 54.6 49 Z' },
  // rear deltoid
  { group: 'Schultern', d: 'M40.4 39.8 C34.6 40.8 29.6 42 26.6 45 C23.6 48.4 22.6 53 22.4 58 C24.4 61.2 27.4 62.2 30.2 61.2 C31.4 55.6 33.6 50.6 36.8 46.6 C38 44.4 39.4 42 40.4 39.8 Z' },
  // rotator cuff (infraspinatus), teres major, latissimus, erector spinae
  { group: 'Rücken', d: 'M38.8 46.4 C43.4 46.6 48.4 48.4 52 51.6 C51.8 56.2 50.2 60 47.2 61.8 C43.4 62.2 39.6 60 37.4 56.6 C36.8 53 37.2 49.4 38.8 46.4 Z' },
  { group: 'Rücken', d: 'M34.6 57.8 C37.2 60.8 40.8 62.8 44.4 63.4 C43.2 65.4 41 66.4 38.4 66.2 C36.6 64 35.2 61.2 34.6 57.8 Z' },
  { group: 'Rücken', d: 'M37.6 67.8 C41.6 67.8 45.8 66 49.4 63.4 C51.6 67.6 53.4 72.6 54.4 78.6 C55 84 55.2 90 55 96 C51.6 94.6 47.8 91.2 45 86.6 C41.8 81 39.2 74.4 37.6 67.8 Z' },
  { group: 'Rücken', d: 'M55.6 84 C57.2 86.6 58.6 90 59.4 94 L59.4 113.4 C56.6 112 54.6 108.4 54 103.4 C53.8 96.6 54.4 89.8 55.6 84 Z' },
  // triceps: lateral and long head
  { group: 'Trizeps', d: 'M22.6 59.6 C24.8 60.8 27 61.2 28.6 61 C28.4 67 27.6 74 26.2 80.4 C24.8 82.8 23.2 82.8 22.4 81 C21.6 74 21.6 66.4 22.6 59.6 Z' },
  { group: 'Trizeps', d: 'M29.4 61.8 C30.8 62.6 31.8 63.4 32.6 64.6 C32.2 71.4 30.8 78 29.2 83.4 C28.2 84.8 27 84.6 26.8 83.4 C28 76 28.8 68.8 29.4 61.8 Z' },
  // forearm extensors
  { group: 'Unterarme', d: 'M19.6 88.4 C21 86.8 23.2 86.4 24.6 87.2 C23.8 96 22.6 106 21.4 115.4 C20.6 116.6 19.8 116.2 19.6 114.8 C19 106 18.8 96 19.6 88.4 Z' },
  { group: 'Unterarme', d: 'M25.6 87.4 C27 87.2 28.2 87.8 28.8 88.8 C28.2 96 26.8 105 25 114.4 C24 116.8 22.6 117 22 115.8 C23.4 106 24.6 96 25.6 87.4 Z' },
  // glutes (medius, maximus), hamstrings (biceps femoris, semitendinosus), adductor
  { group: 'Beine', d: 'M42.4 101.4 C46.4 99.4 51.2 99.8 54.8 102.4 C53.2 105.6 49.4 107.2 44.8 107.4 C43.6 105.8 42.8 103.8 42.4 101.4 Z' },
  { group: 'Beine', d: 'M41.6 109.6 C47.4 107.6 55 108.8 59.4 113 L59.4 130.6 C55 134.6 47.4 134.6 42.8 130.2 C39.8 124.4 39.6 115.8 41.6 109.6 Z' },
  { group: 'Beine', d: 'M40 136.2 C42.6 134.8 45.6 134.8 47.6 135.6 C48 145 47.4 155 46 163 C44.6 165.2 42.6 165 41.8 162.6 C39.8 154 39.2 145 40 136.2 Z' },
  { group: 'Beine', d: 'M48.8 135.8 C51.6 135.4 54.4 136.2 56 137.6 C56.4 147 55 156.6 52.8 163.4 C51.4 165.4 49.6 165.4 48.6 163.6 C48.8 154.6 48.8 145 48.8 135.8 Z' },
  { group: 'Beine', d: 'M56.8 133.8 C58.2 135.2 59 136.8 59.2 138.6 L58.6 146 C57.6 142 57 138 56.8 133.8 Z' },
  // calves: lateral and medial head of the gastrocnemius
  { group: 'Waden', d: 'M38.8 170.2 C40.8 168 43.4 168 44.8 170 C45.2 179 44.4 188 42.8 194.8 C41.6 196.4 40.4 196 39.8 194 C38.4 186 38 178 38.8 170.2 Z' },
  { group: 'Waden', d: 'M45.8 169.6 C48 168.4 50 169.6 50.6 173 C51 181 49.8 189 47.6 196 C46.6 197.6 45.4 197.2 45.2 195.6 C45.6 187 45.6 178 45.8 169.6 Z' },
]

const MAIN = ['Brust', 'Rücken', 'Schultern', 'Beine', 'Bizeps', 'Trizeps', 'Bauch']
const PERIODS = [{ days: 7, get label() { return t('7 Tage', '7 days') }, full: 12 }, { days: 30, get label() { return t('30 Tage', '30 days') }, full: 45 }]
const MIRROR = 'translate(120 0) scale(-1 1)'

/**
 * Front + back body chart (the owner's own drawing, src/assets/anatomy.webp) with
 * every muscle area traced on top (src/data/anatomy.ts). The drawing is grey with
 * transparent lines; `fill` colours a group (emerald for trained, 'transparent'
 * for the rest) and the areas stop at the lines. Tapping selects a group.
 */
export function MuscleFigures({ fill, sel = null, onSel }: { fill: (group: string) => string; sel?: string | null; onSel?: (g: string | null) => void }) {
  // the women's chart when "Frau" is set in the body data (Settings › Körperdaten)
  const female = useStore().settings.sex === 'f'
  const [W, H, url, regions] = female ? [ANATOMY_F_W, ANATOMY_F_H, anatomyFemaleUrl, ANATOMY_F] : [ANATOMY_W, ANATOMY_H, anatomyUrl, ANATOMY]
  return (
    <div className="mm-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Muskeln vorne und hinten', 'Muscles front and back')}>
        <image href={url} width={W} height={H} />
        <g>
          {regions.map((r, i) => (
            <path
              key={i} d={r.d} fill={fill(r.group)}
              className={onSel ? 'mm-region' : undefined}
              onClick={onSel ? () => onSel(sel === r.group ? null : r.group) : undefined}
            />
          ))}
        </g>
        {sel && (
          <g pointerEvents="none">
            {regions.filter((r) => r.group === sel).map((r, i) => <path key={i} d={r.d} fill="none" stroke="#22c784" strokeWidth="3" strokeLinejoin="round" />)}
          </g>
        )}
      </svg>
      <div className="mm-caps faint"><span>{t('Vorne', 'Front')}</span><span>{t('Hinten', 'Back')}</span></div>
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
    // trained muscles turn emerald, the more sets the deeper; the rest stays the white drawing
    return v > 0 ? `rgba(34,199,132,${(0.3 + 0.7 * v).toFixed(2)})` : 'transparent'
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
