import { openDB, type IDBPDatabase } from 'idb'
import type { Exercise, Phase, Settings, Template, WeightEntry, Workout } from './types'

const DB_NAME = 'vis'
const VERSION = 1

export interface Snapshot {
  exercises: Exercise[]
  workouts: Workout[]
  templates: Template[]
  weights: WeightEntry[]
  phases: Phase[]
  settings: Settings
}

let dbp: Promise<IDBPDatabase> | null = null

function db() {
  dbp ??= openDB(DB_NAME, VERSION, {
    upgrade(d) {
      d.createObjectStore('exercises', { keyPath: 'id' })
      d.createObjectStore('workouts', { keyPath: 'id' })
      d.createObjectStore('templates', { keyPath: 'id' })
      d.createObjectStore('weights', { keyPath: 'date' })
      d.createObjectStore('phases', { keyPath: 'id' })
      d.createObjectStore('meta')
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
  const [exercises, workouts, templates, weights, phases, settings] = await Promise.all([
    d.getAll('exercises'),
    d.getAll('workouts'),
    d.getAll('templates'),
    d.getAll('weights'),
    d.getAll('phases'),
    d.get('meta', 'settings'),
  ])
  workouts.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  templates.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
  weights.sort((a, b) => a.date.localeCompare(b.date))
  phases.sort((a, b) => a.start.localeCompare(b.start))
  return { exercises, workouts, templates, weights, phases, settings: { ...DEFAULT_SETTINGS, ...settings } }
}

type Store = 'exercises' | 'workouts' | 'templates' | 'weights' | 'phases'

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
  const stores: Store[] = ['exercises', 'workouts', 'templates', 'weights', 'phases']
  const tx = d.transaction([...stores, 'meta'], 'readwrite')
  for (const st of stores) {
    await tx.objectStore(st).clear()
    for (const v of s[st]) tx.objectStore(st).put(v)
  }
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
