import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon, Toast } from './components/ui'
import { haptic } from './lib'
import { NavCtx, type Overlay } from './nav'
import { Body } from './screens/Body'
import { History } from './screens/History'
import { Home } from './screens/Home'
import { Profile, useAchievements } from './screens/Profile'
import { Settings } from './screens/Settings'
import { Stats } from './screens/Stats'
import { TemplateEditor } from './screens/TemplateEditor'
import { WorkoutScreen } from './screens/Workout'
import { WorkoutView } from './screens/WorkoutView'
import { StoreProvider, useStore } from './store'

type Tab = 'train' | 'stats' | 'body' | 'profile' | 'settings'

const TABS: { id: Tab; label: string; icon: () => React.JSX.Element }[] = [
  { id: 'train', label: 'Training', icon: Icon.dumbbell },
  { id: 'stats', label: 'Statistik', icon: Icon.chart },
  { id: 'body', label: 'Körper', icon: Icon.body },
  { id: 'profile', label: 'Profil', icon: Icon.trophy },
  { id: 'settings', label: 'Mehr', icon: Icon.gear },
]

function Shell() {
  const { active } = useStore()
  const [tab, setTab] = useState<Tab>('train')
  const [showWorkout, setShowWorkout] = useState(!!active)
  const [stack, setStack] = useState<Overlay[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
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
  let content: React.ReactNode
  if (top?.kind === 'workout') content = <WorkoutView key={top.id} id={top.id} />
  else if (top?.kind === 'history') content = <History />
  else if (top?.kind === 'template') content = <TemplateEditor template={top.template} onClose={nav.pop} />
  else if (showWorkout && active) {
    content = <WorkoutScreen workout={active} onClose={(msg) => { setShowWorkout(false); if (msg) setToast(msg) }} />
  }

  return (
    <NavCtx.Provider value={nav}>
      <div className="app">
        {!content && <div className="top-blur" />}
        <div className="app" style={content ? { visibility: 'hidden' } : undefined} aria-hidden={!!content}>
          {tab === 'train' && <Home onOpenWorkout={() => setShowWorkout(true)} toast={setToast} />}
          {tab === 'stats' && <Stats />}
          {tab === 'body' && <Body />}
          {tab === 'profile' && <Profile toast={setToast} />}
          {tab === 'settings' && <Settings toast={setToast} />}
          <nav className="tabbar">
            {TABS.map((t) => (
              <button key={t.id} className={'tab' + (tab === t.id ? ' on' : '')} onClick={() => { if (t.id !== tab) haptic(); setTab(t.id) }}>
                <t.icon />
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        {content && <div className="overlay" key={stack.length + (showWorkout ? 'w' : '')}>{content}</div>}
        {toast && <Toast text={toast} onDone={clearToast} />}
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
