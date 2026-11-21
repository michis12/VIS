import { useMemo, useState } from 'react'
import { LineChart, type Band } from '../components/charts'
import { Sheet, Wheel } from '../components/ui'
import { dateLabel, fmtInt, fmtKg, shortDate, today, uid } from '../lib'
import { useStore } from '../store'
import type { Phase, PhaseType } from '../types'
import { phaseName } from './Home'

const KG = Array.from({ length: 1201 }, (_, i) => Math.round((40 + i / 10) * 10) / 10)
const RANGES = [{ id: 90, l: '3 Monate' }, { id: 182, l: '6 Monate' }, { id: 365, l: '1 Jahr' }, { id: 99999, l: 'Alles' }]
const COLORS: Record<PhaseType, string> = { bulk: '#e3b26b', cut: '#7fb2e5', maintain: '#a1a1a6' }

export function Body() {
  const store = useStore()
  const { weights, phases } = store
  const [range, setRange] = useState(99999)
  const [addW, setAddW] = useState(false)
  const [editPhase, setEditPhase] = useState<Phase | null>(null)

  const since = new Date(Date.now() - range * 864e5).toISOString().slice(0, 10)
  const pts = weights.filter((w) => w.date >= since).map((w) => ({ x: new Date(w.date + 'T12:00:00').getTime(), y: w.kg }))
  const last = weights[weights.length - 1]

  const delta = (days: number) => {
    if (!last) return null
    const ref = new Date(new Date(last.date).getTime() - days * 864e5).toISOString().slice(0, 10)
    const before = [...weights].reverse().find((w) => w.date <= ref)
    return before ? last.kg - before.kg : null
  }

  const bands: Band[] = useMemo(() => phases.map((p, i) => ({
    from: new Date(p.start + 'T00:00:00').getTime(),
    to: phases[i + 1] ? new Date(phases[i + 1].start + 'T00:00:00').getTime() : Date.now(),
    color: COLORS[p.type],
  })), [phases])

  const current = phases[phases.length - 1]
  const phaseStartWeight = current ? weights.find((w) => w.date >= current.start)?.kg : undefined

  return (
    <div className="screen">
      <div className="eyebrow">Körper</div>
      <h1 className="title">Gewicht & Phase</h1>

      <div className="card chrome-edge" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow">Aktuell</div>
            <div style={{ fontSize: 44, fontWeight: 750, letterSpacing: '-0.03em' }} className="num chrome-text">
              {last ? fmtKg(last.kg) : '–'}<span style={{ fontSize: 18, marginLeft: 4 }}>kg</span>
            </div>
            {last && <div className="faint" style={{ fontSize: 13 }}>{dateLabel(last.date)}</div>}
          </div>
          <button className="btn btn-chrome btn-sm" onClick={() => setAddW(true)}>+ Eintragen</button>
        </div>
        <div className="grid-3" style={{ marginTop: 16 }}>
          {[7, 30, 90].map((d) => {
            const v = delta(d)
            return (
              <div key={d}>
                <div className="faint" style={{ fontSize: 12 }}>{d} Tage</div>
                <div className="num" style={{ fontWeight: 650 }}>{v == null ? '–' : `${v > 0 ? '+' : ''}${fmtKg(Math.round(v * 10) / 10)} kg`}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="chips" style={{ marginTop: 16 }}>
        {RANGES.map((r) => <button key={r.id} className={'chip' + (r.id === range ? ' on' : '')} onClick={() => setRange(r.id)}>{r.l}</button>)}
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <LineChart points={pts} height={220} yFmt={(v) => fmtKg(Math.round(v * 10) / 10)} unit="kg" bands={bands} />
        {phases.length > 0 && (
          <div className="legend">
            {(['bulk', 'cut', 'maintain'] as PhaseType[]).filter((t) => phases.some((p) => p.type === t)).map((t) => (
              <span key={t}><i style={{ background: COLORS[t] }} />{phaseName(t)}</span>
            ))}
          </div>
        )}
      </div>

      <div className="section-title">
        <h2>Phase</h2>
        <button className="link" onClick={() => setEditPhase({ id: uid(), type: current?.type === 'bulk' ? 'cut' : 'bulk', start: today(), calories: current?.calories ?? 2800 })}>Neue Phase</button>
      </div>
      {current ? (
        <button className="card" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEditPhase(current)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={'phase-dot phase-' + current.type} style={{ width: 12, height: 12 }} />
            <span style={{ fontSize: 22, fontWeight: 700 }}>{phaseName(current.type)}</span>
            <span className="muted" style={{ marginLeft: 'auto' }}>seit {shortDate(current.start)}</span>
          </div>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <div><div className="faint" style={{ fontSize: 12 }}>Kalorienziel</div><div className="num" style={{ fontSize: 20, fontWeight: 650 }}>{fmtInt(current.calories)} kcal</div></div>
            <div><div className="faint" style={{ fontSize: 12 }}>Veränderung in Phase</div><div className="num" style={{ fontSize: 20, fontWeight: 650 }}>{phaseStartWeight != null && last ? `${last.kg - phaseStartWeight > 0 ? '+' : ''}${fmtKg(Math.round((last.kg - phaseStartWeight) * 10) / 10)} kg` : '–'}</div></div>
          </div>
        </button>
      ) : (
        <div className="card muted">Noch keine Phase gesetzt. Leg fest, ob du gerade im Bulk, Cut oder Erhalt bist.</div>
      )}
      {phases.length > 1 && (
        <div className="card" style={{ padding: '4px 14px', marginTop: 12 }}>
          {[...phases].reverse().slice(1).map((p) => (
            <button key={p.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEditPhase(p)}>
              <span className={'phase-dot phase-' + p.type} />
              <div className="grow">{phaseName(p.type)} <span className="faint">· ab {dateLabel(p.start)}</span></div>
              <span className="num muted">{fmtInt(p.calories)} kcal</span>
            </button>
          ))}
        </div>
      )}

      <div className="section-title"><h2>Einträge</h2></div>
      <div className="card" style={{ padding: '4px 14px' }}>
        {[...weights].reverse().slice(0, 15).map((w) => (
          <div className="list-row" key={w.date}>
            <div className="grow">{dateLabel(w.date)}{w.source === 'screenshot' && <span className="faint" style={{ fontSize: 12 }}> · importiert</span>}</div>
            <span className="num" style={{ fontWeight: 600 }}>{fmtKg(w.kg)} kg</span>
          </div>
        ))}
      </div>

      {addW && <WeightSheet initial={last?.kg ?? 80} onClose={() => setAddW(false)} onSave={(kg, date) => { store.saveWeight({ date, kg, source: 'app' }); setAddW(false) }} />}
      {editPhase && <PhaseSheet phase={editPhase} isNew={!phases.some((p) => p.id === editPhase.id)} onClose={() => setEditPhase(null)} />}
    </div>
  )
}

function WeightSheet({ initial, onClose, onSave }: { initial: number; onClose: () => void; onSave: (kg: number, date: string) => void }) {
  const [kg, setKg] = useState(Math.round(initial * 10) / 10)
  const [date, setDate] = useState(today())
  return (
    <Sheet onClose={onClose}>
      <h3>Gewicht eintragen</h3>
      <div className="wheels"><div className="wheel-col"><Wheel values={KG} value={kg} onChange={setKg} format={(v) => fmtKg(v) + ' kg'} /></div></div>
      <label className="lbl">Datum</label>
      <input className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      <button className="btn btn-chrome btn-block" style={{ marginTop: 18 }} onClick={() => onSave(kg, date)}>Speichern</button>
    </Sheet>
  )
}

function PhaseSheet({ phase, isNew, onClose }: { phase: Phase; isNew: boolean; onClose: () => void }) {
  const store = useStore()
  const [p, setP] = useState(phase)
  return (
    <Sheet onClose={onClose}>
      <h3>{isNew ? 'Neue Phase' : 'Phase bearbeiten'}</h3>
      <label className="lbl">Ziel</label>
      <div className="segmented">
        {(['bulk', 'maintain', 'cut'] as PhaseType[]).map((t) => (
          <button key={t} className={p.type === t ? 'on' : ''} onClick={() => setP({ ...p, type: t })}>{phaseName(t)}</button>
        ))}
      </div>
      <label className="lbl">Kalorien pro Tag</label>
      <input className="input num" inputMode="numeric" value={p.calories || ''} onChange={(e) => setP({ ...p, calories: Number(e.target.value.replace(/\D/g, '')) })} />
      <label className="lbl">Start</label>
      <input className="input" type="date" value={p.start} onChange={(e) => setP({ ...p, start: e.target.value })} />
      <button className="btn btn-chrome btn-block" style={{ marginTop: 18 }} onClick={() => { store.savePhase(p); onClose() }}>Speichern</button>
      {!isNew && <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={() => { store.deletePhase(p.id); onClose() }}>Phase löschen</button>}
    </Sheet>
  )
}
