import { useState } from 'react'
import { addTopup, creditColor, fmtUsd, markSettled, useCredit, type Person } from './AiCredit'

const ct = (usd: number) => (usd * 100).toFixed(2).replace('.', ',') + ' ct'
const who = (p: Person) => (p.isMe ? 'Du' : p.email.split('@')[0] || p.email)
const dateDe = (iso: string) => new Date(iso).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' })

/**
 * Settings: AI credit and usage. The key owner sees the estimated balance, can
 * enter top-ups and sees each friend's use since the last payment ("Bezahlt").
 * Friends only see their own use.
 */
export function AiCreditCard({ toast }: { toast: (t: string) => void }) {
  const { credit, reload } = useCredit()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  if (!credit) return null // not signed in to the cloud
  if (!credit.owner && credit.uses === 0) return null // no AI access / not used yet

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

  const settle = async (p: Person) => {
    try {
      await markSettled(p.userId)
      toast(`${who(p)}: als bezahlt markiert`)
      setConfirm(null)
      reload()
    } catch {
      toast('Hat nicht geklappt')
    }
  }

  const friends = credit.people.filter((p) => !p.isMe)
  return (
    <>
      <div className="section-title"><h2>KI-Funktionen</h2></div>
      <div className="card">
        {credit.owner && (
          <div className="pr-row" style={{ alignItems: 'center' }}>
            <span className="muted">Guthaben (geschätzt)</span>
            <b className="num" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="credit-dot" style={{ background: credit.topups > 0 ? creditColor(credit.balance) : 'var(--text-3)' }} />
              {credit.topups > 0 ? fmtUsd(credit.balance) : '–'}
            </b>
          </div>
        )}
        <div className="pr-row num"><span className="muted">{credit.owner ? 'Du diesen Monat' : 'Diesen Monat verbraucht'}</span><b>{fmtUsd(credit.monthUsed)}</b></div>
        {credit.uses > 0 && (
          <div className="pr-row num"><span className="muted">Anfragen · Ø pro Anfrage</span><b>{credit.uses} · {ct(credit.used / credit.uses)}</b></div>
        )}

        {friends.length > 0 && (
          <>
            <div className="eyebrow" style={{ marginTop: 14 }}>Freunde</div>
            {friends.map((p) => (
              <div key={p.userId} className="ai-person">
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{who(p)}</div>
                  <div className="faint num" style={{ fontSize: 12 }}>
                    {p.uses} Anfragen · diesen Monat {fmtUsd(p.monthUsd)}{p.settledAt ? ` · bezahlt bis ${dateDe(p.settledAt)}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <b className="num">{fmtUsd(p.openUsd)}</b>
                  <div className="faint" style={{ fontSize: 11 }}>offen</div>
                </div>
                {p.openUsd > 0 && (
                  confirm === p.userId
                    ? <button className="btn btn-chrome btn-sm" onClick={() => settle(p)}>Sicher?</button>
                    : <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(p.userId)}>Bezahlt</button>
                )}
              </div>
            ))}
          </>
        )}

        {credit.owner && (
          <>
            <label className="lbl">Aufladung eintragen</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input num" inputMode="decimal" placeholder="z. B. 5" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <button className="btn btn-chrome" disabled={busy || !(Number(amount.replace(',', '.')) > 0)} onClick={save}>Eintragen</button>
            </div>
            <div className="hint"><span>Wenn du in der Anthropic Console Guthaben auflädst, hier denselben Betrag in $ eintragen. Das Guthaben zieht auch den Verbrauch deiner Freunde ab. Unter 2 $ wird der Punkt orange, unter 1 $ rot.</span></div>
          </>
        )}
      </div>
    </>
  )
}
