import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { refreshPlan } from './components/AiCredit'
import { Celebration } from './components/Celebration'
import { Paywall } from './components/Paywall'
import { loadOverrides } from './foodCorrections'
import { Onboarding, onboarded, setOnboarded } from './components/Onboarding'
import { Welcome } from './components/Welcome'
import { Icon, Tap, Toast } from './components/ui'
import { getLang, t } from './i18n'
import { haptic } from './lib'
import { NavCtx, type Overlay } from './nav'
import { useNativeTabs } from './native'
import { Body } from './screens/Body'
import { ExerciseDetail } from './screens/ExerciseDetail'
import { ExerciseLibrary } from './screens/ExerciseLibrary'
import { History } from './screens/History'
import { Measures } from './screens/Measures'
import { Nutrition } from './screens/Nutrition'
import { Home } from './screens/Home'
import { Profile, useAchievements } from './screens/Profile'
import { Settings } from './screens/Settings'
import { Stats } from './screens/Stats'
import { TemplateEditor } from './screens/TemplateEditor'
import { WorkoutScreen } from './screens/Workout'
import { WorkoutView } from './screens/WorkoutView'
import { StoreProvider, useStore } from './store'

type Tab = 'train' | 'stats' | 'body' | 'food' | 'profile'

// `sf`: SF Symbol for the native iOS tab bar (native.ts)
const TABS: { id: Tab; label: () => string; icon: () => React.JSX.Element; sf: string }[] = [
  { id: 'stats', label: () => t('Statistik', 'Stats'), icon: Icon.chart, sf: 'chart.bar.fill' },
  { id: 'body', label: () => t('Körper', 'Body'), icon: Icon.body, sf: 'figure.stand' },
  { id: 'train', label: () => t('Training', 'Training'), icon: Icon.dumbbell, sf: 'dumbbell.fill' },
  { id: 'food', label: () => t('Ernährung', 'Nutrition'), icon: Icon.food, sf: 'fork.knife' },
  { id: 'profile', label: () => t('Profil', 'Profile'), icon: Icon.trophy, sf: 'trophy.fill' },
]

function Shell() {
  const store = useStore()
  const { active } = store
  // switching the language remounts the screens (not the navigation state), so every string re-renders
  const lang = getLang()
  const [tab, setTab] = useState<Tab>('train')
  const [showWorkout, setShowWorkout] = useState(!!active)
  const [stack, setStack] = useState<Overlay[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [bodyFocus, setBodyFocus] = useState<'phase' | null>(null)
  const [celebrate, setCelebrate] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  // plans page: opened by the plan badge or when someone without a plan taps an AI feature
  const [paywall, setPaywall] = useState<false | { reason?: string }>(false)
  // intro: once for new users (nothing logged yet), again from Settings
  const [intro, setIntro] = useState(() => {
    if (onboarded()) return false
    const used = store.workouts.some((w) => w.status === 'done') || store.foodLog.length > 0 || store.weights.length > 0
    if (used) { setOnboarded(); return false }
    return true
  })
  // toasts from places without a toast prop, and the accepted product corrections
  useEffect(() => {
    loadOverrides().catch(() => {})
    const on = (e: Event) => setToast(String((e as CustomEvent<string>).detail))
    window.addEventListener('vis-toast', on)
    return () => window.removeEventListener('vis-toast', on)
  }, [])
  useEffect(() => {
    const open = () => setIntro(true)
    window.addEventListener('vis-onboarding', open)
    return () => window.removeEventListener('vis-onboarding', open)
  }, [])
  useEffect(() => {
    refreshPlan()
    const open = (e: Event) => setPaywall({ reason: (e as CustomEvent<string | undefined>).detail })
    const onShow = () => document.visibilityState === 'visible' && refreshPlan()
    window.addEventListener('vis-paywall', open)
    document.addEventListener('visibilitychange', onShow)
    return () => { window.removeEventListener('vis-paywall', open); document.removeEventListener('visibilitychange', onShow) }
  }, [])
  const nav = useMemo(() => ({
    push: (o: Overlay) => setStack((s) => [...s, o]),
    pop: () => setStack((s) => s.slice(0, -1)),
  }), [])

  // announce newly earned stars
  const achievements = useAchievements()
  const prevStars = useRef<Map<string, number> | null>(null)
  useEffect(() => {
    const now = new Map(achievements.map((a) => [a.def.id, a.stars]))
    if (prevStars.current) {
      const up = achievements.find((a) => a.stars > (prevStars.current!.get(a.def.id) ?? 0))
      if (up) setToast(`Achievement: ${up.def.name} ${'★'.repeat(up.stars)}`)
    }
    prevStars.current = now
  }, [achievements])

  const top = stack[stack.length - 1]
  const covered = !!top || (showWorkout && !!active) || paywall || !!celebrate
  let content: React.ReactNode
  if (top?.kind === 'workout') content = <WorkoutView key={top.id} id={top.id} />
  else if (top?.kind === 'history') content = <History />
  else if (top?.kind === 'template') content = <TemplateEditor template={top.template} onClose={nav.pop} />
  else if (top?.kind === 'measures') content = <Measures />
  else if (top?.kind === 'settings') content = <Settings toast={setToast} />
  else if (top?.kind === 'exercise') content = <ExerciseDetail key={top.id} id={top.id} />
  else if (top?.kind === 'exercises') content = <ExerciseLibrary />

  else if (showWorkout && active) {
    content = (
      <WorkoutScreen
        workout={active}
        onClose={(msg) => { setShowWorkout(false); if (msg) setToast(msg) }}
        onFinished={(id) => { setShowWorkout(false); setCelebrate(id) }}
      />
    )
  }

  // iOS app on iOS 26+: the tab bar is the native Liquid Glass one (no-op everywhere else)
  const nativeTabs = useNativeTabs(
    TABS.map((x) => ({ id: x.id, label: x.label(), icon: x.sf })),
    tab,
    (id) => { setBodyFocus(null); setTab(id as Tab) },
    covered,
  )

  return (
    <NavCtx.Provider value={nav}>
      <div className="app">
        {!content && <div className="top-blur" />}
        <div className="app" style={content ? { visibility: 'hidden' } : undefined} aria-hidden={!!content}>
          <Fragment key={lang}>
          {tab === 'train' && <Home onOpenWorkout={() => setShowWorkout(true)} onOpenStats={() => { haptic(); setTab('stats') }} onOpenBody={(f) => { haptic(); setBodyFocus(f ?? null); setTab('body') }} onOpenFood={() => { haptic(); setTab('food') }} toast={setToast} />}
          {tab === 'stats' && <Stats />}
          {tab === 'body' && <Body focus={bodyFocus} />}
          {tab === 'profile' && <Profile toast={setToast} />}
          {tab === 'food' && <Nutrition />}
          </Fragment>
          {!nativeTabs && <nav className="tabbar">
            {TABS.map((t) => (
              <Tap key={t.id} className={'tab' + (tab === t.id ? ' on' : '')} onClick={() => { if (t.id !== tab) haptic(); setBodyFocus(null); setTab(t.id) }}>
                <t.icon />
                {t.label()}
              </Tap>
            ))}
          </nav>}
        </div>
        {content && <div className="overlay" key={stack.length + (showWorkout ? 'w' : '')}><Fragment key={lang}>{content}</Fragment></div>}
        {toast && <Toast text={toast} onDone={clearToast} />}
        {celebrate && <Celebration id={celebrate} onClose={() => setCelebrate(null)} />}
        {paywall && <Paywall reason={paywall.reason} onClose={() => setPaywall(false)} />}
        {intro && <Onboarding onClose={() => setIntro(false)} toast={setToast} />}
        <Welcome />
      </div>
    </NavCtx.Provider>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
