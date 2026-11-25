import { useState } from 'react'
import {
  PLANS, addTopup, openPaywall, creditColor, fmtPct, fmtUsd, leftColor, markSettled, setPlan, useCredit,
  type Credit, type Person,
} from './AiCredit'
import { TrainingImport } from './TrainingImport'

const ct = (usd: number) => (usd * 100).toFixed(2).replace('.', ',') + ' ct'
const who = (p: Person) => (p.isMe ? 'Du' : p.email.split('@')[0] || p.email)
const dateDe = (iso: string) => new Date(iso).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' })
const PLAN_NAME = { dev: 'Developer', friend: 'Freund', solo: 'Solo', ultra: 'Ultra' } as const

/**
 * Settings "KI & Abo".
 *   no plan / expired - the VIS Pro offer (purchase comes with the store release)
 *   solo / ultra      - share of the monthly quota, never $
 *   friend            - own use in $
 *   dev               - estimated balance, top-ups, everyone's use, hand out plans
 * Everyone with an active plan can import training history.
 */
export function AiCreditCard({ toast }: { toast: (t: string) => void }) {
  const { credit, reload } = useCredit()
  const [importing, setImporting] = useState(false)
  if (!credit) return null // not signed in to the cloud

  const active = !!credit.plan && credit.active
  return (
    <>
      <div className="section-title"><h2>KI & Abo</h2></div>
      {!active && <Offer credit={credit} />}
      {active && (credit.plan === 'solo' || credit.plan === 'ultra') && <PaidStatus credit={credit} />}
      {active && (credit.plan === 'dev' || credit.plan === 'friend') && <UsageCard credit={credit} reload={reload} toast={toast} />}
      {active && (
        <button className="ai-row" style={{ marginTop: 12 }} onClick={() => setImporting(true)}>
          <span className="ai-spark" aria-hidden="true">✦</span>
          <div className="grow">
            <div className="nut-entry-name">Trainings importieren</div>
            <div className="faint" style={{ fontSize: 12 }}>Aus Strong, Hevy, FitNotes, Excel oder deinen Notizen</div>
          </div>
        </button>
      )}
      {importing && <TrainingImport onClose={() => setImporting(false)} toast={toast} />}
    </>
  )
}

/** VIS Pro offer: Solo / Ultra, monthly or yearly. Buying comes with the App Store / Play Store release. */
function Offer({ credit }: { credit: Credit }) {
  const [yearly, setYearly] = useState(false)
  const expired = !!credit.plan && !credit.active
  return (
    <div className="card">
      {expired && <div className="hint" style={{ marginTop: 0, marginBottom: 12 }}><span>Dein Abo ist am {dateDe(credit.paidUntil!)} abgelaufen.</span></div>}
      <div style={{ fontWeight: 700, fontSize: 18 }}>VIS Pro</div>
      <div className="muted" style={{ fontSize: 14, lineHeight: 1.45, marginTop: 4 }}>
        Essen per Foto, Text oder Nährwerttabelle eintragen, Essensvorschläge, Phasenplaner und Import deiner alten Trainings.
      </div>
      <div className="segmented" style={{ marginTop: 14 }}>
        <button className={!yearly ? 'on' : ''} onClick={() => setYearly(false)}>Monatlich</button>
        <button className={yearly ? 'on' : ''} onClick={() => setYearly(true)}>Jährlich</button>
      </div>
      <div className="plan-offers">
        {(['solo', 'ultra'] as const).map((k) => {
          const p = PLANS[k]
          return (
            <div key={k} className={'plan-offer' + (k === 'ultra' ? ' hi' : '')}>
              <div className="plan-offer-name">{p.name}</div>
              <div className="plan-offer-price num">{yearly ? p.year : p.month} €<span>/{yearly ? 'Jahr' : 'Monat'}</span></div>
              {yearly && <div className="plan-offer-save num">{(p.year / 12).toFixed(2).replace('.', ',')} € im Monat · 2 Monate gratis</div>}
              <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                {k === 'ultra' ? 'Doppeltes Kontingent' : 'Alle KI-Funktionen'}
                <br />ca. {p.photos} Essensfotos im Monat
              </div>
            </div>
          )
        })}
      </div>
      <button className="btn btn-chrome btn-block" style={{ marginTop: 14 }} onClick={openPaywall}>Alle Vorteile ansehen</button>
      <div className="hint"><span>Texteinträge, Etiketten und Vorschläge brauchen viel weniger als ein Foto – davon gehen locker tausende.</span></div>
    </div>
  )
}

/** paid plan: how much of this month's quota is used, as a bar */
function PaidStatus({ credit }: { credit: Credit }) {
  const used = credit.usedPct ?? 0
  const left = 100 - used
  const p = PLANS[credit.plan as 'solo' | 'ultra']
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>VIS Pro {p.name}</div>
        <span className="faint" style={{ fontSize: 13 }}>{credit.period === 'year' ? 'jährlich' : 'monatlich'}</span>
      </div>
      <div className="quota-bar"><i style={{ width: `${Math.min(100, used)}%`, background: leftColor(left) }} /></div>
      <div className="pr-row num"><span className="muted">Noch übrig diesen Monat</span><b>{fmtPct(left)}</b></div>
      {credit.resetsAt && <div className="pr-row num"><span className="muted">Wieder 100 % ab</span><b>{dateDe(credit.resetsAt)}</b></div>}
      {credit.paidUntil && <div className="pr-row num"><span className="muted">Abo läuft bis</span><b>{dateDe(credit.paidUntil)}</b></div>}
      {credit.plan === 'solo' && used >= 80 && (
        <div className="hint"><span>Fast aufgebraucht? <b>Ultra</b> verdoppelt dein Kontingent für {PLANS.ultra.month} € im Monat.</span></div>
      )}
    </div>
  )
}

/** developer and friends: use in $; the developer also manages top-ups and plans */
function UsageCard({ credit, reload, toast }: { credit: Credit; reload: () => void; toast: (t: string) => void }) {
  const dev = credit.plan === 'dev'
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [newPlan, setNewPlan] = useState<'friend' | 'solo' | 'ultra' | 'none'>('solo')
  const [period, setPeriod] = useState<'month' | 'year'>('month')

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

  const grant = async () => {
    if (!email.includes('@')) return
    setBusy(true)
    try {
      await setPlan(email.trim(), newPlan, period)
      toast(newPlan === 'none' ? 'Zugang entfernt' : `${PLAN_NAME[newPlan]} vergeben`)
      setEmail('')
      reload()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const others = credit.people.filter((p) => !p.isMe)
  return (
    <div className="card">
      {dev && (
        <div className="pr-row" style={{ alignItems: 'center' }}>
          <span className="muted">Guthaben (geschätzt)</span>
          <b className="num" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="credit-dot" style={{ background: credit.topups > 0 ? creditColor(credit.balance) : 'var(--text-3)' }} />
            {credit.topups > 0 ? fmtUsd(credit.balance) : '–'}
          </b>
        </div>
      )}
      <div className="pr-row num"><span className="muted">{dev ? 'Du diesen Monat' : 'Diesen Monat verbraucht'}</span><b>{fmtUsd(credit.monthUsed)}</b></div>
      {credit.uses > 0 && (
        <div className="pr-row num"><span className="muted">Anfragen · Ø pro Anfrage</span><b>{credit.uses} · {ct(credit.used / credit.uses)}</b></div>
      )}

      {others.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 14 }}>Nutzer</div>
          {others.map((p) => {
            const paid = p.plan === 'solo' || p.plan === 'ultra'
            const expired = paid && p.paidUntil != null && new Date(p.paidUntil) < new Date()
            return (
              <div key={p.userId} className="ai-person">
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{who(p)} <span className="faint" style={{ fontWeight: 500, fontSize: 12 }}>· {PLAN_NAME[p.plan]}</span></div>
                  <div className="faint num" style={{ fontSize: 12 }}>
                    {paid
                      ? `${p.limitUsd ? fmtPct(Math.min(100, p.monthUsd / p.limitUsd * 100)) : '–'} genutzt · ${fmtUsd(p.monthUsd)} · ${expired ? 'abgelaufen' : 'bis'} ${p.paidUntil ? dateDe(p.paidUntil) : ''}`
                      : `${p.uses} Anfragen · diesen Monat ${fmtUsd(p.monthUsd)}${p.settledAt ? ` · bezahlt bis ${dateDe(p.settledAt)}` : ''}`}
                  </div>
                </div>
                {p.plan === 'friend' && (
                  <>
                    <div style={{ textAlign: 'right' }}>
                      <b className="num">{fmtUsd(p.openUsd)}</b>
                      <div className="faint" style={{ fontSize: 11 }}>offen</div>
                    </div>
                    {p.openUsd > 0 && (
                      confirm === p.userId
                        ? <button className="btn btn-chrome btn-sm" onClick={() => settle(p)}>Sicher?</button>
                        : <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(p.userId)}>Bezahlt</button>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </>
      )}

      {dev && (
        <>
          <label className="lbl">Aufladung eintragen</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input num" inputMode="decimal" placeholder="z. B. 5" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button className="btn btn-chrome" disabled={busy || !(Number(amount.replace(',', '.')) > 0)} onClick={save}>Eintragen</button>
          </div>
          <div className="hint"><span>Wenn du in der Anthropic Console Guthaben auflädst, hier denselben Betrag in $ eintragen. Das Guthaben zieht den Verbrauch aller Nutzer ab. Unter 2 $ wird der Punkt orange, unter 1 $ rot.</span></div>

          <label className="lbl">Abo vergeben</label>
          <input className="input" type="email" inputMode="email" autoCapitalize="none" placeholder="E-Mail des Accounts" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="segmented" style={{ marginTop: 8 }}>
            {(['solo', 'ultra', 'friend', 'none'] as const).map((k) => (
              <button key={k} className={newPlan === k ? 'on' : ''} onClick={() => setNewPlan(k)}>{k === 'none' ? 'Entfernen' : PLAN_NAME[k]}</button>
            ))}
          </div>
          {(newPlan === 'solo' || newPlan === 'ultra') && (
            <div className="segmented" style={{ marginTop: 8 }}>
              <button className={period === 'month' ? 'on' : ''} onClick={() => setPeriod('month')}>1 Monat</button>
              <button className={period === 'year' ? 'on' : ''} onClick={() => setPeriod('year')}>1 Jahr</button>
            </div>
          )}
          <button className="btn btn-chrome btn-block" style={{ marginTop: 8 }} disabled={busy || !email.includes('@')} onClick={grant}>
            {newPlan === 'none' ? 'Zugang entfernen' : 'Vergeben'}
          </button>
          <div className="hint"><span>Bis zum Store-Start vergibst du Abos hier von Hand. Ein laufendes Abo wird ab seinem Ende verlängert.</span></div>
        </>
      )}
    </div>
  )
}
