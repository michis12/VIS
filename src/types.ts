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
  exercises: { exerciseId: string; sets: number }[]
}

export interface WeightEntry {
  date: string // YYYY-MM-DD
  kg: number
  source?: 'screenshot' | 'fitnotes' | 'app'
}

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
