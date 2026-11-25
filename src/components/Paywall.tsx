import { dec, t } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib'
import { PLANS, usePlan, type Plan } from './AiCredit'
import { Icon } from './ui'

/** plan badges: chrome pills for Free and Solo, a cut emerald for Ultra, Friend and Dev */
const PLAN_TIER: Record<Plan | 'free', { label: string; gem: boolean }> = {
  free: { label: 'Free', gem: false },
  solo: { label: 'Solo', gem: false },
  ultra: { label: 'Ultra', gem: true },
  friend: { label: 'Friend', gem: true },
  dev: { label: 'Dev', gem: true },
}
const tierClass = (k: Plan | 'free') => (PLAN_TIER[k].gem ? 'tier-gem' : 'tier-chrome')

export function PlanBadge({ onClick }: { onClick: () => void }) {
  const s = usePlan()
  if (s === undefined) return null
  const key: Plan | 'free' = s.plan && s.active ? s.plan : 'free'
  return (
    <button className={'plan-badge ' + tierClass(key)} onClick={() => { haptic(); onClick() }}>
      {PLAN_TIER[key].label}
    </button>
  )
}

/** number that glides to its new value instead of jumping */
function Tween({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const cur = useRef(value)
  useEffect(() => {
    const from = cur.current, t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 520)
      const v = from + (value - from) * (1 - Math.pow(1 - k, 3))
      cur.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{Math.round(shown)}</>
}

const FEATURES: { icon: React.JSX.Element; title: string; text: string }[] = [
  { icon: <path d="M4 8h3l2-3h6l2 3h3v11H4ZM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />, get title() { return t('Essen per Foto', 'Food by photo') }, get text() { return t('Teller fotografieren – Lebensmittel, Mengen und Makros stehen drin.', 'Snap your plate – foods, amounts and macros are filled in.') } },
  { icon: <path d="M5 6h14M5 11h14M5 16h8M16 15l3 3-3 3" />, get title() { return t('Einfach hinschreiben', 'Just write it down') }, get text() { return t('„2 Semmeln mit Schinken" wird zu fertigen Einträgen.', '“2 rolls with ham” turns into ready entries.') } },
  { icon: <path d="M6 4h12v16H6ZM9 8h6M9 11h6M9 14h3" />, get title() { return t('Nährwerttabelle scannen', 'Scan nutrition labels') }, get text() { return t('Packung fotografieren statt Werte abtippen.', 'Photograph the pack instead of typing values.') } },
  { icon: <path d="M12 3a9 9 0 1 0 9 9M12 7v5l3 2M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" />, get title() { return t('Was soll ich noch essen?', 'What should I still eat?') }, get text() { return t('Vorschläge aus deinen echten Mahlzeiten für die restlichen Makros.', 'Ideas from your real meals for the remaining macros.') } },
  { icon: <path d="M3 18c3 0 4-9 7-9s3 6 5 6 3-9 6-9M3 21h18" />, get title() { return t('Phasenplaner', 'Phase planner') }, get text() { return t('Kalorien und Dauer für Bulk oder Cut aus deinen eigenen Daten.', 'Calories and duration for a bulk or cut from your own data.') } },
  { icon: <path d="M12 3v12M7 10l5 5 5-5M4 19h16" />, get title() { return t('Trainings importieren', 'Import workouts') }, get text() { return t('Strong, Hevy, FitNotes oder Notizen – deine Historie kommt mit.', 'Strong, Hevy, FitNotes or notes – your history comes along.') } },
]

/** The plans page: opens from the Free badge in the profile or when someone without a plan taps an AI feature. */
export function Paywall({ onClose }: { onClose: () => void }) {
  const s = usePlan()
  const [yearly, setYearly] = useState(true)
  const current: Plan | 'free' = s?.plan && s.active ? s.plan : 'free'
  const [pick, setPick] = useState<'solo' | 'ultra'>(current === 'ultra' ? 'ultra' : 'solo')
  const expired = !!s?.plan && !s.active

  const card = (k: 'free' | 'solo' | 'ultra') => {
    const tier = PLAN_TIER[k]
    const p = k === 'free' ? null : PLANS[k]
    const price = p ? (yearly ? p.year : p.month) : 0
    const on = k !== 'free' && pick === k
    return (
      <button
        key={k} className={'pw-plan' + (on ? ' on' : '') + (k === 'free' ? ' free' : '')}
        disabled={k === 'free'} onClick={() => { if (k !== 'free') { haptic(); setPick(k) } }}
      >
        <div className="pw-plan-top">
          <span className={'pw-tier ' + tierClass(k)}>{tier.label}</span>
          {current === k && <span className="pw-current">{t('Dein Plan', 'Your plan')}</span>}
          {k === 'ultra' && current !== 'ultra' && <span className="pw-current">{t('Für Vielnutzer', 'For heavy users')}</span>}
        </div>
        <div className="pw-price num">
          <Tween value={price} /> €{p && <span key={yearly ? 'y' : 'm'} className="pw-unit">/{yearly ? t('Jahr', 'year') : t('Monat', 'month')}</span>}
        </div>
        {p && (
          <div className={'pw-save' + (yearly ? ' open' : '')}>
            <div><div className="plan-offer-save num">{dec(p.year / 12, 2)} € {t('im Monat · 2 Monate gratis', 'a month · 2 months free')}</div></div>
          </div>
        )}
        <div className="pw-desc">
          {k === 'free' && t('Training, Statistiken, Körper und Ernährung – alles ohne KI.', 'Training, stats, body and nutrition – everything without AI.')}
          {k === 'solo' && t(`Alle KI-Funktionen. Reicht für ca. ${PLANS.solo.photos} Essensfotos im Monat.`, `All AI features. Enough for about ${PLANS.solo.photos} food photos a month.`)}
          {k === 'ultra' && t(`Doppeltes Kontingent – ca. ${PLANS.ultra.photos} Essensfotos im Monat.`, `Double quota – about ${PLANS.ultra.photos} food photos a month.`)}
        </div>
      </button>
    )
  }

  return createPortal(
    <div className="fullsheet paywall">
      <div className="fullsheet-head">
        <button className="icon-btn" onClick={onClose} aria-label={t('Schließen', 'Close')}><Icon.back /></button>
        <div className="grow" />
      </div>
      <div className="fullsheet-body">
        <div className="pw-hero">
          <div className="pw-spark" aria-hidden="true">✦</div>
          <h1>VIS Pro</h1>
          <p>{t('Weniger tippen, mehr trainieren. Die KI erledigt das Eintragen und plant mit deinen Daten.', 'Less typing, more training. The AI does the logging and plans with your data.')}</p>
        </div>
        {expired && <div className="hint" style={{ justifyContent: 'center' }}><span>{t('Dein Abo ist abgelaufen – verlängere es, um die KI weiter zu nutzen.', 'Your subscription has expired – renew it to keep using the AI.')}</span></div>}

        <div className="pw-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="pw-feature">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{f.icon}</svg>
              <div><b>{f.title}</b><span>{f.text}</span></div>
            </div>
          ))}
        </div>

        <div className={'pw-switch' + (yearly ? ' right' : '')} style={{ marginTop: 22 }}>
          <i aria-hidden="true" />
          <button className={!yearly ? 'on' : ''} onClick={() => { haptic(); setYearly(false) }}>{t('Monatlich', 'Monthly')}</button>
          <button className={yearly ? 'on' : ''} onClick={() => { haptic(); setYearly(true) }}>{t('Jährlich', 'Yearly')} <span className="pw-switch-save">−17 %</span></button>
        </div>
        <div className="pw-plans">
          {card('ultra')}
          {card('solo')}
          {card('free')}
        </div>

        <button className="btn btn-chrome btn-block" style={{ marginTop: 18 }} disabled>
          {current === pick ? t('Dein aktueller Plan', 'Your current plan') : t(`${PLAN_TIER[pick].label} – kommt mit dem App-Store-Start`, `${PLAN_TIER[pick].label} – coming with the App Store launch`)}
        </button>
        <div className="pw-fine">
          {s && !s.signedIn
            ? t('Für VIS Pro brauchst du einen Account: Profil › Einstellungen › Cloud.', 'VIS Pro needs an account: Profile › Settings › Cloud.')
            : t('Kündbar jederzeit. Das Kontingent startet jeden Monatsersten neu.', 'Cancel anytime. The quota resets on the 1st of every month.')}
        </div>
      </div>
    </div>,
    document.body,
  )
}
