import { e1rm, isAssisted, isRealSet } from './lib'
import type { SetEntry, Workout } from './types'

/**
 * Progress & records per set.
 * - 'up'  (Fortschritt): better than the same set of the previous session of that
 *          exercise – more weight, or the same weight with more reps.
 * - 'pr'  (Rekord): heaviest weight ever for the exercise, or best estimated 1RM ever.
 *          The first session of an exercise has no baseline, so it sets no record.
 * A set that is a record is not additionally counted as progress.
 * Assisted exercises (assisted pull-ups, dips) count the other way round: the
 * weight is help, so less weight is progress and the lowest weight is the record.
 */
export type SetFlag = 'up' | 'pr' | null

export interface ExerciseProgress {
  ups: number
  prs: number
  flags: SetFlag[] // aligned with exercise.sets
}

export interface WorkoutProgress {
  ups: number
  prs: number
  exercises: ExerciseProgress[] // aligned with workout.exercises
}

interface ExState {
  last: SetEntry[] // real sets of the previous session
  maxW: number
  bestE: number
  /** lowest weight ever (assisted exercises) */
  minW: number
}
export type ProgressState = Map<string, ExState>

const PLAUSIBLE = (s: SetEntry) => isRealSet(s) && (s.weight ?? 0) <= 500

/** Rates a workout against the history in `state` (state is not changed). */
export function rateWorkout(w: Workout, state: ProgressState, onlyDone = true): WorkoutProgress {
  let ups = 0
  let prs = 0
  const exercises = w.exercises.map((e) => {
    const st = state.get(e.exerciseId)
    let maxW = st?.maxW ?? 0
    let bestE = st?.bestE ?? 0
    let minW = st?.minW ?? Infinity
    const assisted = isAssisted(e.exerciseId)
    const real = st?.last ?? []
    let realIdx = 0
    let exUps = 0
    let exPrs = 0
    const flags: SetFlag[] = e.sets.map((s) => {
      if (e.skipped || !PLAUSIBLE(s) || (onlyDone && !s.done)) return null
      const kg = s.weight ?? 0
      const reps = s.reps ?? 0
      const est = e1rm(kg, reps)
      const prev = real[realIdx++]
      let flag: SetFlag = null
      if (assisted) {
        // less help than ever = record; less help or more reps with the same help = progress
        if (st && kg < minW) flag = 'pr'
        else if (prev && (kg < (prev.weight ?? 0) || (kg === prev.weight && reps > (prev.reps ?? 0)))) flag = 'up'
      } else if (st && (kg > maxW || est > bestE + 0.05)) flag = 'pr'
      else if (prev && (kg > (prev.weight ?? 0) || (kg === prev.weight && reps > (prev.reps ?? 0)))) flag = 'up'
      minW = Math.min(minW, kg)
      maxW = Math.max(maxW, kg)
      bestE = Math.max(bestE, est)
      if (flag === 'pr') exPrs++
      if (flag === 'up') exUps++
      return flag
    })
    ups += exUps
    prs += exPrs
    return { ups: exUps, prs: exPrs, flags }
  })
  return { ups, prs, exercises }
}

/** Adds a finished workout to the history state. */
export function applyWorkout(w: Workout, state: ProgressState) {
  for (const e of w.exercises) {
    if (e.skipped) continue
    const real = e.sets.filter(PLAUSIBLE)
    if (!real.length) continue
    const st = state.get(e.exerciseId) ?? { last: [], maxW: 0, bestE: 0, minW: Infinity }
    for (const s of real) {
      st.maxW = Math.max(st.maxW, s.weight ?? 0)
      st.minW = Math.min(st.minW, s.weight ?? 0)
      st.bestE = Math.max(st.bestE, e1rm(s.weight ?? 0, s.reps ?? 0))
    }
    st.last = real
    state.set(e.exerciseId, st)
  }
}

/**
 * Walks all finished workouts in order. Returns the rating of each finished
 * workout (against everything before it) and the state after the last one,
 * which is what a running workout is compared to.
 */
export function buildProgress(workouts: Workout[]) {
  const state: ProgressState = new Map()
  const byId = new Map<string, WorkoutProgress>()
  for (const w of workouts) {
    if (w.status !== 'done') continue
    byId.set(w.id, rateWorkout(w, state))
    applyWorkout(w, state)
  }
  return { byId, state }
}
