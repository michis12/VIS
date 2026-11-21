import { useCallback, useState } from 'react'
import { Icon, Toast } from './components/ui'
import { Body } from './screens/Body'
import { Home } from './screens/Home'
import { Settings } from './screens/Settings'
import { Stats } from './screens/Stats'
import { WorkoutScreen } from './screens/Workout'
import { StoreProvider, useStore } from './store'

type Tab = 'train' | 'stats' | 'body' | 'settings'

function Shell() {
  const { active } = useStore()
  const [tab, setTab] = useState<Tab>('train')
  const [showWorkout, setShowWorkout] = useState(!!active)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  if (showWorkout && active) {
    return (
      <div className="app">
        <WorkoutScreen workout={active} onClose={(msg) => { setShowWorkout(false); if (msg) setToast(msg) }} />
        {toast && <Toast text={toast} onDone={clearToast} />}
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: () => React.JSX.Element }[] = [
    { id: 'train', label: 'Training', icon: Icon.dumbbell },
    { id: 'stats', label: 'Statistik', icon: Icon.chart },
    { id: 'body', label: 'Körper', icon: Icon.body },
    { id: 'settings', label: 'Mehr', icon: Icon.gear },
  ]

  return (
    <div className="app">
      {tab === 'train' && <Home onOpenWorkout={() => setShowWorkout(true)} />}
      {tab === 'stats' && <Stats />}
      {tab === 'body' && <Body />}
      {tab === 'settings' && <Settings toast={setToast} />}
      <nav className="tabbar">
        {tabs.map((t) => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
            <t.icon />
            {t.label}
          </button>
        ))}
      </nav>
      {toast && <Toast text={toast} onDone={clearToast} />}
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
