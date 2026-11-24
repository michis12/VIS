import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getSession, supabase } from '../cloud'
import { fmtInt, haptic, uid } from '../lib'
import { fmtG, sum, type Macros } from '../nutrition'
import type { Food } from '../types'
import { CreditPill, useCredit } from './AiCredit'
import { Icon, Tap } from './ui'

/**
 * Meal photo → list of foods with estimated grams and macros (Claude via the
 * Supabase Edge Function `food-photo`). Everything stays editable before it is
 * added; a known total weight and a short description make it a lot more exact.
 */
export interface PhotoItem { food: Food; grams: number }

interface Row { name: string; grams: string; per: Macros /* per gram */ }

/** Downscale to max 1024 px and re-encode as JPEG: fast upload, fewer tokens. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return c.toDataURL('image/jpeg', 0.82).split(',')[1]
}

const ERR: Record<string, string> = {
  access: 'Dein Account ist für die KI-Funktionen nicht freigeschaltet.',
  auth: 'Dafür musst du in der Cloud angemeldet sein (Profil › Einstellungen).',
  nokey: 'Die Fotoerkennung ist noch nicht eingerichtet (API-Key fehlt).',
  busy: 'Gerade zu viele Anfragen – gleich nochmal probieren.',
  refusal: 'Das Foto konnte nicht ausgewertet werden.',
}

export function FoodPhoto({ file, onClose, onAdd }: { file: File; onClose: () => void; onAdd: (items: PhotoItem[]) => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  const [note, setNote] = useState('')
  const [weight, setWeight] = useState('')
  const [state, setState] = useState<'input' | 'loading' | 'result'>('input')
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [comment, setComment] = useState('')
  const { credit, setCredit } = useCredit()

  const analyse = async () => {
    setErr(null)
    if (!supabase || !(await getSession())) { setErr(ERR.auth); return }
    setState('loading')
    try {
      const image = await shrink(file)
      const grams = Number(weight.replace(',', '.')) || undefined
      const { data, error } = await supabase.functions.invoke('food-photo', { body: { image, mediaType: 'image/jpeg', note, grams } })
      if (error) {
        let code = ''
        try { code = (await (error as { context?: Response }).context?.json())?.error ?? '' } catch { /* not json */ }
        throw new Error(ERR[code] ?? 'Hat nicht geklappt – Internet prüfen und nochmal versuchen.')
      }
      const items = (data?.items ?? []) as { name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number }[]
      const list = items.filter((i) => i.grams > 0).map((i) => ({
        name: i.name,
        grams: String(Math.round(i.grams)),
        per: { kcal: i.kcal / i.grams, p: i.protein / i.grams, c: i.carbs / i.grams, f: i.fat / i.grams },
      }))
      if (!list.length) throw new Error(data?.comment || 'Kein Essen erkannt.')
      setRows(list)
      if (credit && typeof data?.usd === 'number') setCredit({ ...credit, balance: credit.balance - data.usd, used: credit.used + data.usd })
      setComment(data?.comment ?? '')
      setState('result')
      haptic(true)
    } catch (e) {
      setErr((e as Error).message)
      setState('input')
    }
  }

  const g = (r: Row) => Math.max(0, Number(r.grams.replace(',', '.')) || 0)
  const macros = (r: Row): Macros => ({ kcal: r.per.kcal * g(r), p: r.per.p * g(r), c: r.per.c * g(r), f: r.per.f * g(r) })
  const total = sum(rows.map(macros))

  const add = () => {
    onAdd(rows.filter((r) => g(r) > 0).map((r) => ({
      grams: g(r),
      food: {
        id: 'ai-' + uid(), name: r.name, source: 'custom',
        kcal: r.per.kcal * 100, p: r.per.p * 100, c: r.per.c * 100, f: r.per.f * 100,
      },
    })))
  }

  return createPortal(
    <div className="fullsheet">
      <div className="fullsheet-head">
        <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon.back /></button>
        <div className="grow" style={{ fontWeight: 700, fontSize: 18 }}>Foto erkennen</div>
        <CreditPill credit={credit} />
      </div>
      <div className="fullsheet-body">
        {url && <img className={'photo-preview' + (state === 'loading' ? ' busy' : '')} src={url} alt="" />}

        {state !== 'result' ? (
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
        ) : (
          <>
            <div className="card" style={{ padding: '2px 14px', marginTop: 12 }}>
              {rows.map((r, i) => {
                const m = macros(r)
                return (
                  <div key={i} className="nut-entry photo-row">
                    <div className="grow">
                      <div className="nut-entry-name">{r.name}</div>
                      <div className="faint num" style={{ fontSize: 12 }}>{fmtInt(m.kcal)} kcal · {fmtG(m.p)} E · {fmtG(m.c)} K · {fmtG(m.f)} F</div>
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
            <div className="hint"><span>Schätzung – Mengen bei Bedarf anpassen.</span></div>
            <Tap className="btn btn-chrome btn-block" style={{ marginTop: 16 }} onClick={() => rows.length && add()}>Alles hinzufügen</Tap>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setState('input')}>Nochmal erkennen</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
