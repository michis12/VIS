import { useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib'
import { PLANS, usePlan, type Plan } from './AiCredit'
import { Icon } from './ui'

/** colours of the plan badge: Free bronze, Solo silver, Ultra gold */
export const PLAN_TIER: Record<Plan | 'free', { label: string; a: string; b: string }> = {
  free: { label: 'Free', a: '#e8b48c', b: '#8a5634' },
  solo: { label: 'Solo', a: '#f4f4f8', b: '#8a8a92' },
  ultra: { label: 'Ultra', a: '#f8da98', b: '#a8762a' },
  friend: { label: 'Friend', a: '#dff3fb', b: '#5f8fa3' },
  dev: { label: 'Dev', a: '#ffffff', b: '#3a3a40' },
}

export function PlanBadge({ onClick }: { onClick: () => void }) {
  const s = usePlan()
  if (s === undefined) return null
  const key: Plan | 'free' = s.plan && s.active ? s.plan : 'free'
  const t = PLAN_TIER[key]
  return (
    <button className="plan-badge" onClick={() => { haptic(); onClick() }} style={{ background: `linear-gradient(135deg, ${t.a}, ${t.b})` }}>
      {t.label}
    </button>
  )
}

const FEATURES: { icon: React.JSX.Element; title: string; text: string }[] = [
  { icon: <path d="M4 8h3l2-3h6l2 3h3v11H4ZM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />, title: 'Essen per Foto', text: 'Teller fotografieren – Lebensmittel, Mengen und Makros stehen drin.' },
  { icon: <path d="M5 6h14M5 11h14M5 16h8M16 15l3 3-3 3" />, title: 'Einfach hinschreiben', text: '„2 Semmeln mit Schinken" wird zu fertigen Einträgen.' },
  { icon: <path d="M6 4h12v16H6ZM9 8h6M9 11h6M9 14h3" />, title: 'Nährwerttabelle scannen', text: 'Packung fotografieren statt Werte abtippen.' },
  { icon: <path d="M12 3a9 9 0 1 0 9 9M12 7v5l3 2M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" />, title: 'Was soll ich noch essen?', text: 'Vorschläge aus deinen echten Mahlzeiten für die restlichen Makros.' },
  { icon: <path d="M3 18c3 0 4-9 7-9s3 6 5 6 3-9 6-9M3 21h18" />, title: 'Phasenplaner', text: 'Kalorien und Dauer für Bulk oder Cut aus deinen eigenen Daten.' },
  { icon: <path d="M12 3v12M7 10l5 5 5-5M4 19h16" />, title: 'Trainings importieren', text: 'Strong, Hevy, FitNotes oder Notizen – deine Historie kommt mit.' },
]

/** The plans page: opens from the Free badge in the profile or when someone without a plan taps an AI feature. */
export function Paywall({ onClose }: { onClose: () => void }) {
  const s = usePlan()
  const [yearly, setYearly] = useState(true)
  const current: Plan | 'free' = s?.plan && s.active ? s.plan : 'free'
  const [pick, setPick] = useState<'solo' | 'ultra'>(current === 'ultra' ? 'ultra' : 'solo')
  const expired = !!s?.plan && !s.active

  const card = (k: 'free' | 'solo' | 'ultra') => {
    const t = PLAN_TIER[k]
    const p = k === 'free' ? null : PLANS[k]
    const price = p ? (yearly ? p.year : p.month) : 0
    const on = k !== 'free' && pick === k
    return (
      <button
        key={k} className={'pw-plan' + (on ? ' on' : '') + (k === 'free' ? ' free' : '')}
        disabled={k === 'free'} onClick={() => { if (k !== 'free') { haptic(); setPick(k) } }}
        style={on ? { borderColor: t.a } : undefined}
      >
        <div className="pw-plan-top">
          <span className="pw-tier" style={{ background: `linear-gradient(135deg, ${t.a}, ${t.b})` }}>{t.label}</span>
          {current === k && <span className="pw-current">Dein Plan</span>}
          {k === 'ultra' && current !== 'ultra' && <span className="pw-current">Für Vielnutzer</span>}
        </div>
        <div className="pw-price num">
          {price} €{p && <span>/{yearly ? 'Jahr' : 'Monat'}</span>}
        </div>
        {p && yearly && <div className="plan-offer-save num">{(p.year / 12).toFixed(2).replace('.', ',')} € im Monat · 2 Monate gratis</div>}
        <div className="pw-desc">
          {k === 'free' && 'Training, Statistiken, Körper und Ernährung – alles ohne KI.'}
          {k === 'solo' && `Alle KI-Funktionen. Reicht für ca. ${PLANS.solo.photos} Essensfotos im Monat.`}
          {k === 'ultra' && `Doppeltes Kontingent – ca. ${PLANS.ultra.photos} Essensfotos im Monat.`}
        </div>
      </button>
    )
  }

  return createPortal(
    <div className="fullsheet paywall">
      <div className="fullsheet-head">
        <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon.back /></button>
        <div className="grow" />
      </div>
      <div className="fullsheet-body">
        <div className="pw-hero">
          <div className="pw-spark" aria-hidden="true">✦</div>
          <h1>VIS Pro</h1>
          <p>Weniger tippen, mehr trainieren. Die KI erledigt das Eintragen und plant mit deinen Daten.</p>
        </div>
        {expired && <div className="hint" style={{ justifyContent: 'center' }}><span>Dein Abo ist abgelaufen – verlängere es, um die KI weiter zu nutzen.</span></div>}

        <div className="pw-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="pw-feature">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{f.icon}</svg>
              <div><b>{f.title}</b><span>{f.text}</span></div>
            </div>
          ))}
        </div>

        <div className="segmented" style={{ marginTop: 22 }}>
          <button className={!yearly ? 'on' : ''} onClick={() => setYearly(false)}>Monatlich</button>
          <button className={yearly ? 'on' : ''} onClick={() => setYearly(true)}>Jährlich</button>
        </div>
        <div className="pw-plans">
          {card('ultra')}
          {card('solo')}
          {card('free')}
        </div>

        <button className="btn btn-chrome btn-block" style={{ marginTop: 18 }} disabled>
          {current === pick ? 'Dein aktueller Plan' : `${PLAN_TIER[pick].label} – kommt mit dem App-Store-Start`}
        </button>
        <div className="pw-fine">
          {s && !s.signedIn
            ? 'Für VIS Pro brauchst du einen Account: Profil › Einstellungen › Cloud.'
            : 'Kündbar jederzeit. Das Kontingent startet jeden Monatsersten neu.'}
        </div>
      </div>
    </div>,
    document.body,
  )
}
