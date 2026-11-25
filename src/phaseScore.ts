import { dec, t as tr } from './i18n'
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
const pct = (v: number) => `${v > 0 ? '+' : ''}${dec(v, 2)} %`
const kg1 = (v: number) => `${v > 0 ? '+' : ''}${dec(v, 1)} kg`

export const phaseName = (p: PhaseType) => (p === 'bulk' ? 'Bulk' : p === 'cut' ? 'Cut' : tr('Erhalt', 'Maintain'))

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
      ? `${rate! > 0 ? "+" : ""}${dec(rate!, 2)} ${tr('kg/Woche', 'kg/week')} · ${pct(ratePct)} ${tr('KG', 'BW')}`
      : tr('zu wenig Gewichtseinträge', 'too few weight entries')
    const trainPart = (max: number) => ({
      key: 'train', label: 'Training', max,
      pts: clamp(perWeek / 3) * max,
      detail: `${dec(perWeek, 1)} ${tr('Workouts/Woche', 'workouts/week')}`,
      tip: perWeek >= 3 ? tr('Konstant trainiert.', 'Trained consistently.') : tr('Ziel: mindestens 3 Workouts pro Woche.', 'Goal: at least 3 workouts per week.'),
    })
    const progPart = (max: number, full: number, label = tr('Fortschritt', 'Progress')) => ({
      key: 'prog', label, max,
      pts: clamp(gainRatio / full) * max,
      detail: tr(`${prs} ${prs === 1 ? 'Rekord' : 'Rekorde'} · ${ups} ${ups === 1 ? 'Fortschritt' : 'Fortschritte'} · ${Math.round(gainRatio * 100)} % deines Schnitts`, `${prs} ${prs === 1 ? 'record' : 'records'} · ${ups} progress · ${Math.round(gainRatio * 100)} % of your average`),
      tip: gainRatio >= full ? tr('Mehr Verbesserungen als sonst – stark.', 'More improvements than usual – strong.') : tr('Schlag in möglichst vielen Sätzen dein letztes Mal; Rekorde zählen doppelt.', 'Beat your last time in as many sets as possible; records count double.'),
    })
    const strDetail = strength != null ? `1RM ${pct((strength - 1) * 100)} ${tr('(Anfang → Ende)', '(start → end)')}` : weeks < 3 ? tr('ab 3 Wochen bewertet', 'rated from 3 weeks') : tr('zu wenig gleiche Übungen', 'too few matching exercises')

    if (phase.type === 'bulk') {
      parts.push({
        key: 'weight', label: tr('Gewichtszunahme', 'Weight gain'), max: 40,
        pts: ratePct != null ? band(ratePct, -0.05, 0.2, 0.5, 1.1) * 40 : 20,
        detail: weightDetail,
        tip: ratePct == null ? tr('Wieg dich regelmäßig, damit die Zunahme bewertet werden kann.', 'Weigh yourself regularly so the gain can be rated.')
          : ratePct < 0.2 ? tr(`Zu langsam – Ziel +0,2–0,5 % pro Woche (${kg1((startKg ?? 0) * 0.002)}–${kg1((startKg ?? 0) * 0.005)}). Etwas mehr essen.`, `Too slow – aim for +0.2–0.5 % per week (${kg1((startKg ?? 0) * 0.002)}–${kg1((startKg ?? 0) * 0.005)}). Eat a bit more.`)
          : ratePct > 0.5 ? tr('Zu schnell – mehr Fett als nötig. Kalorien leicht senken.', 'Too fast – more fat than needed. Lower calories slightly.')
          : tr('Optimales Tempo für einen sauberen Bulk.', 'Optimal pace for a clean bulk.'),
      })
      parts.push({
        key: 'str', label: tr('Kraft', 'Strength'), max: 30,
        pts: strength != null ? clamp((strength - 0.96) / 0.1) * 30 : 15,
        detail: strDetail,
        tip: strength == null ? tr('Wird bewertet, sobald genug Daten da sind.', 'Rated once there is enough data.') : strength >= 1.06 ? tr('Deutlich stärker geworden.', 'Clearly got stronger.') : tr('Im Bulk sollte dein 1RM klar steigen – volle Punkte ab +6 % über die Phase.', 'In a bulk your 1RM should clearly rise – full points from +6 % over the phase.'),
      })
      parts.push(progPart(20, 1.2))
      parts.push(trainPart(10))
    } else if (phase.type === 'cut') {
      parts.push({
        key: 'weight', label: tr('Gewichtsverlust', 'Weight loss'), max: 40,
        pts: ratePct != null ? band(-ratePct, 0, 0.5, 1.0, 1.8) * 40 : 20,
        detail: weightDetail,
        tip: ratePct == null ? tr('Wieg dich regelmäßig, damit der Verlust bewertet werden kann.', 'Weigh yourself regularly so the loss can be rated.')
          : -ratePct < 0.5 ? tr(`Zu langsam – Ziel −0,5–1 % pro Woche (${kg1(-(startKg ?? 0) * 0.005)} bis ${kg1(-(startKg ?? 0) * 0.01)}).`, `Too slow – aim for −0.5–1 % per week (${kg1(-(startKg ?? 0) * 0.005)} to ${kg1(-(startKg ?? 0) * 0.01)}).`)
          : -ratePct > 1.0 ? tr('Zu schnell – du riskierst Muskel- und Kraftverlust. Etwas mehr essen.', 'Too fast – you risk losing muscle and strength. Eat a bit more.')
          : tr('Optimales Tempo – Fett runter, Muskeln bleiben.', 'Optimal pace – fat down, muscle stays.'),
      })
      parts.push({
        key: 'str', label: tr('Kraft halten', 'Keep strength'), max: 35,
        pts: strength != null ? clamp((strength - 0.9) / 0.1) * 35 : 17.5,
        detail: strDetail,
        tip: strength == null ? tr('Wird bewertet, sobald genug Daten da sind.', 'Rated once there is enough data.') : strength >= 1 ? tr('Kraft voll gehalten – perfekt im Cut.', 'Strength fully kept – perfect in a cut.') : tr('Schwer bleiben: Gewicht halten, lieber Wdh reduzieren als Last.', 'Stay heavy: keep the weight, cut reps rather than load.'),
      })
      parts.push(trainPart(15))
      parts.push(progPart(10, 0.7, tr('Fortschritt (Bonus)', 'Progress (bonus)')))
    } else {
      parts.push({
        key: 'weight', label: tr('Gewicht stabil', 'Weight stable'), max: 30,
        pts: ratePct != null ? band(ratePct, -0.6, -0.15, 0.15, 0.6) * 30 : 15,
        detail: weightDetail,
        tip: ratePct == null ? tr('Wieg dich regelmäßig.', 'Weigh yourself regularly.') : Math.abs(ratePct) <= 0.15 ? tr('Gewicht schön stabil.', 'Weight nicely stable.') : tr('Im Erhalt sollte das Gewicht kaum wandern (±0,15 % pro Woche).', 'In maintenance the weight should barely move (±0.15 % per week).'),
      })
      parts.push({
        key: 'str', label: tr('Kraft', 'Strength'), max: 25,
        pts: strength != null ? clamp((strength - 0.95) / 0.08) * 25 : 12.5,
        detail: strDetail,
        tip: strength == null ? tr('Wird bewertet, sobald genug Daten da sind.', 'Rated once there is enough data.') : tr('Auch im Erhalt langsam stärker werden.', 'Slowly get stronger in maintenance too.'),
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
