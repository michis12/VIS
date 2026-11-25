import { decStr, t } from './i18n'
import { calorieSteps, type Food, type FoodEntry, type Phase, type Recipe, type WeightEntry } from './types'

export interface Macros { kcal: number; p: number; c: number; f: number }
export const ZERO: Macros = { kcal: 0, p: 0, c: 0, f: 0 }

export const add = (a: Macros, b: Macros): Macros => ({ kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f })
export const scale = (m: Macros, k: number): Macros => ({ kcal: m.kcal * k, p: m.p * k, c: m.c * k, f: m.f * k })
export const sum = (list: Macros[]) => list.reduce(add, ZERO)

/** Raw weight of all ingredients. */
export const recipeRawWeight = (r: Recipe) => r.items.reduce((n, i) => n + i.grams, 0)
/** Weight the nutrition per 100 g refers to (cooked weight when set). */
export const recipeWeight = (r: Recipe) => r.cookedWeight || recipeRawWeight(r)
/** Totals of the whole recipe. */
export const recipeTotal = (r: Recipe): Macros => sum(r.items.map((i) => scale(i.food, i.grams / 100)))
/** Recipe as a food (per 100 g of the finished dish). */
export function recipeAsFood(r: Recipe): Food {
  const w = recipeWeight(r) || 1
  const t = scale(recipeTotal(r), 100 / w)
  return { id: r.id, name: r.name, kcal: t.kcal, p: t.p, c: t.c, f: t.f, source: 'custom' }
}

export const forGrams = (food: Macros, grams: number): Macros => scale(food, grams / 100)

/** Calorie target for a day: the phase calories that applied that day (or null without a phase). */
export function kcalTarget(phases: Phase[], date: string): number | null {
  const p = [...phases].sort((a, b) => a.start.localeCompare(b.start)).reverse().find((x) => x.start <= date)
  if (!p) return null
  const steps = calorieSteps(p)
  return [...steps].reverse().find((s) => s.from <= date)?.kcal ?? p.calories
}

/** Macro targets: protein 2 g/kg, fat 25 % of kcal, carbs the rest. */
export function macroTargets(kcal: number | null, weights: WeightEntry[]) {
  const kg = weights[weights.length - 1]?.kg ?? 80
  const p = Math.round(kg * 2)
  if (!kcal) return { kcal: null, p, c: null, f: null }
  const f = Math.round((kcal * 0.25) / 9)
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4))
  return { kcal, p, c, f }
}

export const dayTotals = (log: FoodEntry[], date: string) => sum(log.filter((e) => e.date === date))

export const round1 = (v: number) => Math.round(v * 10) / 10
export const fmtG = (v: number) => (v >= 10 ? String(Math.round(v)) : decStr(round1(v)))

// ---------------------------------------------------------------- Open Food Facts
// Free and open product database (no key). Search via search.openfoodfacts.org
// (Austria + Germany first), full nutrition by barcode via the product API.

export interface OffHit { code: string; name: string; brand?: string; kcal?: number }

/** brands come as "a,b" (product API) or ["xx:a", "b"] (search) */
const clean = (s?: unknown) => {
  const first = Array.isArray(s) ? s[0] : typeof s === 'string' ? s.split(',')[0] : ''
  return String(first ?? '').replace(/^\w\w:/, '').trim()
}

export async function offSearch(q: string, signal?: AbortSignal): Promise<OffHit[]> {
  const run = async (query: string) => {
    const url = 'https://search.openfoodfacts.org/search?page_size=25&langs=de&fields=code,product_name,product_name_de,brands,nutriments&q=' + encodeURIComponent(query)
    const r = await fetch(url, { signal })
    if (!r.ok) return []
    const j = await r.json()
    return ((j.hits ?? []) as Record<string, unknown>[])
      .map((h) => ({
        code: String(h.code ?? ''),
        name: String(h.product_name_de || h.product_name || '').trim(),
        brand: clean(h.brands) || undefined,
        kcal: (h.nutriments as Record<string, number> | undefined)?.['energy-kcal_100g'],
      }))
      .filter((h) => h.code && h.name)
  }
  const local = await run(`${q} countries:("en:austria" OR "en:germany")`)
  if (local.length >= 8) return local
  const world = await run(q)
  const seen = new Set(local.map((h) => h.code))
  return [...local, ...world.filter((h) => !seen.has(h.code))]
}

/** Full product by barcode, or null when unknown / without nutrition values. */
export async function offProduct(code: string, signal?: AbortSignal): Promise<Food | null> {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=code,product_name,product_name_de,brands,nutriments,serving_quantity,serving_size`, { signal })
  if (!r.ok) return null
  const j = await r.json()
  const p = j.product
  if (!p) return null
  const n = p.nutriments ?? {}
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] != null ? n['energy_100g'] / 4.184 : undefined)
  if (kcal == null) return null
  const sq = Number(p.serving_quantity)
  return {
    id: 'off-' + p.code,
    name: String(p.product_name_de || p.product_name || t('Produkt ', 'Product ') + p.code).trim(),
    brand: clean(p.brands) || undefined,
    kcal: Number(kcal) || 0,
    p: Number(n.proteins_100g) || 0,
    c: Number(n.carbohydrates_100g) || 0,
    f: Number(n.fat_100g) || 0,
    ...(sq > 0 ? { serving: { label: t(`1 Portion · ${Math.round(sq)} g`, `1 serving · ${Math.round(sq)} g`), g: sq } } : {}),
    source: 'off',
    barcode: String(p.code),
  }
}
