import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, Sheet } from '../components/ui'
import { fmtInt, uid } from '../lib'
import { fmtG, forGrams, recipeRawWeight, recipeTotal, recipeWeight, scale } from '../nutrition'
import { useStore } from '../store'
import type { Recipe, RecipeItem } from '../types'
import { FoodPicker } from './Nutrition'

/** Create / edit a recipe: ingredients with grams, optional cooked weight. */
export function RecipeEditor({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const store = useStore()
  const [r, setR] = useState<Recipe>(() => recipe ?? { id: 'r-' + uid(), name: '', items: [] })
  const [picking, setPicking] = useState(false)
  const [edit, setEdit] = useState<number | null>(null)
  const [cooked, setCooked] = useState(r.cookedWeight ? String(r.cookedWeight) : '')
  const [confirmDel, setConfirmDel] = useState(false)

  const raw = recipeRawWeight(r)
  const cookedW = Number(cooked.replace(',', '.')) || 0
  const draft: Recipe = { ...r, cookedWeight: cookedW > 0 ? cookedW : undefined }
  const total = recipeTotal(draft)
  const per100 = scale(total, 100 / (recipeWeight(draft) || 1))
  const setItem = (i: number, it: RecipeItem | null) =>
    setR({ ...r, items: it ? r.items.map((x, j) => (j === i ? it : x)) : r.items.filter((_, j) => j !== i) })

  const save = () => {
    const next: Recipe = { id: r.id, name: r.name.trim(), items: r.items }
    if (cookedW > 0) next.cookedWeight = cookedW
    store.saveRecipe(next)
    onClose()
  }

  return createPortal(
    <div className="fullsheet">
      <div className="fullsheet-head">
        <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon.back /></button>
        <div className="grow" style={{ fontWeight: 700, fontSize: 18 }}>{recipe ? 'Rezept bearbeiten' : 'Neues Rezept'}</div>
        <button className="btn btn-chrome btn-sm" disabled={!r.name.trim() || !r.items.length} onClick={save}>Speichern</button>
      </div>
      <div className="fullsheet-body">
        <label className="lbl">Name</label>
        <input className="input" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="z. B. Chili con Carne" />

        <div className="section-title" style={{ marginTop: 18 }}><h2 style={{ fontSize: 17 }}>Zutaten</h2><button className="link" onClick={() => setPicking(true)}>+ Zutat</button></div>
        <div className="card" style={{ padding: '4px 14px' }}>
          {r.items.length === 0 && <div className="faint" style={{ padding: '14px 0' }}>Noch keine Zutaten</div>}
          {r.items.map((it, i) => {
            const m = forGrams(it.food, it.grams)
            return (
              <button key={i} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEdit(i)}>
                <div className="grow">
                  <div className="nut-entry-name">{it.food.name}</div>
                  <div className="faint num" style={{ fontSize: 12 }}>{fmtG(it.grams)} g · {fmtG(m.p)} g Eiweiß</div>
                </div>
                <span className="num">{fmtInt(m.kcal)} kcal</span>
              </button>
            )
          })}
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="pr-row num"><span className="muted">Gewicht der Zutaten</span><b>{fmtInt(raw)} g</b></div>
          <div className="pr-row" style={{ alignItems: 'center' }}>
            <span className="muted">Gekocht (optional)</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input className="input num nut-cooked" inputMode="decimal" placeholder="–" value={cooked} onChange={(e) => setCooked(e.target.value)} /> g
            </span>
          </div>
          <div className="pr-row num"><span className="muted">Gesamt</span><b>{fmtInt(total.kcal)} kcal · {fmtG(total.p)} g E</b></div>
          <div className="pr-row num"><span className="muted">Pro 100 g</span><b>{fmtInt(per100.kcal)} kcal · {fmtG(per100.p)} E · {fmtG(per100.c)} K · {fmtG(per100.f)} F</b></div>
        </div>
        <div className="hint"><span>Beim Eintragen wählst du die Menge vom fertigen Gericht in g oder als ¼ / ½ / ganz. Wiegst du gekocht ab, hier das Gewicht nach dem Kochen eintragen.</span></div>

        {recipe && (
          confirmDel
            ? <button className="btn btn-danger btn-block" style={{ marginTop: 18 }} onClick={() => { store.deleteRecipe(r.id); onClose() }}>Wirklich löschen</button>
            : <button className="btn btn-ghost btn-block" style={{ marginTop: 18 }} onClick={() => setConfirmDel(true)}>Rezept löschen</button>
        )}
      </div>

      {picking && (
        <FoodPicker
          title="Zutat hinzufügen"
          noRecipes
          onClose={() => setPicking(false)}
          onPickMany={(items) => { setR((x) => ({ ...x, items: [...x.items, ...items.map((i) => ({ food: i.food, grams: i.grams }))] })); setPicking(false) }}
          onPick={(p, grams) => {
            if (p.kind === 'food') setR((x) => ({ ...x, items: [...x.items, { food: p.food, grams }] }))
            if (p.kind === 'food' && p.food.source === 'off') store.saveFood(p.food)
            setPicking(false)
          }}
        />
      )}
      {edit != null && r.items[edit] && (
        <ItemSheet
          item={r.items[edit]}
          onClose={() => setEdit(null)}
          onSave={(g) => { setItem(edit, { ...r.items[edit], grams: g }); setEdit(null) }}
          onDelete={() => { setItem(edit, null); setEdit(null) }}
        />
      )}
    </div>,
    document.body,
  )
}

function ItemSheet({ item, onClose, onSave, onDelete }: { item: RecipeItem; onClose: () => void; onSave: (g: number) => void; onDelete: () => void }) {
  const [t, setT] = useState(String(item.grams).replace('.', ','))
  const g = Math.max(0, Number(t.replace(',', '.')) || 0)
  return (
    <Sheet onClose={onClose}>
      <h3>{item.food.name}</h3>
      <div className="nut-amount">
        <input className="field num" inputMode="decimal" value={t} onChange={(e) => setT(e.target.value)} onFocus={(e) => e.target.select()} />
        <span className="muted">g</span>
      </div>
      <p className="faint num" style={{ fontSize: 13, textAlign: 'center' }}>{fmtInt(forGrams(item.food, g).kcal)} kcal</p>
      <button className="btn btn-chrome btn-block" style={{ marginTop: 12 }} disabled={g <= 0} onClick={() => onSave(g)}>Übernehmen</button>
      <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={onDelete}>Zutat entfernen</button>
    </Sheet>
  )
}
