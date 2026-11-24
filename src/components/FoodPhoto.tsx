import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { foodAi, shrink } from '../foodAi'
import { fmtInt, haptic, uid } from '../lib'
import { fmtG, sum, type Macros } from '../nutrition'
import type { Food } from '../types'
import { CreditPill, useCredit } from './AiCredit'
import { Icon, Tap } from './ui'

/**
 * AI food entry with a review list before anything is added:
 *  - photo: meal photo (+ optional description / total weight) → estimated foods (Sonnet)
 *  - text:  "2 Semmeln mit Schinken" → foods with grams (Haiku); items the user already
 *           knows (recipes, own foods, basics) keep their exact values via `known`.
 */
export interface PhotoItem { food: Food; grams: number; recipeId?: string }

/** A food the text mode may map to; `g` = whole-dish weight for recipes. */
export interface KnownFood { id: string; food: Food; recipeId?: string; g?: number }

interface Row { name: string; grams: string; per: Macros /* per gram */; food?: Food; recipeId?: string }

type Source = { kind: 'photo'; file: File } | { kind: 'text'; text: string; known: KnownFood[] }

interface AiItem { name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number; ref?: string }

export function FoodPhoto({ source, onClose, onAdd }: { source: Source; onClose: () => void; onAdd: (items: PhotoItem[]) => void }) {
  const photo = source.kind === 'photo' ? source.file : null
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!photo) return
    const u = URL.createObjectURL(photo)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [photo])
  const [note, setNote] = useState('')
  const [weight, setWeight] = useState('')
  const [state, setState] = useState<'input' | 'loading' | 'result'>(source.kind === 'text' ? 'loading' : 'input')
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [comment, setComment] = useState('')
  const { credit } = useCredit()

  const toRows = (items: AiItem[]): Row[] => {
    const known = source.kind === 'text' ? new Map(source.known.map((k) => [k.id, k])) : new Map<string, KnownFood>()
    return items.filter((i) => i.grams > 0).map((i) => {
      const k = i.ref ? known.get(i.ref) : undefined
      if (k) {
        // known food: keep its exact values, only take the amount from the AI
        const f = k.food
        return { name: f.name, grams: String(Math.round(i.grams)), per: { kcal: f.kcal / 100, p: f.p / 100, c: f.c / 100, f: f.f / 100 }, food: f, recipeId: k.recipeId }
      }
      return { name: i.name, grams: String(Math.round(i.grams)), per: { kcal: i.kcal / i.grams, p: i.protein / i.grams, c: i.carbs / i.grams, f: i.fat / i.grams } }
    })
  }

  const analyse = async () => {
    setErr(null)
    setState('loading')
    try {
      let data
      if (source.kind === 'text') {
        data = await foodAi({
          mode: 'text', text: source.text,
          foods: source.known.map((k) => ({ id: k.id, name: k.food.name, ...(k.g ? { g: k.g } : {}) })),
        })
      } else {
        const image = await shrink(source.file)
        const grams = Number(weight.replace(',', '.')) || undefined
        data = await foodAi({ mode: 'photo', image, mediaType: 'image/jpeg', note, grams })
      }
      const list = toRows(data?.items ?? [])
      if (!list.length) throw new Error(data?.comment || 'Kein Essen erkannt.')
      setRows(list)
      setComment(data?.comment ?? '')
      setState('result')
      haptic(true)
    } catch (e) {
      setErr((e as Error).message)
      setState(source.kind === 'text' ? 'result' : 'input')
    }
  }

  // text mode starts right away (guarded against the dev double-mount)
  const started = useRef(false)
  useEffect(() => {
    if (source.kind === 'text' && !started.current) { started.current = true; analyse() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const g = (r: Row) => Math.max(0, Number(r.grams.replace(',', '.')) || 0)
  const macros = (r: Row): Macros => ({ kcal: r.per.kcal * g(r), p: r.per.p * g(r), c: r.per.c * g(r), f: r.per.f * g(r) })
  const total = sum(rows.map(macros))

  const add = () => {
    onAdd(rows.filter((r) => g(r) > 0).map((r) => ({
      grams: g(r),
      recipeId: r.recipeId,
      food: r.food ?? {
        id: 'ai-' + uid(), name: r.name, source: 'custom',
        kcal: r.per.kcal * 100, p: r.per.p * 100, c: r.per.c * 100, f: r.per.f * 100,
      },
    })))
  }

  return createPortal(
    <div className="fullsheet">
      <div className="fullsheet-head">
        <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon.back /></button>
        <div className="grow" style={{ fontWeight: 700, fontSize: 18 }}>{source.kind === 'photo' ? 'Foto erkennen' : 'Mit KI eintragen'}</div>
        <CreditPill credit={credit} />
      </div>
      <div className="fullsheet-body">
        {url && <img className={'photo-preview' + (state === 'loading' ? ' busy' : '')} src={url} alt="" />}
        {source.kind === 'text' && <div className="ai-quote">„{source.text}“</div>}

        {source.kind === 'photo' && state !== 'result' ? (
          <>
            <label className="lbl">Was ist drin? (optional)</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Reis mit Hühnerbrust, 1 EL Öl" disabled={state === 'loading'} />
            <label className="lbl">Gewicht des ganzen Gerichts (optional)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input className="input num" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="–" disabled={state === 'loading'} />
              <span className="muted">g</span>
            </div>
            <div className="hint"><span>Mit Gewicht und ein paar Worten (vor allem Öl, Butter, Sauce) wird es deutlich genauer.</span></div>
            {err && <div className="hint" style={{ color: 'var(--danger)' }}><span>{err}</span></div>}
            <Tap className="btn btn-chrome btn-block" style={{ marginTop: 16 }} onClick={() => state === 'input' && analyse()}>
              {state === 'loading' ? 'Wird erkannt…' : 'Erkennen'}
            </Tap>
          </>
        ) : state === 'loading' ? (
          <div className="ai-wait">Wird zerlegt…</div>
        ) : err ? (
          <>
            <div className="hint" style={{ color: 'var(--danger)' }}><span>{err}</span></div>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 14 }} onClick={analyse}>Nochmal versuchen</button>
          </>
        ) : (
          <>
            <div className="card" style={{ padding: '2px 14px', marginTop: 12 }}>
              {rows.map((r, i) => {
                const m = macros(r)
                return (
                  <div key={i} className="nut-entry photo-row">
                    <div className="grow">
                      <div className="nut-entry-name">{r.name}</div>
                      <div className="faint num" style={{ fontSize: 12 }}>{r.food ? (r.recipeId ? 'Rezept · ' : 'bekannt · ') : ''}{fmtInt(m.kcal)} kcal · {fmtG(m.p)} E · {fmtG(m.c)} K · {fmtG(m.f)} F</div>
                    </div>
                    <input className="input num photo-g" inputMode="decimal" value={r.grams} onFocus={(e) => e.target.select()}
                      onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, grams: e.target.value } : x)))} />
                    <span className="faint" style={{ fontSize: 13 }}>g</span>
                    <button className="photo-x" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`${r.name} entfernen`}>×</button>
                  </div>
                )
              })}
            </div>
            <div className="grid-3 nut-sum">
              <div><b className="num">{fmtInt(total.kcal)}</b><span>kcal</span></div>
              <div><b className="num">{fmtG(total.p)}</b><span>Eiweiß</span></div>
              <div><b className="num">{fmtG(total.c)} / {fmtG(total.f)}</b><span>KH / Fett</span></div>
            </div>
            {comment && <div className="hint"><span>{comment}</span></div>}
            <div className="hint"><span>{source.kind === 'photo' ? 'Schätzung – Mengen bei Bedarf anpassen.' : 'Mengen bei Bedarf anpassen.'}</span></div>
            <Tap className="btn btn-chrome btn-block" style={{ marginTop: 16 }} onClick={() => rows.length && add()}>Alles hinzufügen</Tap>
            {source.kind === 'photo' && <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setState('input')}>Nochmal erkennen</button>}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
