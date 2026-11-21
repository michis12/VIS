import { e1rm, fmtInt, isRealSet, weekKey, workoutSetCount, workoutVolume } from './lib'
import type { Exercise, WeightEntry, Workout } from './types'

export type Glyph =
  | 'katana' | 'mountain' | 'flame' | 'shield' | 'anvil' | 'helm' | 'axe' | 'hourglass'
  | 'moon' | 'sun' | 'fist' | 'scroll' | 'lotus' | 'bolt' | 'phoenix' | 'crown' | 'eye'

export interface AchievementDef {
  id: string
  name: string
  glyph: Glyph
  desc: string
  unit: string
  tiers: [number, number, number, number, number]
  metric: keyof Metrics
}

export interface Metrics {
  workouts: number
  volumeT: number
  sets: number
  streak: number
  exercises: number
  maxSets: number
  maxVolume: number
  hours: number
  night: number
  morning: number
  strongWeeks: number
  prs: number
  bestMonth: number
  weighIns: number
  heaviest: number
  comebacks: number
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'samurai', name: 'Samurai', glyph: 'katana', metric: 'workouts', unit: 'Workouts', desc: 'Der Weg des Kriegers beginnt mit dem ersten Schritt. Absolviere Workouts.', tiers: [25, 100, 250, 400, 600] },
  { id: 'titan', name: 'Titan', glyph: 'mountain', metric: 'volumeT', unit: 't bewegt', desc: 'Bewege Berge. Gesamtvolumen aller Sätze in Tonnen.', tiers: [100, 500, 1000, 2000, 3500] },
  { id: 'krieger', name: 'Krieger', glyph: 'axe', metric: 'sets', unit: 'Sätze', desc: 'Jeder Satz ist ein Schlag. Sammle bestätigte Sätze.', tiers: [500, 1500, 3000, 5000, 8000] },
  { id: 'unbeugsam', name: 'Unbeugsam', glyph: 'shield', metric: 'streak', unit: 'Wochen am Stück', desc: 'Längste Serie von Wochen mit mindestens einem Workout.', tiers: [4, 8, 16, 30, 52] },
  { id: 'schmied', name: 'Waffenschmied', glyph: 'anvil', metric: 'exercises', unit: 'Übungen', desc: 'Ein Meister kennt viele Waffen. Trainiere verschiedene Übungen.', tiers: [10, 20, 30, 45, 60] },
  { id: 'spartaner', name: 'Spartaner', glyph: 'helm', metric: 'maxSets', unit: 'Sätze in einem Workout', desc: 'Dies ist Sparta. Die meisten Sätze in einer einzigen Einheit.', tiers: [15, 20, 25, 30, 40] },
  { id: 'berserker', name: 'Berserker', glyph: 'fist', metric: 'maxVolume', unit: 'kg in einem Workout', desc: 'Rausch der Schlacht. Höchstes Volumen in einem Workout.', tiers: [5000, 8000, 12000, 16000, 20000] },
  { id: 'moench', name: 'Shaolin', glyph: 'hourglass', metric: 'hours', unit: 'Stunden', desc: 'Geduld formt Stahl. Gesamte Trainingszeit.', tiers: [25, 75, 150, 300, 500] },
  { id: 'nachtwolf', name: 'Nachtwolf', glyph: 'moon', metric: 'night', unit: 'Workouts ab 20 Uhr', desc: 'Jagd im Dunkeln. Trainiere am späten Abend.', tiers: [5, 20, 50, 100, 200] },
  { id: 'morgenrot', name: 'Morgenrot', glyph: 'sun', metric: 'morning', unit: 'Workouts vor 9 Uhr', desc: 'Wer früh kämpft, siegt. Trainiere vor 9 Uhr.', tiers: [1, 5, 15, 30, 60] },
  { id: 'ronin', name: 'Ronin', glyph: 'bolt', metric: 'strongWeeks', unit: 'Wochen mit 3+ Workouts', desc: 'Ohne Herrn, aber mit Disziplin. Wochen mit mindestens drei Workouts.', tiers: [5, 15, 30, 60, 100] },
  { id: 'sensei', name: 'Sensei', glyph: 'scroll', metric: 'prs', unit: 'Rekorde', desc: 'Übertriff dich selbst. Neue Bestleistungen (geschätztes 1RM) je Übung.', tiers: [10, 50, 150, 300, 500] },
  { id: 'vollmond', name: 'Vollmond', glyph: 'eye', metric: 'bestMonth', unit: 'Workouts in einem Monat', desc: 'Ein Monat voller Kampf. Die meisten Workouts in einem Kalendermonat.', tiers: [8, 12, 16, 20, 25] },
  { id: 'chronist', name: 'Chronist', glyph: 'lotus', metric: 'weighIns', unit: 'Gewichtseinträge', desc: 'Kenne deinen Körper. Trage dein Gewicht ein.', tiers: [10, 30, 60, 120, 250] },
  { id: 'gigant', name: 'Gigant', glyph: 'flame', metric: 'heaviest', unit: 'kg in einem Satz', desc: 'Rohe Kraft. Das schwerste Gewicht, das du je bewegt hast.', tiers: [60, 100, 150, 200, 250] },
  { id: 'phoenix', name: 'Phönix', glyph: 'phoenix', metric: 'comebacks', unit: 'Comebacks', desc: 'Aus der Asche. Zurück ins Training nach 14+ Tagen Pause.', tiers: [1, 2, 3, 5, 8] },
]

export const ULTIMATE = {
  name: 'Shōgun',
  desc: 'Herrscher über alle Disziplinen. Bringe jedes Achievement auf 5 Sterne.',
}

export const RANKS: { min: number; name: string }[] = [
  { min: 0, name: 'Rekrut' },
  { min: 8, name: 'Knappe' },
  { min: 16, name: 'Kämpfer' },
  { min: 26, name: 'Veteran' },
  { min: 38, name: 'Champion' },
  { min: 50, name: 'Meister' },
  { min: 62, name: 'Großmeister' },
  { min: 72, name: 'Legende' },
  { min: 80, name: 'Shōgun' },
]

/** Sets above this are treated as typos (e.g. 1174 kg). */
const MAX_PLAUSIBLE_KG = 500

export function computeMetrics(workouts: Workout[], weights: WeightEntry[], _exercises: Exercise[]): Metrics {
  const done = workouts.filter((w) => w.status === 'done')
  const m: Metrics = {
    workouts: done.length, volumeT: 0, sets: 0, streak: 0, exercises: 0, maxSets: 0, maxVolume: 0, hours: 0,
    night: 0, morning: 0, strongWeeks: 0, prs: 0, bestMonth: 0, weighIns: weights.length, heaviest: 0, comebacks: 0,
  }
  const used = new Set<string>()
  const weeks = new Map<string, number>()
  const months = new Map<string, number>()
  const best = new Map<string, number>()
  let prevDay: number | null = null

  for (const w of done) {
    const vol = workoutVolume(w)
    const sets = workoutSetCount(w)
    m.volumeT += vol / 1000
    m.sets += sets
    m.maxSets = Math.max(m.maxSets, sets)
    m.maxVolume = Math.max(m.maxVolume, vol)
    m.hours += (w.durationSec ?? 0) / 3600
    const h = Number(w.startedAt.slice(11, 13))
    if (h >= 20) m.night++
    if (h < 9) m.morning++
    const wk = weekKey(w.startedAt)
    weeks.set(wk, (weeks.get(wk) ?? 0) + 1)
    const mo = w.startedAt.slice(0, 7)
    months.set(mo, (months.get(mo) ?? 0) + 1)
    const day = new Date(w.startedAt.slice(0, 10) + 'T12:00:00').getTime()
    if (prevDay != null && day - prevDay >= 14 * 864e5) m.comebacks++
    prevDay = day

    for (const e of w.exercises) {
      const real = e.sets.filter(isRealSet).filter((s) => (s.weight ?? 0) <= MAX_PLAUSIBLE_KG)
      if (!real.length) continue
      used.add(e.exerciseId)
      let top = 0
      for (const s of real) {
        top = Math.max(top, e1rm(s.weight ?? 0, s.reps ?? 0))
        m.heaviest = Math.max(m.heaviest, s.weight ?? 0)
      }
      const prev = best.get(e.exerciseId)
      if (prev != null && top > prev) m.prs++
      if (prev == null || top > prev) best.set(e.exerciseId, top)
    }
  }
  m.exercises = used.size
  m.bestMonth = Math.max(0, ...months.values())
  m.strongWeeks = [...weeks.values()].filter((n) => n >= 3).length

  // longest run of consecutive ISO weeks
  const keys = [...weeks.keys()].sort()
  let run = 0
  let prev: number | null = null
  for (const k of keys) {
    const t = new Date(k + 'T12:00:00').getTime()
    run = prev != null && Math.round((t - prev) / (7 * 864e5)) === 1 ? run + 1 : 1
    m.streak = Math.max(m.streak, run)
    prev = t
  }
  m.volumeT = Math.floor(m.volumeT)
  m.hours = Math.floor(m.hours)
  return m
}

export interface AchievementState {
  def: AchievementDef
  value: number
  stars: number
  next: number | null
  progress: number // 0..1 towards next tier
}

export function evaluate(m: Metrics): AchievementState[] {
  return ACHIEVEMENTS.map((def) => {
    const value = m[def.metric]
    const stars = def.tiers.filter((t) => value >= t).length
    const next = stars < 5 ? def.tiers[stars] : null
    const prevT = stars > 0 ? def.tiers[stars - 1] : 0
    const progress = next == null ? 1 : Math.max(0, Math.min(1, (value - prevT) / (next - prevT)))
    return { def, value, stars, next, progress }
  })
}

export const rankFor = (stars: number) => [...RANKS].reverse().find((r) => stars >= r.min)!
export const nextRank = (stars: number) => RANKS.find((r) => r.min > stars) ?? null

export const fmtMetric = (v: number) => fmtInt(v)
