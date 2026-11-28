import { t as tr } from '../i18n'
import { useState } from 'react'
import { FREE_TEMPLATES, openPaywall, requireAi, requireTemplateSlot, templateLimit, usePlan } from '../components/AiCredit'
import { Coach } from '../components/Coach'
import { ScoreGauge } from '../components/ScoreGauge'
import { TemplateOrder } from '../components/TemplateOrder'
import { TrainingImport } from '../components/TrainingImport'
import { nextTemplate, orderedTemplates } from '../templateOrder'
import { Icon, Sheet } from '../components/ui'
import { useWeekScore } from '../components/WeeklyReport'
import { scoreLabel, WEEKLY_TARGET } from '../weekly'
import { dateLabel, fmtInt, fmtKg, haptic, localIso, today } from '../lib'
import { dayTotals, kcalTarget } from '../nutrition'
import { progressColors } from './Nutrition'
import { parseTemplatesFile, pickFile, shareOrDownload, templatesFile } from '../files'
import { useNav } from '../nav'
import { useStore } from '../store'
import type { Template } from '../types'
import { HistoryRow } from './History'
import { newWorkoutFromTemplate } from './Workout'

export function Home({ onOpenWorkout, onOpenStats, onOpenBody, onOpenFood, toast }: {
  onOpenWorkout: () => void
  onOpenStats: () => void
  onOpenBody: (focus?: 'phase') => void
  onOpenFood: () => void
  toast: (t: string) => void
}) {
  const store = useStore()
  const nav = useNav()
  const { workouts, exerciseById, active, weights, phases } = store
  const templates = orderedTemplates(store.templates, store.settings.templateOrder)
  const [ordering, setOrdering] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [chosen, setChosen] = useState<Template | null>(null)
  const [manage, setManage] = useState(false)
  const [importing, setImporting] = useState(false)
  const [coach, setCoach] = useState(false)
  const plan = usePlan()
  // the coach is an Ultra feature (fam and dev have it too)
  const openCoach = () => {
    if (plan && plan.active && (plan.plan === 'ultra' || plan.plan === 'fam' || plan.plan === 'dev')) setCoach(true)
    else openPaywall()
  }
  const week = useWeekScore(0)

  const importTemplates = async () => {
    setManage(false)
    const file = await pickFile('application/json,.json')
    if (!file) return
    try {
      const { templates: imported, newExercises } = await parseTemplatesFile(file, store.exercises)
      if (!imported.length) throw new Error(tr('Keine Templates in der Datei', 'No templates in the file'))
      // Free keeps at most 3 templates: import what still fits, then show why the rest is missing
      const limit = templateLimit()
      const room = limit == null ? imported.length : Math.max(0, limit - templates.length)
      if (!room) { requireTemplateSlot(templates.length); return }
      for (const e of newExercises) store.saveExercise(e)
      for (const t of imported.slice(0, room)) store.saveTemplate(t)
      if (room < imported.length) { openPaywall('templates'); return }
      toast(tr(`${imported.length} Template${imported.length > 1 ? 's' : ''} importiert`, `${imported.length} template${imported.length > 1 ? 's' : ''} imported`))
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
  // rhythm: templates run in their order (Settings › Verwalten › Reihenfolge); after the
  // last trained one comes the next, after the last template the first again
  const next = nextTemplate(templates, workouts)
  const nextId = templates.length > 1 ? next?.id ?? null : null
  // only the next template is shown, the others fold out
  const rest = next && templates.length > 1 ? templates.filter((x) => x.id !== next.id) : []
  const shown = rest.length ? [next!] : templates
  const tplCard = (t: Template) => {
    const last = lastOf(t)
    return (
      <button key={t.id} className={'card tpl' + (t.id === nextId && !active ? ' tpl-next' : '')} style={{ width: '100%', textAlign: 'left' }} onClick={() => !active && setChosen(t)} disabled={!!active}>
        <div className="tpl-badge"><span className="chrome-text">{badge(t.name)}</span></div>
        <div className="tpl-main">
          {t.id === nextId && !active && <div className="tpl-next-tag">{tr('Als Nächstes', 'Up next')}</div>}
          <div className="name">{t.name}</div>
          <div className="meta">{t.exercises.map((e) => exerciseById.get(e.exerciseId)?.name).join(' · ')}</div>
          {last && <div className="meta faint" style={{ marginTop: 2 }}>{tr('Zuletzt', 'Last')} {dateLabel(last.startedAt)}</div>}
        </div>
        <span className="chev"><Icon.chevron /></span>
      </button>
    )
  }
  const recent = [...workouts].filter((w) => w.status !== 'active').reverse().slice(0, 8)
  const lastWeight = weights[weights.length - 1]
  const phase = phases[phases.length - 1]
  const hour = new Date().getHours()
  const greet = hour < 11 ? tr('Guten Morgen', 'Good morning') : hour < 18 ? tr('Bereit?', 'Ready?') : tr('Guten Abend', 'Good evening')

  return (
    <div className="screen home">
      <div className="eyebrow">{dateLabel(localIso(), false)}</div>
      <div className="home-head">
        <h1 className="title">{greet}</h1>
        <button className="coach-btn" onClick={openCoach} aria-label="Coach">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
            <path d="M12 8.2l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9Z" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>

      {active && (
        <button className="card chrome-edge hero" style={{ width: '100%', textAlign: 'left', marginBottom: 12 }} onClick={onOpenWorkout}>
          <div className="eyebrow">{tr('Läuft gerade', 'In progress')}</div>
          <h3 style={{ marginTop: 4 }}>{active.name}</h3>
          <p className="muted" style={{ marginTop: 2 }}>{tr(`Seit ${active.startedAt.slice(11, 16)} Uhr · Tippen zum Fortsetzen`, `Since ${active.startedAt.slice(11, 16)} · tap to continue`)}</p>
        </button>
      )}

      <div className="grid-2">
        <button className="card kpi kpi-link" onClick={() => onOpenBody()}>
          <div className="label">{tr('Gewicht', 'Weight')}</div>
          <div className="value">{lastWeight ? fmtKg(lastWeight.kg) : '–'}<small>kg</small></div>
          <span className="kpi-chev"><Icon.chevron /></span>
        </button>
        <button className="card kpi kpi-link" onClick={() => onOpenBody('phase')}>
          <span className="kpi-chev"><Icon.chevron /></span>
          <div className="label">Phase</div>
          <div className="value" style={{ fontSize: 22, marginTop: 10 }}>
            {phase ? <><span className={'phase-dot phase-' + phase.type} /> {phaseName(phase.type)}</> : <span className="faint">{tr('Nicht gesetzt', 'Not set')}</span>}
          </div>
          {phase && <div className="sub">{fmtInt(phase.calories)} {tr('kcal/Tag', 'kcal/day')}</div>}
        </button>
      </div>

      <KcalStrip onOpen={onOpenFood} />

      <button className="card score-mini" style={{ width: '100%', textAlign: 'left' }} onClick={onOpenStats}>
        <ScoreGauge score={week.score} size={78} />
        <div style={{ flex: 1 }}>
          <div className="eyebrow">{tr('Wochenscore', 'Week score')}</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{scoreLabel(week.score)}</div>
          <div className="faint" style={{ fontSize: 12 }}>{week.workouts} / {WEEKLY_TARGET} Workouts · {tr('Zusammensetzung ansehen', 'see breakdown')}</div>
        </div>
        <span className="chev"><Icon.chevron /></span>
      </button>

      <div className="section-title">
        <h2>{tr('Training starten', 'Start training')}</h2>
        <button className="link" onClick={() => setManage(true)}>{tr('Verwalten', 'Manage')}</button>
      </div>
      {shown.map((t) => tplCard(t))}
      {rest.length > 0 && (
        <>
          <button className={'tpl-more' + (showAll ? ' open' : '')} onClick={() => { haptic(); setShowAll(!showAll) }} aria-expanded={showAll}>
            {showAll ? tr('Weniger anzeigen', 'Show less') : tr(`Weitere Vorlagen (${rest.length})`, `More templates (${rest.length})`)}
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <div className={'tpl-rest' + (showAll ? ' open' : '')}><div>{rest.map((t) => tplCard(t))}</div></div>
        </>
      )}
      {!active && (
        <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => start(null)}>
          <Icon.plus /> {tr('Leeres Training', 'Empty workout')}
        </button>
      )}

      <div className="section-title">
        <h2>{tr('Verlauf', 'History')}</h2>
        <button className="link" onClick={() => nav.push({ kind: 'history' })}>{tr('Alle anzeigen', 'Show all')}</button>
      </div>
      <div className="card" style={{ padding: '4px 14px' }}>
        {recent.map((w) => <HistoryRow key={w.id} w={w} onOpen={() => nav.push({ kind: 'workout', id: w.id })} />)}
      </div>
      <button className="import-link" onClick={() => requireAi() && setImporting(true)}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
        {tr('Trainings aus alter App übernehmen', 'Bring workouts from your old app')}
      </button>
      {coach && <Coach onClose={() => setCoach(false)} />}
      {ordering && <TemplateOrder onClose={() => setOrdering(false)} />}
      {importing && <TrainingImport onClose={() => setImporting(false)} toast={toast} />}

      {manage && (
        <Sheet onClose={() => setManage(false)}>
          <h3>Templates</h3>
          <div className="menu">
            <button onClick={() => { setManage(false); if (requireTemplateSlot(templates.length)) nav.push({ kind: 'template', template: null }) }}>
              <Icon.plus /> {tr('Neues Template', 'New template')}
              {templateLimit() != null && <span className="tpl-limit">{templates.length}/{FREE_TEMPLATES}</span>}
            </button>
            <button disabled={templates.length < 2} onClick={() => { setManage(false); setOrdering(true) }}>{tr('Reihenfolge festlegen', 'Set the order')}</button>
            <button onClick={() => { setManage(false); nav.push({ kind: 'exercises' }) }}>{tr('Alle Übungen', 'All exercises')}</button>
            <button onClick={importTemplates}>{tr('Template-Datei importieren', 'Import template file')}</button>
            <button disabled={!templates.length} onClick={async () => {
              setManage(false)
              const r = await shareOrDownload(templatesFile(templates, exerciseById), 'VIS Templates')
              if (r === 'downloaded') toast(tr('Templates gespeichert', 'Templates saved'))
            }}>{tr('Alle Templates exportieren', 'Export all templates')}</button>
          </div>
        </Sheet>
      )}

      {chosen && (
        <Sheet onClose={() => setChosen(null)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3>{chosen.name}</h3>
            <button className="link muted" onClick={() => { const t = chosen; setChosen(null); nav.push({ kind: 'template', template: t }) }}>{tr('Bearbeiten', 'Edit')}</button>
          </div>
          <p className="muted" style={{ marginBottom: 14 }}>{chosen.exercises.length} {tr('Übungen', 'exercises')} · {chosen.exercises.reduce((n, e) => n + e.sets, 0)} {tr('Sätze', 'sets')}</p>
          <div className="menu" style={{ marginBottom: 16 }}>
            {chosen.exercises.map((e, i) => (
              <div key={i} className="list-row">
                <div className="grow">{exerciseById.get(e.exerciseId)?.name}</div>
                <span className="faint num">{e.sets} ×</span>
              </div>
            ))}
          </div>
          <button className="btn btn-chrome btn-block" onClick={() => start(chosen)}>{tr('Workout starten', 'Start workout')}</button>
          <p className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 10 }}>{tr('Einzelne Übungen kannst du im Workout über ⋯ auslassen.', 'You can skip single exercises in the workout via ⋯.')}</p>
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

export const phaseName = (p: string) => (p === 'bulk' ? 'Bulk' : p === 'cut' ? 'Cut' : tr('Erhalt', 'Maintain'))

/** Thin calorie line for today (opens Ernährung). */
function KcalStrip({ onOpen }: { onOpen: () => void }) {
  const { foodLog, phases } = useStore()
  const d = today()
  const eaten = dayTotals(foodLog, d).kcal
  const target = kcalTarget(phases, d)
  const frac = target ? eaten / target : 0
  const col = progressColors(frac)
  return (
    <button className="card kcal-strip" onClick={onOpen}>
      <div className="kcal-strip-top">
        <span className="eyebrow" style={{ margin: 0 }}>{tr('Kalorien heute', 'Calories today')}</span>
        <span className="num" style={target && frac >= 1 ? { color: 'var(--good)' } : undefined}>
          <b>{fmtInt(eaten)}</b>{target ? <span className="faint"> / {fmtInt(target)} kcal</span> : <span className="faint"> kcal</span>}
        </span>
        <span className="chev"><Icon.chevron /></span>
      </div>
      <div className="kcal-strip-track"><div style={{ width: `${Math.min(100, frac * 100)}%`, background: `linear-gradient(90deg, ${col.from}, ${col.to})` }} /></div>
    </button>
  )
}
