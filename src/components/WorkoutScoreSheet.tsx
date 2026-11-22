import { useState } from 'react'
import { fmtInt } from '../lib'
import { useStore } from '../store'
import { scoreLabel } from '../weekly'
import { ScoreGaugeWithSub, ScorePill } from './ScoreGauge'
import { Sheet } from './ui'

const pct = (v: number) => `${Math.round(v * 100)} %`
const dec = (v: number) => v.toFixed(1).replace('.', ',')

/** Workout score pill that opens the breakdown when tapped. Safe inside a row button. */
export function WorkoutScoreButton({ id, size = 34 }: { id: string; size?: number }) {
  const { workoutScores } = useStore()
  const [open, setOpen] = useState(false)
  const score = workoutScores.get(id)
  if (score == null) return null
  return (
    <>
      <span
        role="button"
        tabIndex={0}
        className="score-tap"
        aria-label={`Workout-Score ${score}, Details`}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setOpen(true) } }}
      >
        <ScorePill score={score} size={size} />
      </span>
      {/* React events bubble out of portals: keep taps in the sheet away from the row behind it */}
      {open && <span onClick={(e) => e.stopPropagation()}><WorkoutScoreSheet id={id} onClose={() => setOpen(false)} /></span>}
    </>
  )
}

export function WorkoutScoreSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { workoutScoreDetails, workouts } = useStore()
  const d = workoutScoreDetails.get(id)
  const w = workouts.find((x) => x.id === id)
  if (!d || !w) return null

  const volRatio = d.baseVol ? d.vol / d.baseVol : 0
  const volTarget = d.baseVol * 1.3
  const gainTarget = d.baseGain * 1.8
  const perEx = d.trained ? d.gain : 0

  const parts = [
    {
      label: 'Volumen', pts: d.volPts, max: 40,
      detail: d.baseVol ? `${fmtInt(d.vol)} kg · ${pct(volRatio)} deines Schnitts` : `${fmtInt(d.vol)} kg · noch kein Vergleich`,
      tip: d.baseVol
        ? d.volPts >= 39.5
          ? 'Volle Punkte – deutlich mehr bewegt als sonst.'
          : `Verglichen mit deinen letzten 5 „${w.name}“-Workouts (Ø ${fmtInt(d.baseVol)} kg). Volle Punkte ab ca. ${fmtInt(volTarget)} kg – mehr Gewicht, mehr Wdh oder ein Extra-Satz.`
        : 'Sobald es Vergleichs-Workouts gibt, zählt dein Volumen gegen deinen Schnitt.',
    },
    {
      label: 'Fortschritt', pts: d.gainPts, max: 40,
      detail: `${d.prs} ${d.prs === 1 ? 'Rekord' : 'Rekorde'} · ${d.ups} ${d.ups === 1 ? 'Fortschritt' : 'Fortschritte'} · ${dec(perEx)} Pkt./Übung`,
      tip: d.baseGain
        ? d.gainPts >= 39.5
          ? 'Volle Punkte – überdurchschnittlich viele Verbesserungen.'
          : `Pro Übung zählt jeder Satz, der dein letztes Mal schlägt (1 Pkt.), ein Rekord doppelt (2 Pkt.). Dein Schnitt: ${dec(d.baseGain)} Pkt./Übung – volle Punkte ab ca. ${dec(gainTarget)}.`
        : 'Schlag in möglichst vielen Sätzen dein letztes Mal – Rekorde zählen doppelt.',
    },
    {
      label: 'Vollständigkeit', pts: d.fullPts, max: 20,
      detail: `${d.trained} von ${d.planned} Übungen trainiert`,
      tip: d.fullPts >= 19.5 ? 'Alles durchgezogen.' : 'Jede ausgelassene Übung kostet Punkte – lieber leichter trainieren als auslassen.',
    },
  ]

  return (
    <Sheet onClose={onClose}>
      <h3>Workout-Score</h3>
      <p className="faint" style={{ fontSize: 13 }}>{w.name} · im Vergleich zu deinem eigenen Verlauf</p>
      <div style={{ margin: '6px auto 0', maxWidth: 220 }}>
        <ScoreGaugeWithSub score={d.score} label={scoreLabel(d.score)} sub="max. 99 – 99 ist selten" />
      </div>
      <div className="score-parts" style={{ marginTop: 8 }}>
        {parts.map((p) => (
          <div key={p.label} className="ws-part">
            <div className="score-part">
              <span>{p.label}</span>
              <div className="track"><div className="fill" style={{ width: `${(p.pts / p.max) * 100}%` }} /></div>
              <span className="n">{Math.round(p.pts)}/{p.max}</span>
              <span className="d">{p.detail}</span>
            </div>
            <div className="ws-tip">{p.tip}</div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
