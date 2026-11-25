import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n'
import { haptic } from '../lib'
import { ackWelcome, openPaywall, refreshPlan, usePlan } from './AiCredit'
import { ChromeConfetti } from './Celebration'

/**
 * Shown once after the developer made someone Friend or Fam (ai_access.welcome).
 *   friend - a calm card with chrome confetti: half price on every plan
 *   fam    - the big one: emerald light, two waves of emerald confetti and a
 *            large "Family" lettering
 */
export function Welcome() {
  const s = usePlan()
  const [shown, setShown] = useState<'fam' | 'friend' | null>(null)
  const [second, setSecond] = useState(false)

  useEffect(() => {
    if (!s?.welcome || shown) return
    setShown(s.welcome)
    void ackWelcome() // once: cleared on the server right away
    haptic(true)
    const t1 = setTimeout(() => haptic(true), 420)
    const t2 = s.welcome === 'fam' ? setTimeout(() => { setSecond(true); haptic(true) }, 1100) : undefined
    return () => { clearTimeout(t1); if (t2) clearTimeout(t2) }
  }, [s?.welcome, shown])

  if (!shown) return null
  const close = () => { setShown(null); setSecond(false); refreshPlan() }

  if (shown === 'friend') {
    return createPortal(
      <div className="welcome friend">
        <ChromeConfetti burst={60} rain={40} />
        <div className="welcome-card stagger">
          <span className="welcome-pill tier-chrome">Friend</span>
          <h2 className="chrome-text">{t('Du bist jetzt Friend', 'You are a Friend now')}</h2>
          <p>{t('Alle VIS-Pro-Abos bekommst du ab sofort zum halben Preis.', 'From now on you get every VIS Pro plan at half price.')}</p>
          <button className="btn btn-chrome btn-block" onClick={() => { close(); openPaywall() }}>{t('Abos ansehen', 'See plans')}</button>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={close}>{t('Später', 'Later')}</button>
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div className="welcome fam" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="fam-rays" aria-hidden="true" />
      <div className="fam-ring" aria-hidden="true" />
      <div className="fam-ring r2" aria-hidden="true" />
      <ChromeConfetti tint="emerald" burst={110} rain={70} top={0.36} />
      {second && <ChromeConfetti tint="emerald" burst={80} rain={0} top={0.36} />}
      <div className="fam-body">
        <span className="welcome-pill tier-gem fam-gem">Fam</span>
        <div className="fam-pre">{t('Du bist', 'You are')}</div>
        <div className="fam-word">Family</div>
        <p className="fam-sub">{t('Alle KI-Funktionen von VIS – ohne Limit. Willkommen.', 'Every AI feature in VIS – no limit. Welcome.')}</p>
        <button className="fam-btn" onClick={close}>{t('Los geht’s', 'Let’s go')}</button>
      </div>
    </div>,
    document.body,
  )
}
