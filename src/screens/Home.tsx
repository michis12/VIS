import { useState } from 'react'
import { Icon, Sheet } from '../components/ui'
import { dateLabel, fmtInt, fmtKg, localIso, uid } from '../lib'
import { useNav } from '../nav'
import { useStore } from '../store'
import type { Template } from '../types'
import { HistoryRow } from './History'
import { newWorkoutFromTemplate } from './Workout'

export function Home({ onOpenWorkout }: { onOpenWorkout: () => void }) {
  const store = useStore()
  const nav = useNav()
  const { templates, workouts, exerciseById, active, weights, phases } = store
  const [chosen, setChosen] = useState<Template | null>(null)

  const start = (t: Template | null) => {
    store.saveWorkout(newWorkoutFromTemplate(t))
    setChosen(null)
    onOpenWorkout()
  }

  const skip = (t: Template) => {
    store.saveWorkout({
      id: uid(), name: t.name, templateId: t.id, startedAt: localIso(), durationSec: null, status: 'skipped', source: 'app',
      exercises: t.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: Array.from({ length: e.sets }, () => ({ weight: null, reps: null, done: false })) })),
    })
    setChosen(null)
  }

  const lastOf = (t: Template) => [...workouts].reverse().find((w) => w.name === t.name && w.status === 'done')
  const recent = [...workouts].filter((w) => w.status !== 'active').reverse().slice(0, 8)
  const lastWeight = weights[weights.length - 1]
  const phase = phases[phases.length - 1]
  const hour = new Date().getHours()
  const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Bereit?' : 'Guten Abend'

  return (
    <div className="screen">
      <div className="eyebrow">{dateLabel(localIso(), false)}</div>
      <h1 className="title">{greet}</h1>

      {active && (
        <button className="card chrome-edge hero" style={{ width: '100%', textAlign: 'left', marginBottom: 12 }} onClick={onOpenWorkout}>
          <div className="eyebrow">Läuft gerade</div>
          <h3 style={{ marginTop: 4 }}>{active.name}</h3>
          <p className="muted" style={{ marginTop: 2 }}>Seit {active.startedAt.slice(11, 16)} Uhr · Tippen zum Fortsetzen</p>
        </button>
      )}

      <div className="grid-2">
        <div className="card kpi">
          <div className="label">Gewicht</div>
          <div className="value">{lastWeight ? fmtKg(lastWeight.kg) : '–'}<small>kg</small></div>
        </div>
        <div className="card kpi">
          <div className="label">Phase</div>
          <div className="value" style={{ fontSize: 22, marginTop: 10 }}>
            {phase ? <><span className={'phase-dot phase-' + phase.type} /> {phaseName(phase.type)}</> : <span className="faint">Nicht gesetzt</span>}
          </div>
          {phase && <div className="sub">{fmtInt(phase.calories)} kcal/Tag</div>}
        </div>
      </div>

      <div className="section-title">
        <h2>Training starten</h2>
        <button className="link" onClick={() => nav.push({ kind: 'template', template: null })}>+ Neues Template</button>
      </div>
      {templates.map((t) => {
        const last = lastOf(t)
        return (
          <button key={t.id} className="card tpl" style={{ width: '100%', textAlign: 'left' }} onClick={() => !active && setChosen(t)} disabled={!!active}>
            <div className="tpl-badge"><span className="chrome-text">{badge(t.name)}</span></div>
            <div className="tpl-main">
              <div className="name">{t.name}</div>
              <div className="meta">{t.exercises.map((e) => exerciseById.get(e.exerciseId)?.name).join(' · ')}</div>
              {last && <div className="meta faint" style={{ marginTop: 2 }}>Zuletzt {dateLabel(last.startedAt)}</div>}
            </div>
            <span className="chev"><Icon.chevron /></span>
          </button>
        )
      })}
      {!active && (
        <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => start(null)}>
          <Icon.plus /> Leeres Training
        </button>
      )}

      <div className="section-title">
        <h2>Verlauf</h2>
        <button className="link" onClick={() => nav.push({ kind: 'history' })}>Alle anzeigen</button>
      </div>
      <div className="card" style={{ padding: '4px 14px' }}>
        {recent.map((w) => <HistoryRow key={w.id} w={w} onOpen={() => nav.push({ kind: 'workout', id: w.id })} />)}
      </div>

      {chosen && (
        <Sheet onClose={() => setChosen(null)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3>{chosen.name}</h3>
            <button className="link muted" onClick={() => { const t = chosen; setChosen(null); nav.push({ kind: 'template', template: t }) }}>Bearbeiten</button>
          </div>
          <p className="muted" style={{ marginBottom: 14 }}>{chosen.exercises.length} Übungen · {chosen.exercises.reduce((n, e) => n + e.sets, 0)} Sätze</p>
          <div className="menu" style={{ marginBottom: 16 }}>
            {chosen.exercises.map((e, i) => (
              <div key={i} className="list-row">
                <div className="grow">{exerciseById.get(e.exerciseId)?.name}</div>
                <span className="faint num">{e.sets} ×</span>
              </div>
            ))}
          </div>
          <button className="btn btn-chrome btn-block" onClick={() => start(chosen)}>Workout starten</button>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => skip(chosen)}>Heute nicht trainieren</button>
        </Sheet>
      )}

    </div>
  )
}

/** "Day 1 Upper" -> "1U", "Push" -> "PU" */
function badge(name: string) {
  const parts = name.split(/[\s\-+_]+/).filter(Boolean).map((p) => (/^\d+$/.test(p) ? p : p[0]))
  return (parts.length >= 2 ? parts.slice(-2).join('') : name.slice(0, 2)).toUpperCase()
}

export const phaseName =(t: string) => (t === 'bulk' ? 'Bulk' : t === 'cut' ? 'Cut' : 'Erhalt')
