import { openDB, type IDBPDatabase } from 'idb'
import { CATALOG } from './data/exercises'
import { SEED_RECIPES } from './data/foods'
import type { Exercise, Food, FoodEntry, Measurement, Phase, Recipe, Settings, Template, WeightEntry, Workout } from './types'

const DB_NAME = 'vis'
const VERSION = 3

export interface Snapshot {
  exercises: Exercise[]
  workouts: Workout[]
  templates: Template[]
  weights: WeightEntry[]
  phases: Phase[]
  /** body measurements (added later – may be missing in old backups) */
  measurements: Measurement[]
  /** nutrition (added later – may be missing in old backups) */
  foods: Food[]
  recipes: Recipe[]
  foodLog: FoodEntry[]
  settings: Settings
}

/** Fills fields missing in older backups. */
export function normalizeSnapshot(data: Partial<Snapshot>, fallback: Settings): Snapshot {
  return {
    exercises: data.exercises ?? [], workouts: data.workouts ?? [], templates: data.templates ?? [],
    weights: data.weights ?? [], phases: data.phases ?? [], measurements: data.measurements ?? [],
    foods: data.foods ?? [], recipes: data.recipes ?? [], foodLog: data.foodLog ?? [],
    settings: data.settings ?? fallback,
  }
}

/** The persisted part of the store. */
export function snapshotOf(s: Snapshot): Snapshot {
  return {
    exercises: s.exercises, workouts: s.workouts, templates: s.templates, weights: s.weights, phases: s.phases,
    measurements: s.measurements, foods: s.foods, recipes: s.recipes, foodLog: s.foodLog, settings: s.settings,
  }
}

let dbp: Promise<IDBPDatabase> | null = null

function db() {
  dbp ??= openDB(DB_NAME, VERSION, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('exercises', { keyPath: 'id' })
        d.createObjectStore('workouts', { keyPath: 'id' })
        d.createObjectStore('templates', { keyPath: 'id' })
        d.createObjectStore('weights', { keyPath: 'date' })
        d.createObjectStore('phases', { keyPath: 'id' })
        d.createObjectStore('meta')
      }
      if (oldVersion < 2) d.createObjectStore('measurements', { keyPath: 'date' })
      if (oldVersion < 3) {
        d.createObjectStore('foods', { keyPath: 'id' })
        d.createObjectStore('recipes', { keyPath: 'id' })
        d.createObjectStore('foodlog', { keyPath: 'id' })
      }
    },
    // a newer version (other tab / after an update) needs the database: let go and reload
    blocking() {
      void dbp?.then((x) => x.close())
      location.reload()
    },
  })
  return dbp
}

export const DEFAULT_SETTINGS: Settings = { restSec: 180 }

interface SeedFix {
  workoutId: string
  exerciseId: string
  set: number
  from: { weight: number; reps: number }
  to: { weight: number; reps: number }
}
type Seed = Omit<Snapshot, 'phases' | 'settings'> & { version: number; fixes?: SeedFix[] }

/** Loads everything; on first start imports the bundled history, later seed versions are migrated in. */
export async function loadAll(): Promise<Snapshot> {
  const d = await db()
  const seeded = await d.get('meta', 'seeded')
  const seedVersion: number = (await d.get('meta', 'seedVersion')) ?? (seeded ? 1 : 0)
  const seed = (await import('./data/seed.json')).default as unknown as Seed
  if (!seeded) {
    const tx = d.transaction(['exercises', 'workouts', 'templates', 'weights', 'meta'], 'readwrite')
    for (const e of seed.exercises) tx.objectStore('exercises').put(e)
    for (const w of seed.workouts) tx.objectStore('workouts').put(w)
    for (const t of seed.templates) tx.objectStore('templates').put(t)
    for (const w of seed.weights) tx.objectStore('weights').put(w)
    tx.objectStore('meta').put(true, 'seeded')
    tx.objectStore('meta').put(seed.version, 'seedVersion')
    await tx.done
  } else if (seedVersion < 2 && seed.version >= 2) {
    // v2: provisional templates replaced by the real split, new exercises added
    const tx = d.transaction(['exercises', 'templates', 'meta'], 'readwrite')
    const ex = tx.objectStore('exercises')
    for (const e of seed.exercises) if (!(await ex.get(e.id))) ex.put(e)
    for (const id of ['tpl-push', 'tpl-pull', 'tpl-core', 'tpl-abs-arms']) tx.objectStore('templates').delete(id)
    for (const t of seed.templates) tx.objectStore('templates').put(t)
    tx.objectStore('meta').put(2, 'seedVersion')
    await tx.done
  }
  if (seeded && seedVersion < 3 && seed.version >= 3) {
    // v3: older FitNotes history (2024) – only adds what is missing, never overwrites
    const tx = d.transaction(['exercises', 'workouts', 'weights', 'meta'], 'readwrite')
    const ex = tx.objectStore('exercises')
    const wo = tx.objectStore('workouts')
    const we = tx.objectStore('weights')
    for (const e of seed.exercises) if (!(await ex.get(e.id))) ex.put(e)
    for (const w of seed.workouts) if (w.source === 'fitnotes' && !(await wo.get(w.id))) wo.put(w)
    for (const w of seed.weights) if (w.source === 'fitnotes' && !(await we.get(w.date))) we.put(w)
    tx.objectStore('meta').put(3, 'seedVersion')
    await tx.done
  }
  if (seeded && seedVersion < 4 && seed.version >= 4) {
    // v4: typo fixes in imported history – only where the old typo is still unchanged
    const tx = d.transaction(['workouts', 'meta'], 'readwrite')
    const wo = tx.objectStore('workouts')
    for (const f of seed.fixes ?? []) {
      const w: Workout | undefined = await wo.get(f.workoutId)
      const s = w?.exercises.find((e) => e.exerciseId === f.exerciseId)?.sets[f.set]
      if (w && s && s.weight === f.from.weight && s.reps === f.from.reps) {
        s.weight = f.to.weight
        s.reps = f.to.reps
        wo.put(w)
      }
    }
    tx.objectStore('meta').put(seed.version, 'seedVersion')
    await tx.done
  }
  // standard exercise catalog: adds whatever is missing (by id or name) on every start,
  // so it also comes back after restoring an older backup; nothing existing is touched
  {
    const have = (await d.getAll('exercises')) as Exercise[]
    const ids = new Set(have.map((e) => e.id)), names = new Set(have.map((e) => e.name.toLowerCase()))
    const missing = CATALOG.filter((e) => !ids.has(e.id) && !names.has(e.name.toLowerCase()))
    if (missing.length) {
      const tx = d.transaction('exercises', 'readwrite')
      for (const e of missing) tx.store.put(e)
      await tx.done
    }
  }
  // the assisted dip is done triceps-focused: once per device, every template and past
  // workout with the chest version moves to "Triceps Dip (Assisted)" (records go along)
  if (!(await d.get('meta', 'dipsTriceps'))) {
    const FROM = 'chest-dip-assisted', TO = 'triceps-dip-assisted'
    const tx = d.transaction(['workouts', 'templates', 'meta'], 'readwrite')
    for (const w of (await tx.objectStore('workouts').getAll()) as Workout[]) {
      if (!w.exercises.some((e) => e.exerciseId === FROM)) continue
      tx.objectStore('workouts').put({ ...w, exercises: w.exercises.map((e) => (e.exerciseId === FROM ? { ...e, exerciseId: TO } : e)) })
    }
    for (const t of (await tx.objectStore('templates').getAll()) as Template[]) {
      if (!t.exercises.some((e) => e.exerciseId === FROM)) continue
      tx.objectStore('templates').put({ ...t, exercises: t.exercises.map((e) => (e.exerciseId === FROM ? { ...e, exerciseId: TO } : e)) })
    }
    tx.objectStore('meta').put(true, 'dipsTriceps')
    await tx.done
  }
  // starter recipes, once per device (again after restoring a backup that has none)
  if (!(await d.get('meta', 'recipesSeeded'))) {
    const tx = d.transaction(['recipes', 'meta'], 'readwrite')
    for (const r of SEED_RECIPES) if (!(await tx.objectStore('recipes').get(r.id))) tx.objectStore('recipes').put(r)
    tx.objectStore('meta').put(true, 'recipesSeeded')
    await tx.done
  }
  const [exercises, workouts, templates, weights, phases, settings, measurements, foods, recipes, foodLog] = await Promise.all([
    d.getAll('exercises'),
    d.getAll('workouts'),
    d.getAll('templates'),
    d.getAll('weights'),
    d.getAll('phases'),
    d.get('meta', 'settings'),
    d.getAll('measurements'),
    d.getAll('foods'),
    d.getAll('recipes'),
    d.getAll('foodlog'),
  ])
  recipes.sort((a, b) => a.name.localeCompare(b.name, 'de'))
  foodLog.sort((a, b) => a.at.localeCompare(b.at))
  measurements.sort((a, b) => a.date.localeCompare(b.date))
  workouts.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  templates.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
  weights.sort((a, b) => a.date.localeCompare(b.date))
  phases.sort((a, b) => a.start.localeCompare(b.start))
  return { exercises, workouts, templates, weights, phases, measurements, foods, recipes, foodLog, settings: { ...DEFAULT_SETTINGS, ...settings } }
}

type Store = 'exercises' | 'workouts' | 'templates' | 'weights' | 'phases' | 'measurements' | 'foods' | 'recipes' | 'foodlog'

export async function put<T>(store: Store, value: T) {
  await (await db()).put(store, value)
}

export async function del(store: Store, key: string) {
  await (await db()).delete(store, key)
}

export async function saveSettings(s: Settings) {
  await (await db()).put('meta', s, 'settings')
}

/** Full replace, used by backup import. */
export async function replaceAll(s: Snapshot) {
  const d = await db()
  const map: [Store, keyof Snapshot][] = [
    ['exercises', 'exercises'], ['workouts', 'workouts'], ['templates', 'templates'], ['weights', 'weights'],
    ['phases', 'phases'], ['measurements', 'measurements'], ['foods', 'foods'], ['recipes', 'recipes'], ['foodlog', 'foodLog'],
  ]
  const tx = d.transaction([...map.map(([st]) => st), 'meta'], 'readwrite')
  for (const [st, key] of map) {
    await tx.objectStore(st).clear()
    for (const v of (s[key] as unknown[] | undefined) ?? []) tx.objectStore(st).put(v) // old backups lack newer stores
  }
  // a backup without recipes gets the starter recipes again
  if (!s.recipes?.length) tx.objectStore('meta').delete('recipesSeeded')
  // an older backup may still have the chest dips: move them to triceps again on the next load
  tx.objectStore('meta').delete('dipsTriceps')
  tx.objectStore('meta').put(s.settings, 'settings')
  tx.objectStore('meta').put(true, 'seeded')
  tx.objectStore('meta').put(4, 'seedVersion')
  await tx.done
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
