import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as cloud from './cloud'
import * as db from './db'
import type { Snapshot } from './db'
import { buildProgress } from './progress'
import { buildWorkoutScoreDetails, type WorkoutScoreDetail } from './workoutScore'
import type { Exercise, Food, FoodEntry, Measurement, Phase, Recipe, Settings, Template, WeightEntry, Workout } from './types'

interface Store extends Snapshot {
  exerciseById: Map<string, Exercise>
  active: Workout | undefined
  /** progress/record rating per finished workout + history state for the running one */
  progress: ReturnType<typeof buildProgress>
  /** score 0–99 per finished workout */
  workoutScores: Map<string, number>
  /** how each workout score came about */
  workoutScoreDetails: Map<string, WorkoutScoreDetail>
  saveWorkout: (w: Workout) => void
  deleteWorkout: (id: string) => void
  saveTemplate: (t: Template) => void
  deleteTemplate: (id: string) => void
  saveExercise: (e: Exercise) => void
  saveWeight: (w: WeightEntry) => void
  deleteWeight: (date: string) => void
  savePhase: (p: Phase) => void
  deletePhase: (id: string) => void
  saveMeasurement: (m: Measurement) => void
  deleteMeasurement: (date: string) => void
  saveSettings: (s: Settings) => void
  saveFood: (f: Food) => void
  deleteFood: (id: string) => void
  saveRecipe: (r: Recipe) => void
  deleteRecipe: (id: string) => void
  saveFoodEntry: (e: FoodEntry) => void
  deleteFoodEntry: (id: string) => void
  importSnapshot: (s: Snapshot) => Promise<void>
}

const Ctx = createContext<Store | null>(null)

function upsert<T>(list: T[], item: T, key: (t: T) => string, sortKey?: (t: T) => string) {
  const k = key(item)
  const next = list.filter((x) => key(x) !== k)
  next.push(item)
  if (sortKey) next.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  return next
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    db.loadAll().then(setSnap, (e) => setError(String(e)))
    db.requestPersistence()
  }, [])

  const mutate = useCallback((fn: (s: Snapshot) => Snapshot) => setSnap((s) => (s ? fn(s) : s)), [])

  // cloud backup: upload 15 s after the last change, and right away when the app goes to the background
  const latest = useRef<Snapshot | null>(null)
  const dirty = useRef(false)
  useEffect(() => {
    if (!snap) return
    if (latest.current) dirty.current = true
    latest.current = snap
    if (!cloud.cloudConfigured || !cloud.cloudReady()) return
    const t = setTimeout(() => flush(), 15000)
    return () => clearTimeout(t)
  }, [snap])
  const flush = useCallback(() => {
    if (!dirty.current || !latest.current || !cloud.cloudReady()) return
    dirty.current = false
    cloud.upload(latest.current).catch(() => { dirty.current = true })
  }, [])
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [flush])

  const workouts = snap?.workouts
  const progress = useMemo(() => buildProgress(workouts ?? []), [workouts])
  const workoutScoreDetails = useMemo(() => buildWorkoutScoreDetails(workouts ?? [], progress.byId), [workouts, progress])
  const workoutScores = useMemo(() => new Map([...workoutScoreDetails].map(([id, d]) => [id, d.score])), [workoutScoreDetails])

  const store = useMemo<Store | null>(() => {
    if (!snap) return null
    return {
      ...snap,
      exerciseById: new Map(snap.exercises.map((e) => [e.id, e])),
      progress,
      workoutScores,
      workoutScoreDetails,
      active: snap.workouts.find((w) => w.status === 'active'),
      saveWorkout: (w) => {
        db.put('workouts', w)
        mutate((s) => ({ ...s, workouts: upsert(s.workouts, w, (x) => x.id, (x) => x.startedAt) }))
      },
      deleteWorkout: (id) => {
        db.del('workouts', id)
        mutate((s) => ({ ...s, workouts: s.workouts.filter((w) => w.id !== id) }))
      },
      saveTemplate: (t) => {
        db.put('templates', t)
        mutate((s) => ({ ...s, templates: upsert(s.templates, t, (x) => x.id, (x) => x.name) }))
      },
      deleteTemplate: (id) => {
        db.del('templates', id)
        mutate((s) => ({ ...s, templates: s.templates.filter((t) => t.id !== id) }))
      },
      saveExercise: (e) => {
        db.put('exercises', e)
        mutate((s) => ({ ...s, exercises: upsert(s.exercises, e, (x) => x.id, (x) => x.name) }))
      },
      saveWeight: (w) => {
        db.put('weights', w)
        mutate((s) => ({ ...s, weights: upsert(s.weights, w, (x) => x.date, (x) => x.date) }))
      },
      deleteWeight: (date) => {
        db.del('weights', date)
        mutate((s) => ({ ...s, weights: s.weights.filter((w) => w.date !== date) }))
      },
      savePhase: (p) => {
        db.put('phases', p)
        mutate((s) => ({ ...s, phases: upsert(s.phases, p, (x) => x.id, (x) => x.start) }))
      },
      deletePhase: (id) => {
        db.del('phases', id)
        mutate((s) => ({ ...s, phases: s.phases.filter((p) => p.id !== id) }))
      },
      saveMeasurement: (m) => {
        db.put('measurements', m)
        mutate((s) => ({ ...s, measurements: upsert(s.measurements, m, (x) => x.date, (x) => x.date) }))
      },
      deleteMeasurement: (date) => {
        db.del('measurements', date)
        mutate((s) => ({ ...s, measurements: s.measurements.filter((m) => m.date !== date) }))
      },
      saveSettings: (settings) => {
        db.saveSettings(settings)
        mutate((s) => ({ ...s, settings }))
      },
      saveFood: (f) => {
        db.put('foods', f)
        mutate((s) => ({ ...s, foods: upsert(s.foods, f, (x) => x.id) }))
      },
      deleteFood: (id) => {
        db.del('foods', id)
        mutate((s) => ({ ...s, foods: s.foods.filter((x) => x.id !== id) }))
      },
      saveRecipe: (r) => {
        db.put('recipes', r)
        mutate((s) => ({ ...s, recipes: upsert(s.recipes, r, (x) => x.id, (x) => x.name) }))
      },
      deleteRecipe: (id) => {
        db.del('recipes', id)
        mutate((s) => ({ ...s, recipes: s.recipes.filter((x) => x.id !== id) }))
      },
      saveFoodEntry: (e) => {
        db.put('foodlog', e)
        mutate((s) => ({ ...s, foodLog: upsert(s.foodLog, e, (x) => x.id, (x) => x.at) }))
      },
      deleteFoodEntry: (id) => {
        db.del('foodlog', id)
        mutate((s) => ({ ...s, foodLog: s.foodLog.filter((x) => x.id !== id) }))
      },
      importSnapshot: async (s) => {
        await db.replaceAll(s)
        setSnap(await db.loadAll())
      },
    }
  }, [snap, mutate, progress, workoutScores, workoutScoreDetails])

  if (error) return <div className="boot">Daten konnten nicht geladen werden: {error}</div>
  if (!store) return <div className="boot"><div className="boot-mark">VIS</div></div>
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}
