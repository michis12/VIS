import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Scanner } from '../components/Scanner'
import { Icon, Sheet, Tap } from '../components/ui'
import { BASICS } from '../data/foods'
import { dateLabel, fmtInt, haptic, localIso, today, uid } from '../lib'
import {
  dayTotals, fmtG, forGrams, kcalTarget, macroTargets, offProduct, offSearch, recipeAsFood, recipeTotal, recipeWeight,
  type Macros, type OffHit,
} from '../nutrition'
import { useStore } from '../store'
import type { Food, FoodEntry, Meal, Recipe } from '../types'
import { RecipeEditor } from './RecipeEditor'

const addDays = (iso: string, d: number) => {
  const t = new Date(iso + 'T12:00:00')
  t.setDate(t.getDate() + d)
  return t.toISOString().slice(0, 10)
}

const mealAt = (): Meal => {
  const h = new Date().getHours()
  return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack'
}

/** Neutral chrome up to 60 % of a goal, then fading into mint until it is reached. */
const mix = (a: string, b: string, t: number) => {
  const pa = a.match(/\w\w/g)!.map((x) => parseInt(x, 16))
  const pb = b.match(/\w\w/g)!.map((x) => parseInt(x, 16))
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')
}
const greenness = (frac: number) => Math.max(0, Math.min(1, (frac - 0.6) / 0.4))
export const progressColors = (frac: number) => {
  const t = greenness(frac)
  return { from: mix('#8e8e93', '#5fae73', t), to: mix('#f2f2f7', '#a6e0b2', t) }
}

/** What can be picked: a food (per 100 g) or a recipe. */
export type Pick = { kind: 'food'; food: Food } | { kind: 'recipe'; recipe: Recipe }
const pickFood = (p: Pick): Food => (p.kind === 'food' ? p.food : recipeAsFood(p.recipe))
const pickName = (p: Pick) => (p.kind === 'food' ? p.food.name : p.recipe.name)

export function Nutrition() {
  const store = useStore()
  const { foodLog, phases, weights, recipes } = store
  const [date, setDate] = useState(today())
  const [adding, setAdding] = useState<null | 'search' | 'scan'>(null)
  const [editing, setEditing] = useState<FoodEntry | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null | 'new'>(null)

  // newest first
  const day = useMemo(() => foodLog.filter((e) => e.date === date).reverse(), [foodLog, date])
  const total = useMemo(() => dayTotals(foodLog, date), [foodLog, date])
  const target = macroTargets(kcalTarget(phases, date), weights)

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = addDays(date, i - 6)
    return { d, kcal: dayTotals(foodLog, d).kcal, target: kcalTarget(phases, d) }
  }), [foodLog, phases, date])
  const logged = week.filter((x) => x.kcal > 0)
  const avg = logged.length ? Math.round(logged.reduce((n, x) => n + x.kcal, 0) / logged.length) : 0
  const maxK = Math.max(1, ...week.map((x) => Math.max(x.kcal, x.target ?? 0)))

  return (
    <div className="screen">
      <div className="eyebrow">Ernährung</div>
      <div className="nut-day">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Vorheriger Tag"><Icon.back /></button>
        <h1 className="title" style={{ margin: 0 }}>{date === today() ? 'Heute' : date === addDays(today(), -1) ? 'Gestern' : dateLabel(date, false)}</h1>
        <button className="icon-btn" style={{ transform: 'scaleX(-1)', visibility: date >= today() ? 'hidden' : undefined }} onClick={() => setDate(addDays(date, 1))} aria-label="Nächster Tag"><Icon.back /></button>
      </div>

      <div className="card chrome-edge nut-ring-card">
        <KcalRing eaten={total.kcal} target={target.kcal} />
        <div className="nut-macros">
          <MacroBar label="Eiweiß" v={total.p} t={target.p} />
          <MacroBar label="Kohlenhydrate" v={total.c} t={target.c} />
          <MacroBar label="Fett" v={total.f} t={target.f} />
        </div>
      </div>
      {target.kcal == null && <div className="hint"><span>Kein Kalorienziel – leg unter Körper eine Phase mit Kalorien an.</span></div>}
      {target.kcal != null && date === today() && new Date().getHours() >= 18 && total.kcal > 0 && total.p < target.p * 0.75 && (
        <div className="hint"><span>Noch <b>{Math.round(target.p - total.p)} g Eiweiß</b> bis zu deinem Ziel – z. B. Skyr, Topfen oder ein Shake.</span></div>
      )}

      <div className="nut-actions">
        <Tap className="btn btn-chrome" onClick={() => { haptic(); setAdding('search') }}><Icon.plus /> Hinzufügen</Tap>
        <Tap className="nut-scan big" onClick={() => { haptic(); setAdding('scan') }} aria-label="Barcode scannen"><ScanIcon /></Tap>
      </div>

      {day.length > 0 && (
        <div className="card" style={{ padding: '2px 14px', marginTop: 12 }}>
          {day.map((e) => (
            <button key={e.id} className="nut-entry" onClick={() => setEditing(e)}>
              <div className="grow">
                <div className="nut-entry-name">{e.name}</div>
                <div className="faint num" style={{ fontSize: 12 }}>{e.at.slice(11, 16)} · {fmtG(e.grams)} g · {fmtG(e.p)} E · {fmtG(e.c)} K · {fmtG(e.f)} F</div>
              </div>
              <span className="num">{fmtInt(e.kcal)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="section-title"><h2>Letzte 7 Tage</h2>{avg > 0 && <span className="faint" style={{ fontSize: 13 }}>Ø {fmtInt(avg)} kcal</span>}</div>
      <div className="card">
        <div className="nut-week">
          {week.map((x) => (
            <button key={x.d} className={'nut-week-day' + (x.d === date ? ' on' : '')} onClick={() => setDate(x.d)}>
              <div className="nut-week-bar">
                {x.target != null && <i className="tgt" style={{ bottom: `${(x.target / maxK) * 100}%` }} />}
                <b style={{ height: `${(x.kcal / maxK) * 100}%` }} />
              </div>
              <span>{['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(x.d + 'T12:00:00').getDay()]}</span>
            </button>
          ))}
        </div>
        <div className="faint" style={{ fontSize: 11, textAlign: 'center', marginTop: 6 }}>Strich = Kalorienziel der Phase</div>
      </div>

      <div className="section-title"><h2>Rezepte</h2><button className="link" onClick={() => setRecipe('new')}>Neues Rezept</button></div>
      <div className="card" style={{ padding: '4px 14px' }}>
        {recipes.length === 0 && <div className="faint" style={{ padding: '14px 0' }}>Noch keine Rezepte</div>}
        {recipes.map((r) => {
          const t = recipeTotal(r)
          return (
            <button key={r.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setRecipe(r)}>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                <div className="faint num" style={{ fontSize: 12 }}>{r.items.length} Zutaten · {fmtInt(recipeWeight(r))} g · {fmtInt((t.kcal / recipeWeight(r)) * 100)} kcal/100 g</div>
              </div>
              <span className="chev"><Icon.chevron /></span>
            </button>
          )
        })}
      </div>

      {adding && (
        <FoodPicker
          title="Hinzufügen"
          startScan={adding === 'scan'}
          onClose={() => setAdding(null)}
          onPick={(p, grams) => {
            const m = forGrams(pickFood(p), grams)
            store.saveFoodEntry({
              id: uid(), date, meal: mealAt(), name: pickName(p), grams, ...m, at: localIso(),
              ref: p.kind === 'food' ? { kind: 'food', food: p.food } : { kind: 'recipe', id: p.recipe.id },
            })
            if (p.kind === 'food' && p.food.source === 'off') store.saveFood(p.food) // keep for offline + recents
            haptic()
            setAdding(null)
          }}
        />
      )}
      {editing && <EntrySheet entry={editing} onClose={() => setEditing(null)} />}
      {recipe && <RecipeEditor recipe={recipe === 'new' ? null : recipe} onClose={() => setRecipe(null)} />}
    </div>
  )
}

function KcalRing({ eaten, target }: { eaten: number; target: number | null }) {
  const r = 52
  const c = 2 * Math.PI * r
  const raw = target ? eaten / target : 0
  const frac = Math.min(1, raw)
  const col = progressColors(raw)
  const left = target != null ? Math.round(target - eaten) : null
  return (
    <div className="nut-ring">
      <svg viewBox="0 0 120 120" width="132" height="132">
        <defs>
          <linearGradient id="nutRing" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor={col.to} /><stop offset=".55" stopColor={col.from} /><stop offset="1" stopColor={col.to} /></linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="9" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="url(#nutRing)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset .5s' }} />
      </svg>
      <div className="nut-ring-txt">
        <b className="num">{fmtInt(eaten)}</b>
        <span className="faint">{target ? `von ${fmtInt(target)}` : 'kcal'}</span>
        {left != null && <span className="nut-left num" style={raw >= 1 ? { color: 'var(--good)' } : undefined}>{left >= 0 ? `${fmtInt(left)} übrig` : `${fmtInt(-left)} drüber`}</span>}
      </div>
    </div>
  )
}

function MacroBar({ label, v, t }: { label: string; v: number; t: number | null }) {
  return (
    <div className="nut-macro">
      <div className="nut-macro-top"><span>{label}</span><span className="num faint" style={t && v >= t ? { color: 'var(--good)' } : undefined}>{Math.round(v)}{t ? ` / ${t}` : ''} g</span></div>
      <div className="track"><div className="fill" style={{ width: `${t ? Math.min(100, (v / t) * 100) : 0}%`, background: t ? `linear-gradient(90deg, ${progressColors(v / t).from}, ${progressColors(v / t).to})` : undefined }} /></div>
    </div>
  )
}

// ---------------------------------------------------------------- picking food

/** Full-screen search: recents, recipes, own foods, basics and Open Food Facts; plus barcode scan. */
export function FoodPicker({ title, onPick, onClose, noRecipes, startScan }: {
  title: string
  onPick: (p: Pick, grams: number) => void
  onClose: () => void
  noRecipes?: boolean
  /** open straight into the camera (scan button) */
  startScan?: boolean
}) {
  const { foodLog, foods, recipes, saveFood } = useStore()
  const [q, setQ] = useState('')
  const [remote, setRemote] = useState<OffHit[]>([])
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)
  const [scan, setScan] = useState(!!startScan)
  const [missing, setMissing] = useState<{ code: string; name?: string } | null>(null)
  const [chosen, setChosen] = useState<Pick | null>(null)
  const [custom, setCustom] = useState<{ barcode?: string; name?: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const ctrl = useRef<AbortController | null>(null)

  // recently logged, newest first, unique
  const recents = useMemo(() => {
    const out: Pick[] = []
    const seen = new Set<string>()
    for (let i = foodLog.length - 1; i >= 0 && out.length < 20; i--) {
      const r = foodLog[i].ref
      const key = r.kind === 'food' ? r.food.id : r.id
      if (seen.has(key)) continue
      seen.add(key)
      if (r.kind === 'food') out.push({ kind: 'food', food: r.food })
      else {
        const rec = recipes.find((x) => x.id === r.id)
        if (rec && !noRecipes) out.push({ kind: 'recipe', recipe: rec })
      }
    }
    return out
  }, [foodLog, recipes, noRecipes])

  const term = q.trim().toLowerCase()
  const local = useMemo(() => {
    if (!term) return []
    const words = term.split(/\s+/)
    const hit = (s: string) => words.every((w) => s.toLowerCase().includes(w))
    const out: Pick[] = []
    if (!noRecipes) for (const r of recipes) if (hit(r.name)) out.push({ kind: 'recipe', recipe: r })
    for (const f of foods) if (hit(f.name + ' ' + (f.brand ?? ''))) out.push({ kind: 'food', food: f })
    for (const f of BASICS) if (hit(f.name)) out.push({ kind: 'food', food: f })
    return out.slice(0, 30)
  }, [term, recipes, foods, noRecipes])

  useEffect(() => {
    ctrl.current?.abort()
    setRemote([])
    if (term.length < 3) { setLoading(false); return }
    const c = new AbortController()
    ctrl.current = c
    setLoading(true)
    const t = setTimeout(() => {
      offSearch(term, c.signal)
        .then((r) => { setRemote(r); setOffline(false) })
        .catch((e) => { if ((e as Error).name !== 'AbortError') setOffline(true) })
        .finally(() => { if (!c.signal.aborted) setLoading(false) })
    }, 450)
    return () => { clearTimeout(t); c.abort() }
  }, [term])

  const openProduct = async (code: string, fallbackName?: string) => {
    const known = foods.find((f) => f.barcode === code)
    if (known) { setChosen({ kind: 'food', food: known }); return }
    setBusy(code)
    try {
      const f = await offProduct(code)
      if (f) setChosen({ kind: 'food', food: f })
      else setMissing({ code, name: fallbackName })
    } catch {
      setOffline(true)
    } finally {
      setBusy(null)
    }
  }

  const list = term ? local : recents
  return createPortal(
    <div className="fullsheet">
      <div className="fullsheet-head">
        <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon.back /></button>
        <div className="grow" style={{ fontWeight: 700, fontSize: 18 }}>{title}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => setCustom({})}>Eigenes</button>
      </div>
      <div className="nut-search">
        <input className="input" placeholder="Lebensmittel, Marke oder Rezept" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <Tap className="nut-scan" onClick={() => setScan(true)} aria-label="Barcode scannen"><ScanIcon /></Tap>
      </div>

      <div className="fullsheet-body">
        {!term && <div className="eyebrow" style={{ margin: '4px 2px 6px' }}>{recents.length ? 'Zuletzt' : 'Tipp: suchen oder Barcode scannen'}</div>}
        {!term && !noRecipes && recipes.length > 0 && recents.length === 0 && (
          <>
            {recipes.map((r) => <PickRow key={r.id} p={{ kind: 'recipe', recipe: r }} onClick={() => setChosen({ kind: 'recipe', recipe: r })} />)}
          </>
        )}
        {list.map((p) => (
          <PickRow key={(p.kind === 'food' ? p.food.id : p.recipe.id)} p={p} onClick={() => setChosen(p)} />
        ))}
        {term && (
          <>
            <div className="eyebrow" style={{ margin: '14px 2px 6px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Produkte</span><span className="faint">{loading ? 'suche…' : offline ? 'offline' : 'Open Food Facts'}</span>
            </div>
            {term.length < 3 && <div className="faint" style={{ fontSize: 13, padding: '4px 2px' }}>Ab 3 Buchstaben wird online gesucht</div>}
            {remote.map((h) => (
              <button key={h.code} className="nut-pick" onClick={() => openProduct(h.code, h.name)} disabled={busy === h.code}>
                <div className="grow">
                  <div className="nut-entry-name">{h.name}</div>
                  <div className="faint" style={{ fontSize: 12 }}>{h.brand ?? ''}</div>
                </div>
                <span className="faint num" style={{ fontSize: 13 }}>{busy === h.code ? '…' : h.kcal != null ? `${Math.round(h.kcal)} kcal` : ''}</span>
              </button>
            ))}
            {!loading && !offline && term.length >= 3 && remote.length === 0 && <div className="faint" style={{ fontSize: 13, padding: '4px 2px' }}>Nichts gefunden – „Eigenes“ anlegen.</div>}
          </>
        )}
      </div>

      {scan && (
        <Scanner
          // opened via the scan button: cancelling goes straight back
          onClose={() => { setScan(false); if (startScan && !missing) onClose() }}
          onCode={(code) => { setScan(false); openProduct(code) }}
        />
      )}
      {busy && !scan && <div className="nut-loading">Produkt wird geladen…</div>}
      {missing && (
        <Sheet onClose={() => setMissing(null)}>
          <h3>Produkt nicht gefunden</h3>
          <p className="faint" style={{ fontSize: 13 }}>
            {missing.name ? `„${missing.name}“ hat noch keine Nährwerte.` : 'Diesen Barcode kennt die Datenbank noch nicht.'} Leg es einmal an – danach erkennt VIS es beim Scannen automatisch.
          </p>
          <p className="faint num" style={{ fontSize: 12, marginTop: 4 }}>Barcode {missing.code}</p>
          <Tap className="btn btn-chrome btn-block" style={{ marginTop: 16 }} onClick={() => { setCustom({ barcode: missing.code, name: missing.name }); setMissing(null) }}>Produkt anlegen</Tap>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => { setMissing(null); setScan(true) }}>Erneut scannen</button>
        </Sheet>
      )}
      {chosen && <AmountSheet pick={chosen} onClose={() => setChosen(null)} onDone={(g) => { onPick(chosen, g); setChosen(null) }} />}
      {custom && (
        <CustomFoodSheet
          initial={custom}
          onClose={() => setCustom(null)}
          onSave={(f) => { saveFood(f); setCustom(null); setChosen({ kind: 'food', food: f }) }}
        />
      )}
    </div>,
    document.body,
  )
}

function PickRow({ p, onClick }: { p: Pick; onClick: () => void }) {
  const f = pickFood(p)
  const sub = p.kind === 'recipe' ? 'Rezept' : p.food.brand ?? (p.food.source === 'basic' ? 'Grundnahrungsmittel' : p.food.source === 'custom' ? 'Eigenes' : '')
  return (
    <button className="nut-pick" onClick={onClick}>
      <div className="grow">
        <div className="nut-entry-name">{pickName(p)}</div>
        <div className="faint" style={{ fontSize: 12 }}>{sub}</div>
      </div>
      <span className="faint num" style={{ fontSize: 13 }}>{Math.round(f.kcal)} kcal</span>
    </button>
  )
}

/** Amount in grams with quick chips; live macros. */
function AmountSheet({ pick, onClose, onDone, initial, action = 'Hinzufügen', extra }: {
  pick: Pick
  onClose: () => void
  onDone: (grams: number) => void
  initial?: number
  action?: string
  extra?: React.ReactNode
}) {
  const food = pickFood(pick)
  const chips = useMemo(() => {
    const c: { label: string; g: number }[] = []
    if (pick.kind === 'recipe') {
      const w = recipeWeight(pick.recipe)
      c.push({ label: '¼', g: w / 4 }, { label: '⅓', g: w / 3 }, { label: '½', g: w / 2 }, { label: 'Ganz', g: w })
    } else {
      if (food.serving) c.push({ label: food.serving.label, g: food.serving.g })
      for (const g of [50, 100, 150, 200, 250]) c.push({ label: `${g} g`, g })
    }
    return c
  }, [pick, food])
  const [text, setText] = useState(() => String(Math.round(initial ?? (food.serving?.g ?? (pick.kind === 'recipe' ? recipeWeight(pick.recipe) / 2 : 100)))))
  const grams = Math.max(0, Number(text.replace(',', '.')) || 0)
  const m: Macros = forGrams(food, grams)
  return (
    <Sheet onClose={onClose}>
      <h3 style={{ paddingRight: 8 }}>{pickName(pick)}</h3>
      <p className="faint num" style={{ fontSize: 13 }}>
        pro 100 g: {Math.round(food.kcal)} kcal · {fmtG(food.p)} E · {fmtG(food.c)} K · {fmtG(food.f)} F
      </p>
      <div className="chips" style={{ margin: '12px -18px 0', padding: '2px 18px 4px' }}>
        {chips.map((c) => <button key={c.label} className={'chip' + (Math.round(c.g) === Math.round(grams) ? ' on' : '')} onClick={() => setText(String(Math.round(c.g)))}>{c.label}</button>)}
      </div>
      <div className="nut-amount">
        <input className="field num" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()} />
        <span className="muted">g</span>
      </div>
      <div className="grid-3 nut-sum">
        <div><b className="num">{fmtInt(m.kcal)}</b><span>kcal</span></div>
        <div><b className="num">{fmtG(m.p)}</b><span>Eiweiß</span></div>
        <div><b className="num">{fmtG(m.c)} / {fmtG(m.f)}</b><span>KH / Fett</span></div>
      </div>
      {extra}
      <Tap className="btn btn-chrome btn-block" style={{ marginTop: 14 }} onClick={() => grams > 0 && onDone(grams)}>{action}</Tap>
    </Sheet>
  )
}

function EntrySheet({ entry, onClose }: { entry: FoodEntry; onClose: () => void }) {
  const store = useStore()
  const rec = entry.ref.kind === 'recipe' ? store.recipes.find((r) => r.id === (entry.ref as { id: string }).id) : null
  const pick: Pick = entry.ref.kind === 'food'
    ? { kind: 'food', food: entry.ref.food }
    : rec ? { kind: 'recipe', recipe: rec }
      // recipe was deleted: keep its values as a plain food
      : { kind: 'food', food: { id: 'x', name: entry.name, source: 'custom', ...forGrams(entry, 100 * 100 / entry.grams / 100) } }
  return (
    <AmountSheet
      pick={pick}
      initial={entry.grams}
      action="Speichern"
      onClose={onClose}
      onDone={(g) => {
        store.saveFoodEntry({ ...entry, grams: g, ...forGrams(pickFood(pick), g) })
        onClose()
      }}
      extra={
        <>
          <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={() => { store.deleteFoodEntry(entry.id); onClose() }}>Eintrag löschen</button>
        </>
      }
    />
  )
}

function CustomFoodSheet({ initial, onClose, onSave }: { initial: { barcode?: string; name?: string }; onClose: () => void; onSave: (f: Food) => void }) {
  const [v, setV] = useState({ name: initial.name ?? '', brand: '', kcal: '', p: '', c: '', f: '', serving: '' })
  const num = (s: string) => Math.max(0, Number(s.replace(',', '.')) || 0)
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value })
  const ok = v.name.trim() && num(v.kcal) > 0
  return (
    <Sheet onClose={onClose}>
      <h3>Eigenes Lebensmittel</h3>
      {initial.barcode && <p className="faint" style={{ fontSize: 13 }}>Barcode {initial.barcode} ist noch unbekannt – einmal anlegen, dann erkennt VIS ihn.</p>}
      <label className="lbl">Name</label>
      <input className="input" value={v.name} onChange={set('name')} placeholder="z. B. Proteinriegel" />
      <label className="lbl">Marke (optional)</label>
      <input className="input" value={v.brand} onChange={set('brand')} />
      <label className="lbl">Pro 100 g</label>
      <div className="grid-2">
        <input className="input num" inputMode="decimal" placeholder="kcal" value={v.kcal} onChange={set('kcal')} />
        <input className="input num" inputMode="decimal" placeholder="Eiweiß g" value={v.p} onChange={set('p')} />
        <input className="input num" inputMode="decimal" placeholder="Kohlenhydrate g" value={v.c} onChange={set('c')} />
        <input className="input num" inputMode="decimal" placeholder="Fett g" value={v.f} onChange={set('f')} />
      </div>
      <label className="lbl">Portion in g (optional)</label>
      <input className="input num" inputMode="decimal" value={v.serving} onChange={set('serving')} placeholder="z. B. 45" />
      <button
        className="btn btn-chrome btn-block" style={{ marginTop: 16 }} disabled={!ok}
        onClick={() => onSave({
          id: 'c-' + uid(), name: v.name.trim(), brand: v.brand.trim() || undefined,
          kcal: num(v.kcal), p: num(v.p), c: num(v.c), f: num(v.f), source: 'custom',
          ...(initial.barcode ? { barcode: initial.barcode } : {}),
          ...(num(v.serving) > 0 ? { serving: { label: '1 Portion', g: num(v.serving) } } : {}),
        })}
      >Speichern</button>
    </Sheet>
  )
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <path d="M8 8v8M11 8v8M14 8v8M17 8v8" strokeWidth="1.4" />
    </svg>
  )
}
