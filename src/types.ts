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
  source?: 'strong' | 'fitnotes' | 'app'
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
] as const
export type MeasureKey = (typeof MEASURE_FIELDS)[number]['key']

export type Measurement = { date: string } & Partial<Record<MeasureKey, number>>

export type PhaseType = 'bulk' | 'cut' | 'maintain'

export interface Phase {
  id: string
  type: PhaseType
  start: string // YYYY-MM-DD
  calories: number
}

export interface Settings {
  restSec: number
  name?: string
  /** square JPEG data URL, 256 px */
  avatar?: string
}
