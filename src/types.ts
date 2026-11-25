export interface Exercise {
  id: string
  name: string
  muscle: string
}

export interface SetEntry {
  weight: number | null
  reps: number | null
  done: boolean
  /** values were pre-filled as a suggestion and not yet touched */
  suggested?: boolean
}

export interface WorkoutExercise {
  exerciseId: string
  sets: SetEntry[]
  /** "heute nicht trainieren": kept in the record without values */
  skipped?: boolean
  /** superset: consecutive exercises sharing a group id are done round by round */
  group?: string
}

export type WorkoutStatus = 'active' | 'done' | 'skipped'

export interface Workout {
  id: string
  name: string
  templateId?: string
  startedAt: string // ISO local
  durationSec: number | null
  status: WorkoutStatus
  source?: 'strong' | 'fitnotes' | 'app' | 'import'
  exercises: WorkoutExercise[]
}

export interface Template {
  id: string
  name: string
  exercises: { exerciseId: string; sets: number; group?: string }[]
}

export interface WeightEntry {
  date: string // YYYY-MM-DD
  kg: number
  source?: 'screenshot' | 'fitnotes' | 'app'
}

export const MEASURE_FIELDS = [
  { key: 'arm', label: 'Oberarm', unit: 'cm' },
  { key: 'chest', label: 'Brust', unit: 'cm' },
  { key: 'waist', label: 'Taille', unit: 'cm' },
  { key: 'hips', label: 'Hüfte', unit: 'cm' },
  { key: 'thigh', label: 'Oberschenkel', unit: 'cm' },
  { key: 'calf', label: 'Wade', unit: 'cm' },
  { key: 'neck', label: 'Nacken', unit: 'cm' },
  { key: 'bodyFat', label: 'Körperfett', unit: '%' },
  { key: 'muscle', label: 'Muskelmasse', unit: 'kg' },
] as const
export type MeasureKey = (typeof MEASURE_FIELDS)[number]['key']

export type Measurement = { date: string } & Partial<Record<MeasureKey, number>>

export type PhaseType = 'bulk' | 'cut' | 'maintain'

export interface Phase {
  id: string
  type: PhaseType
  start: string // YYYY-MM-DD
  /** current calories (= last entry of calorieLog) */
  calories: number
  /** calorie changes within the same phase, oldest first; first entry starts at `start` */
  calorieLog?: { from: string; kcal: number }[]
}

/** Calorie steps of a phase (always at least one, starting at the phase start). */
export function calorieSteps(p: Phase): { from: string; kcal: number }[] {
  const log = (p.calorieLog ?? []).filter((e) => e.from >= p.start).sort((a, b) => a.from.localeCompare(b.from))
  if (!log.length || log[0].from !== p.start) log.unshift({ from: p.start, kcal: log[0]?.kcal ?? p.calories })
  return log
}

/** Time-weighted average calories of a phase up to `end` (exclusive). */
export function avgCalories(p: Phase, end: string): number {
  const steps = calorieSteps(p)
  const t = (iso: string) => new Date(iso + 'T12:00:00').getTime()
  let sum = 0, days = 0
  steps.forEach((s, i) => {
    const to = Math.min(t(steps[i + 1]?.from ?? end), t(end))
    const d = Math.max(0, (to - t(s.from)) / 864e5)
    sum += s.kcal * d
    days += d
  })
  return days ? Math.round(sum / days) : p.calories
}

export interface Settings {
  restSec: number
  name?: string
  /** square JPEG data URL, 256 px */
  avatar?: string
  /** body data for the phase planner */
  heightCm?: number
  birthYear?: number
  sex?: 'm' | 'f'
}

// ---- Ernährung

/** Nutrition per 100 g (or 100 ml). */
export interface Food {
  id: string
  name: string
  brand?: string
  kcal: number
  p: number
  c: number
  f: number
  /** optional portion, e.g. { label: '1 Ei', g: 55 } */
  serving?: { label: string; g: number }
  source: 'basic' | 'off' | 'custom'
  barcode?: string
}

export interface RecipeItem { food: Food; grams: number }

export interface Recipe {
  id: string
  name: string
  items: RecipeItem[]
  /** weight after cooking; nutrition per 100 g is based on this when set */
  cookedWeight?: number
}

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export const MEALS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Frühstück' },
  { id: 'lunch', label: 'Mittagessen' },
  { id: 'dinner', label: 'Abendessen' },
  { id: 'snack', label: 'Snacks' },
]

export interface FoodEntry {
  id: string
  date: string // YYYY-MM-DD
  meal: Meal
  name: string
  grams: number
  /** totals for `grams` */
  kcal: number
  p: number
  c: number
  f: number
  ref: { kind: 'food'; food: Food } | { kind: 'recipe'; id: string }
  at: string // ISO local, when it was logged
}
