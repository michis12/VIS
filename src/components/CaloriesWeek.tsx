import { t } from '../i18n'
import { useMemo } from 'react'
import { dayShort, fmtInt, today } from '../lib'
import { dayTotals, kcalTarget } from '../nutrition'
import { useStore } from '../store'

const addDays = (iso: string, d: number) => {
  const t = new Date(iso + 'T12:00:00')
  t.setDate(t.getDate() + d)
  return t.toISOString().slice(0, 10)
}

/** Calories of the last 7 days against the phase target (Statistik). */
export function CaloriesWeek() {
  const { foodLog, phases } = useStore()
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today(), i - 6)
    return { d, kcal: dayTotals(foodLog, d).kcal, target: kcalTarget(phases, d) }
  }), [foodLog, phases])
  if (!foodLog.length) return null
  const logged = week.filter((x) => x.kcal > 0)
  const avg = logged.length ? Math.round(logged.reduce((n, x) => n + x.kcal, 0) / logged.length) : 0
  const maxK = Math.max(1, ...week.map((x) => Math.max(x.kcal, x.target ?? 0)))
  return (
    <>
      <div className="section-title"><h2>{t('Kalorien · 7 Tage', 'Calories · 7 days')}</h2>{avg > 0 && <span className="faint" style={{ fontSize: 13 }}>{t('Ø', 'avg')} {fmtInt(avg)} kcal</span>}</div>
      <div className="card">
        <div className="nut-week">
          {week.map((x) => (
            <div key={x.d} className={'nut-week-day' + (x.d === today() ? ' on' : '')}>
              <span className="num" style={{ fontSize: 10 }}>{x.kcal ? fmtInt(x.kcal) : '–'}</span>
              <div className="nut-week-bar">
                {x.target != null && <i className="tgt" style={{ bottom: `${(x.target / maxK) * 100}%` }} />}
                <b style={{ height: `${(x.kcal / maxK) * 100}%` }} />
              </div>
              <span>{dayShort(new Date(x.d + 'T12:00:00').getDay())}</span>
            </div>
          ))}
        </div>
        <div className="faint" style={{ fontSize: 11, textAlign: 'center', marginTop: 6 }}>{t('Strich = Kalorienziel der Phase', 'Line = phase calorie target')}</div>
      </div>
    </>
  )
}
