import { t } from './i18n'
import type { Exercise, Template, Workout } from './types'

/**
 * Template rhythm: the templates run in a fixed order (Day 1, Day 2, …); after
 * the last one comes the first again. The order is kept in settings.templateOrder
 * (template ids); templates not in it follow by name.
 */
export function orderedTemplates(templates: Template[], order: string[] | undefined): Template[] {
  if (!order?.length) return templates
  const pos = new Map(order.map((id, i) => [id, i]))
  return [...templates].sort((a, b) => (pos.get(a.id) ?? 1e6) - (pos.get(b.id) ?? 1e6) || a.name.localeCompare(b.name))
}

/** Which template a finished workout came from (id first, name for older ones). */
const templateOf = (templates: Template[], w: Workout) =>
  templates.find((x) => x.id === w.templateId) ?? templates.find((x) => x.name === w.name)

/** The template that is up next: the one after the last trained template. */
export function nextTemplate(ordered: Template[], workouts: Workout[]): Template | null {
  if (!ordered.length) return null
  for (let i = workouts.length - 1; i >= 0; i--) {
    const w = workouts[i]
    if (w.status !== 'done') continue
    const tp = templateOf(ordered, w)
    if (!tp) continue
    return ordered[(ordered.indexOf(tp) + 1) % ordered.length]
  }
  return ordered[0]
}

/** Share of the work sets per muscle group of a template. */
function muscleShare(tp: Template, exById: Map<string, Exercise>) {
  const m = new Map<string, number>()
  let n = 0
  for (const e of tp.exercises) {
    const g = exById.get(e.exerciseId)?.muscle ?? 'Sonstige'
    m.set(g, (m.get(g) ?? 0) + e.sets)
    n += e.sets
  }
  for (const [k, v] of m) m.set(k, v / (n || 1))
  return m
}

/** 0 = completely different muscles, 1 = the same */
function overlap(a: Map<string, number>, b: Map<string, number>) {
  let s = 0
  for (const [k, v] of a) s += Math.min(v, b.get(k) ?? 0)
  return s
}

/**
 * A sensible order: follows how the templates were actually trained one after
 * another; where the history says nothing, the next day trains the muscles that
 * the previous one did not (Upper → Lower, Push → Pull → Legs).
 */
export function smartOrder(templates: Template[], workouts: Workout[], exById: Map<string, Exercise>): { ids: string[]; why: string } {
  if (templates.length < 2) return { ids: templates.map((x) => x.id), why: '' }
  const seq = workouts.filter((w) => w.status === 'done').map((w) => ({ tp: templateOf(templates, w), at: w.startedAt })).filter((x) => x.tp).slice(-80)
  const succ = new Map<string, Map<string, number>>()
  let fromHistory = 0
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1].tp!.id, b = seq[i].tp!.id
    if (a === b) continue
    const m = succ.get(a) ?? new Map<string, number>()
    m.set(b, (m.get(b) ?? 0) + 1)
    succ.set(a, m)
    fromHistory++
  }
  const shares = new Map(templates.map((x) => [x.id, muscleShare(x, exById)]))
  const num = (x: Template) => Number(x.name.match(/\d+/)?.[0] ?? NaN)

  // start: "Day 1" if the names are numbered, else what usually comes after a longer break, else the first one
  let start = templates[0]
  const numbered = templates.filter((x) => !Number.isNaN(num(x)))
  if (numbered.length === templates.length) start = [...numbered].sort((a, b) => num(a) - num(b))[0]
  else if (seq.length >= 4) {
    const afterBreak = new Map<string, number>()
    for (let i = 1; i < seq.length; i++) {
      const gap = (new Date(seq[i].at).getTime() - new Date(seq[i - 1].at).getTime()) / 864e5
      if (gap >= 2.5) afterBreak.set(seq[i].tp!.id, (afterBreak.get(seq[i].tp!.id) ?? 0) + 1)
    }
    const best = [...afterBreak].sort((a, b) => b[1] - a[1])[0]
    if (best) start = templates.find((x) => x.id === best[0]) ?? start
  }

  const out = [start]
  const left = new Set(templates.filter((x) => x !== start).map((x) => x.id))
  let usedHistory = false
  while (left.size) {
    const cur = out[out.length - 1]
    const prev = out[out.length - 2]
    const cands = templates.filter((x) => left.has(x.id))
    const counts = succ.get(cur.id)
    const score = (x: Template) => {
      const h = counts?.get(x.id) ?? 0
      // history first; then as different from the last two days as possible; then the current order
      return h * 10 - overlap(shares.get(cur.id)!, shares.get(x.id)!) * 2 - (prev ? overlap(shares.get(prev.id)!, shares.get(x.id)!) : 0) - templates.indexOf(x) * 0.001
    }
    const pick = cands.sort((a, b) => score(b) - score(a))[0]
    if ((counts?.get(pick.id) ?? 0) > 0) usedHistory = true
    out.push(pick)
    left.delete(pick.id)
  }
  const why = usedHistory && fromHistory >= 3
    ? t('Nach deinem Verlauf: so trainierst du die Vorlagen meistens hintereinander.', 'From your history: this is the order you usually train them in.')
    : t('Nach Muskelgruppen: jeder Tag trainiert möglichst andere Muskeln als der davor.', 'By muscle groups: each day trains different muscles than the one before.')
  return { ids: out.map((x) => x.id), why }
}
