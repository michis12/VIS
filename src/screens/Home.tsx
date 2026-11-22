import { useState } from 'react'
import { ScoreGauge } from '../components/ScoreGauge'
import { Icon, Sheet } from '../components/ui'
import { useWeekScore } from '../components/WeeklyReport'
import { scoreLabel, WEEKLY_TARGET } from '../weekly'
import { dateLabel, fmtInt, fmtKg, localIso } from '../lib'
import { parseTemplatesFile, pickFile, shareOrDownload, templatesFile } from '../files'
import { useNav } from '../nav'
import { useStore } from '../store'
import type { Template } from '../types'
import { HistoryRow } from './History'
import { newWorkoutFromTemplate } from './Workout'

export function Home({ onOpenWorkout, onOpenStats, onOpenBody, toast }: {
  onOpenWorkout: () => void
  onOpenStats: () => void
  onOpenBody: (focus?: 'phase') => void
  toast: (t: string) => void
}) {
  const store = useStore()
  const nav = useNav()
  const { templates, workouts, exerciseById, active, weights, phases } = store
  const [chosen, setChosen] = useState<Template | null>(null)
  const [manage, setManage] = useState(false)
  const week = useWeekScore(0)

  const importTemplates = async () => {
    setManage(false)
    const file = await pickFile('application/json,.json')
    if (!file) return
    try {
      const { templates: imported, newExercises } = await parseTemplatesFile(file, store.exercises)
      if (!imported.length) throw new Error('Keine Templates in der Datei')
      for (const e of newExercises) store.saveExercise(e)
      for (const t of imported) store.saveTemplate(t)
      toast(`${imported.length} Template${imported.length > 1 ? 's' : ''} importiert`)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const start = (t: Template | null) => {
    store.saveWorkout(newWorkoutFromTemplate(t))
    setChosen(null)
    onOpenWorkout()
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
        <button className="card kpi kpi-link" onClick={() => onOpenBody()}>
          <div className="label">Gewicht</div>
          <div className="value">{lastWeight ? fmtKg(lastWeight.kg) : '–'}<small>kg</small></div>
          <span className="kpi-chev"><Icon.chevron /></span>
        </button>
        <button className="card kpi kpi-link" onClick={() => onOpenBody('phase')}>
          <span className="kpi-chev"><Icon.chevron /></span>
          <div className="label">Phase</div>
          <div className="value" style={{ fontSize: 22, marginTop: 10 }}>
            {phase ? <><span className={'phase-dot phase-' + phase.type} /> {phaseName(phase.type)}</> : <span className="faint">Nicht gesetzt</span>}
          </div>
          {phase && <div className="sub">{fmtInt(phase.calories)} kcal/Tag</div>}
        </button>
      </div>

      <button className="card score-mini" style={{ width: '100%', textAlign: 'left' }} onClick={onOpenStats}>
        <ScoreGauge score={week.score} size={78} />
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Wochenscore</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{scoreLabel(week.score)}</div>
          <div className="faint" style={{ fontSize: 12 }}>{week.workouts} / {WEEKLY_TARGET} Workouts · Zusammensetzung ansehen</div>
        </div>
        <span className="chev"><Icon.chevron /></span>
      </button>

      <div className="section-title">
        <h2>Training starten</h2>
        <button className="link" onClick={() => setManage(true)}>Verwalten</button>
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

      {manage && (
        <Sheet onClose={() => setManage(false)}>
          <h3>Templates</h3>
          <div className="menu">
            <button onClick={() => { setManage(false); nav.push({ kind: 'template', template: null }) }}><Icon.plus /> Neues Template</button>
            <button onClick={importTemplates}>Template-Datei importieren</button>
            <button disabled={!templates.length} onClick={async () => {
              setManage(false)
              const r = await shareOrDownload(templatesFile(templates, exerciseById), 'VIS Templates')
              if (r === 'downloaded') toast('Templates gespeichert')
            }}>Alle Templates exportieren</button>
          </div>
        </Sheet>
      )}

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
          <p className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 10 }}>Einzelne Übungen kannst du im Workout über ⋯ auslassen.</p>
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
