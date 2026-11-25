import { useMemo, useState } from 'react'
import { BASICS } from '../data/foods'
import { foodAi } from '../foodAi'
import { fmtInt, haptic } from '../lib'
import { fmtG, forGrams, recipeAsFood, sum, type Macros } from '../nutrition'
import { useStore } from '../store'
import type { Food } from '../types'
import { CreditPill, useCredit } from './AiCredit'
import type { PhotoItem } from './FoodPhoto'
import { Sheet, Tap } from './ui'

/**
 * "Was soll ich noch essen?" – opened from the kcal ring. Shows what is left for
 * the day and asks the AI (Haiku) for 2–3 options built only from the user's own
 * recipes and frequently eaten foods; all values are recomputed from the app's
 * data, the AI only picks foods and amounts.
 */
interface Cand { id: string; food: Food; recipeId?: string; typ: number; count: number }
interface Option { title: string; why: string; items: PhotoItem[]; total: Macros }

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0 }

export function MealSuggest({ left, onClose, onAdd }: {
  left: { kcal: number | null; p: number; c: number | null; f: number | null }
  onClose: () => void
  onAdd: (items: PhotoItem[]) => void
}) {
  const { foodLog, recipes, foods } = useStore()
  const { credit } = useCredit()
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [options, setOptions] = useState<Option[]>([])

  // what the person actually eats: last 60 days, by frequency, with their usual amount
  const cands = useMemo(() => {
    const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)
    const seen = new Map<string, { food: Food; recipeId?: string; grams: number[] }>()
    for (const e of foodLog) {
      if (e.date < since) continue
      const r = e.ref
      const rec = r.kind === 'recipe' ? recipes.find((x) => x.id === r.id) : null
      if (r.kind === 'recipe' && !rec) continue
      const id = r.kind === 'food' ? r.food.id : r.id
      const cur = seen.get(id) ?? { food: rec ? recipeAsFood(rec) : (r as { food: Food }).food, recipeId: rec?.id, grams: [] }
      cur.grams.push(e.grams)
      seen.set(id, cur)
    }
    const out: Cand[] = [...seen.entries()]
      .map(([id, v]) => ({ id, food: v.food, recipeId: v.recipeId, typ: median(v.grams), count: v.grams.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)
    // recipes and own foods not eaten lately still count as options
    const have = new Set(out.map((c) => c.id))
    for (const r of recipes) if (!have.has(r.id)) out.push({ id: r.id, food: recipeAsFood(r), recipeId: r.id, typ: 400, count: 0 })
    for (const f of foods) if (!have.has(f.id) && out.length < 70) out.push({ id: f.id, food: f, typ: f.serving?.g ?? 100, count: 0 })
    // a few protein basics so there is always something to close the gap
    for (const id of ['b-skyr', 'b-magerquark', 'b-whey', 'b-huehnerbrust', 'b-ei', 'b-banane', 'b-haferflocken']) {
      const f = BASICS.find((x) => x.id === id)
      if (f && !have.has(id)) out.push({ id, food: f, typ: f.serving?.g ?? 150, count: 0 })
    }
    return out
  }, [foodLog, recipes, foods])

  const ask = async () => {
    setErr(null)
    setState('loading')
    try {
      const d = await foodAi({
        mode: 'suggest',
        time: new Date().toTimeString().slice(0, 5),
        left: { kcal: left.kcal ?? 0, p: left.p, c: left.c ?? 0, f: left.f ?? 0 },
        candidates: cands.map((c) => ({ id: c.id, name: c.food.name, kcal: c.food.kcal, p: c.food.p, c: c.food.c, f: c.food.f, typ: c.typ, count: c.count })),
      })
      const byId = new Map(cands.map((c) => [c.id, c]))
      const opts: Option[] = ((d?.options ?? []) as { title: string; why: string; items: { ref: string; grams: number }[] }[])
        .map((o) => {
          const items = o.items
            .filter((i) => byId.has(i.ref) && i.grams > 0)
            .map((i) => { const c = byId.get(i.ref)!; return { food: c.food, recipeId: c.recipeId, grams: Math.round(i.grams) } })
          return { title: o.title, why: o.why, items, total: sum(items.map((i) => forGrams(i.food, i.grams))) }
        })
        .filter((o) => o.items.length)
      if (!opts.length) throw new Error('Keine passenden Vorschläge – trag erst ein paar Mahlzeiten ein.')
      setOptions(opts)
      setState('done')
      haptic(true)
    } catch (e) {
      setErr((e as Error).message)
      setState('idle')
    }
  }

  const done = left.kcal != null && left.kcal <= 50 && left.p <= 5
  return (
    <Sheet onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ margin: 0, flex: 1 }}>Noch offen heute</h3>
        <CreditPill credit={credit} />
      </div>
      <div className="grid-3 nut-sum">
        <div><b className="num">{left.kcal == null ? '–' : fmtInt(Math.max(0, left.kcal))}</b><span>kcal</span></div>
        <div><b className="num">{fmtInt(Math.max(0, left.p))} g</b><span>Eiweiß</span></div>
        <div><b className="num">{left.c == null ? '–' : `${fmtInt(Math.max(0, left.c))} / ${fmtInt(Math.max(0, left.f ?? 0))}`}</b><span>KH / Fett</span></div>
      </div>

      {done ? (
        <div className="hint good"><span>Ziel für heute erreicht – nichts mehr nötig.</span></div>
      ) : state !== 'done' ? (
        <>
          {err && <div className="hint" style={{ color: 'var(--danger)' }}><span>{err}</span></div>}
          <Tap className="btn btn-chrome btn-block" style={{ marginTop: 16 }} onClick={() => state === 'idle' && ask()}>
            {state === 'loading' ? 'Wird überlegt…' : '✦ Was soll ich noch essen?'}
          </Tap>
          <div className="hint"><span>Vorschläge aus deinen Rezepten und dem, was du oft isst.</span></div>
        </>
      ) : (
        <>
          {options.map((o, i) => (
            <div key={i} className="card suggest-card">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <b style={{ flex: 1 }}>{o.title}</b>
                <span className="num faint" style={{ fontSize: 13 }}>{fmtInt(o.total.kcal)} kcal · {fmtG(o.total.p)} g E</span>
              </div>
              <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
                {o.items.map((it) => `${it.food.name} ${fmtInt(it.grams)} g`).join(' · ')}
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>{o.why}</div>
              <Tap className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => onAdd(o.items)}>Eintragen</Tap>
            </div>
          ))}
          <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={ask}>Andere Vorschläge</button>
        </>
      )}
    </Sheet>
  )
}
