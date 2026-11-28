import { kcalTarget } from './nutrition'
import type { FoodEntry, Phase, WeightEntry } from './types'

/**
 * Weekly calorie check-in (paid plans): like an adaptive TDEE. The real
 * expenditure comes from what was eaten and how the smoothed weight moved:
 *   expenditure = average intake − (trend change × 7700 kcal/kg) / days
 * and the new target is that plus / minus what the phase's pace needs.
 */

const DAY = 864e5
const t = (iso: string) => new Date(iso + 'T12:00:00').getTime()
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * Smoothed weight: an exponential moving average over days (10 % per day), so a
 * salty dinner or a missed weigh-in doesn't move it much. One point per weigh-in.
 */
export function weightTrend(weights: WeightEntry[]): { date: string; kg: number }[] {
  if (!weights.length) return []
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date))
  const out: { date: string; kg: number }[] = []
  let trend = sorted[0].kg
  let last = t(sorted[0].date)
  for (const w of sorted) {
    const days = Math.max(1, Math.round((t(w.date) - last) / DAY))
    // a gap of n days pulls as much as n daily steps would
    const k = 1 - Math.pow(0.9, days)
    trend = out.length ? trend + k * (w.kg - trend) : w.kg
    last = t(w.date)
    out.push({ date: w.date, kg: Math.round(trend * 100) / 100 })
  }
  return out
}

const trendAt = (trend: { date: string; kg: number }[], date: string) => {
  let v: number | null = null
  for (const p of trend) { if (p.date <= date) v = p.kg; else break }
  return v
}

// pace per week as a share of body weight
const PACE: Record<Phase['type'], number> = { bulk: 0.0025, cut: -0.0075, maintain: 0 }

export interface Checkin {
  ok: true
  expenditure: number
  intake: number
  days: number
  trendNow: number
  perWeek: number
  pace: number
  target: number
  current: number | null
  phase: Phase
}
export type CheckinResult = Checkin | { ok: false; reason: 'phase' | 'food' | 'weight'; have: number; need: number }

/** The check-in from the last 3 weeks (today not counted, it's still open). */
export function computeCheckin(foodLog: FoodEntry[], weights: WeightEntry[], phases: Phase[], today: string): CheckinResult {
  const phase = [...phases].sort((a, b) => a.start.localeCompare(b.start)).reverse().find((p) => p.start <= today)
  if (!phase) return { ok: false, reason: 'phase', have: 0, need: 1 }
  const end = iso(t(today) - DAY)
  const start = iso(t(today) - 21 * DAY)
  // a logged day counts when it looks complete: at least half of that day's target
  const kcal = new Map<string, number>()
  for (const e of foodLog) if (e.date >= start && e.date <= end) kcal.set(e.date, (kcal.get(e.date) ?? 0) + e.kcal)
  const full = [...kcal].filter(([d, k]) => k >= (kcalTarget(phases, d) ?? 1600) * 0.5)
  if (full.length < 10) return { ok: false, reason: 'food', have: full.length, need: 10 }
  const inWin = weights.filter((w) => w.date >= start && w.date <= end)
  const spread = inWin.length ? (t(inWin[inWin.length - 1].date) - t(inWin[0].date)) / DAY : 0
  if (inWin.length < 4 || spread < 10) return { ok: false, reason: 'weight', have: inWin.length, need: 4 }

  const trend = weightTrend(weights)
  const a = trendAt(trend, inWin[0].date)!, b = trendAt(trend, end)!
  const days = Math.max(7, (t(end) - t(inWin[0].date)) / DAY)
  const intake = full.reduce((n, [, k]) => n + k, 0) / full.length
  const expenditure = intake - ((b - a) * 7700) / days
  const pace = PACE[phase.type]
  const target = Math.round((expenditure + (b * pace * 7700) / 7) / 50) * 50
  return {
    ok: true, expenditure: Math.round(expenditure / 10) * 10, intake: Math.round(intake), days: full.length,
    trendNow: b, perWeek: ((b - a) / days) * 7, pace, target, current: kcalTarget(phases, today), phase,
  }
}

/** The check-in is due once a week (first time as soon as there is enough data). */
export const checkinDue = (lastAt: string | undefined, today: string) => !lastAt || t(today) - t(lastAt) >= 7 * DAY
