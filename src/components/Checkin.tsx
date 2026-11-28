import { useMemo, useState } from 'react'
import { checkinDue, computeCheckin } from '../checkin'
import { dec, t } from '../i18n'
import { fmtInt, fmtKg, haptic, today } from '../lib'
import { useStore } from '../store'
import { calorieSteps } from '../types'
import { openPaywall, usePlan } from './AiCredit'
import { Icon, Sheet } from './ui'

const phaseLabel = (p: string) => (p === 'bulk' ? 'Bulk' : p === 'cut' ? 'Cut' : t('Erhalt', 'Maintain'))

/** paid plans (incl. fam and dev) get the check-in */
export function usePaid() {
  const s = usePlan()
  return !!s?.plan && !!s.active
}

/**
 * Small note on the nutrition page when the weekly check-in is due (paid plans,
 * switchable in Settings). Tapping opens the check-in.
 */
export function CheckinNudge() {
  const store = useStore()
  const paid = usePaid()
  const [open, setOpen] = useState(false)
  const d = today()
  const res = useMemo(() => computeCheckin(store.foodLog, store.weights, store.phases, d), [store.foodLog, store.weights, store.phases, d])
  if (!paid || store.settings.checkin === false || !res.ok || !checkinDue(store.settings.checkinAt, d)) return null
  return (
    <>
      <button className="checkin-nudge" onClick={() => { haptic(); setOpen(true) }}>
        <span className="ai-spark" aria-hidden="true">✦</span>
        <span className="grow">{t('Wochen-Check-in bereit', 'Weekly check-in ready')}<small>{t('Dein echter Verbrauch und ein neues Kalorienziel', 'Your real expenditure and a new calorie target')}</small></span>
        <Icon.chevron />
      </button>
      {open && <CheckinSheet onClose={() => setOpen(false)} />}
    </>
  )
}

/** Row on the body page: opens the check-in any time (paid) or the plans page (free). */
export function CheckinRow() {
  const paid = usePaid()
  const store = useStore()
  const [open, setOpen] = useState(false)
  if (store.settings.checkin === false && paid) return null
  return (
    <>
      <button className="ai-row" style={{ marginTop: 10 }} onClick={() => (paid ? setOpen(true) : openPaywall('checkin'))}>
        <span className="ai-spark" aria-hidden="true">✦</span>
        <div className="grow">
          <div className="nut-entry-name">{t('Kalorien-Check-in', 'Calorie check-in')}{!paid && <span className="ps-only" style={{ marginLeft: 6 }}>Solo</span>}</div>
          <div className="faint" style={{ fontSize: 12 }}>{t('Echter Verbrauch aus Essen + Gewichtstrend, jede Woche neu', 'Real expenditure from food + weight trend, every week')}</div>
        </div>
        <Icon.chevron />
      </button>
      {open && <CheckinSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function CheckinSheet({ onClose }: { onClose: () => void }) {
  const store = useStore()
  const d = today()
  const res = useMemo(() => computeCheckin(store.foodLog, store.weights, store.phases, d), [store.foodLog, store.weights, store.phases, d])
  const done = () => { store.saveSettings({ ...store.settings, checkinAt: d }); onClose() }

  if (!res.ok) {
    const why = res.reason === 'phase'
      ? t('Leg zuerst unter Körper eine Phase (Bulk, Cut oder Erhalt) an.', 'First set a phase (bulk, cut or maintain) under Body.')
      : res.reason === 'food'
        ? t(`Dafür braucht es mindestens 10 vollständig eingetragene Tage in den letzten 3 Wochen – bisher ${res.have}.`, `This needs at least 10 fully logged days in the last 3 weeks – ${res.have} so far.`)
        : t(`Dafür braucht es mindestens 4 Gewichtseinträge über 10+ Tage in den letzten 3 Wochen – bisher ${res.have}.`, `This needs at least 4 weigh-ins over 10+ days in the last 3 weeks – ${res.have} so far.`)
    return (
      <Sheet onClose={onClose}>
        <h3>{t('Kalorien-Check-in', 'Calorie check-in')}</h3>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.5, margin: '8px 0 14px' }}>{why}</p>
        <p className="faint" style={{ fontSize: 13, lineHeight: 1.5 }}>{t('Aus dem, was du isst, und deinem geglätteten Gewicht rechnet VIS jede Woche deinen echten Verbrauch aus – genauer als jede Formel.', 'From what you eat and your smoothed weight, VIS works out your real expenditure every week – more accurate than any formula.')}</p>
      </Sheet>
    )
  }

  const diff = res.current != null ? res.target - res.current : 0
  const apply = () => {
    haptic(true)
    const p = res.phase
    const log = calorieSteps(p).filter((s) => s.from < d)
    log.push({ from: d, kcal: res.target })
    store.savePhase({ ...p, calories: res.target, calorieLog: log })
    done()
  }
  const pacePct = `${res.pace > 0 ? '+' : ''}${dec(res.pace * 100, 2)} %`
  return (
    <Sheet onClose={onClose}>
      <h3>{t('Wochen-Check-in', 'Weekly check-in')}</h3>
      <div className="checkin-big num">{fmtInt(res.expenditure)}<span>{t('kcal Verbrauch / Tag', 'kcal burned / day')}</span></div>
      <div className="menu checkin-rows">
        <div className="list-row"><div className="grow muted">{t('Gegessen im Schnitt', 'Eaten on average')}</div><b className="num">{fmtInt(res.intake)} kcal</b><span className="faint" style={{ fontSize: 12, marginLeft: 6 }}>{res.days} {t('Tage', 'days')}</span></div>
        <div className="list-row"><div className="grow muted">{t('Trendgewicht', 'Trend weight')}</div><b className="num">{fmtKg(Math.round(res.trendNow * 10) / 10)} kg</b><span className="faint num" style={{ fontSize: 12, marginLeft: 6 }}>{res.perWeek >= 0 ? '+' : ''}{dec(res.perWeek, 2)} kg/{t('Wo', 'wk')}</span></div>
        <div className="list-row"><div className="grow muted">{t('Ziel', 'Goal')}: {phaseLabel(res.phase.type)}</div><b className="num">{pacePct}</b><span className="faint" style={{ fontSize: 12, marginLeft: 6 }}>{t('pro Woche', 'per week')}</span></div>
      </div>
      <div className="checkin-reco">
        <span className="faint">{t('Neues Kalorienziel', 'New calorie target')}</span>
        <b className="num">{fmtInt(res.target)} kcal</b>
        {res.current != null && <small className="num">{t('bisher', 'was')} {fmtInt(res.current)} · {diff >= 0 ? '+' : '−'}{fmtInt(Math.abs(diff))}</small>}
      </div>
      {Math.abs(diff) >= 50 ? (
        <button className="btn btn-chrome btn-block" onClick={apply}>{t('Übernehmen', 'Apply')}</button>
      ) : (
        <button className="btn btn-chrome btn-block" onClick={done}>{t('Passt so ✓', 'All good ✓')}</button>
      )}
      <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={done}>{t('Nicht ändern', 'Keep it')}</button>
    </Sheet>
  )
}
