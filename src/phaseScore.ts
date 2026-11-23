import { e1rm, isRealSet } from './lib'
import type { WorkoutProgress } from './progress'
import type { Phase, PhaseType, WeightEntry, Workout } from './types'

/**
 * Score 0–99 for a bulk / cut / maintenance phase.
 *
 * Bulk   – Gewichtszunahme 40 (optimal +0,2–0,5 % KG/Woche) · Kraft 30 · Fortschritt 20 · Training 10
 * Cut    – Gewichtsverlust 40 (optimal −0,5–1,0 % KG/Woche) · Kraft halten 35 · Training 15 · Fortschritt 10 (Bonus)
 * Erhalt – Gewicht stabil 30 · Kraft 25 · Fortschritt 30 · Training 15
 *
 * Kraft compares the best estimated 1RM per exercise in the first vs. the last
 * third of the phase (up to six weeks each) (median over the exercises trained in both).
 * Fortschritt compares records/progress per workout with your all-time average.
 */
export interface PhasePart { key: string; label: string; pts: number; max: number; detail: string; tip: string }
export interface PhaseScore {
  phase: Phase
  end: string // exclusive, YYYY-MM-DD
  current: boolean
  weeks: number
  score: number
  parts: PhasePart[]
  workouts: number
  startKg: number | null
  endKg: number | null
  /** kg per week (trend line) */
  rate: number | null
  /** % of body weight per week */
  ratePct: number | null
  /** best-1RM ratio last vs. first weeks (1 = equal) */
  strength: number | null
  ups: number
  prs: number
  /** too short to judge (< 2 weeks) */
  early: boolean
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const DAY = 864e5
const t = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00').getTime()
const today = () => new Date().toISOString().slice(0, 10)
const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')} %`
const kg1 = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')} kg`

export const phaseName = (t: PhaseType) => (t === 'bulk' ? 'Bulk' : t === 'cut' ? 'Cut' : 'Erhalt')

/** Least-squares slope in kg per week. */
function slope(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return null
  const n = pts.length
  const mx = pts.reduce((s, p) => s + p.x, 0) / n
  const my = pts.reduce((s, p) => s + p.y, 0) / n
  let num = 0, den = 0
  for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2 }
  return den ? (num / den) * 7 * DAY : null
}

/** 1 inside [lo, hi], falling linearly to 0 at loZero / hiZero. */
function band(v: number, loZero: number, lo: number, hi: number, hiZero: number) {
  if (v >= lo && v <= hi) return 1
  if (v < lo) return clamp((v - loZero) / (lo - loZero))
  return clamp((hiZero - v) / (hiZero - hi))
}

function strengthRatio(ws: Workout[], start: string, end: string) {
  const days = (t(end) - t(start)) / DAY
  const win = Math.min(42, days / 3)
  const early = new Map<string, number>()
  const late = new Map<string, number>()
  for (const w of ws) {
    const d = (t(w.startedAt) - t(start)) / DAY
    const target = d < win ? early : d >= days - win ? late : null
    if (!target) continue
    for (const e of w.exercises) {
      for (const s of e.sets) {
        if (!isRealSet(s) || (s.weight ?? 0) > 500) continue
        const v = e1rm(s.weight ?? 0, s.reps ?? 0)
        if (v > (target.get(e.exerciseId) ?? 0)) target.set(e.exerciseId, v)
      }
    }
  }
  const ratios = [...early].filter(([id, v]) => v > 0 && late.has(id)).map(([id, v]) => late.get(id)! / v).sort((a, b) => a - b)
  if (ratios.length < 2) return null
  const m = Math.floor(ratios.length / 2)
  return ratios.length % 2 ? ratios[m] : (ratios[m - 1] + ratios[m]) / 2
}

export function scorePhases(phases: Phase[], workouts: Workout[], weights: WeightEntry[], progress: Map<string, WorkoutProgress>): PhaseScore[] {
  const done = workouts.filter((w) => w.status === 'done')
  // all-time average of (progress + 2·records) per workout
  let totalGain = 0
  for (const w of done) { const r = progress.get(w.id); totalGain += (r?.ups ?? 0) + 2 * (r?.prs ?? 0) }
  const avgGain = done.length ? totalGain / done.length : 0
  const sorted = [...phases].sort((a, b) => a.start.localeCompare(b.start))

  return sorted.map((phase, i) => {
    const next = sorted[i + 1]
    const current = !next
    const end = next ? next.start : addDay(today())
    const weeks = Math.max(1 / 7, (t(end) - t(phase.start)) / (7 * DAY))
    const ws = done.filter((w) => w.startedAt.slice(0, 10) >= phase.start && w.startedAt.slice(0, 10) < end)
    const wts = weights.filter((w) => w.date >= phase.start && w.date < end)
    const startKg = wts[0]?.kg ?? null
    const endKg = wts[wts.length - 1]?.kg ?? null
    const spanDays = wts.length > 1 ? (t(wts[wts.length - 1].date) - t(wts[0].date)) / DAY : 0
    const rate = spanDays >= 7 ? slope(wts.map((w) => ({ x: t(w.date), y: w.kg }))) : null
    const ratePct = rate != null && startKg ? (rate / startKg) * 100 : null
    const strength = weeks >= 3 ? strengthRatio(ws, phase.start, end) : null
    let ups = 0, prs = 0
    for (const w of ws) { const r = progress.get(w.id); ups += r?.ups ?? 0; prs += r?.prs ?? 0 }
    const gainPer = ws.length ? (ups + 2 * prs) / ws.length : 0
    const gainRatio = avgGain ? gainPer / avgGain : gainPer > 0 ? 1 : 0
    const perWeek = ws.length / weeks

    const parts: PhasePart[] = []
    const weightDetail = ratePct != null
      ? `${rate! > 0 ? "+" : ""}${rate!.toFixed(2).replace(".", ",")} kg/Woche · ${pct(ratePct)} KG`
      : 'zu wenig Gewichtseinträge'
    const trainPart = (max: number) => ({
      key: 'train', label: 'Training', max,
      pts: clamp(perWeek / 3) * max,
      detail: `${perWeek.toFixed(1).replace('.', ',')} Workouts/Woche`,
      tip: perWeek >= 3 ? 'Konstant trainiert.' : 'Ziel: mindestens 3 Workouts pro Woche.',
    })
    const progPart = (max: number, full: number, label = 'Fortschritt') => ({
      key: 'prog', label, max,
      pts: clamp(gainRatio / full) * max,
      detail: `${prs} ${prs === 1 ? 'Rekord' : 'Rekorde'} · ${ups} ${ups === 1 ? 'Fortschritt' : 'Fortschritte'} · ${Math.round(gainRatio * 100)} % deines Schnitts`,
      tip: gainRatio >= full ? 'Mehr Verbesserungen als sonst – stark.' : 'Schlag in möglichst vielen Sätzen dein letztes Mal; Rekorde zählen doppelt.',
    })
    const strDetail = strength != null ? `1RM ${pct((strength - 1) * 100)} (Anfang → Ende)` : weeks < 3 ? 'ab 3 Wochen bewertet' : 'zu wenig gleiche Übungen'

    if (phase.type === 'bulk') {
      parts.push({
        key: 'weight', label: 'Gewichtszunahme', max: 40,
        pts: ratePct != null ? band(ratePct, -0.05, 0.2, 0.5, 1.1) * 40 : 20,
        detail: weightDetail,
        tip: ratePct == null ? 'Wieg dich regelmäßig, damit die Zunahme bewertet werden kann.'
          : ratePct < 0.2 ? `Zu langsam – Ziel +0,2–0,5 % pro Woche (${kg1((startKg ?? 0) * 0.002)}–${kg1((startKg ?? 0) * 0.005)}). Etwas mehr essen.`
          : ratePct > 0.5 ? 'Zu schnell – mehr Fett als nötig. Kalorien leicht senken.'
          : 'Optimales Tempo für einen sauberen Bulk.',
      })
      parts.push({
        key: 'str', label: 'Kraft', max: 30,
        pts: strength != null ? clamp((strength - 0.96) / 0.1) * 30 : 15,
        detail: strDetail,
        tip: strength == null ? 'Wird bewertet, sobald genug Daten da sind.' : strength >= 1.06 ? 'Deutlich stärker geworden.' : 'Im Bulk sollte dein 1RM klar steigen – volle Punkte ab +6 % über die Phase.',
      })
      parts.push(progPart(20, 1.2))
      parts.push(trainPart(10))
    } else if (phase.type === 'cut') {
      parts.push({
        key: 'weight', label: 'Gewichtsverlust', max: 40,
        pts: ratePct != null ? band(-ratePct, 0, 0.5, 1.0, 1.8) * 40 : 20,
        detail: weightDetail,
        tip: ratePct == null ? 'Wieg dich regelmäßig, damit der Verlust bewertet werden kann.'
          : -ratePct < 0.5 ? `Zu langsam – Ziel −0,5–1 % pro Woche (${kg1(-(startKg ?? 0) * 0.005)} bis ${kg1(-(startKg ?? 0) * 0.01)}).`
          : -ratePct > 1.0 ? 'Zu schnell – du riskierst Muskel- und Kraftverlust. Etwas mehr essen.'
          : 'Optimales Tempo – Fett runter, Muskeln bleiben.',
      })
      parts.push({
        key: 'str', label: 'Kraft halten', max: 35,
        pts: strength != null ? clamp((strength - 0.9) / 0.1) * 35 : 17.5,
        detail: strDetail,
        tip: strength == null ? 'Wird bewertet, sobald genug Daten da sind.' : strength >= 1 ? 'Kraft voll gehalten – perfekt im Cut.' : 'Schwer bleiben: Gewicht halten, lieber Wdh reduzieren als Last.',
      })
      parts.push(trainPart(15))
      parts.push(progPart(10, 0.7, 'Fortschritt (Bonus)'))
    } else {
      parts.push({
        key: 'weight', label: 'Gewicht stabil', max: 30,
        pts: ratePct != null ? band(ratePct, -0.6, -0.15, 0.15, 0.6) * 30 : 15,
        detail: weightDetail,
        tip: ratePct == null ? 'Wieg dich regelmäßig.' : Math.abs(ratePct) <= 0.15 ? 'Gewicht schön stabil.' : 'Im Erhalt sollte das Gewicht kaum wandern (±0,15 % pro Woche).',
      })
      parts.push({
        key: 'str', label: 'Kraft', max: 25,
        pts: strength != null ? clamp((strength - 0.95) / 0.08) * 25 : 12.5,
        detail: strDetail,
        tip: strength == null ? 'Wird bewertet, sobald genug Daten da sind.' : 'Auch im Erhalt langsam stärker werden.',
      })
      parts.push(progPart(30, 1.1))
      parts.push(trainPart(15))
    }

    const score = ws.length ? Math.min(99, Math.round(parts.reduce((n, p) => n + p.pts, 0))) : 0
    return {
      phase, end, current, weeks, score, workouts: ws.length, startKg, endKg, rate, ratePct, strength, ups, prs,
      early: weeks < 2,
      parts: parts.map((p) => ({ ...p, pts: Math.round(p.pts) })),
    }
  })
}

function addDay(iso: string) {
  return new Date(t(iso) + DAY).toISOString().slice(0, 10)
}
