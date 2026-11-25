import { t as tr } from '../i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LineChart, type Band } from '../components/charts'
import { Icon, Sheet, Wheel } from '../components/ui'
import { dateLabel, fmtInt, fmtKg, shortDate, today, uid } from '../lib'
import { useNav } from '../nav'
import { CurrentPhaseScore, usePhaseScores } from '../components/PhaseScores'
import { requireAi } from '../components/AiCredit'
import { PhasePlanner } from '../components/PhasePlanner'
import { useStore } from '../store'
import { calorieSteps, type Phase, type PhaseType } from '../types'
import { phaseName } from './Home'

const KG = Array.from({ length: 1201 }, (_, i) => Math.round((40 + i / 10) * 10) / 10)
const RANGES = [
  { id: 90, get l() { return tr('3 Monate', '3 months') } },
  { id: 182, get l() { return tr('6 Monate', '6 months') } },
  { id: 365, get l() { return tr('1 Jahr', '1 year') } },
  { id: 99999, get l() { return tr('Alles', 'All') } },
]
const COLORS: Record<PhaseType, string> = { bulk: '#e3b26b', cut: '#7fb2e5', maintain: '#a1a1a6' }

export function Body({ focus }: { focus?: 'phase' | null }) {
  const phaseRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focus === 'phase') phaseRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [focus])
  const store = useStore()
  const nav = useNav()
  const { weights, phases } = store
  const [range, setRange] = useState(99999)
  const [addW, setAddW] = useState(false)
  const [editPhase, setEditPhase] = useState<Phase | null>(null)
  const [planning, setPlanning] = useState(false)

  const since = new Date(Date.now() - range * 864e5).toISOString().slice(0, 10)
  const pts = weights.filter((w) => w.date >= since).map((w) => ({ x: new Date(w.date + 'T12:00:00').getTime(), y: w.kg }))
  const last = weights[weights.length - 1]

  const delta = (days: number) => {
    if (!last) return null
    const ref = new Date(new Date(last.date).getTime() - days * 864e5).toISOString().slice(0, 10)
    const before = [...weights].reverse().find((w) => w.date <= ref)
    return before ? last.kg - before.kg : null
  }

  const bands: Band[] = useMemo(() => phases.map((p, i) => ({
    from: new Date(p.start + 'T00:00:00').getTime(),
    to: phases[i + 1] ? new Date(phases[i + 1].start + 'T00:00:00').getTime() : Date.now(),
    color: COLORS[p.type],
  })), [phases])

  const current = phases[phases.length - 1]
  const daysSinceWeigh = last ? Math.floor((Date.now() - new Date(last.date + 'T12:00:00').getTime()) / 864e5) : null

  // calorie tip when the weight trend doesn't fit the phase (≥ 2 weeks of data)
  const phaseScores = usePhaseScores()
  const kcalTip = useMemo(() => {
    const ps = phaseScores.find((p) => p.phase.id === current?.id)
    if (!ps || !current || ps.weeks < 2 || ps.ratePct == null || !ps.startKg) return null
    const r = ps.ratePct
    const [lo, hi] = current.type === 'bulk' ? [0.2, 0.5] : current.type === 'cut' ? [-1.0, -0.5] : [-0.15, 0.15]
    if (r >= lo && r <= hi) return null
    const target = r < lo ? lo + 0.05 : hi - 0.05
    // ~7700 kcal per kg body weight
    const kcal = Math.round((((target - r) / 100) * ps.startKg * 7700) / 7 / 50) * 50
    const k = Math.max(-500, Math.min(500, kcal))
    if (Math.abs(k) < 100) return null
    const what = current.type === 'bulk' ? (r < lo ? tr('Bulk zu langsam', 'Bulk too slow') : tr('Bulk zu schnell', 'Bulk too fast'))
      : current.type === 'cut' ? (r > hi ? tr('Cut zu langsam', 'Cut too slow') : tr('Cut zu schnell', 'Cut too fast'))
      : r > hi ? tr('Gewicht steigt', 'Weight rising') : tr('Gewicht sinkt', 'Weight falling')
    return { what, k, next: current.calories + k }
  }, [phaseScores, current])
  const phaseStartWeight = current ? weights.find((w) => w.date >= current.start)?.kg : undefined

  return (
    <div className="screen">
      <div className="eyebrow">{tr('Körper', 'Body')}</div>
      <h1 className="title">{tr('Gewicht & Phase', 'Weight & phase')}</h1>

      <div className="card chrome-edge" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow">{tr('Aktuell', 'Current')}</div>
            <div style={{ fontSize: 44, fontWeight: 750, letterSpacing: '-0.03em' }} className="num chrome-text">
              {last ? fmtKg(last.kg) : '–'}<span style={{ fontSize: 18, marginLeft: 4 }}>kg</span>
            </div>
            {last && <div className="faint" style={{ fontSize: 13 }}>{dateLabel(last.date)}</div>}
          </div>
          <button className="btn btn-chrome btn-sm" onClick={() => setAddW(true)}>{tr('+ Eintragen', '+ Log')}</button>
        </div>
        <div className="grid-3" style={{ marginTop: 16 }}>
          {[7, 30, 90].map((d) => {
            const v = delta(d)
            return (
              <div key={d}>
                <div className="faint" style={{ fontSize: 12 }}>{d} {tr('Tage', 'days')}</div>
                <div className="num" style={{ fontWeight: 650 }}>{v == null ? '–' : `${v > 0 ? '+' : ''}${fmtKg(Math.round(v * 10) / 10)} kg`}</div>
              </div>
            )
          })}
        </div>
        {daysSinceWeigh != null && daysSinceWeigh >= 5 && (
          <div className="hint"><span>{tr('Seit ', 'Not weighed for ')}<b>{daysSinceWeigh} {tr('Tagen', 'days')}</b>{tr(' nicht gewogen – regelmäßig wiegen hält den Phasen-Score genau.', ' – weighing regularly keeps the phase score accurate.')}</span></div>
        )}
      </div>

      <div className="sticky-blur" style={{ marginTop: 6 }}>
        <div className="chips">
          {RANGES.map((r) => <button key={r.id} className={'chip' + (r.id === range ? ' on' : '')} onClick={() => setRange(r.id)}>{r.l}</button>)}
        </div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <LineChart points={pts} height={220} yFmt={(v) => fmtKg(Math.round(v * 10) / 10)} unit="kg" bands={bands} />
        {phases.length > 0 && (
          <div className="legend">
            {(['bulk', 'cut', 'maintain'] as PhaseType[]).filter((t) => phases.some((p) => p.type === t)).map((t) => (
              <span key={t}><i style={{ background: COLORS[t] }} />{phaseName(t)}</span>
            ))}
          </div>
        )}
      </div>

      <div className="section-title" ref={phaseRef} style={{ scrollMarginTop: 'calc(var(--safe-top) + 24px)' }}>
        <h2>Phase</h2>
        <button className="link" onClick={() => setEditPhase({ id: uid(), type: current?.type === 'bulk' ? 'cut' : 'bulk', start: today(), calories: current?.calories ?? 2800 })}>{tr('Neue Phase', 'New phase')}</button>
      </div>
      {current ? (
        <button className="card" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEditPhase(current)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={'phase-dot phase-' + current.type} style={{ width: 12, height: 12 }} />
            <span style={{ fontSize: 22, fontWeight: 700 }}>{phaseName(current.type)}</span>
            <span className="muted" style={{ marginLeft: 'auto' }}>{tr('seit', 'since')} {shortDate(current.start)}</span>
            <CurrentPhaseScore id={current.id} />
          </div>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <div>
              <div className="faint" style={{ fontSize: 12 }}>{tr('Kalorienziel', 'Calorie target')}</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 650 }}>{fmtInt(current.calories)} kcal</div>
              {calorieSteps(current).length > 1 && (
                <div className="faint num" style={{ fontSize: 11 }}>
                  {tr('seit', 'since')} {shortDate(calorieSteps(current)[calorieSteps(current).length - 1].from)} · {tr('vorher', 'before')} {fmtInt(calorieSteps(current)[calorieSteps(current).length - 2].kcal)}
                </div>
              )}
            </div>
            <div><div className="faint" style={{ fontSize: 12 }}>{tr('Veränderung in Phase', 'Change in phase')}</div><div className="num" style={{ fontSize: 20, fontWeight: 650 }}>{phaseStartWeight != null && last ? `${last.kg - phaseStartWeight > 0 ? '+' : ''}${fmtKg(Math.round((last.kg - phaseStartWeight) * 10) / 10)} kg` : '–'}</div></div>
          </div>
          {kcalTip && (
            <div className="hint"><span>{kcalTip.what} → {tr('ca.', 'about')} <b>{kcalTip.k > 0 ? '+' : '−'}{Math.abs(kcalTip.k)} {tr('kcal/Tag', 'kcal/day')}</b> ({tr('auf', 'to')} {fmtInt(kcalTip.next)} kcal)</span></div>
          )}
        </button>
      ) : (
        <div className="card muted">{tr('Noch keine Phase gesetzt. Leg fest, ob du gerade im Bulk, Cut oder Erhalt bist.', 'No phase set yet. Choose whether you are bulking, cutting or maintaining.')}</div>
      )}
      <button className="ai-row" style={{ marginTop: 12 }} onClick={() => requireAi() && setPlanning(true)}>
        <span className="ai-spark" aria-hidden="true">✦</span>
        <div className="grow">
          <div className="nut-entry-name">{tr('Nächste Phase planen', 'Plan the next phase')}</div>
          <div className="faint" style={{ fontSize: 12 }}>{tr('Kalorien, Dauer und Zielgewicht aus deinen Daten', 'Calories, duration and target weight from your data')}</div>
        </div>
        <Icon.chevron />
      </button>
      {phases.length > 1 && (
        <div className="card" style={{ padding: '4px 14px', marginTop: 12 }}>
          {[...phases].reverse().slice(1).map((p) => (
            <button key={p.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEditPhase(p)}>
              <span className={'phase-dot phase-' + p.type} />
              <div className="grow">{phaseName(p.type)} <span className="faint">· {tr('ab', 'from')} {dateLabel(p.start)}</span></div>
              <span className="num muted">{fmtInt(p.calories)} kcal</span>
            </button>
          ))}
        </div>
      )}

      <button className="card subtle-link" onClick={() => nav.push({ kind: 'measures' })}>
        <span style={{ flex: 1 }}>
          {tr('Körpermaße', 'Measurements')}
          <span className="faint" style={{ display: 'block', fontSize: 12 }}>
            {store.measurements.length ? tr(`Zuletzt gemessen ${shortDate(store.measurements[store.measurements.length - 1].date)}`, `Last measured ${shortDate(store.measurements[store.measurements.length - 1].date)}`) : tr('Arm, Brust, Taille, Oberschenkel …', 'Arm, chest, waist, thigh …')}
          </span>
        </span>
        <Icon.chevron />
      </button>

      <div className="section-title"><h2>{tr('Einträge', 'Entries')}</h2></div>
      <div className="card" style={{ padding: '4px 14px' }}>
        {[...weights].reverse().slice(0, 15).map((w) => (
          <div className="list-row" key={w.date}>
            <div className="grow">{dateLabel(w.date)}{w.source && w.source !== 'app' &&<span className="faint" style={{ fontSize: 12 }}> · {tr('importiert', 'imported')}</span>}</div>
            <span className="num" style={{ fontWeight: 600 }}>{fmtKg(w.kg)} kg</span>
          </div>
        ))}
      </div>

      {addW && <WeightSheet initial={last?.kg ?? 80} onClose={() => setAddW(false)} onSave={(kg, date) => { store.saveWeight({ date, kg, source: 'app' }); setAddW(false) }} />}
      {planning && (
        <PhasePlanner
          onClose={() => setPlanning(false)}
          onApply={(type, kcal) => { setPlanning(false); setEditPhase({ id: uid(), type, start: today(), calories: kcal }) }}
        />
      )}
      {editPhase && <PhaseSheet phase={editPhase} isNew={!phases.some((p) => p.id === editPhase.id)} onClose={() => setEditPhase(null)} />}
    </div>
  )
}

function WeightSheet({ initial, onClose, onSave }: { initial: number; onClose: () => void; onSave: (kg: number, date: string) => void }) {
  const [kg, setKg] = useState(Math.round(initial * 10) / 10)
  const [date, setDate] = useState(today())
  return (
    <Sheet onClose={onClose}>
      <h3>{tr('Gewicht eintragen', 'Log weight')}</h3>
      <div className="wheels"><div className="wheel-col"><Wheel values={KG} value={kg} onChange={setKg} format={(v) => fmtKg(v) + ' kg'} /></div></div>
      <label className="lbl">{tr('Datum', 'Date')}</label>
      <input className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      <button className="btn btn-chrome btn-block" style={{ marginTop: 18 }} onClick={() => onSave(kg, date)}>{tr('Speichern', 'Save')}</button>
    </Sheet>
  )
}

function PhaseSheet({ phase, isNew, onClose }: { phase: Phase; isNew: boolean; onClose: () => void }) {
  const store = useStore()
  const [p, setP] = useState(phase)
  const [steps, setSteps] = useState(() => calorieSteps(phase))
  const setStep = (i: number, patch: Partial<{ from: string; kcal: number }>) =>
    setSteps((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const save = () => {
    const log = steps
      .map((x, i) => (i === 0 ? { ...x, from: p.start } : x))
      .filter((x) => x.from >= p.start && x.kcal > 0)
      .sort((a, b) => a.from.localeCompare(b.from))
      .filter((x, i, a) => i === 0 || x.from !== a[i - 1].from)
    const calories = log[log.length - 1]?.kcal ?? p.calories
    const next: Phase = { id: p.id, type: p.type, start: p.start, calories }
    if (log.length > 1) next.calorieLog = log
    store.savePhase(next)
    onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <h3>{isNew ? tr('Neue Phase', 'New phase') : tr('Phase bearbeiten', 'Edit phase')}</h3>
      <label className="lbl">{tr('Ziel', 'Goal')}</label>
      <div className="segmented">
        {(['bulk', 'maintain', 'cut'] as PhaseType[]).map((t) => (
          <button key={t} className={p.type === t ? 'on' : ''} onClick={() => setP({ ...p, type: t })}>{phaseName(t)}</button>
        ))}
      </div>
      <label className="lbl">Start</label>
      <input className="input" type="date" value={p.start} onChange={(e) => setP({ ...p, start: e.target.value })} />
      <label className="lbl">{tr('Kalorien pro Tag', 'Calories per day')}</label>
      {steps.length === 1 ? (
        <input className="input num" inputMode="numeric" value={steps[0].kcal || ''} onChange={(e) => setStep(0, { kcal: Number(e.target.value.replace(/\D/g, '')) })} />
      ) : steps.map((x, i) => (
        <div key={i} className="kcal-step">
          {i === 0
            ? <span className="faint kcal-from">{tr('ab Start', 'from start')}</span>
            : <input className="input kcal-from" type="date" value={x.from} min={p.start} onChange={(e) => setStep(i, { from: e.target.value })} />}
          <input className="input num" inputMode="numeric" value={x.kcal || ''} onChange={(e) => setStep(i, { kcal: Number(e.target.value.replace(/\D/g, '')) })} />
          {i > 0 && <button className="icon-btn" aria-label={tr('Änderung löschen', 'Delete change')} onClick={() => setSteps((l) => l.filter((_, j) => j !== i))}>×</button>}
        </div>
      ))}
      {!isNew && (
        <button className="link" style={{ marginTop: 8 }} onClick={() => setSteps((l) => [...l, { from: today(), kcal: l[l.length - 1]?.kcal ?? 0 }])}>
          {tr('+ Kalorien ab einem Datum ändern', '+ Change calories from a date')}
        </button>
      )}
      <button className="btn btn-chrome btn-block" style={{ marginTop: 18 }} onClick={save}>{tr('Speichern', 'Save')}</button>
      {!isNew && <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={() => { store.deletePhase(p.id); onClose() }}>{tr('Phase löschen', 'Delete phase')}</button>}
    </Sheet>
  )
}
