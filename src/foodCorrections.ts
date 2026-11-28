import { getSession, supabase } from './cloud'
import type { Food } from './types'

/**
 * Corrections of database products (Open Food Facts): when someone changes the
 * values of such a product, it applies for them at once (their own copy), and a
 * request goes to the owner's VIS-Officium. Accepted values land in
 * public.food_overrides (migration 0013), which every app reads, so the product
 * shows the corrected values for everyone.
 */
type Vals = { name: string; brand?: string; kcal: number; p: number; c: number; f: number; serving?: number }
const KEY = 'vis.foodOverrides'
let overrides: Record<string, Vals> = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } })()

const r1 = (v: number) => Math.round(v * 10) / 10
const vals = (f: Food): Vals => ({
  name: f.name, ...(f.brand ? { brand: f.brand } : {}), kcal: Math.round(f.kcal), p: r1(f.p), c: r1(f.c), f: r1(f.f),
  ...(f.serving ? { serving: Math.round(f.serving.g) } : {}),
})

/** Loads the accepted corrections (on start; cached for offline use). */
export async function loadOverrides() {
  if (!supabase) return
  const { data, error } = await supabase.from('food_overrides').select('food_id, barcode, values')
  if (error || !data) return
  const next: Record<string, Vals> = {}
  for (const row of data as { food_id: string; barcode: string | null; values: Vals }[]) {
    next[row.food_id] = row.values
    if (row.barcode) next['bc:' + row.barcode] = row.values
  }
  overrides = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
}

/**
 * A database product with the accepted correction applied. Only products as they
 * come from the database: the user's own edits (source "custom") always win.
 */
export function withOverride(f: Food): Food {
  if (f.source !== 'off') return f
  const o = overrides[f.id] ?? (f.barcode ? overrides['bc:' + f.barcode] : undefined)
  if (!o) return f
  return {
    ...f, name: o.name || f.name, brand: o.brand ?? f.brand, kcal: o.kcal, p: o.p, c: o.c, f: o.f,
    ...(o.serving ? { serving: { label: f.serving?.label ?? `1 Portion · ${o.serving} g`, g: o.serving } } : {}),
  }
}
export const overrideKcal = (code: string): number | undefined => overrides['off-' + code]?.kcal ?? overrides['bc:' + code]?.kcal

/**
 * Sends a correction when the values of a database product were changed.
 * Silent without an account or when nothing that matters changed.
 */
export async function sendCorrection(before: Food, after: Food) {
  if (before.source !== 'off' || !supabase || !(await getSession())) return false
  const a = vals(before), b = vals(after)
  if (JSON.stringify(a) === JSON.stringify(b)) return false
  const { error } = await supabase.from('food_corrections').insert({
    food_id: before.id, barcode: before.barcode ?? null, name: after.name.slice(0, 120), brand: after.brand?.slice(0, 80) ?? null,
    old_values: a, new_values: b,
  })
  return !error
}
