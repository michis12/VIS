import { dec, t } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib'
import { FREE_TEMPLATES, PLANS, fmtEuro, openPaywall, planPhotos, planPrice, useCredit, usePlan, type Plan } from './AiCredit'
import { Icon, Sheet } from './ui'

/** plan badges: chrome pills for Free and Solo, a cut emerald for Ultra, Fam and Dev */
const PLAN_TIER: Record<Plan, { label: string; gem: boolean }> = {
  free: { label: 'Free', gem: false },
  solo: { label: 'Solo', gem: false },
  ultra: { label: 'Ultra', gem: true },
  fam: { label: 'Fam', gem: true },
  dev: { label: 'Dev', gem: true },
}
const tierClass = (k: Plan) => (PLAN_TIER[k].gem ? 'tier-gem' : 'tier-chrome')

/**
 * The plan badge in the profile. Free opens the plans page; Solo a summary of
 * what it includes with the way to Ultra; every other plan its status.
 */
export function PlanBadge() {
  const s = usePlan()
  const [open, setOpen] = useState(false)
  if (s === undefined) return null
  const key: Plan = s.plan && s.active ? s.plan : 'free'
  return (
    <>
      <button className={'plan-badge ' + tierClass(key)} onClick={() => { haptic(); if (key === 'free') openPaywall(); else setOpen(true) }}>
        {key === 'free' && s.friend ? 'Friend' : PLAN_TIER[key].label}
      </button>
      {open && key !== 'free' && <PlanStatus plan={key} friend={s.friend} onClose={() => setOpen(false)} />}
    </>
  )
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(t('de-AT', 'en-GB'), { day: 'numeric', month: 'long', year: 'numeric' }) : '–')

function PlanStatus({ plan, friend, onClose }: { plan: Exclude<Plan, 'free'>; friend: boolean; onClose: () => void }) {
  const { credit } = useCredit()
  const coach = plan !== 'solo'
  const unlimited = plan === 'fam' || plan === 'dev'
  const pct = credit?.usedPct ?? null
  const rows: [string, string][] = [
    [t('Plan', 'Plan'), PLAN_TIER[plan].label + (friend ? ' · Friend' : '')],
    ...(plan === 'solo' || plan === 'ultra' ? [
      [t('Abrechnung', 'Billing'), credit?.period === 'year' ? t('jährlich', 'yearly') : credit?.period === 'month' ? t('monatlich', 'monthly') : '–'] as [string, string],
      [t('Bezahlt bis', 'Paid until'), fmtDate(credit?.paidUntil ?? null)] as [string, string],
    ] : []),
    [t('KI diesen Monat', 'AI this month'), unlimited ? (credit ? `${dec(credit.monthUsed, 2)} $` : '–') : pct == null ? '–' : `${dec(pct, 1)} %`],
    ...(credit?.resetsAt && !unlimited ? [[t('Neu ab', 'Resets on'), fmtDate(credit.resetsAt)] as [string, string]] : []),
  ]
  return (
    <Sheet onClose={onClose}>
      <div className="ps-head">
        <span className={'pw-tier ' + tierClass(plan)}>{PLAN_TIER[plan].label}</span>
        <h3>{plan === 'solo' ? t('Das kann dein Solo', 'What Solo gives you') : t('Dein Status', 'Your status')}</h3>
      </div>
      {!unlimited && pct != null && (
        <div className="ps-meter"><div style={{ width: `${Math.min(100, pct)}%` }} /></div>
      )}
      <div className="menu ps-rows">
        {rows.map(([k, v]) => <div key={k} className="list-row"><div className="grow muted">{k}</div><b className="num">{v}</b></div>)}
      </div>
      <div className="ps-features">
        {FEATURES.filter((f) => !f.coach).map((f) => (
          <div key={f.title} className="ps-feature"><span className="ps-check">✓</span>{f.title}</div>
        ))}
        <div className={'ps-feature' + (coach ? '' : ' off')}><span className="ps-check">{coach ? '✓' : '✦'}</span>{t('KI-Coach', 'AI coach')}{!coach && <span className="ps-only">Ultra</span>}</div>
      </div>
      {plan === 'solo' && (
        <>
          <div className="pw-killer ps-killer">
            <div className="pw-killer-tag">{t('Nur mit Ultra', 'Only with Ultra')}</div>
            <b>{t('Der KI-Coach', 'The AI coach')}</b>
            <span>{COACH_TEXT()}</span>
          </div>
          <button className="btn btn-chrome btn-block" style={{ marginTop: 14 }} onClick={() => { onClose(); openPaywall() }}>{t('Auf Ultra upgraden', 'Upgrade to Ultra')}</button>
        </>
      )}
    </Sheet>
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
  return <>{Number.isInteger(value) ? Math.round(shown) : dec(shown, 2)}</>
}

const COACH_TEXT = () => t(
  'Dein persönlicher Coach kennt dein ganzes Training, deine Ernährung und Phasen – und erledigt Dinge für dich: Essen eintragen, Vorlagen und Pläne bauen, Übungen und Rezepte anlegen, Phase anpassen. Alles mit einem Tipp.',
  'Your personal coach knows all your training, food and phases – and gets things done: logs food, builds templates and plans, creates exercises and recipes, adjusts your phase. All with one tap.',
)

const FEATURES: { icon: React.JSX.Element; title: string; text: string; coach?: boolean; templates?: boolean }[] = [
  { icon: <path d="M4 8h3l2-3h6l2 3h3v11H4ZM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />, get title() { return t('Essen per Foto', 'Food by photo') }, get text() { return t('Teller fotografieren – Lebensmittel, Mengen und Makros stehen drin.', 'Snap your plate – foods, amounts and macros are filled in.') } },
  { icon: <path d="M5 6h14M5 11h14M5 16h8M16 15l3 3-3 3" />, get title() { return t('Einfach hinschreiben', 'Just write it down') }, get text() { return t('„2 Semmeln mit Schinken" wird zu fertigen Einträgen.', '“2 rolls with ham” turns into ready entries.') } },
  { icon: <path d="M6 4h12v16H6ZM9 8h6M9 11h6M9 14h3" />, get title() { return t('Nährwerttabelle scannen', 'Scan nutrition labels') }, get text() { return t('Packung fotografieren statt Werte abtippen.', 'Photograph the pack instead of typing values.') } },
  { icon: <path d="M12 3a9 9 0 1 0 9 9M12 7v5l3 2M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" />, get title() { return t('Was soll ich noch essen?', 'What should I still eat?') }, get text() { return t('Vorschläge aus deinen echten Mahlzeiten für die restlichen Makros.', 'Ideas from your real meals for the remaining macros.') } },
  { icon: <path d="M3 18c3 0 4-9 7-9s3 6 5 6 3-9 6-9M3 21h18" />, get title() { return t('Phasenplaner', 'Phase planner') }, get text() { return t('Kalorien und Dauer für Bulk oder Cut aus deinen eigenen Daten.', 'Calories and duration for a bulk or cut from your own data.') } },
  { icon: <path d="M12 3v12M7 10l5 5 5-5M4 19h16" />, get title() { return t('Trainings importieren', 'Import workouts') }, get text() { return t('Strong, Hevy, FitNotes oder Notizen – deine Historie kommt mit.', 'Strong, Hevy, FitNotes or notes – your history comes along.') } },
  { icon: <path d="M4 19h16M6 16l4-5 3 3 5-7M18 7h-3M18 7v3" />, get title() { return t('Wöchentlicher Kalorien-Check-in', 'Weekly calorie check-in') }, get text() { return t('Echter Verbrauch aus deinem Essen und Gewichtstrend – jede Woche ein passendes neues Kalorienziel.', 'Real expenditure from your food and weight trend – a fitting new calorie target every week.') } },
  { templates: true, icon: <path d="M5 4h10l4 4v12H5ZM15 4v4h4M8.5 12h7M8.5 15.5h7M8.5 8.5h3" />, get title() { return t('Unbegrenzt Vorlagen', 'Unlimited templates') }, get text() { return t(`Free hat bis zu ${FREE_TEMPLATES} Vorlagen – mit Solo und Ultra so viele du willst.`, `Free has up to ${FREE_TEMPLATES} templates – with Solo and Ultra as many as you like.`) } },
  { coach: true, icon: <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM12 8.2l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9Z" />, get title() { return t('KI-Coach · Ultra', 'AI coach · Ultra') }, get text() { return COACH_TEXT() } },
]

/**
 * Emerald "slide to subscribe", like the phone's slide-to-answer: a gem knob
 * that nudges to the right while idle, a shimmering label, and a track that
 * fills in emerald as you drag. Past ~85 % it locks in; until purchases exist it
 * shows when they arrive and slides back.
 */
function SlideToBuy({ label, doneLabel, onDone }: { label: string; doneLabel: string; onDone?: () => void }) {
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x0: number; max: number } | null>(null)
  const [x, setX] = useState(0)
  const [state, setState] = useState<'idle' | 'drag' | 'back' | 'done'>('idle')
  const KNOB = 70, PAD = 5
  const maxX = () => (track.current ? track.current.clientWidth - KNOB - PAD * 2 : 240)
  const frac = Math.max(0, Math.min(1, x / Math.max(1, maxX())))

  const down = (e: React.PointerEvent) => {
    if (state === 'done') return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x0: e.clientX - x, max: maxX() }
    setState('drag')
    haptic()
  }
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return
    setX(Math.max(0, Math.min(drag.current.max, e.clientX - drag.current.x0)))
  }
  const up = () => {
    if (!drag.current) return
    const done = x >= drag.current.max * 0.85
    drag.current = null
    if (done) {
      setX(maxX())
      setState('done')
      haptic(true)
      onDone?.()
      setTimeout(() => { setState('back'); setX(0) }, 1900)
    } else {
      setState(x > 0 ? 'back' : 'idle') // a plain tap has nothing to slide back
      setX(0)
    }
  }

  return (
    // the wrapper carries the glow: a clip-path would cut off a shadow on the track itself
    <div className={'slide-wrap ' + state}>
    <div className={'slide-buy ' + state} ref={track} style={{ ['--f' as string]: state === 'done' ? 1 : frac }}>
      {/* light trail behind the knob: nothing at rest, it builds up as you slide */}
      <div className="slide-trail" style={{ width: `${x + KNOB / 2 + PAD}px`, opacity: state === 'done' ? 1 : Math.min(1, x / 90) }} />
      <div className="slide-label" style={{ opacity: state === 'done' ? 1 : Math.max(0, 1 - frac * 1.6) }}>
        {state === 'done' ? doneLabel : <span className="slide-shine">{label}</span>}
      </div>
      <div
        className="slide-knob" role="slider" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}
        style={{ transform: `translateX(${x}px)` }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onTransitionEnd={() => state === 'back' && setState('idle')}
      >
        {state === 'done'
          ? <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="square" strokeLinejoin="miter"><path d="M4.5 12.5l5 5L19.5 7" /></svg>
          : <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="square" strokeLinejoin="miter" strokeMiterlimit="10"><path d="M8 3.5l9 8.5-9 8.5" /></svg>}
      </div>
    </div>
    </div>
  )
}

/** The plans page: opens from the Free badge in the profile or when someone without a plan taps an AI feature. */
export function Paywall({ onClose, reason }: { onClose: () => void; reason?: string }) {
  const s = usePlan()
  const [yearly, setYearly] = useState(true)
  const current: Plan | 'free' = s?.plan && s.active ? s.plan : 'free'
  const [pick, setPick] = useState<'solo' | 'ultra'>(current === 'ultra' ? 'ultra' : 'solo')
  const expired = (s?.plan === 'solo' || s?.plan === 'ultra') && !s.active
  const friend = !!s?.friend

  const card = (k: 'free' | 'solo' | 'ultra') => {
    const tier = PLAN_TIER[k]
    const p = k === 'free' ? null : PLANS[k]
    const price = p ? planPrice(k as 'solo' | 'ultra', yearly, friend) : 0
    const full = p ? planPrice(k as 'solo' | 'ultra', yearly) : 0
    const on = k !== 'free' && pick === k
    return (
      <button
        key={k} className={'pw-plan' + (on ? ' on' : '') + (k === 'free' ? ' free' : '')}
        disabled={k === 'free'} onClick={() => { if (k !== 'free') { haptic(); setPick(k) } }}
      >
        <div className="pw-plan-top">
          <span className={'pw-tier ' + tierClass(k)}>{tier.label}</span>
          {current === k && <span className="pw-current">{t('Dein Plan', 'Your plan')}</span>}
          {p && friend && current !== k && <span className="pw-current pw-friend">Friend −50 %</span>}
          {k === 'ultra' && !friend && current !== 'ultra' && <span className="pw-current">{t('Für Vielnutzer', 'For heavy users')}</span>}
        </div>
        <div className="pw-price num">
          {p && friend && <s className="pw-old">{fmtEuro(full)} €</s>}<Tween value={price} /> €{p && <span key={yearly ? 'y' : 'm'} className="pw-unit">/{yearly ? t('Jahr', 'year') : t('Monat', 'month')}</span>}
        </div>
        {p && (
          <div className={'pw-save' + (yearly ? ' open' : '')}>
            <div><div className="plan-offer-save num">{dec(planPrice(k as 'solo' | 'ultra', true, friend) / 12, 2)} € {t('im Monat · 2 Monate gratis', 'a month · 2 months free')}</div></div>
          </div>
        )}
        <div className="pw-desc">
          {k === 'free' && t(`Training, Statistiken, Körper und Ernährung – ohne KI, bis zu ${FREE_TEMPLATES} Vorlagen.`, `Training, stats, body and nutrition – no AI, up to ${FREE_TEMPLATES} templates.`)}
          {k === 'solo' && t(`Alle KI-Funktionen und unbegrenzt Vorlagen. Reicht für ca. ${planPhotos('solo', friend)} Essensfotos im Monat.`, `All AI features and unlimited templates. Enough for about ${planPhotos('solo', friend)} food photos a month.`)}
          {k === 'ultra' && t(`200 % Limit + KI-Coach + unbegrenzt Vorlagen – ca. ${planPhotos('ultra', friend)} Essensfotos im Monat.`, `200% limit + AI coach + unlimited templates – about ${planPhotos('ultra', friend)} food photos a month.`)}
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
        {reason === 'templates-locked' && (
          <div className="pw-reason">
            <b>{t('Diese Vorlage ist gesperrt', 'This template is locked')}</b>
            <span>{t(`Mit Free bleiben deine ${FREE_TEMPLATES} meistgenutzten Vorlagen. Mit Solo oder Ultra sind alle wieder da – nichts ist gelöscht.`, `On Free your ${FREE_TEMPLATES} most used templates stay. With Solo or Ultra all of them are back – nothing was deleted.`)}</span>
          </div>
        )}
        {reason === 'checkin' && (
          <div className="pw-reason">
            <b>{t('Kalorien-Check-in mit Solo oder Ultra', 'Calorie check-in with Solo or Ultra')}</b>
            <span>{t('Jede Woche rechnet VIS aus deinem Essen und Gewichtstrend deinen echten Verbrauch aus und schlägt ein neues Kalorienziel vor.', 'Every week VIS works out your real expenditure from your food and weight trend and suggests a new calorie target.')}</span>
          </div>
        )}
        {reason === 'templates' && (
          <div className="pw-reason">
            <b>{t(`Free: bis zu ${FREE_TEMPLATES} Vorlagen`, `Free: up to ${FREE_TEMPLATES} templates`)}</b>
            <span>{t('Mit Solo oder Ultra legst du so viele Vorlagen an, wie du willst.', 'With Solo or Ultra you can create as many templates as you like.')}</span>
          </div>
        )}
        {expired && <div className="hint" style={{ justifyContent: 'center' }}><span>{t('Dein Abo ist abgelaufen – verlängere es, um die KI weiter zu nutzen.', 'Your subscription has expired – renew it to keep using the AI.')}</span></div>}

        {/* the killer feature: the coach gets its own card above the list */}
        <div className="pw-killer">
          <div className="pw-killer-tag">✦ {t('Killer-Feature · Ultra', 'Killer feature · Ultra')}</div>
          <div className="pw-killer-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{FEATURES.find((f) => f.coach)!.icon}</svg>
            <b>{t('Dein KI-Coach', 'Your AI coach')}</b>
          </div>
          <span>{COACH_TEXT()}</span>
          <div className="pw-killer-chips">
            {[t('Kennt deine Daten', 'Knows your data'), t('Trägt Essen ein', 'Logs food'), t('Baut Pläne', 'Builds plans'), t('Legt Rezepte an', 'Creates recipes')].map((c) => <i key={c}>{c}</i>)}
          </div>
        </div>
        <div className="pw-features">
          {FEATURES.filter((f) => !f.coach).map((f) => (
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

        {current === pick ? (
          <button className="btn btn-chrome btn-block" style={{ marginTop: 18 }} disabled>{t('Dein aktueller Plan', 'Your current plan')}</button>
        ) : (
          <SlideToBuy
            key={pick}
            label={t(`${PLAN_TIER[pick].label} kaufen`, `Get ${PLAN_TIER[pick].label}`)}
            doneLabel={t('Kommt mit dem App-Store-Start', 'Coming with the App Store launch')}
          />
        )}
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
