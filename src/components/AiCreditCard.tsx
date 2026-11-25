import { useState } from 'react'
import {
  PLANS, addTopup, openPaywall, creditColor, fmtEuro, fmtPct, fmtUsd, leftColor, markSettled, planPhotos, planPrice, setPlan, useCredit,
  type Credit, type Person,
} from './AiCredit'
import { TrainingImport } from './TrainingImport'
import { dec, locale, t } from '../i18n'

const ct = (usd: number) => dec(usd * 100, 2) + ' ct'
const who = (p: Person) => (p.isMe ? t('Du', 'You') : p.email.split('@')[0] || p.email)
const dateDe = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
const PLAN_NAME = { dev: 'Developer', fam: 'Fam', free: 'Free', friend: 'Friend', solo: 'Solo', ultra: 'Ultra' }

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
      <div className="section-title"><h2>{t('KI & Abo', 'AI & subscription')}</h2></div>
      {!active && <Offer credit={credit} />}
      {active && (credit.plan === 'solo' || credit.plan === 'ultra') && <PaidStatus credit={credit} />}
      {active && (credit.plan === 'dev' || credit.plan === 'fam') && <UsageCard credit={credit} reload={reload} toast={toast} />}
      {active && (
        <button className="ai-row" style={{ marginTop: 12 }} onClick={() => setImporting(true)}>
          <span className="ai-spark" aria-hidden="true">✦</span>
          <div className="grow">
            <div className="nut-entry-name">{t('Trainings importieren', 'Import workouts')}</div>
            <div className="faint" style={{ fontSize: 12 }}>{t('Aus Strong, Hevy, FitNotes, Excel oder deinen Notizen', 'From Strong, Hevy, FitNotes, Excel or your notes')}</div>
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
  const expired = (credit.plan === 'solo' || credit.plan === 'ultra') && !credit.active
  const f = credit.friend
  return (
    <div className="card">
      {f && <div className="hint good" style={{ marginTop: 0, marginBottom: 12 }}><span>{t('Als Friend bekommst du alle Abos zum halben Preis.', 'As a Friend you get every plan at half price.')}</span></div>}
      {expired && <div className="hint" style={{ marginTop: 0, marginBottom: 12 }}><span>{t(`Dein Abo ist am ${dateDe(credit.paidUntil!)} abgelaufen.`, `Your subscription expired on ${dateDe(credit.paidUntil!)}.`)}</span></div>}
      <div style={{ fontWeight: 700, fontSize: 18 }}>VIS Pro</div>
      <div className="muted" style={{ fontSize: 14, lineHeight: 1.45, marginTop: 4 }}>
        {t('Essen per Foto, Text oder Nährwerttabelle eintragen, Essensvorschläge, Phasenplaner und Import deiner alten Trainings.', 'Log food by photo, text or nutrition label, meal ideas, phase planner and import of your old workouts.')}
      </div>
      <div className="segmented" style={{ marginTop: 14 }}>
        <button className={!yearly ? 'on' : ''} onClick={() => setYearly(false)}>{t('Monatlich', 'Monthly')}</button>
        <button className={yearly ? 'on' : ''} onClick={() => setYearly(true)}>{t('Jährlich', 'Yearly')}</button>
      </div>
      <div className="plan-offers">
        {(['solo', 'ultra'] as const).map((k) => {
          const p = PLANS[k]
          return (
            <div key={k} className={'plan-offer' + (k === 'ultra' ? ' hi' : '')}>
              <div className="plan-offer-name">{p.name}</div>
              <div className="plan-offer-price num">{fmtEuro(planPrice(k, yearly, f))} €<span>/{yearly ? t('Jahr', 'year') : t('Monat', 'month')}</span></div>
              {yearly && <div className="plan-offer-save num">{dec(planPrice(k, true, f) / 12, 2)} € {t('im Monat · 2 Monate gratis', 'a month · 2 months free')}</div>}
              <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                {k === 'ultra' ? t('200 % Limit', '200% limit') : t('Alle KI-Funktionen', 'All AI features')}
                <br />{t(`ca. ${planPhotos(k, f)} Essensfotos im Monat`, `about ${planPhotos(k, f)} food photos a month`)}
              </div>
            </div>
          )
        })}
      </div>
      <button className="btn btn-chrome btn-block" style={{ marginTop: 14 }} onClick={openPaywall}>{t('Alle Vorteile ansehen', 'See all benefits')}</button>
      <div className="hint"><span>{t('Texteinträge, Etiketten und Vorschläge brauchen viel weniger als ein Foto – davon gehen locker tausende.', 'Text entries, labels and suggestions need far less than a photo – thousands of them easily fit.')}</span></div>
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
        <span className="faint" style={{ fontSize: 13 }}>{credit.period === 'year' ? t('jährlich', 'yearly') : t('monatlich', 'monthly')}</span>
      </div>
      <div className="quota-bar"><i style={{ width: `${Math.min(100, used)}%`, background: leftColor(left) }} /></div>
      <div className="pr-row num"><span className="muted">{t('Noch übrig diesen Monat', 'Left this month')}</span><b>{fmtPct(left)}</b></div>
      {credit.resetsAt && <div className="pr-row num"><span className="muted">{t('Wieder 100 % ab', 'Back to 100 % on')}</span><b>{dateDe(credit.resetsAt)}</b></div>}
      {credit.paidUntil && <div className="pr-row num"><span className="muted">{t('Abo läuft bis', 'Subscription runs until')}</span><b>{dateDe(credit.paidUntil)}</b></div>}
      {credit.plan === 'solo' && used >= 80 && (
        <div className="hint"><span>{t('Fast aufgebraucht? ', 'Almost used up? ')}<b>Ultra</b>{t(` gibt dir 200 % Limit für ${fmtEuro(planPrice('ultra', false, credit.friend))} € im Monat.`, ` gives you a 200% limit for ${fmtEuro(planPrice('ultra', false, credit.friend))} € a month.`)}</span></div>
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
  const [newPlan, setNewPlan] = useState<'fam' | 'friend' | 'solo' | 'ultra' | 'none'>('solo')
  const [period, setPeriod] = useState<'month' | 'year'>('month')

  const save = async () => {
    const v = Number(amount.replace(',', '.'))
    if (!(v > 0)) return
    setBusy(true)
    try {
      await addTopup(v)
      setAmount('')
      toast(t(`${fmtUsd(v)} Guthaben eingetragen`, `${fmtUsd(v)} balance added`))
      reload()
    } catch {
      toast(t('Speichern hat nicht geklappt', 'Saving did not work'))
    } finally {
      setBusy(false)
    }
  }

  const settle = async (p: Person) => {
    try {
      await markSettled(p.userId)
      toast(t(`${who(p)}: als bezahlt markiert`, `${who(p)}: marked as paid`))
      setConfirm(null)
      reload()
    } catch {
      toast(t('Hat nicht geklappt', 'That did not work'))
    }
  }

  const grant = async () => {
    if (!email.includes('@')) return
    setBusy(true)
    try {
      await setPlan(email.trim(), newPlan, period)
      toast(newPlan === 'none' ? t('Zugang entfernt', 'Access removed') : t(`${PLAN_NAME[newPlan]} vergeben`, `${PLAN_NAME[newPlan]} granted`))
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
          <span className="muted">{t('Guthaben (geschätzt)', 'Balance (estimated)')}</span>
          <b className="num" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="credit-dot" style={{ background: credit.topups > 0 ? creditColor(credit.balance) : 'var(--text-3)' }} />
            {credit.topups > 0 ? fmtUsd(credit.balance) : '–'}
          </b>
        </div>
      )}
      <div className="pr-row num"><span className="muted">{dev ? t('Du diesen Monat', 'You this month') : t('Diesen Monat verbraucht', 'Used this month')}</span><b>{fmtUsd(credit.monthUsed)}</b></div>
      {credit.uses > 0 && (
        <div className="pr-row num"><span className="muted">{t('Anfragen · Ø pro Anfrage', 'Requests · avg per request')}</span><b>{credit.uses} · {ct(credit.used / credit.uses)}</b></div>
      )}

      {others.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 14 }}>{t('Nutzer', 'Users')}</div>
          {others.map((p) => {
            const paid = p.plan === 'solo' || p.plan === 'ultra'
            const expired = paid && p.paidUntil != null && new Date(p.paidUntil) < new Date()
            return (
              <div key={p.userId} className="ai-person">
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{who(p)} <span className="faint" style={{ fontWeight: 500, fontSize: 12 }}>· {PLAN_NAME[p.plan]}{p.friend ? ' · Friend' : ''}</span></div>
                  <div className="faint num" style={{ fontSize: 12 }}>
                    {paid
                      ? t(`${p.limitUsd ? fmtPct(Math.min(100, p.monthUsd / p.limitUsd * 100)) : '–'} genutzt · ${fmtUsd(p.monthUsd)} · ${expired ? 'abgelaufen' : 'bis'} ${p.paidUntil ? dateDe(p.paidUntil) : ''}`, `${p.limitUsd ? fmtPct(Math.min(100, p.monthUsd / p.limitUsd * 100)) : '–'} used · ${fmtUsd(p.monthUsd)} · ${expired ? 'expired' : 'until'} ${p.paidUntil ? dateDe(p.paidUntil) : ''}`)
                      : t(`${p.uses} Anfragen · diesen Monat ${fmtUsd(p.monthUsd)}${p.settledAt ? ` · bezahlt bis ${dateDe(p.settledAt)}` : ''}`, `${p.uses} requests · this month ${fmtUsd(p.monthUsd)}${p.settledAt ? ` · paid until ${dateDe(p.settledAt)}` : ''}`)}
                  </div>
                </div>
                {p.plan === 'fam' && (
                  <>
                    <div style={{ textAlign: 'right' }}>
                      <b className="num">{fmtUsd(p.openUsd)}</b>
                      <div className="faint" style={{ fontSize: 11 }}>{t('offen', 'open')}</div>
                    </div>
                    {p.openUsd > 0 && (
                      confirm === p.userId
                        ? <button className="btn btn-chrome btn-sm" onClick={() => settle(p)}>{t('Sicher?', 'Sure?')}</button>
                        : <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(p.userId)}>{t('Bezahlt', 'Paid')}</button>
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
          <label className="lbl">{t('Aufladung eintragen', 'Add top-up')}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input num" inputMode="decimal" placeholder={t('z. B. 5', 'e.g. 5')} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button className="btn btn-chrome" disabled={busy || !(Number(amount.replace(',', '.')) > 0)} onClick={save}>{t('Eintragen', 'Add')}</button>
          </div>
          <div className="hint"><span>{t('Wenn du in der Anthropic Console Guthaben auflädst, hier denselben Betrag in $ eintragen. Das Guthaben zieht den Verbrauch aller Nutzer ab. Unter 2 $ wird der Punkt orange, unter 1 $ rot.', 'When you top up in the Anthropic Console, enter the same amount in $ here. The balance subtracts every user’s use. Below 2 $ the dot turns orange, below 1 $ red.')}</span></div>

          <label className="lbl">{t('Abo vergeben', 'Grant subscription')}</label>
          <input className="input" type="email" inputMode="email" autoCapitalize="none" placeholder={t('E-Mail des Accounts', 'Account email')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="segmented" style={{ marginTop: 8 }}>
            {(['solo', 'ultra', 'fam', 'friend', 'none'] as const).map((k) => (
              <button key={k} className={newPlan === k ? 'on' : ''} onClick={() => setNewPlan(k)}>{k === 'none' ? '✕' : PLAN_NAME[k]}</button>
            ))}
          </div>
          {(newPlan === 'solo' || newPlan === 'ultra') && (
            <div className="segmented" style={{ marginTop: 8 }}>
              <button className={period === 'month' ? 'on' : ''} onClick={() => setPeriod('month')}>{t('1 Monat', '1 month')}</button>
              <button className={period === 'year' ? 'on' : ''} onClick={() => setPeriod('year')}>{t('1 Jahr', '1 year')}</button>
            </div>
          )}
          <button className="btn btn-chrome btn-block" style={{ marginTop: 8 }} disabled={busy || !email.includes('@')} onClick={grant}>
            {newPlan === 'none' ? t('Zugang entfernen', 'Remove access') : t('Vergeben', 'Grant')}
          </button>
          <div className="hint"><span>{t('Fam = alle KI-Funktionen ohne Limit. Friend = halber Preis auf Solo/Ultra (Limit 2 $ bzw. 4 $). Beide bekommen eine Nachricht und ein Willkommens-Pop-up. Ein laufendes Abo wird ab seinem Ende verlängert.', 'Fam = all AI features without a limit. Friend = half price on Solo/Ultra (limit 2 $ / 4 $). Both get a message and a welcome pop-up. A running subscription is extended from its end.')}</span></div>
        </>
      )}
    </div>
  )
}
