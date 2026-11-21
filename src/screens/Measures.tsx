import { useState } from 'react'
import { Icon, Sheet } from '../components/ui'
import { dateLabel, fmtKg, haptic, shortDate, today } from '../lib'
import { useNav } from '../nav'
import { useStore } from '../store'
import { MEASURE_FIELDS, type MeasureKey, type Measurement } from '../types'

/** Tiny inline trend line for one measurement. */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="spark-empty" />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const W = 72
  const H = 22
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - 2 - ((v - min) / (max - min || 1)) * (H - 4)}`)
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="spark" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke="#c7c7cc" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function Measures() {
  const { measurements, saveMeasurement, deleteMeasurement } = useStore()
  const nav = useNav()
  const [editing, setEditing] = useState<Measurement | null>(null)
  const latest = measurements[measurements.length - 1]

  return (
    <div className="screen no-tabs">
      <div className="wo-head">
        <button className="icon-btn" onClick={nav.pop} aria-label="Zurück"><Icon.back /></button>
        <div className="grow">
          <div className="name">Körpermaße</div>
          <div className="wo-timer">{latest ? `Zuletzt ${dateLabel(latest.date)}` : 'Noch nichts gemessen'}</div>
        </div>
        <button className="btn btn-chrome btn-sm" onClick={() => setEditing({ date: today(), ...stripDate(latest) })}>Messen</button>
      </div>

      <div className="card" style={{ marginTop: 18, padding: '4px 16px' }}>
        {MEASURE_FIELDS.map((f) => {
          const series = measurements.filter((m) => m[f.key] != null).map((m) => m[f.key]!)
          const now = series[series.length - 1]
          const first = series[0]
          const diff = now != null && first != null && series.length > 1 ? now - first : null
          return (
            <div className="measure-row" key={f.key}>
              <span className="muted">{f.label}</span>
              <Spark values={series} />
              <span className="num measure-val">{now != null ? `${fmtKg(now)} ${f.unit}` : '–'}</span>
              <span className="num faint measure-diff">{diff != null ? `${diff > 0 ? '+' : ''}${fmtKg(Math.round(diff * 10) / 10)}` : ''}</span>
            </div>
          )
        })}
      </div>
      <p className="faint" style={{ fontSize: 12, margin: '8px 4px 0' }}>Veränderung jeweils seit der ersten Messung. Am besten morgens, entspannt, immer an derselben Stelle messen.</p>

      {measurements.length > 0 && (
        <>
          <div className="section-title"><h2>Verlauf</h2></div>
          <div className="card" style={{ padding: '4px 14px' }}>
            {[...measurements].reverse().map((m) => (
              <button key={m.date} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEditing(m)}>
                <div className="grow">{dateLabel(m.date)}</div>
                <span className="faint" style={{ fontSize: 13 }}>{MEASURE_FIELDS.filter((f) => m[f.key] != null).length} Werte</span>
                <span className="chev"><Icon.chevron /></span>
              </button>
            ))}
          </div>
        </>
      )}

      {editing && (
        <MeasureSheet
          initial={editing}
          exists={measurements.some((m) => m.date === editing.date)}
          onClose={() => setEditing(null)}
          onSave={(m) => { haptic(); saveMeasurement(m); setEditing(null) }}
          onDelete={(d) => { deleteMeasurement(d); setEditing(null) }}
        />
      )}
    </div>
  )
}

function stripDate(m?: Measurement): Partial<Measurement> {
  if (!m) return {}
  const { date: _date, ...rest } = m
  return rest
}

function MeasureSheet({ initial, exists, onClose, onSave, onDelete }: {
  initial: Measurement
  exists: boolean
  onClose: () => void
  onSave: (m: Measurement) => void
  onDelete: (date: string) => void
}) {
  const [date, setDate] = useState(initial.date)
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(MEASURE_FIELDS.map((f) => [f.key, initial[f.key] != null ? fmtKg(initial[f.key]!) : ''])))

  const save = () => {
    const m: Measurement = { date }
    for (const f of MEASURE_FIELDS) {
      const v = Number(vals[f.key].replace(',', '.'))
      if (vals[f.key].trim() && v > 0) m[f.key as MeasureKey] = Math.round(v * 10) / 10
    }
    onSave(m)
  }

  return (
    <Sheet onClose={onClose}>
      <h3>{exists ? `Messung vom ${shortDate(initial.date)}` : 'Neue Messung'}</h3>
      <p className="faint" style={{ fontSize: 13 }}>Vorausgefüllt mit deinen letzten Werten – nur ändern, was du neu gemessen hast.</p>
      <label className="lbl">Datum</label>
      <input className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      <div className="measure-grid">
        {MEASURE_FIELDS.map((f) => (
          <label key={f.key} className="measure-field">
            <span>{f.label}</span>
            <span className="measure-input">
              <input inputMode="decimal" value={vals[f.key]} placeholder="–"
                onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} onFocus={(e) => e.target.select()} />
              <small>{f.unit}</small>
            </span>
          </label>
        ))}
      </div>
      <button className="btn btn-chrome btn-block" style={{ marginTop: 16 }} onClick={save}>Speichern</button>
      {exists && <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={() => onDelete(initial.date)}>Messung löschen</button>}
    </Sheet>
  )
}
