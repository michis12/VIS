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

/** Loads everything; on first start imports the bundled history. */
export async function loadAll(): Promise<Snapshot> {
  const d = await db()
  if (!(await d.get('meta', 'seeded'))) {
    const seed = (await import('./data/seed.json')).default as unknown as Omit<Snapshot, 'phases' | 'settings'>
    const tx = d.transaction(['exercises', 'workouts', 'templates', 'weights', 'meta'], 'readwrite')
    for (const e of seed.exercises) tx.objectStore('exercises').put(e)
    for (const w of seed.workouts) tx.objectStore('workouts').put(w)
    for (const t of seed.templates) tx.objectStore('templates').put(t)
    for (const w of seed.weights) tx.objectStore('weights').put(w)
    tx.objectStore('meta').put(true, 'seeded')
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
  await tx.done
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
