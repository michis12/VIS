import { useState } from 'react'
import { addTopup, creditColor, fmtUsd, useCredit } from './AiCredit'

/** Settings: estimated AI credit (photo recognition) and entering a top-up. */
export function AiCreditCard({ toast }: { toast: (t: string) => void }) {
  const { credit, reload } = useCredit()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  if (!credit) return null // not signed in to the cloud

  const save = async () => {
    const v = Number(amount.replace(',', '.'))
    if (!(v > 0)) return
    setBusy(true)
    try {
      await addTopup(v)
      setAmount('')
      toast(`${fmtUsd(v)} Guthaben eingetragen`)
      reload()
    } catch {
      toast('Speichern hat nicht geklappt')
    } finally {
      setBusy(false)
    }
  }

  const perPhoto = credit.uses ? credit.used / credit.uses : 0
  return (
    <>
      <div className="section-title"><h2>Fotoerkennung</h2></div>
      <div className="card">
        <div className="pr-row" style={{ alignItems: 'center' }}>
          <span className="muted">Guthaben (geschätzt)</span>
          <b className="num" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="credit-dot" style={{ background: credit.topups > 0 ? creditColor(credit.balance) : 'var(--text-3)' }} />
            {credit.topups > 0 ? fmtUsd(credit.balance) : '–'}
          </b>
        </div>
        <div className="pr-row num"><span className="muted">Diesen Monat verbraucht</span><b>{fmtUsd(credit.monthUsed)}</b></div>
        {credit.uses > 0 && (
          <div className="pr-row num"><span className="muted">Fotos · Ø pro Foto</span><b>{credit.uses} · {(perPhoto * 100).toFixed(2).replace('.', ',')} ct</b></div>
        )}
        <label className="lbl">Aufladung eintragen</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input num" inputMode="decimal" placeholder="z. B. 5" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn btn-chrome" disabled={busy || !(Number(amount.replace(',', '.')) > 0)} onClick={save}>Eintragen</button>
        </div>
        <div className="hint"><span>Wenn du in der Anthropic Console Guthaben auflädst, hier denselben Betrag in $ eintragen. Unter 2 $ wird der Punkt orange, unter 1 $ rot. Der genaue Stand steht in der Console.</span></div>
      </div>
    </>
  )
}
