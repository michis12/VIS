import { useMemo, useState } from 'react'
import { BarChart, LineChart } from '../components/charts'
import { MuscleMap } from '../components/MuscleMap'
import { Icon } from '../components/ui'
import { WeeklyReport } from '../components/WeeklyReport'
import { useNav } from '../nav'
import { dateLabel, durationLabel, e1rm, fmtInt, fmtKg, isRealSet, shortDate, weekKey, workoutSetCount, workoutVolume } from '../lib'
import { useStore } from '../store'

const RANGES = [
  { id: '3m', label: '3 Monate', days: 91 },
  { id: '6m', label: '6 Monate', days: 182 },
  { id: '1y', label: '1 Jahr', days: 365 },
  { id: 'all', label: 'Alles', days: 99999 },
] as const

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export function Stats() {
  const { workouts, exerciseById, exercises } = useStore()
  const nav = useNav()
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('6m')
  const days = RANGES.find((r) => r.id === range)!.days
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)

  const done = useMemo(() => workouts.filter((w) => w.status === 'done'), [workouts])
  const inRange = useMemo(() => done.filter((w) => w.startedAt.slice(0, 10) >= since), [done, since])

  const k = useMemo(() => {
    const sets = inRange.reduce((n, w) => n + workoutSetCount(w), 0)
    const vol = inRange.reduce((n, w) => n + workoutVolume(w), 0)
    const durs = inRange.map((w) => w.durationSec).filter((d): d is number => d != null)
    const first = inRange[0]?.startedAt
    const weeks = first ? Math.max(1, (Date.now() - new Date(first).getTime()) / (7 * 864e5)) : 1
    // streak: consecutive weeks (ending this or last week) with >=1 workout
    const wk = new Set(done.map((w) => weekKey(w.startedAt)))
    let streak = 0
    const d = new Date()
    if (!wk.has(weekKey(d.toISOString()))) d.setDate(d.getDate() - 7)
    while (wk.has(weekKey(d.toISOString()))) { streak++; d.setDate(d.getDate() - 7) }
    const skipped = workouts.filter((w) => w.status === 'skipped' && w.startedAt.slice(0, 10) >= since).length
    return { n: inRange.length, sets, vol, avgDur: durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null, perWeek: inRange.length / weeks, streak, skipped }
  }, [inRange, done, workouts, since])

  const weekly = useMemo(() => {
    const n = Math.min(26, Math.ceil(days / 7))
    const map = new Map<string, { count: number; vol: number }>()
    for (const w of inRange) {
      const key = weekKey(w.startedAt)
      const m = map.get(key) ?? { count: 0, vol: 0 }
      m.count++
      m.vol += workoutVolume(w)
      map.set(key, m)
    }
    const out = []
    const d = new Date()
    for (let i = n - 1; i >= 0; i--) {
      const x = new Date(d.getTime() - i * 7 * 864e5)
      const key = weekKey(x.toISOString())
      out.push({ key, label: shortDate(key), ...(map.get(key) ?? { count: 0, vol: 0 }) })
    }
    return out
  }, [inRange, days])

  const muscles = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of inRange) for (const e of w.exercises) {
      const g = exerciseById.get(e.exerciseId)?.muscle ?? 'Sonstige'
      m.set(g, (m.get(g) ?? 0) + e.sets.filter(isRealSet).length)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [inRange, exerciseById])

  const splits = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of inRange) m.set(w.name, (m.get(w.name) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [inRange])

  const weekday = useMemo(() => {
    const c = [0, 0, 0, 0, 0, 0, 0]
    for (const w of inRange) c[(new Date(w.startedAt).getDay() + 6) % 7]++
    return c.map((v, i) => ({ label: WD[i], value: v }))
  }, [inRange])

  const heat = useMemo(() => {
    const per = new Map<string, number>()
    for (const w of done) per.set(w.startedAt.slice(0, 10), (per.get(w.startedAt.slice(0, 10)) ?? 0) + workoutSetCount(w))
    const cells: { date: string; lvl: number }[] = []
    const end = new Date()
    const start = new Date(end.getTime() - 52 * 7 * 864e5)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const s = per.get(key) ?? 0
      cells.push({ date: key, lvl: s === 0 ? 0 : s < 12 ? 1 : s < 20 ? 2 : 3 })
    }
    return cells
  }, [done])

  // exercise deep dive: exercises trained in the selected range, most used first
  const ranked = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of inRange) for (const e of w.exercises) m.set(e.exerciseId, (m.get(e.exerciseId) ?? 0) + e.sets.length)
    return exercises.filter((e) => m.has(e.id)).sort((a, b) => (m.get(b.id) ?? 0) - (m.get(a.id) ?? 0))
  }, [inRange, exercises])
  const [exId, setExId] = useState<string | null>(null)
  const ex = exId && ranked.some((e) => e.id === exId) ? exId : ranked[0]?.id

  const exStats = useMemo(() => {
    if (!ex) return null
    const series: { x: number; y: number; note: string }[] = []
    const volSeries: { x: number; y: number }[] = []
    let best = { w: 0, r: 0, e: 0, date: '' }
    let heaviest = { w: 0, r: 0, date: '' }
    let mostReps = { w: 0, r: 0, date: '' }
    let sets = 0
    const repPR = new Map<number, { w: number; date: string }>()
    for (const w of done) {
      for (const e of w.exercises) {
        if (e.exerciseId !== ex) continue
        let dayBest = { e: 0, note: '' }
        let vol = 0
        for (const s of e.sets) {
          if (!isRealSet(s)) continue
          const kg = s.weight ?? 0, r = s.reps ?? 0
          sets++
          vol += kg * r
          const est = e1rm(kg, r)
          if (est > dayBest.e) dayBest = { e: est, note: `${fmtKg(kg)} × ${r}` }
          if (est > best.e) best = { w: kg, r, e: est, date: w.startedAt }
          if (kg > heaviest.w || (kg === heaviest.w && r > heaviest.r)) heaviest = { w: kg, r, date: w.startedAt }
          if (r > mostReps.r) mostReps = { w: kg, r, date: w.startedAt }
          if (r <= 12) { const p = repPR.get(r); if (!p || kg > p.w) repPR.set(r, { w: kg, date: w.startedAt }) }
        }
        if (dayBest.e > 0) series.push({ x: new Date(w.startedAt).getTime(), y: dayBest.e, note: dayBest.note })
        if (vol > 0) volSeries.push({ x: new Date(w.startedAt).getTime(), y: vol })
      }
    }
    const x0 = new Date(since).getTime()
    const cut = <T extends { x: number }>(a: T[]) => a.filter((p) => p.x >= x0)
    const recent = cut(series)
    const change = recent.length > 1 ? ((recent[recent.length - 1].y - recent[0].y) / recent[0].y) * 100 : null
    return { series: recent, volSeries: cut(volSeries), best, heaviest, mostReps, sets, change, repPR: [...repPR.entries()].sort((a, b) => a[0] - b[0]), sessions: series.length }
  }, [ex, done, since])

  const maxMuscle = Math.max(1, ...muscles.map((m) => m[1]))
  const maxSplit = Math.max(1, ...splits.map((m) => m[1]))

  return (
    <div className="screen">
      <div className="eyebrow">Fortschritt</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="title">Statistik</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => nav.push({ kind: 'coach' })}><span className="ai-spark">✦</span> Coach</button>
      </div>

      <WeeklyReport />

      <div className="section-title"><h2>Muskeln diese Woche</h2></div>
      <MuscleMap />
      <div style={{ height: 22 }} />

      <div className="sticky-blur">
        <div className="chips">
          {RANGES.map((r) => <button key={r.id} className={'chip' + (r.id === range ? ' on' : '')} onClick={() => setRange(r.id)}>{r.label}</button>)}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <Kpi label="Workouts" value={String(k.n)} sub={`${k.perWeek.toFixed(1).replace('.', ',')} pro Woche`} />
        <Kpi label="Serie" value={String(k.streak)} unit="Wochen" sub="in Folge trainiert" />
        <Kpi label="Volumen" value={fmtInt(k.vol / 1000)} unit="t" sub={`${fmtInt(k.sets)} Sätze`} />
        <Kpi label="Ø Dauer" value={k.avgDur ? String(Math.round(k.avgDur / 60)) : '–'} unit="min" sub={k.skipped ? `${k.skipped}× ausgelassen` : 'pro Workout'} />
      </div>

      <div className="section-title"><h2>Trainingstage</h2><span className="faint" style={{ fontSize: 13 }}>52 Wochen</span></div>
      <div className="card">
        <div className="heat">
          {[...heat].reverse().map((c) => <div key={c.date} className={c.lvl ? 'l' + c.lvl : ''} title={`${dateLabel(c.date)}`} />)}
        </div>
        <div className="legend" style={{ justifyContent: 'flex-end' }}>
          <span>weniger</span>
          <span className="heat" style={{ display: 'flex', gap: 3, direction: 'ltr' }}><div /><div className="l1" /><div className="l2" /><div className="l3" /></span>
          <span>mehr Sätze</span>
        </div>
      </div>

      <div className="section-title"><h2>Workouts pro Woche</h2></div>
      <div className="card"><BarChart bars={weekly.map((w) => ({ label: w.label, value: w.count, tip: `Woche ab ${w.label}` }))} unit="Workouts" /></div>

      <div className="section-title"><h2>Volumen pro Woche</h2></div>
      <div className="card"><BarChart bars={weekly.map((w) => ({ label: w.label, value: w.vol / 1000, tip: `Woche ab ${w.label}` }))} yFmt={(v) => (v < 10 ? v.toFixed(1).replace('.', ',') : String(Math.round(v)))} unit="t" /></div>

      <div className="section-title"><h2>Übung im Detail</h2></div>
      <div className="chips">
        {ranked.slice(0, 40).map((e) => <button key={e.id} className={'chip' + (e.id === ex ? ' on' : '')} onClick={() => setExId(e.id)}>{e.name}</button>)}
      </div>
      {exStats && (
        <>
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div>
                <div className="faint" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' }}>Geschätztes 1RM</div>
                <div style={{ fontSize: 26, fontWeight: 700 }} className="num">{fmtKg(Math.round(exStats.best.e * 10) / 10)} <span className="muted" style={{ fontSize: 14 }}>kg Bestwert</span></div>
              </div>
              {exStats.change != null && (
                <div className="num" style={{ fontWeight: 650, color: exStats.change >= 0 ? 'var(--good)' : 'var(--danger)' }}>
                  {exStats.change >= 0 ? '▲' : '▼'} {Math.abs(exStats.change).toFixed(1).replace('.', ',')} %
                </div>
              )}
            </div>
            <LineChart points={exStats.series} yFmt={(v) => String(Math.round(v))} unit="kg e1RM" dots />
          </div>
          <div className="grid-3" style={{ marginTop: 12 }}>
            <Kpi label="Schwerster" value={fmtKg(exStats.heaviest.w)} unit="kg" sub={`× ${exStats.heaviest.r} Wdh`} small />
            <Kpi label="Meiste Wdh" value={String(exStats.mostReps.r)} sub={`bei ${fmtKg(exStats.mostReps.w)} kg`} small />
            <Kpi label="Sätze" value={fmtInt(exStats.sets)} sub={`${exStats.sessions} Einheiten`} small />
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="faint" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Volumen pro Einheit</div>
            <LineChart points={exStats.volSeries} yFmt={(v) => fmtInt(v)} unit="kg" />
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="faint" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>Rekorde nach Wiederholungen</div>
            {exStats.repPR.map(([r, p]) => (
              <div className="pr-row num" key={r}><span className="muted">{r} Wdh</span><span><b>{fmtKg(p.w)} kg</b> <span className="faint">· {shortDate(p.date)} {p.date.slice(2, 4)}</span></span></div>
            ))}
          </div>
        </>
      )}

      <div className="section-title"><h2>Sätze pro Muskelgruppe</h2></div>
      <div className="card">
        {muscles.map(([m, n]) => (
          <div className="bar-row" key={m}><span>{m}</span><div className="track"><div className="fill" style={{ width: `${(n / maxMuscle) * 100}%` }} /></div><span className="n">{n}</span></div>
        ))}
      </div>

      <div className="section-title"><h2>Splits</h2></div>
      <div className="card">
        {splits.map(([m, n]) => (
          <div className="bar-row" key={m}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m}</span><div className="track"><div className="fill" style={{ width: `${(n / maxSplit) * 100}%` }} /></div><span className="n">{n}</span></div>
        ))}
      </div>

      <div className="section-title"><h2>Wochentage</h2></div>
      <div className="card"><BarChart bars={weekday} unit="Workouts" height={140} /></div>

      <div className="section-title"><h2>Längste Workouts</h2></div>
      <div className="card" style={{ padding: '4px 14px' }}>
        {[...inRange].filter((w) => w.durationSec).sort((a, b) => (b.durationSec ?? 0) - (a.durationSec ?? 0)).slice(0, 5).map((w) => (
          <button className="list-row" style={{ width: '100%', textAlign: 'left' }} key={w.id} onClick={() => nav.push({ kind: 'workout', id: w.id })}>
            <div className="grow">{w.name}<div className="faint" style={{ fontSize: 13 }}>{dateLabel(w.startedAt)}</div></div>
            <span className="num muted">{durationLabel(w.durationSec)}</span>
            <span className="chev"><Icon.chevron /></span>
          </button>
        ))}
      </div>

      <div className="section-title"><h2>Größtes Volumen</h2></div>
      <div className="card" style={{ padding: '4px 14px' }}>
        {[...inRange].sort((a, b) => workoutVolume(b) - workoutVolume(a)).slice(0, 5).map((w) => (
          <button className="list-row" style={{ width: '100%', textAlign: 'left' }} key={w.id} onClick={() => nav.push({ kind: 'workout', id: w.id })}>
            <div className="grow">{w.name}<div className="faint" style={{ fontSize: 13 }}>{dateLabel(w.startedAt)}</div></div>
            <span className="num muted">{fmtInt(workoutVolume(w))} kg</span>
            <span className="chev"><Icon.chevron /></span>
          </button>
        ))}
      </div>
      <button className="btn btn-ghost btn-block" style={{ marginTop: 14 }} onClick={() => nav.push({ kind: 'history' })}>Gesamten Verlauf ansehen</button>
    </div>
  )
}

function Kpi({ label, value, unit, sub, small }: { label: string; value: string; unit?: string; sub?: string; small?: boolean }) {
  return (
    <div className="card kpi" style={small ? { padding: 12 } : undefined}>
      <div className="label">{label}</div>
      <div className="value" style={small ? { fontSize: 20 } : undefined}>{value}{unit && <small>{unit}</small>}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}
