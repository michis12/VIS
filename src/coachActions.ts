import { BASICS } from './data/foods'
import { t } from './i18n'
import { fmtInt, today, uid } from './lib'
import { forGrams, recipeAsFood, recipeWeight, sum } from './nutrition'
import { muscleLabel } from './muscles'
import { calorieSteps, MEALS, type Exercise, type Food, type Meal, type Phase, type PhaseType, type Settings, type Template } from './types'
import type { useStore } from './store'

/**
 * What the coach can do in the app. The coach function proposes these; they
 * only run when the user taps them in the chat (one by one or all at once).
 */
type Store = ReturnType<typeof useStore>
interface Item { ref: string; name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number }
type ExRef = { ref: string; sets: number }
export type Action =
  | { kind: 'template'; name: string; exercises: ExRef[] }
  | { kind: 'edit_template'; id: string; name: string; exercises: ExRef[] }
  | { kind: 'order'; ids: string[] }
  | { kind: 'exercise'; name: string; muscle: string }
  | { kind: 'food'; name: string; brand: string; kcal: number; protein: number; carbs: number; fat: number; servingG: number }
  | { kind: 'recipe'; name: string; items: Item[]; cookedWeight: number }
  | { kind: 'log'; date: string; meal: Meal; items: Item[] }
  | { kind: 'weight'; date: string; kg: number }
  | { kind: 'phase'; type: PhaseType; kcal: number; start: string }
  | { kind: 'rest'; sec: number }

/** A known food the coach may refer to by id (recipes count as a food per 100 g of the dish). */
export interface KnownFood { id: string; food: Food; recipeId?: string; g?: number }

/** Recipes, own foods, recently eaten and the basics: what the coach gets as its food list. */
export function knownFoods(store: Store): KnownFood[] {
  const out: KnownFood[] = []
  const seen = new Set<string>()
  const push = (k: KnownFood) => { if (!seen.has(k.id)) { seen.add(k.id); out.push(k) } }
  for (const r of store.recipes) push({ id: r.id, food: recipeAsFood(r), recipeId: r.id, g: recipeWeight(r) })
  for (const f of store.foods) push({ id: f.id, food: f })
  for (let i = store.foodLog.length - 1, n = 0; i >= 0 && n < 40; i--, n++) {
    const r = store.foodLog[i].ref
    if (r.kind === 'food') push({ id: r.food.id, food: r.food })
  }
  for (const f of BASICS) push({ id: f.id, food: f })
  return out
}

const num = (v: unknown, lo = 0, hi = 1e5) => Math.max(lo, Math.min(hi, Number(v) || 0))
const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const dateOr = (s: unknown) => (isDate(s) ? (s as string) : today())

/** Clean up what came back from the model: drop what can't work, clamp numbers. */
export function sanitize(raw: unknown[], store: Store): Action[] {
  const out: Action[] = []
  const newNames = new Set(raw.filter((a) => (a as Action)?.kind === 'exercise').map((a) => String((a as { name: string }).name).trim().toLowerCase()))
  const exOk = (r: string) => store.exerciseById.has(r) || (r.startsWith('new:') && (newNames.has(r.slice(4).trim().toLowerCase()) || !!findExercise(store, r.slice(4))))
  const exList = (l: unknown) => (Array.isArray(l) ? l : []).filter((e) => exOk(String(e?.ref ?? ''))).map((e) => ({ ref: String(e.ref), sets: Math.round(num(e.sets, 1, 6)) || 2 }))
  const items = (l: unknown) => (Array.isArray(l) ? l : []).filter((i) => i && num(i.grams) > 0 && String(i.name ?? '').trim()).map((i) => ({
    ref: String(i.ref ?? ''), name: String(i.name).trim().slice(0, 60), grams: Math.round(num(i.grams, 1, 5000)),
    kcal: num(i.kcal, 0, 950), protein: num(i.protein, 0, 100), carbs: num(i.carbs, 0, 100), fat: num(i.fat, 0, 100),
  }))
  for (const a of raw as Record<string, unknown>[]) {
    if (!a || typeof a !== 'object') continue
    const name = String(a.name ?? '').trim().slice(0, 60)
    switch (a.kind) {
      case 'template': { const ex = exList(a.exercises); if (name && ex.length) out.push({ kind: 'template', name, exercises: ex }); break }
      case 'edit_template': {
        const tp = store.templates.find((x) => x.id === a.id)
        const ex = exList(a.exercises)
        if (tp && ex.length) out.push({ kind: 'edit_template', id: tp.id, name: name || tp.name, exercises: ex })
        break
      }
      case 'order': {
        const ids = (Array.isArray(a.ids) ? a.ids : []).map(String).filter((id, i, l) => store.templates.some((x) => x.id === id) && l.indexOf(id) === i)
        if (ids.length >= 2) out.push({ kind: 'order', ids })
        break
      }
      case 'exercise': if (name && !findExercise(store, name)) out.push({ kind: 'exercise', name, muscle: String(a.muscle ?? 'Sonstige') }); break
      case 'food': if (name && num(a.kcal) > 0) out.push({ kind: 'food', name, brand: String(a.brand ?? '').trim().slice(0, 40), kcal: num(a.kcal, 0, 950), protein: num(a.protein, 0, 100), carbs: num(a.carbs, 0, 100), fat: num(a.fat, 0, 100), servingG: num(a.servingG, 0, 2000) }); break
      case 'recipe': { const it = items(a.items); if (name && it.length) out.push({ kind: 'recipe', name, items: it, cookedWeight: num(a.cookedWeight, 0, 20000) }); break }
      case 'log': { const it = items(a.items); if (it.length) out.push({ kind: 'log', date: dateOr(a.date), meal: MEALS.some((m) => m.id === a.meal) ? a.meal as Meal : 'snack', items: it }); break }
      case 'weight': if (num(a.kg) >= 25 && num(a.kg) <= 350) out.push({ kind: 'weight', date: dateOr(a.date), kg: Math.round(num(a.kg) * 10) / 10 }); break
      case 'phase': if (['bulk', 'cut', 'maintain'].includes(String(a.type)) && num(a.kcal) >= 800) out.push({ kind: 'phase', type: a.type as PhaseType, kcal: Math.round(num(a.kcal, 800, 8000)), start: dateOr(a.start) }); break
      case 'rest': if (num(a.sec) > 0) out.push({ kind: 'rest', sec: Math.round(num(a.sec, 30, 600)) }); break
    }
  }
  return out
}

const findExercise = (store: Store, name: string) => store.exercises.find((e) => e.name.trim().toLowerCase() === name.trim().toLowerCase())

const phaseName = (p: string) => (p === 'bulk' ? 'Bulk' : p === 'cut' ? 'Cut' : t('Erhalt', 'Maintain'))
const mealName = (m: Meal) => MEALS.find((x) => x.id === m)?.label ?? m
const dayName = (d: string) => (d === today() ? t('heute', 'today') : d.split('-').reverse().slice(0, 2).join('.'))

/** Food behind an item: the known one (its exact values) or a new one from the coach's values. */
function itemFood(it: Item, known: Map<string, KnownFood>): { food: Food; recipeId?: string } {
  const k = it.ref ? known.get(it.ref) : undefined
  if (k) return { food: k.food, recipeId: k.recipeId }
  return { food: { id: 'ai-' + uid(), name: it.name, kcal: it.kcal, p: it.protein, c: it.carbs, f: it.fat, source: 'custom' } }
}
const itemsKcal = (items: Item[], known: Map<string, KnownFood>) => sum(items.map((i) => forGrams(itemFood(i, known).food, i.grams))).kcal

/** Title and one line of detail for the card in the chat. */
export function describe(a: Action, store: Store, known: Map<string, KnownFood>): { title: string; detail: string } {
  const exName = (r: string) => (r.startsWith('new:') ? r.slice(4) : store.exerciseById.get(r)?.name ?? r)
  const exs = (l: ExRef[]) => l.map((e) => `${exName(e.ref)} ×${e.sets}`).join(' · ')
  const its = (l: Item[]) => l.map((i) => `${i.grams} g ${known.get(i.ref)?.food.name ?? i.name}`).join(' · ')
  switch (a.kind) {
    case 'template': return { title: t('Neue Vorlage: ', 'New template: ') + a.name, detail: exs(a.exercises) }
    case 'edit_template': return { title: t('Vorlage ändern: ', 'Change template: ') + a.name, detail: exs(a.exercises) }
    case 'order': return { title: t('Reihenfolge der Vorlagen', 'Template order'), detail: a.ids.map((id) => store.templates.find((x) => x.id === id)?.name).join(' → ') }
    case 'exercise': return { title: t('Neue Übung: ', 'New exercise: ') + a.name, detail: muscleLabel(a.muscle) }
    case 'food': return { title: t('Neues Lebensmittel: ', 'New food: ') + a.name + (a.brand ? ` (${a.brand})` : ''), detail: t(`pro 100 g: ${fmtInt(a.kcal)} kcal · ${a.protein} g E · ${a.carbs} g K · ${a.fat} g F`, `per 100 g: ${fmtInt(a.kcal)} kcal · ${a.protein} g P · ${a.carbs} g C · ${a.fat} g F`) }
    case 'recipe': return { title: t('Neues Rezept: ', 'New recipe: ') + a.name, detail: `${its(a.items)} · ${fmtInt(itemsKcal(a.items, known))} kcal` }
    case 'log': return { title: t(`Eintragen: ${mealName(a.meal)}, ${dayName(a.date)}`, `Log: ${mealName(a.meal)}, ${dayName(a.date)}`), detail: `${its(a.items)} · ${fmtInt(itemsKcal(a.items, known))} kcal` }
    case 'weight': return { title: t('Gewicht eintragen', 'Log weight'), detail: `${a.kg} kg · ${dayName(a.date)}` }
    case 'phase': {
      const cur = store.phases[store.phases.length - 1]
      return cur && cur.type === a.type && a.start >= cur.start
        ? { title: t(`${phaseName(a.type)}: Kalorien ändern`, `${phaseName(a.type)}: change calories`), detail: t(`${fmtInt(a.kcal)} kcal/Tag ab ${dayName(a.start)}`, `${fmtInt(a.kcal)} kcal/day from ${dayName(a.start)}`) }
        : { title: t(`Neue Phase: ${phaseName(a.type)}`, `New phase: ${phaseName(a.type)}`), detail: t(`${fmtInt(a.kcal)} kcal/Tag ab ${dayName(a.start)}`, `${fmtInt(a.kcal)} kcal/day from ${dayName(a.start)}`) }
    }
    case 'rest': return { title: t('Pausenzeit', 'Rest timer'), detail: `${Math.floor(a.sec / 60)}:${String(a.sec % 60).padStart(2, '0')} min` }
  }
}

/**
 * Runs actions in order. `siblings` are the other actions of the same answer,
 * so a template can create the new exercise it needs even when that one was
 * not tapped first. Settings changes are collected and saved once.
 */
export function runActions(list: Action[], siblings: Action[], store: Store, known: Map<string, KnownFood>) {
  const made = new Map<string, Exercise>()
  const settings: Partial<Settings> = {}
  const exId = (r: string) => {
    if (!r.startsWith('new:')) return r
    const name = r.slice(4).trim()
    const key = name.toLowerCase()
    const have = made.get(key) ?? findExercise(store, name)
    if (have) return have.id
    const spec = siblings.find((s) => s.kind === 'exercise' && s.name.trim().toLowerCase() === key) as Extract<Action, { kind: 'exercise' }> | undefined
    return createExercise(name, spec?.muscle ?? 'Sonstige').id
  }
  const createExercise = (name: string, muscle: string) => {
    const e: Exercise = { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + uid().slice(0, 4), name, muscle }
    store.saveExercise(e)
    made.set(name.trim().toLowerCase(), e)
    return e
  }
  const exs = (l: ExRef[]): Template['exercises'] => l.map((e) => ({ exerciseId: exId(e.ref), sets: e.sets }))

  for (const a of list) {
    switch (a.kind) {
      case 'template': store.saveTemplate({ id: 'tpl-' + uid(), name: a.name, exercises: exs(a.exercises) }); break
      case 'edit_template': {
        const tp = store.templates.find((x) => x.id === a.id)
        if (tp) store.saveTemplate({ ...tp, name: a.name, exercises: exs(a.exercises) })
        break
      }
      case 'order': settings.templateOrder = a.ids; break
      case 'exercise': if (!made.has(a.name.trim().toLowerCase()) && !findExercise(store, a.name)) createExercise(a.name, a.muscle); break
      case 'food': store.saveFood({
        id: 'c-' + uid(), name: a.name, brand: a.brand || undefined, kcal: a.kcal, p: a.protein, c: a.carbs, f: a.fat, source: 'custom',
        ...(a.servingG > 0 ? { serving: { label: t('1 Portion', '1 serving'), g: a.servingG } } : {}),
      }); break
      case 'recipe': store.saveRecipe({
        id: 'r-' + uid(), name: a.name, items: a.items.map((i) => ({ food: itemFood(i, known).food, grams: i.grams })),
        ...(a.cookedWeight > 0 ? { cookedWeight: a.cookedWeight } : {}),
      }); break
      case 'log': {
        const at = (a.date === today() ? new Date() : new Date(a.date + 'T12:00:00'))
        const iso = new Date(at.getTime() - at.getTimezoneOffset() * 6e4).toISOString().slice(0, 19)
        for (const it of a.items) {
          const { food, recipeId } = itemFood(it, known)
          store.saveFoodEntry({
            id: uid(), date: a.date, meal: a.meal, name: food.name, grams: it.grams, ...forGrams(food, it.grams), at: iso,
            ref: recipeId ? { kind: 'recipe', id: recipeId } : { kind: 'food', food },
          })
        }
        break
      }
      case 'weight': store.saveWeight({ date: a.date, kg: a.kg, source: 'app' }); break
      case 'phase': {
        const cur = store.phases[store.phases.length - 1]
        if (cur && cur.type === a.type && a.start >= cur.start) {
          const log = calorieSteps(cur).filter((s) => s.from < a.start)
          log.push({ from: a.start, kcal: a.kcal })
          store.savePhase({ ...cur, calories: a.kcal, calorieLog: log })
        } else {
          const p: Phase = { id: uid(), type: a.type, start: a.start, calories: a.kcal }
          store.savePhase(p)
        }
        break
      }
      case 'rest': settings.restSec = a.sec; break
    }
  }
  if (Object.keys(settings).length) store.saveSettings({ ...store.settings, ...settings })
}
