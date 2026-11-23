import { useMemo, useState } from 'react'
import { dateLabel, fmtInt, shortDate } from '../lib'
import { phaseName, scorePhases, type PhaseScore } from '../phaseScore'
import { useStore } from '../store'
import { avgCalories, calorieSteps } from '../types'
import { scoreLabel } from '../weekly'
import { LineChart } from './charts'
import { ScoreGaugeWithSub, ScorePill } from './ScoreGauge'
import { Icon, Sheet } from './ui'

export function usePhaseScores() {
  const { phases, workouts, weights, progress } = useStore()
  return useMemo(() => scorePhases(phases, workouts, weights, progress.byId), [phases, workouts, weights, progress])
}

const COLORS = { bulk: '#e3b26b', cut: '#7fb2e5', maintain: '#a1a1a6' } as const
const IDEAL = { bulk: [0.2, 0.5], cut: [-1.0, -0.5], maintain: [-0.15, 0.15] } as const
const dec = (v: number, d = 1) => v.toFixed(d).replace('.', ',')
const rateText = (p: PhaseScore) => (p.rate == null ? null : `${p.rate > 0 ? '+' : ''}${dec(p.rate, 2)} kg/Woche`)
function verdict(p: PhaseScore) {
  if (p.ratePct == null) return null
  const [lo, hi] = IDEAL[p.phase.type]
  if (p.ratePct < lo) return p.phase.type === 'cut' ? 'zu schnell' : p.phase.type === 'bulk' ? 'zu langsam' : 'sinkt'
  if (p.ratePct > hi) return p.phase.type === 'cut' ? 'zu langsam' : p.phase.type === 'bulk' ? 'zu schnell' : 'steigt'
  return 'optimal'
}

const fmtWeeks = (w: number) => (w < 1 ? `${Math.round(w * 7)} Tage` : `${Math.round(w)} Wochen`)
const endLabel = (p: PhaseScore) => {
  const last = new Date(new Date(p.end + 'T12:00:00').getTime() - 864e5).toISOString().slice(0, 10)
  return `${shortDate(p.phase.start)} ${p.phase.start.slice(2, 4)} – ${p.current ? 'heute' : `${shortDate(last)} ${last.slice(2, 4)}`}`
}

/** "Phasen" section for Statistik: every phase with its score, tap for the breakdown. */
export function PhaseList() {
  const list = usePhaseScores()
  const [open, setOpen] = useState<PhaseScore | null>(null)
  if (!list.length) return null
  const rated = list.filter((p) => p.workouts > 0 && !p.early)
  const avg = rated.length ? Math.round(rated.reduce((n, p) => n + p.score, 0) / rated.length) : null
  // calories as steps over time, phases as colored bands
  const t = (iso: string) => new Date(iso + 'T12:00:00').getTime()
  const kcal = list.flatMap((p) => {
    const steps = calorieSteps(p.phase)
    return steps.flatMap((st, i) => [
      { x: t(st.from), y: st.kcal, note: phaseName(p.phase.type) },
      // last step of the running phase reaches "now", so a change made today is already visible
      { x: steps[i + 1] ? t(steps[i + 1].from) - 864e5 : p.current ? Math.max(Date.now(), t(st.from) + 864e5 / 2) : t(p.end) - 864e5, y: st.kcal, note: phaseName(p.phase.type) },
    ])
  })
  const bands = list.map((p) => ({ from: t(p.phase.start), to: t(p.end), color: COLORS[p.phase.type] }))
  // what worked last time, per phase type (for the next bulk / cut)
  const lastOf = (['bulk', 'cut', 'maintain'] as const)
    .map((type) => [...list].reverse().find((p) => p.phase.type === type && !p.early && p.rate != null))
    .filter((p): p is PhaseScore => !!p)

  return (
    <>
      <div className="section-title"><h2>Phasen</h2>{avg != null && <span className="faint" style={{ fontSize: 13 }}>Ø Score {avg}</span>}</div>
      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 6 }}>Kalorien-Verlauf</div>
        <LineChart points={kcal} bands={bands} unit="kcal/Tag" yFmt={(v) => fmtInt(v)} height={170} />
        <div className="legend">
          {(['bulk', 'cut', 'maintain'] as const).filter((x) => list.some((p) => p.phase.type === x)).map((x) => (
            <span key={x}><i style={{ background: COLORS[x] }} />{phaseName(x)}</span>
          ))}
        </div>
        {lastOf.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {lastOf.map((p) => (
              <div key={p.phase.id} className="hint">
                <span>Letzter {phaseName(p.phase.type)}: <b>{calorieSteps(p.phase).length > 1 ? 'Ø ' : ''}{fmtInt(avgCalories(p.phase, p.end))} kcal</b> → {rateText(p)} ({verdict(p)})</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card" style={{ padding: '4px 14px', marginTop: 12 }}>
        {[...list].reverse().map((p) => (
          <button key={p.phase.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(p)}>
            <ScorePill score={p.score} />
            <div className="grow">
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={'phase-dot phase-' + p.phase.type} />
                {phaseName(p.phase.type)}
                {p.current && <span className="pill" style={{ fontSize: 11, padding: '1px 7px' }}>läuft</span>}
              </div>
              <div className="faint" style={{ fontSize: 12 }}>{endLabel(p)} · {fmtWeeks(p.weeks)}</div>
            </div>
            <div className="hist-meta num">
              <div>{calorieSteps(p.phase).map((x) => fmtInt(x.kcal)).join(' → ')} kcal</div>
              {p.startKg != null && p.endKg != null && <div>{p.endKg - p.startKg > 0 ? '+' : ''}{dec(p.endKg - p.startKg)} kg</div>}
              {p.strength != null && <div className="faint">1RM {p.strength >= 1 ? '+' : ''}{((p.strength - 1) * 100).toFixed(0)} %</div>}
            </div>
            <span className="chev"><Icon.chevron /></span>
          </button>
        ))}
      </div>
      {open && <PhaseScoreSheet p={open} onClose={() => setOpen(null)} />}
    </>
  )
}

export function PhaseScoreSheet({ p, onClose }: { p: PhaseScore; onClose: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <h3><span className={'phase-dot phase-' + p.phase.type} style={{ marginRight: 8 }} />{phaseName(p.phase.type)}-Score</h3>
      <p className="faint" style={{ fontSize: 13 }}>
        {dateLabel(p.phase.start)} · {fmtWeeks(p.weeks)}{p.current ? ' · läuft noch' : ''} · {p.workouts} Workouts
      </p>
      <div className="grid-3" style={{ marginTop: 12 }}>
        <div className="card kpi" style={{ padding: 10 }}><div className="label">{calorieSteps(p.phase).length > 1 ? 'Ø Kalorien' : 'Kalorien'}</div><div className="value" style={{ fontSize: 17 }}>{fmtInt(avgCalories(p.phase, p.end))}</div><div className="sub">kcal/Tag</div></div>
        <div className="card kpi" style={{ padding: 10 }}><div className="label">Gewicht</div><div className="value" style={{ fontSize: 17 }}>{p.startKg != null && p.endKg != null ? `${p.endKg - p.startKg > 0 ? '+' : ''}${dec(p.endKg - p.startKg)}` : '–'}</div><div className="sub">{p.startKg != null && p.endKg != null ? `${dec(p.startKg)} → ${dec(p.endKg)} kg` : 'kg'}</div></div>
        <div className="card kpi" style={{ padding: 10 }}><div className="label">Tempo</div><div className="value" style={{ fontSize: 17 }}>{p.rate != null ? `${p.rate > 0 ? '+' : ''}${dec(p.rate, 2)}` : '–'}</div><div className="sub">{p.rate != null ? `kg/Woche · ${verdict(p)}` : 'kg/Woche'}</div></div>
      </div>
      {calorieSteps(p.phase).length > 1 && (
        <div style={{ marginTop: 4 }}>
          {calorieSteps(p.phase).map((x, i) => (
            <div key={x.from} className="hint"><span>{i === 0 ? 'ab Start' : `ab ${shortDate(x.from)}`}: <b>{fmtInt(x.kcal)} kcal</b></span></div>
          ))}
        </div>
      )}
      <div style={{ margin: '6px auto 0', maxWidth: 220 }}>
        <ScoreGaugeWithSub
          score={p.score}
          label={scoreLabel(p.score)}
          sub={p.early ? 'erst kurz dabei – noch vorläufig' : p.phase.type === 'bulk' ? 'Zunahme & Kraft zählen am meisten' : p.phase.type === 'cut' ? 'Abnehmen & Kraft halten zählen am meisten' : 'stabil bleiben & stärker werden'}
        />
      </div>
      <div className="score-parts" style={{ marginTop: 8 }}>
        {p.parts.map((x) => (
          <div key={x.key} className="ws-part">
            <div className="score-part">
              <span>{x.label}</span>
              <div className="track"><div className="fill" style={{ width: `${(x.pts / x.max) * 100}%` }} /></div>
              <span className="n">{x.pts}/{x.max}</span>
              <span className="d">{x.detail}</span>
            </div>
            <div className="ws-tip">{x.tip}</div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

/** Score pill for the current phase card in Körper. */
export function CurrentPhaseScore({ id }: { id: string }) {
  const list = usePhaseScores()
  const [open, setOpen] = useState(false)
  const p = list.find((x) => x.phase.id === id)
  if (!p || !p.workouts) return null
  return (
    <>
      <span role="button" tabIndex={0} className="score-tap" aria-label={`Phasen-Score ${p.score}, Details`}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}>
        <ScorePill score={p.score} size={38} />
      </span>
      {open && <span onClick={(e) => e.stopPropagation()}><PhaseScoreSheet p={p} onClose={() => setOpen(false)} /></span>}
    </>
  )
}
