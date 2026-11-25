import { t } from '../i18n'
import { useMemo, useState } from 'react'
import { WorkoutScoreButton } from '../components/WorkoutScoreSheet'
import { Icon, ProgressBadges } from '../components/ui'
import { dateLabel, monthLong, durationLabel, fmtInt, workoutSetCount, workoutVolume } from '../lib'
import { useNav } from '../nav'
import { useStore } from '../store'
import type { Workout } from '../types'


export function History() {
  const { workouts } = useStore()
  const nav = useNav()
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const list = workouts.filter((w) => w.status !== 'active' && w.name.toLowerCase().includes(q.toLowerCase())).reverse()
    const out: { key: string; label: string; items: Workout[] }[] = []
    for (const w of list) {
      const key = w.startedAt.slice(0, 7)
      let g = out[out.length - 1]
      if (!g || g.key !== key) {
        g = { key, label: `${monthLong(Number(key.slice(5)) - 1)} ${key.slice(0, 4)}`, items: [] }
        out.push(g)
      }
      g.items.push(w)
    }
    return out
  }, [workouts, q])

  return (
    <div className="screen no-tabs">
      <div className="wo-head">
        <button className="icon-btn" onClick={nav.pop} aria-label={t('Zurück', 'Back')}><Icon.back /></button>
        <div className="grow"><div className="name">{t('Verlauf', 'History')}</div><div className="wo-timer">{workouts.length} {t('Einträge', 'entries')}</div></div>
      </div>
      <input className="input" placeholder={t('Workout suchen', 'Search workouts')} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 16 }} />

      {groups.map((g) => (
        <div key={g.key}>
          <div className="section-title"><h2>{g.label}</h2><span className="faint" style={{ fontSize: 13 }}>{g.items.filter((w) => w.status === 'done').length} Workouts</span></div>
          <div className="card" style={{ padding: '4px 14px' }}>
            {g.items.map((w) => <HistoryRow key={w.id} w={w} onOpen={() => nav.push({ kind: 'workout', id: w.id })} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

export function HistoryRow({ w, onOpen }: { w: Workout; onOpen: () => void }) {
  const store = useStore()
  const rating = store.progress.byId.get(w.id)
  return (
    <button className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={onOpen}>
      {w.status === 'done' && <WorkoutScoreButton id={w.id} />}
      <div className="grow">
        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px' }}>
          {w.name}
          {rating && <ProgressBadges ups={rating.ups} prs={rating.prs} />}
        </div>
        <div className="faint" style={{ fontSize: 13 }}>{dateLabel(w.startedAt)}</div>
      </div>
      {w.status === 'skipped' ? (
        <span className="pill skip">{t('Ausgelassen', 'Skipped')}</span>
      ) : (
        <div className="hist-meta num">
          <div>{workoutSetCount(w)} {t('Sätze', 'sets')}</div>
          <div>{fmtInt(workoutVolume(w))} kg</div>
          <div className="faint">{durationLabel(w.durationSec)}</div>
        </div>
      )}
      <span className="chev"><Icon.chevron /></span>
    </button>
  )
}
