import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { foodAi } from '../foodAi'
import { fmtInt, fmtKg, haptic } from '../lib'
import { buildPlanData } from '../phasePlan'
import { phaseName } from '../screens/Home'
import { useStore } from '../store'
import type { PhaseType } from '../types'
import { CreditPill, useCredit } from './AiCredit'
import { usePhaseScores } from './PhaseScores'
import { Icon, Tap } from './ui'

/** Height, birth year and sex (settings) – used by the phase planner. */
export function BodyDataFields() {
  const store = useStore()
  const s = store.settings
  const [h, setH] = useState(s.heightCm ? String(s.heightCm) : '')
  const [y, setY] = useState(s.birthYear ? String(s.birthYear) : '')
  const save = (patch: Partial<typeof s>) => store.saveSettings({ ...store.settings, ...patch })
  const year = new Date().getFullYear()
  return (
    <div className="body-data">
      <label className="measure-field">
        <span>Größe</span>
        <span className="measure-input">
          <input inputMode="numeric" value={h} placeholder="–" onChange={(e) => setH(e.target.value.replace(/\D/g, ''))}
            onBlur={() => { const v = Number(h); save({ heightCm: v >= 120 && v <= 230 ? v : undefined }) }} />
          <small>cm</small>
        </span>
      </label>
      <label className="measure-field">
        <span>Geburtsjahr</span>
        <span className="measure-input">
          <input inputMode="numeric" value={y} placeholder="–" onChange={(e) => setY(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onBlur={() => { const v = Number(y); save({ birthYear: v >= year - 100 && v <= year - 10 ? v : undefined }) }} />
        </span>
      </label>
      <div className="segmented body-sex">
        {([['m', 'Mann'], ['f', 'Frau']] as const).map(([k, l]) => (
          <button key={k} className={s.sex === k ? 'on' : ''} onClick={() => save({ sex: k })}>{l}</button>
        ))}
      </div>
    </div>
  )
}

interface Plan {
  maintenance: number; kcal: number; weeks: number; targetKg: number; kgPerWeek: number
  protein: number; bullets: string[]; warning: string
}

const dec = (v: number, d = 1) => v.toFixed(d).replace('.', ',')

/** AI phase planner: activity in words + all body data → calories, duration, target weight. */
export function PhasePlanner({ onClose, onApply }: { onClose: () => void; onApply: (type: PhaseType, kcal: number) => void }) {
  const store = useStore()
  const scores = usePhaseScores()
  const { credit } = useCredit()
  const current = store.phases[store.phases.length - 1]
  const [goal, setGoal] = useState<PhaseType>(current?.type === 'bulk' ? 'cut' : 'bulk')
  const [activity, setActivity] = useState('')
  const [wish, setWish] = useState('')
  const [state, setState] = useState<'input' | 'loading' | 'result'>('input')
  const [err, setErr] = useState<string | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)

  const data = useMemo(() => buildPlanData({
    settings: store.settings, weights: store.weights, measurements: store.measurements, phases: store.phases,
    workouts: store.workouts, foodLog: store.foodLog, scores,
  }), [store.settings, store.weights, store.measurements, store.phases, store.workouts, store.foodLog, scores])

  const missing = !data.heightCm || !data.age || !data.sex

  const run = async () => {
    setErr(null)
    if (!activity.trim()) { setErr('Beschreib kurz, wie aktiv du gerade bist.'); return }
    setState('loading')
    try {
      const d = await foodAi({ mode: 'plan', goal, activity, wish, data })
      const p = d as Plan
      if (!(p?.kcal > 0)) throw new Error('Kein Ergebnis – nochmal versuchen.')
      // keep it sane whatever comes back
      p.kcal = Math.round(Math.min(6000, Math.max(1200, p.kcal)) / 50) * 50
      p.maintenance = Math.round(p.maintenance / 50) * 50
      setPlan(p)
      setState('result')
      haptic(true)
    } catch (e) {
      setErr((e as Error).message)
      setState('input')
    }
  }

  return createPortal(
    <div className="fullsheet">
      <div className="fullsheet-head">
        <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon.back /></button>
        <div className="grow" style={{ fontWeight: 700, fontSize: 18 }}>Phase planen</div>
        <CreditPill credit={credit} />
      </div>
      <div className="fullsheet-body">
        {state !== 'result' || !plan ? (
          <>
            <label className="lbl">Ziel</label>
            <div className="segmented">
              {(['bulk', 'maintain', 'cut'] as PhaseType[]).map((t) => (
                <button key={t} className={goal === t ? 'on' : ''} onClick={() => setGoal(t)}>{phaseName(t)}</button>
              ))}
            </div>

            <label className="lbl">Wie aktiv bist du gerade?</label>
            <textarea className="input plan-text" rows={3} value={activity} onChange={(e) => setActivity(e.target.value)}
              placeholder="z. B. 3× Gym, 2× Fußball (je 90 min), Bürojob, ca. 8000 Schritte" />
            <label className="lbl">Wunsch (optional)</label>
            <input className="input" value={wish} onChange={(e) => setWish(e.target.value)} placeholder="z. B. bis Juni, Zielgewicht 78 kg, eher langsam" />

            <div className="card plan-data">
              <div className="eyebrow" style={{ marginBottom: 6 }}>Deine Daten</div>
              {missing && <BodyDataFields />}
              <div className="plan-facts num">
                <span>{data.weightKg ? `${fmtKg(data.weightKg)} kg` : 'kein Gewicht'}</span>
                {data.heightCm && <span>{data.heightCm} cm</span>}
                {data.age && <span>{data.age} J.</span>}
                {data.bodyFatPct && <span>KFA {dec(data.bodyFatPct)} %</span>}
                {data.muscleKg && <span>Muskeln {dec(data.muscleKg)} kg</span>}
                <span>{dec(data.workoutsPerWeek)} Workouts/Woche</span>
              </div>
              {data.measured ? (
                <div className="hint good"><span>Gemessener Erhalt: <b>~{fmtInt(data.measured.kcal)} kcal</b> – aus {data.measured.weeks} Wochen {data.measured.basis} (Ø {fmtInt(data.measured.avgIntake)} kcal) und deinem Gewichtsverlauf ({data.measured.kgPerWeek > 0 ? '+' : ''}{dec(data.measured.kgPerWeek, 2)} kg/Woche).</span></div>
              ) : (
                <div className="hint"><span>Für einen gemessenen Erhalt fehlen noch 3 Wochen mit regelmäßigem Wiegen – bis dahin wird geschätzt.</span></div>
              )}
              {!data.bodyFatPct && <div className="hint"><span>KFA und Muskelmasse vom Body-Scanner kannst du unter Körpermaße eintragen (optional).</span></div>}
            </div>

            {err && <div className="hint" style={{ color: 'var(--danger)' }}><span>{err}</span></div>}
            <Tap className="btn btn-chrome btn-block" style={{ marginTop: 16 }} onClick={() => state === 'input' && run()}>
              {state === 'loading' ? 'Wird berechnet…' : 'Berechnen'}
            </Tap>
          </>
        ) : (
          <>
            <div className="card chrome-edge plan-result">
              <div className="eyebrow">{phaseName(goal)} · Kalorien pro Tag</div>
              <div className="plan-kcal num chrome-text">{fmtInt(plan.kcal)}<span> kcal</span></div>
              <div className="faint num" style={{ fontSize: 13 }}>Erhalt ca. {fmtInt(plan.maintenance)} kcal · {plan.kcal >= plan.maintenance ? '+' : '−'}{fmtInt(Math.abs(plan.kcal - plan.maintenance))} kcal</div>
              <div className="grid-3" style={{ marginTop: 16 }}>
                <div><div className="faint" style={{ fontSize: 12 }}>Dauer</div><div className="num" style={{ fontWeight: 650 }}>{plan.weeks} Wochen</div></div>
                <div><div className="faint" style={{ fontSize: 12 }}>Ziel</div><div className="num" style={{ fontWeight: 650 }}>{fmtKg(Math.round(plan.targetKg * 10) / 10)} kg</div></div>
                <div><div className="faint" style={{ fontSize: 12 }}>Tempo</div><div className="num" style={{ fontWeight: 650 }}>{plan.kgPerWeek > 0 ? '+' : ''}{dec(plan.kgPerWeek, 2)} kg/W.</div></div>
              </div>
              <div className="faint num" style={{ fontSize: 13, marginTop: 10 }}>Eiweiß: {fmtInt(plan.protein)} g pro Tag</div>
            </div>
            {plan.bullets.map((b, i) => <div key={i} className="hint"><span>{b}</span></div>)}
            {plan.warning && <div className="hint" style={{ color: '#e0a050' }}><span>{plan.warning}</span></div>}
            <Tap className="btn btn-chrome btn-block" style={{ marginTop: 16 }} onClick={() => onApply(goal, plan.kcal)}>Als neue Phase anlegen</Tap>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setState('input')}>Angaben ändern</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
