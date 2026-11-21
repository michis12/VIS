import { isRealSet, weekKey, workoutSetCount, workoutVolume } from './lib'
import type { WorkoutProgress } from './progress'
import type { Phase, WeightEntry, Workout } from './types'

/**
 * Weekly score 0–99 (Monday–Sunday), built from five parts:
 *   Training 35 · Volumen 20 · Fortschritt 25 · Konstanz 10 · Körper 10
 * Volume and progress are compared with your own recent weeks, so the score
 * tracks "a good week for you", not an absolute standard.
 */
export const WEEKLY_TARGET = 3

export interface ScorePart { key: string; label: string; pts: number; max: number; detail: string }
export interface WeekScore {
  start: string // Monday YYYY-MM-DD
  score: number
  parts: ScorePart[]
  workouts: number
  sets: number
  volume: number
  ups: number
  prs: number
  current: boolean
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const addDays = (iso: string, d: number) => {
  const t = new Date(iso + 'T12:00:00')
  t.setDate(t.getDate() + d)
  return t.toISOString().slice(0, 10)
}

export const scoreLabel = (s: number) =>
  s >= 90 ? 'Legendär' : s >= 80 ? 'Elite' : s >= 60 ? 'Stark' : s >= 40 ? 'Solide' : s > 0 ? 'Aufbau' : 'Ruhewoche'

export function weekScore(
  workouts: Workout[],
  progress: Map<string, WorkoutProgress>,
  weights: WeightEntry[],
  phases: Phase[],
  weeksAgo = 0,
): WeekScore {
  const thisMonday = weekKey(new Date().toISOString())
  const start = addDays(thisMonday, -7 * weeksAgo)
  const end = addDays(start, 7)
  const done = workouts.filter((w) => w.status === 'done')
  const inWeek = (w: Workout, s: string, e: string) => w.startedAt.slice(0, 10) >= s && w.startedAt.slice(0, 10) < e
  const week = done.filter((w) => inWeek(w, start, end))

  const volume = week.reduce((n, w) => n + workoutVolume(w), 0)
  const sets = week.reduce((n, w) => n + workoutSetCount(w), 0)
  const ups = week.reduce((n, w) => n + (progress.get(w.id)?.ups ?? 0), 0)
  const prs = week.reduce((n, w) => n + (progress.get(w.id)?.prs ?? 0), 0)

  // baseline: the 4 previous weeks that had training (volume) / 8 weeks (progress per workout)
  const prevWeeks = Array.from({ length: 8 }, (_, i) => {
    const s = addDays(start, -7 * (i + 1))
    const ws = done.filter((w) => inWeek(w, s, addDays(s, 7)))
    return { vol: ws.reduce((n, w) => n + workoutVolume(w), 0), ws }
  })
  const volBase = prevWeeks.slice(0, 4).filter((p) => p.vol > 0)
  const avgVol = volBase.length ? volBase.reduce((n, p) => n + p.vol, 0) / volBase.length : 0
  const prevWorkouts = prevWeeks.flatMap((p) => p.ws)
  const gainPer = (ws: Workout[]) =>
    ws.length ? ws.reduce((n, w) => n + (progress.get(w.id)?.ups ?? 0) + 2 * (progress.get(w.id)?.prs ?? 0), 0) / ws.length : 0
  const baseGain = gainPer(prevWorkouts)
  const thisGain = gainPer(week)

  const parts: ScorePart[] = []
  // 1 · Training
  parts.push({
    key: 'train', label: 'Training', max: 35,
    pts: Math.round(clamp(week.length / WEEKLY_TARGET) * 35),
    detail: `${week.length} / ${WEEKLY_TARGET} Workouts`,
  })
  // 2 · Volumen
  const volRatio = avgVol ? volume / avgVol : volume > 0 ? 1 : 0
  parts.push({
    key: 'vol', label: 'Volumen', max: 20,
    pts: Math.round(clamp((volRatio - 0.4) / 0.7) * 20),
    detail: avgVol ? `${Math.round(volRatio * 100)} % deines Schnitts` : 'noch kein Vergleich',
  })
  // 3 · Fortschritt
  const gainRatio = baseGain ? thisGain / baseGain : thisGain > 0 ? 1 : 0
  parts.push({
    key: 'prog', label: 'Fortschritt', max: 25,
    pts: Math.round(clamp(gainRatio / 1.2) * 25),
    detail: `${prs} Rekorde · ${ups} Fortschritte`,
  })
  // 4 · Konstanz (skipped exercises)
  const planned = week.reduce((n, w) => n + w.exercises.length, 0)
  const skipped = week.reduce((n, w) => n + w.exercises.filter((e) => e.skipped).length, 0)
  const trained = week.reduce((n, w) => n + w.exercises.filter((e) => e.sets.some(isRealSet)).length, 0)
  parts.push({
    key: 'const', label: 'Konstanz', max: 10,
    pts: planned ? Math.round(clamp(trained / planned) * 10) : 0,
    detail: planned ? (skipped ? `${skipped} Übung${skipped > 1 ? 'en' : ''} ausgelassen` : 'nichts ausgelassen') : 'kein Training',
  })
  // 5 · Körper (weight trend vs. phase)
  const phase = [...phases].reverse().find((p) => p.start < end)
  const lastIn = [...weights].reverse().find((w) => w.date >= start && w.date < end)
  const lastBefore = [...weights].reverse().find((w) => w.date < start)
  let bodyPts = 5
  let bodyDetail = 'keine Phase gesetzt'
  if (phase && lastIn && lastBefore) {
    const d = lastIn.kg - lastBefore.kg
    const fit = phase.type === 'bulk' ? d >= 0.05 && d <= 0.6 : phase.type === 'cut' ? d <= -0.15 && d >= -1 : Math.abs(d) <= 0.35
    const near = phase.type === 'bulk' ? d > -0.2 : phase.type === 'cut' ? d < 0.2 : Math.abs(d) <= 0.7
    bodyPts = fit ? 10 : near ? 6 : 2
    bodyDetail = `${d > 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')} kg · ${phase.type === 'bulk' ? 'Bulk' : phase.type === 'cut' ? 'Cut' : 'Erhalt'}`
  } else if (phase) {
    bodyDetail = 'kein Gewicht diese Woche'
  }
  parts.push({ key: 'body', label: 'Körper', max: 10, pts: bodyPts, detail: bodyDetail })

  const score = Math.min(99, parts.reduce((n, p) => n + p.pts, 0))
  return { start, score: week.length ? score : 0, parts, workouts: week.length, sets, volume, ups, prs, current: weeksAgo === 0 }
}
