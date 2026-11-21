import { useMemo, useState } from 'react'
import { fmtInt, shortDate } from '../lib'
import { useStore } from '../store'
import { scoreLabel, weekScore } from '../weekly'
import { ScoreGauge } from './ScoreGauge'
import { AiBox } from './AiBox'

export function useWeekScore(weeksAgo = 0) {
  const { workouts, progress, weights, phases } = useStore()
  return useMemo(() => weekScore(workouts, progress.byId, weights, phases, weeksAgo), [workouts, progress, weights, phases, weeksAgo])
}

export function WeeklyReport() {
  const [ago, setAgo] = useState(0)
  const s = useWeekScore(ago)
  const prev = useWeekScore(ago + 1)
  const delta = s.score - prev.score
  return (
    <div className="card chrome-edge score-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="eyebrow">Wochenscore</div>
        <div className="segmented" style={{ width: 190 }}>
          <button className={ago === 0 ? 'on' : ''} onClick={() => setAgo(0)}>Diese</button>
          <button className={ago === 1 ? 'on' : ''} onClick={() => setAgo(1)}>Letzte</button>
        </div>
      </div>
      <ScoreGauge
        score={s.score}
        label={scoreLabel(s.score)}
        sub={`Woche ab ${shortDate(s.start)}${s.current ? ' · läuft' : ''}${prev.score ? ` · ${delta >= 0 ? '+' : ''}${delta} zur Vorwoche` : ''}`}
      />
      <div className="score-parts">
        {s.parts.map((p) => (
          <div key={p.key} className="score-part">
            <span>{p.label}</span>
            <div className="track"><div className="fill" style={{ width: `${(p.pts / p.max) * 100}%` }} /></div>
            <span className="n">{p.pts}/{p.max}</span>
            <span className="d">{p.detail}</span>
          </div>
        ))}
      </div>
      <div className="faint num" style={{ fontSize: 12, marginTop: 12, textAlign: 'center' }}>
        {s.workouts} Workouts · {fmtInt(s.sets)} Sätze · {fmtInt(s.volume / 1000)} t Volumen
      </div>
      <AiBox mode="week" weekStart={s.start} label="KI-Wochenbericht" />
    </div>
  )
}
