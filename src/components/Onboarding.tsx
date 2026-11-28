import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getLang, t } from '../i18n'
import { haptic } from '../lib'
import { CloudCard } from './CloudCard'

/**
 * Intro for new users: phones with real screens like the App Store images,
 * scroll through every feature, skip at the top, "Weiter" at the bottom.
 * After that an optional sign-up for the cloud backup. Can be opened again
 * from Settings (event "vis-onboarding").
 */
const KEY = 'vis.onboarded'
export const onboarded = () => { try { return localStorage.getItem(KEY) === '1' } catch { return true } }
export const setOnboarded = () => { try { localStorage.setItem(KEY, '1') } catch { /* ignore */ } }
export const openOnboarding = () => window.dispatchEvent(new Event('vis-onboarding'))

const img = (name: string) => `${import.meta.env.BASE_URL}intro/${getLang() === 'en' ? 'en' : 'de'}/${name}.webp`

function Phone({ src, tilt = 0, className = '' }: { src: string; tilt?: number; className?: string }) {
  return (
    <div className={'ob-phone ' + className} style={{ ['--tilt' as string]: `${tilt}deg` }}>
      <div className="ob-bezel"><div className="ob-screen">
        <div className="ob-island" />
        <img src={img(src)} alt="" loading="lazy" draggable={false} />
      </div></div>
    </div>
  )
}

interface Section { key: string; shot: string; eyebrow: string; title: string; text: string; points: string[]; killer?: boolean }
const sections = (): Section[] => [
  {
    key: 'train', shot: 'home', eyebrow: t('Training', 'Training'),
    title: t('Dein Plan im Rhythmus', 'Your plan, in rhythm'),
    text: t('Leg Vorlagen an, bring sie in eine Reihenfolge – auf der Trainingsseite steht immer nur das nächste Workout.', 'Create templates and put them in order – the training page always shows just the next workout.'),
    points: [t('Vorlagen per Drag & Drop', 'Templates with drag & drop'), t('„Schlau sortieren“ aus deinem Verlauf', '“Sort smartly” from your history'), t('Wochenscore auf einen Blick', 'Week score at a glance')],
  },
  {
    key: 'workout', shot: 'workout', eyebrow: t('Im Gym', 'At the gym'),
    title: t('Jeder Satz zählt', 'Every set counts'),
    text: t('Gewicht und Wiederholungen tippen, abhaken, Pause läuft. Der Pokal zeigt Rekorde, der Pfeil Fortschritt gegenüber dem letzten Mal.', 'Tap weight and reps, check the set, the rest timer runs. The trophy marks records, the arrow progress over last time.'),
    points: [t('Pausen-Timer mit Mitteilung', 'Rest timer with notification'), t('Supersätze koppeln', 'Link supersets'), t('Werte vom letzten Mal stehen schon drin', 'Last time’s values are prefilled')],
  },
  {
    key: 'stats', shot: 'stats', eyebrow: t('Statistik', 'Stats'),
    title: t('Sieh deinen Fortschritt', 'See your progress'),
    text: t('Wochenscore aus Training, Volumen, Fortschritt, Konstanz und Körper – mit Verlauf und Diagrammen für jede Übung.', 'Week score from training, volume, progress, consistency and body – with history and charts for every exercise.'),
    points: [t('Rekorde und 1RM pro Übung', 'Records and 1RM per exercise'), t('Volumen und Sätze pro Woche', 'Volume and sets per week')],
  },
  {
    key: 'food', shot: 'food', eyebrow: t('Ernährung', 'Nutrition'),
    title: t('Kalorien ohne Stress', 'Calories made easy'),
    text: t('Barcode scannen, suchen, Favoriten und eigene Rezepte. Ziel und Makros kommen aus deiner Phase.', 'Scan barcodes, search, favourites and your own recipes. Target and macros come from your phase.'),
    points: [t('Millionen Produkte per Barcode', 'Millions of products by barcode'), t('Menge vom letzten Mal wird vorgeschlagen', 'Last amount is suggested'), t('Eigene Notizen, z. B. „Toast“', 'Own notes, e.g. “toast”')],
  },
  {
    key: 'ai', shot: 'ai-food', eyebrow: t('KI', 'AI'),
    title: t('Foto oder Text – die KI zählt', 'Photo or text – AI does the math'),
    text: t('Teller fotografieren oder „2 Eier und ein Toast“ schreiben: Lebensmittel, Mengen und Makros stehen sofort drin.', 'Snap your plate or write “2 eggs and a toast”: foods, amounts and macros are filled in right away.'),
    points: [t('Nährwerttabelle abfotografieren', 'Photograph nutrition labels'), t('Vorschläge für die restlichen Makros', 'Ideas for the remaining macros')],
  },
  {
    key: 'coach', shot: 'coach', eyebrow: t('KI-Coach · Ultra', 'AI coach · Ultra'), killer: true,
    title: t('Dein Coach kennt deine Daten', 'Your coach knows your data'),
    text: t('Frag nach deiner Woche, lass dir Pläne bauen, Essen eintragen oder Rezepte anlegen – der Coach erledigt es mit einem Tipp.', 'Ask about your week, have plans built, food logged or recipes created – the coach does it with one tap.'),
    points: [t('Vorlagen, Übungen, Rezepte anlegen', 'Creates templates, exercises, recipes'), t('Gewicht und Phase eintragen', 'Logs weight and phase')],
  },
  {
    key: 'body', shot: 'body-muscles', eyebrow: t('Körper', 'Body'),
    title: t('Sieh, was du trainierst', 'See what you train'),
    text: t('Gewicht mit Bulk- und Cut-Phasen, Körpermaße und eine Heatmap, die jeden Muskel zeigt – auch die, die du liegen lässt.', 'Weight with bulk and cut phases, measurements and a heat map that shows every muscle – including the ones you skip.'),
    points: [t('Phasenplaner mit KI', 'Phase planner with AI'), t('Vorne und hinten, 7 oder 30 Tage', 'Front and back, 7 or 30 days')],
  },
  {
    key: 'awards', shot: 'profile', eyebrow: 'Achievements',
    title: t('Vom Rookie zum Shōgun', 'From rookie to Shōgun'),
    text: t('57 Achievements mit Sternen – ernste und welche zum Schmunzeln – und Ränge, die mit dir wachsen.', '57 achievements with stars – serious ones and some just for fun – and ranks that grow with you.'),
    points: [t('Ehrenhalle im Profil', 'Hall of fame in your profile'), t('Teilen als Bild', 'Share as an image')],
  },
]

export function Onboarding({ onClose, toast }: { onClose: () => void; toast: (s: string) => void }) {
  const [step, setStep] = useState<'tour' | 'account'>('tour')
  const body = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)

  // sections slide in as they come into view
  useEffect(() => {
    if (step !== 'tour') return
    const els = body.current?.querySelectorAll('.ob-reveal') ?? []
    const io = new IntersectionObserver((list) => {
      for (const e of list) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
    }, { root: body.current, threshold: 0.18 })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [step])

  const onScroll = () => {
    const el = body.current
    if (el) setProgress(Math.min(1, el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)))
  }
  const finish = () => { setOnboarded(); onClose() }
  const next = () => { haptic(true); setStep('account'); body.current?.scrollTo({ top: 0 }) }

  return createPortal(
    <div className="ob">
      {step === 'tour' && <div className="ob-progress" style={{ transform: `scaleX(${progress})` }} />}
      <div className="ob-top">
        <span className="ob-brand chrome-text">VIS</span>
        <button className="ob-skip" onClick={() => { haptic(); step === 'tour' ? next() : finish() }}>
          {step === 'tour' ? t('Überspringen', 'Skip') : t('Später', 'Later')}
        </button>
      </div>
      <div className="ob-body" ref={body} onScroll={onScroll} key={step}>
        {step === 'tour' ? (
          <>
            <section className="ob-hero">
              <div className="ob-glow" />
              <div className="ob-hero-phones">
                <Phone src="workout" tilt={-12} className="ob-side left" />
                <Phone src="home" className="ob-main" />
                <Phone src="coach" tilt={12} className="ob-side right" />
              </div>
              <h1 className="ob-hero-title"><span className="chrome-text">{t('Training. Ernährung.', 'Training. Nutrition.')}</span><br /><span className="ob-em">{t('Mit KI.', 'Powered by AI.')}</span></h1>
              <p className="ob-hero-text">{t('Willkommen bei VIS. Scroll durch – in einer Minute kennst du alles.', 'Welcome to VIS. Scroll through – in a minute you know it all.')}</p>
              <div className="ob-scroll-hint" aria-hidden="true"><span /></div>
            </section>

            {sections().map((s, i) => (
              <section key={s.key} className={'ob-sec ob-reveal' + (i % 2 ? ' flip' : '') + (s.killer ? ' killer' : '')}>
                <div className="ob-sec-phone"><Phone src={s.shot} tilt={i % 2 ? 6 : -6} /></div>
                <div className="ob-sec-text">
                  <div className="ob-eyebrow"><i />{s.eyebrow}</div>
                  <h2>{s.title}</h2>
                  <p>{s.text}</p>
                  <ul>{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
              </section>
            ))}

            <section className="ob-end ob-reveal">
              <h2 className="chrome-text">{t('Bereit?', 'Ready?')}</h2>
              <p>{t('Die Einführung findest du jederzeit wieder unter Profil › Einstellungen.', 'You can open this intro again any time under Profile › Settings.')}</p>
              <button className="btn btn-chrome btn-block ob-next" onClick={next}>{t('Weiter', 'Continue')}</button>
            </section>
          </>
        ) : (
          <section className="ob-account">
            <div className="ob-cloud" aria-hidden="true">
              <svg viewBox="0 0 120 80"><path className="ob-cloud-line" d="M34 66h56a18 18 0 0 0 2-35.9A26 26 0 0 0 42.5 24 20 20 0 0 0 34 66Z" /><path className="ob-cloud-arrow" d="M60 56V36M51 44l9-9 9 9" /></svg>
            </div>
            <h2 className="chrome-text">{t('Sichere deine Fortschritte', 'Keep your progress safe')}</h2>
            <p className="ob-account-text">{t('Mit einem kostenlosen Konto sichert VIS alles automatisch in der Cloud: Trainings, Essen, Gewicht und Rekorde. Neues Handy oder zweites Gerät? Einfach anmelden – alles ist wieder da.', 'With a free account VIS backs up everything to the cloud automatically: workouts, food, weight and records. New phone or a second device? Just sign in – everything is back.')}</p>
            <div className="ob-perks">
              <span>☁︎ {t('Automatisches Backup', 'Automatic backup')}</span>
              <span>⇄ {t('Mehrere Geräte', 'Several devices')}</span>
              <span>✦ {t('Für KI-Funktionen nötig', 'Needed for AI features')}</span>
            </div>
            <div className="ob-card"><CloudCard toast={toast} /></div>
            <button className="btn btn-chrome btn-block" style={{ marginTop: 16 }} onClick={finish}>{t('Los geht’s', 'Let’s go')}</button>
            <p className="ob-fine">{t('Optional – VIS funktioniert auch ganz ohne Konto, deine Daten bleiben dann nur auf diesem Gerät.', 'Optional – VIS works without an account too; your data then stays on this device only.')}</p>
          </section>
        )}
      </div>
    </div>,
    document.body,
  )
}
