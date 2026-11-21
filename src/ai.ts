import { supabase, getSession } from './cloud'
import { e1rm, fmtKg, isRealSet, workoutSetCount, workoutVolume } from './lib'
import type { WorkoutProgress } from './progress'
import type { Exercise, Measurement, Phase, WeightEntry, Workout } from './types'
import { MEASURE_FIELDS } from './types'
import { weekScore } from './weekly'

/**
 * KI-Coach: the app sends a compact text summary of the training data to the
 * `coach` edge function, which asks Claude and returns plain text.
 * See supabase/functions/coach.
 */
export type CoachMode = 'workout' | 'week' | 'chat'
export interface ChatTurn { role: 'user' | 'assistant'; content: string }

interface Data {
  workouts: Workout[]
  exercises: Exercise[]
  weights: WeightEntry[]
  phases: Phase[]
  measurements: Measurement[]
  progress: Map<string, WorkoutProgress>
  name?: string
}

const d = (iso: string) => iso.slice(0, 10)

/** Compact, stable text summary of everything relevant (a few thousand tokens). */
export function buildContext(data: Data): string {
  const { workouts, exercises, weights, phases, measurements, progress } = data
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const done = workouts.filter((w) => w.status === 'done')
  const lines: string[] = []

  lines.push(`# Athlet${data.name ? `: ${data.name}` : ''}`)
  const phase = phases[phases.length - 1]
  if (phase) lines.push(`Phase: ${phase.type} seit ${phase.start}, Ziel ${phase.calories} kcal/Tag`)
  const recentW = weights.slice(-12)
  if (recentW.length) lines.push(`Körpergewicht (letzte Einträge): ${recentW.map((w) => `${w.date} ${fmtKg(w.kg)}kg`).join(', ')}`)
  const m = measurements[measurements.length - 1]
  if (m) lines.push(`Körpermaße ${m.date}: ${MEASURE_FIELDS.filter((f) => m[f.key] != null).map((f) => `${f.label} ${m[f.key]}${f.unit}`).join(', ')}`)
  lines.push(`Workouts gesamt: ${done.length}, seit ${done[0] ? d(done[0].startedAt) : '–'}`)

  // weekly scores
  const weeks = Array.from({ length: 6 }, (_, i) => weekScore(workouts, progress, weights, phases, i))
  lines.push('\n# Wochenscores (0–99, neueste zuerst)')
  for (const w of weeks) lines.push(`${w.start}: ${w.score} (${w.parts.map((p) => `${p.label} ${p.pts}/${p.max}`).join(', ')}) – ${w.workouts} Workouts, ${w.prs} Rekorde, ${w.ups} Fortschritte`)

  // last workouts
  lines.push('\n# Letzte 12 Workouts')
  for (const w of done.slice(-12).reverse()) {
    const r = progress.get(w.id)
    const ex = w.exercises
      .map((e) => {
        const name = byId.get(e.exerciseId)?.name ?? e.exerciseId
        if (e.skipped) return `${name}: ausgelassen`
        const sets = e.sets.filter(isRealSet).map((s) => `${fmtKg(s.weight ?? 0)}×${s.reps}`).join(' ')
        return `${name}: ${sets}`
      })
      .join('; ')
    lines.push(`${d(w.startedAt)} ${w.name} (${w.durationSec ? Math.round(w.durationSec / 60) + ' min, ' : ''}${workoutSetCount(w)} Sätze, ${Math.round(workoutVolume(w))} kg, ${r?.prs ?? 0} Rekorde, ${r?.ups ?? 0} Fortschritte) – ${ex}`)
  }

  // per-exercise trend (most trained in the last 90 days)
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
  const recent = done.filter((w) => d(w.startedAt) >= since)
  const count = new Map<string, number>()
  for (const w of recent) for (const e of w.exercises) if (e.sets.some(isRealSet)) count.set(e.exerciseId, (count.get(e.exerciseId) ?? 0) + 1)
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
  lines.push('\n# Übungen (letzte 6 Einheiten: bester Satz / geschätztes 1RM; Allzeit-Bestwerte)')
  for (const [id] of top) {
    const sessions: string[] = []
    let bestE = 0
    let maxW = 0
    for (const w of done) {
      const e = w.exercises.find((x) => x.exerciseId === id)
      if (!e) continue
      const real = e.sets.filter(isRealSet).filter((s) => (s.weight ?? 0) <= 500)
      if (!real.length) continue
      const top1 = real.reduce((b, s) => (e1rm(s.weight ?? 0, s.reps ?? 0) > e1rm(b.weight ?? 0, b.reps ?? 0) ? s : b))
      const est = e1rm(top1.weight ?? 0, top1.reps ?? 0)
      bestE = Math.max(bestE, est)
      maxW = Math.max(maxW, ...real.map((s) => s.weight ?? 0))
      sessions.push(`${d(w.startedAt)} ${fmtKg(top1.weight ?? 0)}×${top1.reps} (${Math.round(est)})`)
    }
    const ex = byId.get(id)
    lines.push(`${ex?.name ?? id} [${ex?.muscle ?? ''}]: ${sessions.slice(-6).join(', ')} | Bestwerte: ${fmtKg(maxW)} kg, 1RM ${Math.round(bestE)}`)
  }
  return lines.join('\n')
}

/** Detail block for one workout (finish screen). */
export function describeWorkout(w: Workout, exercises: Exercise[], r?: WorkoutProgress): string {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const rows = w.exercises.map((e, i) => {
    const name = byId.get(e.exerciseId)?.name ?? e.exerciseId
    if (e.skipped) return `- ${name}: heute ausgelassen`
    const flags = r?.exercises[i]?.flags ?? []
    const sets = e.sets
      .map((s, j) => (isRealSet(s) ? `${fmtKg(s.weight ?? 0)}×${s.reps}${flags[j] === 'pr' ? ' (REKORD)' : flags[j] === 'up' ? ' (besser als letztes Mal)' : ''}` : null))
      .filter(Boolean)
      .join(', ')
    return `- ${name}: ${sets}`
  })
  return `Workout "${w.name}" am ${d(w.startedAt)}, Dauer ${w.durationSec ? Math.round(w.durationSec / 60) + ' min' : 'unbekannt'}, ${r?.prs ?? 0} Rekorde, ${r?.ups ?? 0} Fortschritte:\n${rows.join('\n')}`
}

export class CoachError extends Error {}

export async function askCoach(payload: {
  mode: CoachMode
  context: string
  focus?: string
  messages?: ChatTurn[]
}): Promise<string> {
  if (!supabase) throw new CoachError('Cloud ist nicht eingerichtet.')
  if (!(await getSession())) throw new CoachError('Bitte zuerst unter Mehr → Cloud anmelden.')
  const { data, error } = await supabase.functions.invoke('coach', { body: payload })
  if (error) {
    let msg = error.message
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.error) msg = body.error
    } catch { /* keep message */ }
    throw new CoachError(msg)
  }
  if (!data?.text) throw new CoachError('Keine Antwort erhalten.')
  return data.text as string
}

// small per-viewer cache so a report isn't re-generated (and billed) on every visit
export const cacheGet = (key: string) => { try { return localStorage.getItem('vis.ai.' + key) } catch { return null } }
export const cacheSet = (key: string, v: string) => { try { localStorage.setItem('vis.ai.' + key, v) } catch { /* ignore */ } }
