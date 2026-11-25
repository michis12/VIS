import { t } from '../i18n'
import { useMemo, useState } from 'react'
import { fmtInt, shortDate } from '../lib'
import { useStore } from '../store'
import { scoreLabel, weekScore } from '../weekly'
import { ScoreGaugeWithSub } from './ScoreGauge'

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
        <div className="eyebrow">{t('Wochenscore', 'Week score')}</div>
        <div className="segmented" style={{ width: 190 }}>
          <button className={ago === 0 ? 'on' : ''} onClick={() => setAgo(0)}>{t('Diese', 'This')}</button>
          <button className={ago === 1 ? 'on' : ''} onClick={() => setAgo(1)}>{t('Letzte', 'Last')}</button>
        </div>
      </div>
      <ScoreGaugeWithSub
        score={s.score}
        label={scoreLabel(s.score)}
        sub={
          <>
            {t(`Woche ab ${shortDate(s.start)}${s.current ? ' · läuft' : ''}`, `Week of ${shortDate(s.start)}${s.current ? ' · in progress' : ''}`)}
            {prev.score > 0 && delta !== 0 && (
              <span className={'week-delta' + (delta > 0 ? ' up' : '')}>{delta > 0 ? '+' : '−'}{Math.abs(delta)} {t('zur Vorwoche', 'vs last week')}</span>
            )}
          </>
        }
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
        {s.workouts} Workouts · {fmtInt(s.sets)} {t('Sätze', 'sets')} · {fmtInt(s.volume / 1000)} t {t('Volumen', 'volume')}
      </div>
    </div>
  )
}
