import type { PhaseScore } from './phaseScore'
import { avgCalories, calorieSteps, type FoodEntry, type Measurement, type Phase, type Settings, type WeightEntry, type Workout } from './types'

/**
 * Inputs for the AI phase planner. All the arithmetic happens here, deterministic:
 * BMR by formula (Katch-McArdle with a body-fat value, else Mifflin-St Jeor) and,
 * more important, the maintenance calories measured from the user's own data:
 * average calories over the last weeks minus what the weight trend says was
 * stored or burned (~7700 kcal per kg). The model only adds the judgement.
 */
export interface PlanData {
  weightKg: number | null
  heightCm: number | null
  age: number | null
  sex: 'm' | 'f' | null
  bodyFatPct: number | null
  muscleKg: number | null
  bmr: number | null
  bmrFormula: 'Katch-McArdle' | 'Mifflin-St Jeor' | null
  /** measured maintenance from phase calories (or logged food) and weight trend */
  measured: { kcal: number; weeks: number; basis: 'Essenslog' | 'Phasenkalorien'; avgIntake: number; kgPerWeek: number } | null
  workoutsPerWeek: number
  phases: { type: Phase['type']; start: string; weeks: number; avgKcal: number; kgPerWeek: number | null; pctPerWeek: number | null; current: boolean }[]
}

const DAY = 864e5
const t = (iso: string) => new Date(iso + 'T12:00:00').getTime()
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** least squares slope in kg per day */
function slope(pts: { x: number; y: number }[]) {
  const n = pts.length
  const mx = pts.reduce((a, p) => a + p.x, 0) / n
  const my = pts.reduce((a, p) => a + p.y, 0) / n
  const num = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0)
  const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0)
  return den ? num / den : 0
}

export function buildPlanData(input: {
  settings: Settings; weights: WeightEntry[]; measurements: Measurement[]; phases: Phase[]
  workouts: Workout[]; foodLog: FoodEntry[]; scores: PhaseScore[]
}): PlanData {
  const { settings, weights, measurements, phases, workouts, foodLog, scores } = input
  const now = Date.now()
  const weightKg = weights[weights.length - 1]?.kg ?? null
  const heightCm = settings.heightCm ?? null
  const age = settings.birthYear ? new Date().getFullYear() - settings.birthYear : null
  const sex = settings.sex ?? null
  const latest = (k: 'bodyFat' | 'muscle') => [...measurements].reverse().find((m) => m[k] != null)?.[k] ?? null
  const bodyFatPct = latest('bodyFat')
  const muscleKg = latest('muscle')

  let bmr: number | null = null
  let bmrFormula: PlanData['bmrFormula'] = null
  if (weightKg && bodyFatPct) {
    bmr = Math.round(370 + 21.6 * weightKg * (1 - bodyFatPct / 100))
    bmrFormula = 'Katch-McArdle'
  } else if (weightKg && heightCm && age && sex) {
    bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'm' ? 5 : -161))
    bmrFormula = 'Mifflin-St Jeor'
  }

  // measured maintenance over the last 6 weeks (needs 3+ weeks and 6+ weigh-ins)
  let measured: PlanData['measured'] = null
  const from = iso(now - 42 * DAY)
  const ws = weights.filter((w) => w.date >= from)
  if (ws.length >= 6 && t(ws[ws.length - 1].date) - t(ws[0].date) >= 21 * DAY) {
    const start = ws[0].date
    const end = iso(now + DAY)
    const days = (t(end) - t(start)) / DAY
    const kgPerDay = slope(ws.map((w) => ({ x: t(w.date) / DAY, y: w.kg })))
    // logged food when most days are logged, else the phase calorie targets
    const logged = new Map<string, number>()
    for (const e of foodLog) if (e.date >= start) logged.set(e.date, (logged.get(e.date) ?? 0) + e.kcal)
    const fullDays = [...logged.values()].filter((k) => k > 800)
    let avgIntake: number | null = null
    let basis: 'Essenslog' | 'Phasenkalorien' = 'Phasenkalorien'
    if (fullDays.length >= days * 0.7) {
      avgIntake = fullDays.reduce((a, b) => a + b, 0) / fullDays.length
      basis = 'Essenslog'
    } else {
      // time-weighted phase calories over the window
      let sum = 0, n = 0
      for (let d = t(start); d < t(end); d += DAY) {
        const day = iso(d)
        const p = [...phases].sort((a, b) => a.start.localeCompare(b.start)).reverse().find((x) => x.start <= day)
        if (p) { sum += currentKcal(p, day); n++ }
      }
      if (n >= days * 0.8) avgIntake = sum / n
    }
    if (avgIntake) {
      measured = {
        kcal: Math.round((avgIntake - kgPerDay * 7700) / 10) * 10,
        weeks: Math.round(days / 7),
        basis,
        avgIntake: Math.round(avgIntake),
        kgPerWeek: Math.round(kgPerDay * 7 * 100) / 100,
      }
    }
  }

  const since = iso(now - 28 * DAY)
  const workoutsPerWeek = Math.round((workouts.filter((w) => w.status === 'done' && w.startedAt.slice(0, 10) >= since).length / 4) * 10) / 10

  const recent = scores.slice(-4).map((s) => ({
    type: s.phase.type, start: s.phase.start, weeks: s.weeks, avgKcal: avgCalories(s.phase, s.end),
    kgPerWeek: s.rate, pctPerWeek: s.ratePct, current: s.current,
  }))

  return { weightKg, heightCm, age, sex, bodyFatPct, muscleKg, bmr, bmrFormula, measured, workoutsPerWeek, phases: recent }
}

/** calories of a phase on a given day */
function currentKcal(p: Phase, day: string) {
  return [...calorieSteps(p)].reverse().find((s) => s.from <= day)?.kcal ?? p.calories
}
