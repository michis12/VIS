import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { foodAi } from '../foodAi'
import { dec, t } from '../i18n'
import { fmtInt, fmtKg, haptic } from '../lib'
import { buildPlanData } from '../phasePlan'
import { phaseName } from '../screens/Home'
import { useStore } from '../store'
import type { PhaseType } from '../types'
import { CreditPill, useCredit } from './AiCredit'
import { usePhaseScores } from './PhaseScores'
import { AiWait, Icon, Tap } from './ui'

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
        <span>{t('Größe', 'Height')}</span>
        <span className="measure-input">
          <input inputMode="numeric" value={h} placeholder="–" onChange={(e) => setH(e.target.value.replace(/\D/g, ''))}
            onBlur={() => { const v = Number(h); save({ heightCm: v >= 120 && v <= 230 ? v : undefined }) }} />
          <small>cm</small>
        </span>
      </label>
      <label className="measure-field">
        <span>{t('Geburtsjahr', 'Birth year')}</span>
        <span className="measure-input">
          <input inputMode="numeric" value={y} placeholder="–" onChange={(e) => setY(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onBlur={() => { const v = Number(y); save({ birthYear: v >= year - 100 && v <= year - 10 ? v : undefined }) }} />
        </span>
      </label>
      <div className="segmented body-sex">
        {([['m', t('Mann', 'Male')], ['f', t('Frau', 'Female')]] as const).map(([k, l]) => (
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
    if (!activity.trim()) { setErr(t('Beschreib kurz, wie aktiv du gerade bist.', 'Briefly describe how active you are right now.')); return }
    setState('loading')
    try {
      const d = await foodAi({ mode: 'plan', goal, activity, wish, data })
      const p = d as Plan
      if (!(p?.kcal > 0)) throw new Error(t('Kein Ergebnis – nochmal versuchen.', 'No result – please try again.'))
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
        <button className="icon-btn" onClick={onClose} aria-label={t('Schließen', 'Close')}><Icon.back /></button>
        <div className="grow" style={{ fontWeight: 700, fontSize: 18 }}>{t('Phase planen', 'Plan a phase')}</div>
        <CreditPill credit={credit} />
      </div>
      <div className="fullsheet-body">
        {state !== 'result' || !plan ? (
          <>
            <label className="lbl">{t('Ziel', 'Goal')}</label>
            <div className="segmented">
              {(['bulk', 'maintain', 'cut'] as PhaseType[]).map((k) => (
                <button key={k} className={goal === k ? 'on' : ''} onClick={() => setGoal(k)}>{phaseName(k)}</button>
              ))}
            </div>

            <label className="lbl">{t('Wie aktiv bist du gerade?', 'How active are you right now?')}</label>
            <textarea className="input plan-text" rows={3} value={activity} onChange={(e) => setActivity(e.target.value)}
              placeholder={t('z. B. 3× Gym, 2× Fußball (je 90 min), Bürojob, ca. 8000 Schritte', 'e.g. 3× gym, 2× football (90 min each), office job, about 8000 steps')} />
            <label className="lbl">{t('Wunsch (optional)', 'Wish (optional)')}</label>
            <input className="input" value={wish} onChange={(e) => setWish(e.target.value)} placeholder={t('z. B. bis Juni, Zielgewicht 78 kg, eher langsam', 'e.g. by June, target weight 78 kg, rather slow')} />

            <div className="card plan-data">
              <div className="eyebrow" style={{ marginBottom: 6 }}>{t('Deine Daten', 'Your data')}</div>
              {missing && <BodyDataFields />}
              <div className="plan-facts num">
                <span>{data.weightKg ? `${fmtKg(data.weightKg)} kg` : t('kein Gewicht', 'no weight')}</span>
                {data.heightCm && <span>{data.heightCm} cm</span>}
                {data.age && <span>{data.age} {t('J.', 'y')}</span>}
                {data.bodyFatPct && <span>{t('KFA', 'BF')} {dec(data.bodyFatPct)} %</span>}
                {data.muscleKg && <span>{t('Muskeln', 'Muscle')} {dec(data.muscleKg)} kg</span>}
                <span>{dec(data.workoutsPerWeek)} {t('Workouts/Woche', 'workouts/week')}</span>
              </div>
              {data.measured ? (
                <div className="hint good"><span>{t('Gemessener Erhalt', 'Measured maintenance')}: <b>~{fmtInt(data.measured.kcal)} kcal</b> – {t(`aus ${data.measured.weeks} Wochen ${data.measured.basis} (Ø ${fmtInt(data.measured.avgIntake)} kcal) und deinem Gewichtsverlauf`, `from ${data.measured.weeks} weeks of ${data.measured.basis === 'Essenslog' ? 'food log' : 'phase calories'} (avg ${fmtInt(data.measured.avgIntake)} kcal) and your weight trend`)} ({data.measured.kgPerWeek > 0 ? '+' : ''}{dec(data.measured.kgPerWeek, 2)} {t('kg/Woche', 'kg/week')}).</span></div>
              ) : (
                <div className="hint"><span>{t('Für einen gemessenen Erhalt fehlen noch 3 Wochen mit regelmäßigem Wiegen – bis dahin wird geschätzt.', 'A measured maintenance needs 3 weeks of regular weigh-ins – until then it is estimated.')}</span></div>
              )}
              {!data.bodyFatPct && <div className="hint"><span>{t('KFA und Muskelmasse vom Body-Scanner kannst du unter Körpermaße eintragen (optional).', 'You can enter body fat and muscle mass from a body scanner under Measurements (optional).')}</span></div>}
            </div>

            {err && <div className="hint" style={{ color: 'var(--danger)' }}><span>{err}</span></div>}
            <Tap className="btn btn-chrome btn-block" style={{ marginTop: 16 }} onClick={() => state === 'input' && run()}>
              {state === 'loading' ? t('Wird berechnet…', 'Calculating…') : t('Berechnen', 'Calculate')}
            </Tap>
            {state === 'loading' && <AiWait text={t('Deine Daten werden ausgewertet…', 'Analysing your data…')} />}
          </>
        ) : (
          <>
            <div className="card chrome-edge plan-result">
              <div className="eyebrow">{phaseName(goal)} · {t('Kalorien pro Tag', 'calories per day')}</div>
              <div className="plan-kcal num chrome-text">{fmtInt(plan.kcal)}<span> kcal</span></div>
              <div className="faint num" style={{ fontSize: 13 }}>{t('Erhalt ca.', 'Maintenance about')} {fmtInt(plan.maintenance)} kcal · {plan.kcal >= plan.maintenance ? '+' : '−'}{fmtInt(Math.abs(plan.kcal - plan.maintenance))} kcal</div>
              <div className="grid-3" style={{ marginTop: 16 }}>
                <div><div className="faint" style={{ fontSize: 12 }}>{t('Dauer', 'Duration')}</div><div className="num" style={{ fontWeight: 650 }}>{plan.weeks} {t('Wochen', 'weeks')}</div></div>
                <div><div className="faint" style={{ fontSize: 12 }}>{t('Ziel', 'Goal')}</div><div className="num" style={{ fontWeight: 650 }}>{fmtKg(Math.round(plan.targetKg * 10) / 10)} kg</div></div>
                <div><div className="faint" style={{ fontSize: 12 }}>{t('Tempo', 'Pace')}</div><div className="num" style={{ fontWeight: 650 }}>{plan.kgPerWeek > 0 ? '+' : ''}{dec(plan.kgPerWeek, 2)} {t('kg/W.', 'kg/wk')}</div></div>
              </div>
              <div className="faint num" style={{ fontSize: 13, marginTop: 10 }}>{t('Eiweiß', 'Protein')}: {fmtInt(plan.protein)} g {t('pro Tag', 'per day')}</div>
            </div>
            {plan.bullets.map((b, i) => <div key={i} className="hint"><span>{b}</span></div>)}
            {plan.warning && <div className="hint" style={{ color: '#e0a050' }}><span>{plan.warning}</span></div>}
            <Tap className="btn btn-chrome btn-block" style={{ marginTop: 16 }} onClick={() => onApply(goal, plan.kcal)}>{t('Als neue Phase anlegen', 'Create as new phase')}</Tap>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setState('input')}>{t('Angaben ändern', 'Change details')}</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
