import { useMemo, useState } from 'react'
import { Icon } from '../components/ui'
import { dateLabel, durationLabel, fmtInt, workoutSetCount, workoutVolume } from '../lib'
import { useNav } from '../nav'
import { useStore } from '../store'
import type { Workout } from '../types'

const MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

export function History() {
  const { workouts } = useStore()
  const nav = useNav()
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const list = workouts.filter((w) => w.status !== 'active' && w.name.toLowerCase().includes(q.toLowerCase())).reverse()
    const out: { key: string; label: string; items: Workout[] }[] = []
    for (const w of list) {
      const key = w.startedAt.slice(0, 7)
      let g = out[out.length - 1]
      if (!g || g.key !== key) {
        g = { key, label: `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`, items: [] }
        out.push(g)
      }
      g.items.push(w)
    }
    return out
  }, [workouts, q])

  return (
    <div className="screen no-tabs">
      <div className="wo-head">
        <button className="icon-btn" onClick={nav.pop} aria-label="Zurück"><Icon.back /></button>
        <div className="grow"><div className="name">Verlauf</div><div className="wo-timer">{workouts.length} Einträge</div></div>
      </div>
      <input className="input" placeholder="Workout suchen" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 16 }} />

      {groups.map((g) => (
        <div key={g.key}>
          <div className="section-title"><h2>{g.label}</h2><span className="faint" style={{ fontSize: 13 }}>{g.items.filter((w) => w.status === 'done').length} Workouts</span></div>
          <div className="card" style={{ padding: '4px 14px' }}>
            {g.items.map((w) => <HistoryRow key={w.id} w={w} onOpen={() => nav.push({ kind: 'workout', id: w.id })} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

export function HistoryRow({ w, onOpen }: { w: Workout; onOpen: () => void }) {
  return (
    <button className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={onOpen}>
      <div className="grow">
        <div style={{ fontWeight: 600 }}>{w.name}</div>
        <div className="faint" style={{ fontSize: 13 }}>{dateLabel(w.startedAt)}</div>
      </div>
      {w.status === 'skipped' ? (
        <span className="pill skip">Ausgelassen</span>
      ) : (
        <div style={{ textAlign: 'right', fontSize: 13 }} className="muted num">
          <div>{workoutSetCount(w)} Sätze · {fmtInt(workoutVolume(w))} kg</div>
          <div className="faint">{durationLabel(w.durationSec)}</div>
        </div>
      )}
      <span className="chev"><Icon.chevron /></span>
    </button>
  )
}
