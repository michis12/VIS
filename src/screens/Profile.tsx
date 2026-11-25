import { useId, useMemo, useRef, useState } from 'react'
import { pastWeekScores } from '../weekly'
import { scorePhases } from '../phaseScore'
import { kcalTarget } from '../nutrition'
import { computeMetrics, evaluate, fmtMetric, MAX_STARS, nextRank, rankFor, ULTIMATE, type AchievementState, type Glyph } from '../achievements'
import { openPaywall } from '../components/AiCredit'
import { Avatar, ProfileEditor } from '../components/Avatar'
import { PlanBadge } from '../components/Paywall'
import { Icon, Sheet } from '../components/ui'
import { useNav } from '../nav'
import { shareOrDownload } from '../files'
import { renderShareCard } from '../shareCard'
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

/** profile name: smaller for long names so the longest word fits next to the buttons (~140 px) */
const nameSize = (name: string) => {
  const word = Math.max(...name.split(/\s+/).map((w) => w.length))
  return Math.max(17, Math.min(26, name.length > 20 ? 20 : 26, Math.floor(140 / (0.62 * word))))
}

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
  // fun
  beer: <g {...P}><path d="M8 11h12v13a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3Z" /><path d="M20 14h2a3 3 0 0 1 0 6h-2" /><path d="M8 11c-1-3 2-5 4-4 1-2 4-2 5 0 2-1 4 1 3 4" /><path d="M12 16v6M16 16v6" /></g>,
  ghost: <g {...P}><path d="M8 27V14a8 8 0 0 1 16 0v13l-3-2-2.5 2-2.5-2-2.5 2-2.5-2Z" /><circle cx="13" cy="15" r="1.2" fill="currentColor" /><circle cx="19" cy="15" r="1.2" fill="currentColor" /></g>,
  tree: <g {...P}><path d="M16 5l5 7h-3l5 7h-4l5 6H8l5-6H9l5-7h-3Z" /><path d="M16 25v3" /></g>,
  heart: <g {...P}><path d="M16 26S5 19.5 5 12.5A5.5 5.5 0 0 1 16 10a5.5 5.5 0 0 1 11 2.5C27 19.5 16 26 16 26Z" /><path d="M11 13.5h3l1.5-3 2 6 1.5-3h3" /></g>,
  rocket: <g {...P}><path d="M19 5c4 0 8 4 8 8l-9 9-5-5 9-9" /><path d="M13 17l-4 1-3 4 5-1M18 22l-1 4-4 3 1-5" /><circle cx="20.5" cy="11.5" r="1.8" /><path d="M8 24l-3 3" /></g>,
  chair: <g {...P}><path d="M10 5v12h12" /><path d="M10 17v10M22 17v10M10 11h9" /><path d="M19 11V5" /></g>,
  pyramid: <g {...P}><path d="M16 5 28 26H4Z" /><path d="M9.5 16.5h13M7 21.5h18M16 5v21" /></g>,
  drumstick: <g {...P}><path d="M19 6a7 7 0 0 1 5 12c-2 2-5 2-7 1l-5 5" /><path d="M19 6a7 7 0 0 0-4 11" /><circle cx="9.5" cy="25.5" r="2" /><circle cx="7" cy="22" r="2" /></g>,
  flex: <g {...P}><path d="M6 25c2-6 3-10 3-14l4-4 2 2-2 3 3 3c3-2 7-2 9 1 2 4-1 9-6 9Z" /><path d="M16 18c1 2 3 3 5 2" /></g>,
  repeat: <g {...P}><path d="M7 14a9 9 0 0 1 15-5l2 2" /><path d="M24 5v6h-6" /><path d="M25 18a9 9 0 0 1-15 5l-2-2" /><path d="M8 27v-6h6" /></g>,
  shot: <g {...P}><path d="M9 7h14l-2 19H11Z" /><path d="M10 13h12" /><path d="M14 18h4" /></g>,
  // strength & body
  barbell: <g {...P}><path d="M3 16h26" /><rect x="6" y="9" width="3.5" height="14" rx="1" /><rect x="22.5" y="9" width="3.5" height="14" rx="1" /><rect x="10" y="11.5" width="2.5" height="9" rx="1" /><rect x="19.5" y="11.5" width="2.5" height="9" rx="1" /></g>,
  deadlift: <g {...P}><circle cx="16" cy="6" r="2.4" /><path d="M16 9v8l-4 5v5M16 17l4 5v5M11 13h10" /><path d="M5 22h22" /><circle cx="6" cy="22" r="3" /><circle cx="26" cy="22" r="3" /></g>,
  lion: <g {...P}><path d="M16 4l2.5 3 3.5-1.5.5 3.8 3.5 1.2-1.8 3.3 2.3 3-3.5 1.4.2 3.8-3.7-.4L16 28l-2-3.4-3.7.4.2-3.8-3.5-1.4 2.3-3-1.8-3.3 3.5-1.2.5-3.8L13.5 7Z" /><circle cx="13.5" cy="15" r=".9" fill="currentColor" /><circle cx="18.5" cy="15" r=".9" fill="currentColor" /><path d="M14.5 19.5 16 21l1.5-1.5" /></g>,
  scale: <g {...P}><rect x="5" y="6" width="22" height="21" rx="5" /><path d="M10.5 13a6 6 0 0 1 11 0" /><path d="M16 13l2-2.5" /></g>,
  gorilla: <g {...P}><path d="M9 27v-4c-3-1-4-4-4-7 0-5 5-9 11-9s11 4 11 9c0 3-1 6-4 7v4" /><path d="M11 15h3M18 15h3" /><path d="M12 20c2 2 6 2 8 0" /><path d="M16 7V4" /></g>,
  blade: <g {...P}><path d="M6 26 22 10c2-2 5-2 5-2s0 3-2 5L9 29Z" /><path d="M4 24l4 4M18 14l2 2" /></g>,
  plate: <g {...P}><circle cx="16" cy="16" r="11.5" /><circle cx="16" cy="16" r="2.5" /><path d="M16 4.5v3M16 24.5v3M4.5 16h3M24.5 16h3" /></g>,
  ring: <g {...P}><circle cx="16" cy="19" r="8" /><path d="M12 7l4-3 4 3-4 4Z" /></g>,
  // records & progress
  target: <g {...P}><circle cx="16" cy="16" r="11" /><circle cx="16" cy="16" r="6.5" /><circle cx="16" cy="16" r="2" fill="currentColor" /><path d="M16 2v5M16 25v5M2 16h5M25 16h5" /></g>,
  stairs: <g {...P}><path d="M4 27h6v-6h6v-6h6V9h6" /><path d="M21 4h7v7" /><path d="M28 4 20 12" /></g>,
  storm: <g {...P}><path d="M9 17a5 5 0 0 1 .6-10 7 7 0 0 1 13.2 1.6A4.5 4.5 0 0 1 22.5 17" /><path d="M17 13l-4 7h5l-3 7" /></g>,
  chevrons: <g {...P}><path d="M8 13l8-7 8 7M8 20l8-7 8 7M8 27l8-7 8 7" /></g>,
  infinity: <g {...P}><path d="M16 16c-2.5-3.5-4.5-5-7-5a5 5 0 0 0 0 10c2.5 0 4.5-1.5 7-5Zm0 0c2.5 3.5 4.5 5 7 5a5 5 0 0 0 0-10c-2.5 0-4.5 1.5-7 5Z" /></g>,
  diamond: <g {...P}><path d="M9 6h14l5 7-12 14L4 13Z" /><path d="M4 13h24M12 6l-2 7 6 14 6-14-2-7" /></g>,
  swords: <g {...P}><path d="M6 6l14 14M26 6 12 20" /><path d="M18 22l4-4M14 22l-4-4" /><path d="M21 21l4 4M11 21l-4 4" /><path d="M6 6h4M6 6v4M26 6h-4M26 6v4" /></g>,
  laurel: <g {...P}><path d="M16 27V12" /><path d="M10 26c-4-3-5-9-3-14M22 26c4-3 5-9 3-14" /><path d="M8 20c-2 0-3-1-4-3 2 0 3 1 4 3ZM7 14c-2-1-2-3-2-5 2 1 2 3 2 5ZM24 20c2 0 3-1 4-3-2 0-3 1-4 3ZM25 14c2-1 2-3 2-5-2 1-2 3-2 5Z" /><path d="M16 5l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6Z" /></g>,
  torch: <g {...P}><path d="M12 14h8l-2 14h-4Z" /><path d="M16 4c3 3 4 5 4 7a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-2-1-4 0-6Z" /></g>,
  gauge: <g {...P}><path d="M5 22a11 11 0 1 1 22 0" /><path d="M16 22l6-7" /><circle cx="16" cy="22" r="1.6" /><path d="M8 22h-2M26 22h-2M16 11V9" /></g>,
  check: <g {...P}><circle cx="16" cy="16" r="11" /><path d="M10.5 16.5l4 4 7-8.5" /></g>,
  figure: <g {...P}><circle cx="16" cy="6" r="2.6" /><path d="M7 11c3 1 6 1.5 9 1.5s6-.5 9-1.5" /><path d="M11 12l1.5 8h7L21 12" /><path d="M12.5 20 11 28M19.5 20 21 28" /></g>,
  link: <g {...P}><rect x="4" y="11" width="13" height="10" rx="5" /><rect x="15" y="11" width="13" height="10" rx="5" /></g>,
  tape: <g {...P}><circle cx="13" cy="14" r="8" /><circle cx="13" cy="14" r="2.5" /><path d="M13 22h15v-4" /><path d="M18 22v-2.5M22 22v-2.5M26 22v-2.5" /></g>,
  trend: <g {...P}><path d="M4 24l8-8 5 5 10-11" /><path d="M21 10h6v6" /></g>,
  phase: <g {...P}><path d="M4 24c4 0 5-12 9-12s4 8 7 8 4-12 8-12" /><circle cx="13" cy="12" r="1.6" /><circle cx="20" cy="20" r="1.6" /></g>,
  bulk: <g {...P}><path d="M6 26h20" /><path d="M9 26V18M14 26V14M19 26V10M24 26V6" /><path d="M21 6h3v3" /></g>,
  shred: <g {...P}><path d="M16 28c-5 0-8-3.5-8-8 0-5 4-7 5-12 3 2 4 5 4 7 1-1 2-3 2-4 3 2 5 5 5 9 0 4.5-3 8-8 8Z" /><path d="M16 28c-2 0-3.5-1.5-3.5-3.5 0-2 2-3 3.5-5.5 1.5 2.5 3.5 3.5 3.5 5.5S18 28 16 28Z" /></g>,
  diary: <g {...P}><rect x="7" y="4" width="18" height="24" rx="2.5" /><path d="M11 4v24" /><path d="M15 11h6M15 15h6M15 19h4" /></g>,
  egg: <g {...P}><path d="M16 4c-5 0-9 8-9 14a9 9 0 0 0 18 0c0-6-4-14-9-14Z" /><path d="M12 19a4 4 0 0 0 4 4" /></g>,
  bullseye: <g {...P}><circle cx="16" cy="16" r="11" /><circle cx="16" cy="16" r="6.5" /><circle cx="16" cy="16" r="2" /></g>,
  couch: <g {...P}><path d="M7 16v-4a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4" /><path d="M4 18a2 2 0 0 1 4 0v2h16v-2a2 2 0 0 1 4 0v6H4Z" /><path d="M7 24v3M25 24v3" /></g>,
}

export function Medal({ glyph, stars, size = 64, ultimate = false }: { glyph: Glyph; stars: number; size?: number; ultimate?: boolean }) {
  const id = useId().replace(/:/g, '')
  const t = TIER[stars]
  const locked = stars === 0
  const hex = 'M32 3 57 17.5v29L32 61 7 46.5v-29Z'
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 64 64" className={'medal' + (locked ? ' locked' : '') + (ultimate ? ' ultimate' : '')}>
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

function useMetrics() {
  const { workouts, weights, exercises, progress, phases, workoutScores, measurements, foodLog } = useStore()
  return useMemo(() => {
    const first = workouts.find((w) => w.status === 'done')?.startedAt
    const weeks = first ? Math.min(600, Math.ceil((Date.now() - Date.parse(first)) / (7 * 864e5)) + 1) : 0
    const weekScores = pastWeekScores(workouts, progress.byId, weights, phases, weeks).reverse()
    const phaseScores = scorePhases(phases, workouts, weights, progress.byId).map((p) => ({ type: p.phase.type, score: p.score, weeks: p.weeks }))
    // food log: per day totals vs. targets
    const byDay = new Map<string, { kcal: number; p: number }>()
    for (const e of foodLog) {
      const d = byDay.get(e.date) ?? { kcal: 0, p: 0 }
      d.kcal += e.kcal; d.p += e.p
      byDay.set(e.date, d)
    }
    let proteinDays = 0, onTargetDays = 0
    for (const [date, d] of byDay) {
      const kg = [...weights].reverse().find((w) => w.date <= date)?.kg ?? weights[0]?.kg
      if (kg && d.p >= kg * 2) proteinDays++
      const t = kcalTarget(phases, date)
      if (t && Math.abs(d.kcal - t) <= t * 0.05) onTargetDays++
    }
    const nutrition = { days: byDay.size, proteinDays, onTargetDays }
    return computeMetrics(workouts, weights, exercises, progress.byId, { workoutScores, weekScores, measurements: measurements.length, phaseScores, nutrition })
  }, [workouts, weights, exercises, progress, phases, workoutScores, measurements, foodLog])
}

export function useAchievements() {
  const metrics = useMetrics()
  return useMemo(() => evaluate(metrics), [metrics])
}

const MONTH_LETTER = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_SHORT = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

export function Profile({ toast }: { toast: (t: string) => void }) {
  const { workouts, settings } = useStore()
  const nav = useNav()
  const list = useAchievements()
  const [open, setOpen] = useState<AchievementState | null>(null)
  const [ultOpen, setUltOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null)
  const [busy, setBusy] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const metrics = useMetrics()

  const buildShare = async () => {
    setBusy(true)
    try {
      const medals = [...(gridRef.current?.querySelectorAll('svg.medal') ?? [])].slice(0, 3).map((s) => s.outerHTML)
      const now = new Date()
      const months = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        return { label: MONTH_LETTER[d.getMonth()], value: workouts.filter((w) => w.status === 'done' && w.startedAt.startsWith(key)).length }
      })
      const sinceDate = first ? new Date(first.startedAt) : null
      const blob = await renderShareCard({
        name: settings.name || 'Athlet',
        avatar: settings.avatar,
        rank: rank.name,
        stars: total,
        maxStars: max,
        since: sinceDate ? `${MONTH_SHORT[sinceDate.getMonth()]} ${sinceDate.getFullYear()}` : undefined,
        kpis: [
          { label: 'Workouts', value: fmtInt(metrics.workouts) },
          { label: 'Volumen', value: fmtInt(metrics.volumeT), unit: 't' },
          { label: 'Sätze', value: fmtInt(metrics.sets) },
          { label: 'Trainingszeit', value: fmtInt(metrics.hours), unit: 'h' },
          { label: 'Beste Serie', value: String(metrics.streak), unit: 'Wo.' },
          { label: 'Rekorde', value: fmtInt(metrics.prs) },
        ],
        top: sorted.slice(0, 3).map((a, i) => ({ name: a.def.name, stars: a.stars, svg: medals[i] ?? '' })),
        months,
      })
      const file = new File([blob], `VIS-Profil-${new Date().toISOString().slice(0, 10)}.png`, { type: 'image/png' })
      setPreview({ url: URL.createObjectURL(blob), file })
    } catch (e) {
      toast('Bild konnte nicht erstellt werden: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const total = list.reduce((n, a) => n + a.stars, 0)
  const max = MAX_STARS
  const rank = rankFor(total)
  const nr = nextRank(total)
  const byRank = (a: AchievementState, b: AchievementState) => b.stars - a.stars || b.progress - a.progress
  const core = list.filter((a) => !a.def.fun && !a.def.body && !a.def.prog && !a.def.score)
  const body = list.filter((a) => a.def.body).sort(byRank)
  const prog = list.filter((a) => a.def.prog).sort(byRank)
  const scoreAch = list.filter((a) => a.def.score).sort(byRank)
  const fun = list.filter((a) => a.def.fun).sort(byRank)
  const maxed = core.filter((a) => a.stars === 5).length
  const ultimate = maxed === core.length
  const first = workouts.find((w) => w.status === 'done')
  const sorted = [...core].sort(byRank)
  const renderAch = (a: AchievementState) => (
    <button key={a.def.id} className={'ach' + (a.stars === 0 ? ' locked' : '')} onClick={() => setOpen(a)}>
      <Medal glyph={a.def.glyph} stars={a.stars} />
      <div className="ach-name">{a.def.name}</div>
      <Stars n={a.stars} />
      <div className="ach-bar"><div style={{ width: `${a.progress * 100}%` }} /></div>
    </button>
  )

  return (
    <div className="screen">
      <div className="eyebrow">Profil · Ehrenhalle</div>
      <div className="profile-head">
        <Avatar size={76} onClick={() => setEditing(true)} />
        <div className="who">
          <div className="nm-row">
            <div className="nm" lang="de" style={{ fontSize: nameSize(settings.name || 'Dein Name') }}>{settings.name || 'Dein Name'}</div>
            <PlanBadge onClick={openPaywall} />
          </div>
          <button className="link muted" style={{ fontSize: 14 }} onClick={() => setEditing(true)}>Profil bearbeiten</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="icon-btn" onClick={buildShare} disabled={busy} aria-label="Profil teilen" style={{ width: 44, height: 44 }}>
            <Icon.share />
          </button>
          <button className="icon-btn" onClick={() => nav.push({ kind: 'settings' })} aria-label="Einstellungen" style={{ width: 44, height: 44 }}>
            <Icon.gear />
          </button>
        </div>
      </div>

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
          <div className="muted" style={{ fontSize: 13 }}>{maxed} / {core.length} Achievements gemaxt</div>
          <div className="progress" style={{ marginTop: 8 }}><div style={{ width: `${(maxed / core.length) * 100}%` }} /></div>
        </div>
      </button>

      <div className="section-title"><h2>Achievements</h2><span className="faint" style={{ fontSize: 13 }}>{core.filter((a) => a.stars > 0).length} / {core.length} freigeschaltet</span></div>
      <div className="ach-grid" ref={gridRef}>{sorted.map(renderAch)}</div>

      <div className="section-title"><h2>Rekorde & Fortschritt</h2><span className="faint" style={{ fontSize: 13 }}>{prog.filter((a) => a.stars > 0).length} / {prog.length} freigeschaltet</span></div>
      <div className="ach-grid">{prog.map(renderAch)}</div>

      <div className="section-title"><h2>Scores & Features</h2><span className="faint" style={{ fontSize: 13 }}>{scoreAch.filter((a) => a.stars > 0).length} / {scoreAch.length} freigeschaltet</span></div>
      <div className="ach-grid">{scoreAch.map(renderAch)}</div>

      <div className="section-title"><h2>Kraft & Körper</h2><span className="faint" style={{ fontSize: 13 }}>{body.filter((a) => a.stars > 0).length} / {body.length} freigeschaltet</span></div>
      <div className="ach-grid">{body.map(renderAch)}</div>

      <div className="section-title"><h2>Just for fun</h2><span className="faint" style={{ fontSize: 13 }}>{fun.filter((a) => a.stars > 0).length} / {fun.length} freigeschaltet</span></div>
      <div className="ach-grid">{fun.map(renderAch)}</div>

      {open && (
        <Sheet onClose={() => setOpen(null)}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Medal glyph={open.def.glyph} stars={open.stars} size={84} />
            <div>
              <h3 style={{ fontSize: 24 }}>{open.def.name}</h3>
              <Stars n={open.stars} size={16} />
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{open.stars && open.def.labels ? open.def.labels[open.stars - 1] : TIER[open.stars].name}</div>
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
                <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>Noch {fmtMetric(Math.round((open.next - open.value) * 10) / 10)} bis {open.stars + 1} {open.stars + 1 === 1 ? 'Stern' : 'Sterne'}</div>
              </>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            {open.def.tiers.map((t, i) => (
              <div key={i} className="pr-row num">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Stars n={i + 1} />
                  <span className={open.stars > i ? '' : 'faint'}>{open.def.labels?.[i] ?? TIER[i + 1].name}</span>
                </span>
                <span className={open.stars > i ? '' : 'faint'}>{open.stars > i ? '✓ ' : ''}{fmtInt(t)}</span>
              </div>
            ))}
          </div>
          {open.def.note && <p className="faint" style={{ fontSize: 12, marginTop: 12 }}>{open.def.note}</p>}
        </Sheet>
      )}

      <button className="btn btn-chrome btn-block" style={{ marginTop: 22 }} onClick={buildShare} disabled={busy}>
        <Icon.share /> {busy ? 'Erstelle Bild…' : 'Profil-Dashboard teilen'}
      </button>

      {editing && <ProfileEditor onClose={() => setEditing(false)} />}

      {preview && (
        <Sheet onClose={() => { URL.revokeObjectURL(preview.url); setPreview(null) }}>
          <h3>Dein Dashboard</h3>
          <img src={preview.url} alt="Profil-Dashboard" className="share-preview" />
          <button className="btn btn-chrome btn-block" style={{ marginTop: 14 }} onClick={async () => {
            const r = await shareOrDownload(preview.file, 'Mein VIS-Profil')
            if (r === 'downloaded') toast('Bild gespeichert')
          }}><Icon.share /> Teilen</button>
        </Sheet>
      )}

      {ultOpen && (
        <Sheet onClose={() => setUltOpen(false)}>
          <div style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
            <Medal glyph="crown" stars={ultimate ? 5 : 0} size={110} ultimate />
            <h3 style={{ fontSize: 26, marginTop: 10 }} className={ultimate ? 'chrome-text' : ''}>{ULTIMATE.name}</h3>
            <p className="muted" style={{ margin: '6px 0 16px' }}>{ULTIMATE.desc}</p>
          </div>
          {[...core].sort((a, b) => b.stars - a.stars).map((a) => (
            <div key={a.def.id} className="pr-row"><span className={a.stars === 5 ? '' : 'muted'}>{a.def.name}</span><Stars n={a.stars} /></div>
          ))}
        </Sheet>
      )}
    </div>
  )
}
