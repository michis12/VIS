import { isRealSet, workoutVolume } from './lib'
import type { WorkoutProgress } from './progress'
import type { Workout } from './types'

/**
 * Score 0–99 for a single finished workout, relative to your own history:
 *   Volumen 40      – volume vs. your last 5 workouts with the same name
 *   Fortschritt 40  – records/progress per exercise vs. your last 10 workouts
 *   Vollständigkeit 20 – trained vs. planned exercises (skips cost points)
 */
const clamp = (v: number) => Math.max(0, Math.min(1, v))

export function buildWorkoutScores(workouts: Workout[], progress: Map<string, WorkoutProgress>) {
  const scores = new Map<string, number>()
  const volByName = new Map<string, number[]>()
  const recentVol: number[] = []
  const recentGain: number[] = []
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

  for (const w of workouts) {
    if (w.status !== 'done') continue
    const vol = workoutVolume(w)
    const r = progress.get(w.id)
    const planned = w.exercises.length
    const trained = w.exercises.filter((e) => !e.skipped && e.sets.some(isRealSet)).length
    const gain = trained ? ((r?.ups ?? 0) + 2 * (r?.prs ?? 0)) / trained : 0

    const same = volByName.get(w.name) ?? []
    const baseVol = same.length ? avg(same.slice(-5)) : avg(recentVol.slice(-5))
    // full points only for clearly above-usual sessions, so 99 stays rare
    const volPts = baseVol ? clamp((vol / baseVol - 0.55) / 0.75) * 40 : 30
    const baseGain = avg(recentGain.slice(-10))
    const gainPts = baseGain ? clamp(gain / baseGain / 1.8) * 40 : gain > 0 ? 30 : 15
    const fullPts = planned ? clamp(trained / planned) * 20 : 0

    scores.set(w.id, trained ? Math.min(99, Math.round(volPts + gainPts + fullPts)) : 0)

    same.push(vol)
    volByName.set(w.name, same)
    recentVol.push(vol)
    recentGain.push(gain)
  }
  return scores
}
