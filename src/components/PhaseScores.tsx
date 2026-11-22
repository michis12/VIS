import { useMemo, useState } from 'react'
import { dateLabel, shortDate } from '../lib'
import { phaseName, scorePhases, type PhaseScore } from '../phaseScore'
import { useStore } from '../store'
import { scoreLabel } from '../weekly'
import { ScoreGaugeWithSub, ScorePill } from './ScoreGauge'
import { Icon, Sheet } from './ui'

export function usePhaseScores() {
  const { phases, workouts, weights, progress } = useStore()
  return useMemo(() => scorePhases(phases, workouts, weights, progress.byId), [phases, workouts, weights, progress])
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
  return (
    <>
      <div className="section-title"><h2>Phasen</h2>{avg != null && <span className="faint" style={{ fontSize: 13 }}>Ø Score {avg}</span>}</div>
      <div className="card" style={{ padding: '4px 14px' }}>
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
              {p.startKg != null && p.endKg != null && <div>{p.endKg - p.startKg > 0 ? '+' : ''}{(p.endKg - p.startKg).toFixed(1).replace('.', ',')} kg</div>}
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
