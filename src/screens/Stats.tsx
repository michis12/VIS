import { dec, t as tr } from '../i18n'
import { useMemo, useState } from 'react'
import { BarChart, LineChart } from '../components/charts'
import { MuscleMap } from '../components/MuscleMap'
import { PhaseList } from '../components/PhaseScores'
import { ScoreGauge } from '../components/ScoreGauge'
import { pastWeekScores } from '../weekly'
import { Icon, ProgressBadges } from '../components/ui'
import { WeeklyReport } from '../components/WeeklyReport'
import { useNav } from '../nav'
import { Num } from '../anim'
import { dateLabel, dayShort, durationLabel, e1rm, fmtInt, fmtKg, isRealSet, monthLabel, shortDate, weekKey, workoutSetCount, workoutVolume } from '../lib'
import { muscleLabel } from '../muscles'
import { kcalTarget } from '../nutrition'
import { useStore } from '../store'

const RANGES = [
  { id: '3m', get label() { return tr('3 Monate', '3 months') }, get short() { return tr('3 Monate', '3 months') }, days: 91 },
  { id: '6m', get label() { return tr('6 Monate', '6 months') }, get short() { return tr('6 Monate', '6 months') }, days: 182 },
  { id: '1y', get label() { return tr('1 Jahr', '1 year') }, get short() { return tr('1 Jahr', '1 year') }, days: 365 },
  { id: 'all', get label() { return tr('Alles', 'All') }, get short() { return tr('Gesamt', 'All time') }, days: 99999 },
] as const

export function Stats() {
  const { workouts, exerciseById, exercises, progress, weights, phases, workoutScores, foodLog } = useStore()
  const nav = useNav()
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('6m')
  const R = RANGES.find((r) => r.id === range)!
  const days = R.days
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)

  const done = useMemo(() => workouts.filter((w) => w.status === 'done'), [workouts])
  const inRange = useMemo(() => done.filter((w) => w.startedAt.slice(0, 10) >= since), [done, since])

  // the range's charts: one bar per week, per month for more than ~6 months
  const start = useMemo(() => {
    // never before the first workout or food entry (with no data at all: today)
    const firsts = [done[0]?.startedAt.slice(0, 10), foodLog.reduce<string | undefined>((m, e) => (!m || e.date < m ? e.date : m), undefined)].filter(Boolean) as string[]
    const first = firsts.length ? firsts.sort()[0] : new Date().toISOString().slice(0, 10)
    return first > since ? first : since
  }, [done, foodLog, since])
  const monthly = (Date.now() - new Date(start + 'T12:00:00').getTime()) / 864e5 > 200
  const per = monthly ? tr('Monat', 'month') : tr('Woche', 'week')
  const bucketOf = useMemo(() => (iso: string) => (monthly ? iso.slice(0, 7) : weekKey(iso)), [monthly])
  const buckets = useMemo(() => {
    const out: { key: string; label: string }[] = []
    const end = new Date()
    if (monthly) {
      const d = new Date(start.slice(0, 7) + '-01T12:00:00')
      while (d <= end) {
        out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: monthLabel(d) })
        d.setMonth(d.getMonth() + 1)
      }
    } else {
      const d = new Date(weekKey(start) + 'T12:00:00')
      while (d <= end) {
        const key = weekKey(d.toISOString())
        out.push({ key, label: shortDate(key) })
        d.setDate(d.getDate() + 7)
      }
    }
    return out
  }, [monthly, start])

  // average weekly score / workout score over the chosen range (finished weeks only)
  const avg = useMemo(() => {
    const first = done[0]?.startedAt.slice(0, 10)
    if (!first) return { weeks: 0, week: 0, workout: 0, best: 0, bestStart: '' }
    const fromDate = since > first ? since : first
    const n = Math.max(0, Math.floor((Date.now() - new Date(fromDate + 'T12:00:00').getTime()) / (7 * 864e5)))
    const list = pastWeekScores(workouts, progress.byId, weights, phases, Math.min(n, 400))
    const best = list.reduce((b, s) => (s.score > b.score ? s : b), list[0] ?? { score: 0, start: '' })
    const ws = inRange.map((w) => workoutScores.get(w.id) ?? 0).filter((s) => s > 0)
    return {
      weeks: list.length,
      week: list.length ? Math.round(list.reduce((s, x) => s + x.score, 0) / list.length) : 0,
      workout: ws.length ? Math.round(ws.reduce((a, b) => a + b, 0) / ws.length) : 0,
      best: best?.score ?? 0,
      bestStart: best?.start ?? '',
    }
  }, [done, since, workouts, progress, weights, phases, inRange, workoutScores])

  const k = useMemo(() => {
    const sets = inRange.reduce((n, w) => n + workoutSetCount(w), 0)
    const vol = inRange.reduce((n, w) => n + workoutVolume(w), 0)
    const durs = inRange.map((w) => w.durationSec).filter((d): d is number => d != null)
    const first = inRange[0]?.startedAt
    const weeks = first ? Math.max(1, (Date.now() - new Date(first).getTime()) / (7 * 864e5)) : 1
    // training days and the longest run of weeks with at least one workout, both inside the range
    const dayCount = new Set(inRange.map((w) => w.startedAt.slice(0, 10))).size
    const wk = new Set(inRange.map((w) => weekKey(w.startedAt)))
    let streak = 0, run = 0
    for (const d = new Date(weekKey(start) + 'T12:00:00'); d <= new Date(); d.setDate(d.getDate() + 7)) {
      run = wk.has(weekKey(d.toISOString())) ? run + 1 : 0
      streak = Math.max(streak, run)
    }
    const skipped = workouts.filter((w) => w.status === 'skipped' && w.startedAt.slice(0, 10) >= since).length
    return { n: inRange.length, sets, vol, avgDur: durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null, perWeek: inRange.length / weeks, dayCount, streak, skipped }
  }, [inRange, workouts, since, start])

  const weekly = useMemo(() => {
    const map = new Map<string, { count: number; vol: number }>()
    for (const w of inRange) {
      const key = bucketOf(w.startedAt)
      const m = map.get(key) ?? { count: 0, vol: 0 }
      m.count++
      m.vol += workoutVolume(w)
      map.set(key, m)
    }
    return buckets.map((b) => ({ ...b, ...(map.get(b.key) ?? { count: 0, vol: 0 }) }))
  }, [inRange, buckets, bucketOf])

  // calories in the range: average per logged day, per week / month, against the phase target
  const kcal = useMemo(() => {
    const perDay = new Map<string, number>()
    for (const e of foodLog) if (e.date >= start) perDay.set(e.date, (perDay.get(e.date) ?? 0) + e.kcal)
    const acc = new Map<string, { sum: number; n: number; tgt: number; tn: number }>()
    let sum = 0, tgt = 0, tn = 0, logged = 0
    for (const [d, v] of perDay) {
      if (v <= 0) continue
      logged++
      sum += v
      const a = acc.get(bucketOf(d)) ?? { sum: 0, n: 0, tgt: 0, tn: 0 }
      a.sum += v; a.n++
      const tg = kcalTarget(phases, d)
      if (tg) { a.tgt += tg; a.tn++; tgt += tg; tn++ }
      acc.set(bucketOf(d), a)
    }
    const total = Math.max(1, Math.round((Date.now() - new Date(start + 'T12:00:00').getTime()) / 864e5) + 1)
    return {
      logged, total, avg: logged ? sum / logged : 0, target: tn ? tgt / tn : null,
      bars: buckets.map((b) => {
        const a = acc.get(b.key)
        return { label: b.label, value: a ? a.sum / a.n : 0, tip: a ? `${b.label}: ${tr('Ø', 'avg')} ${fmtInt(a.sum / a.n)} kcal${a.tn ? ` · ${tr('Ziel', 'target')} ${fmtInt(a.tgt / a.tn)}` : ''} · ${a.n} ${tr('Tage', 'days')}` : `${b.label}: ${tr('nichts erfasst', 'nothing logged')}` }
      }),
    }
  }, [foodLog, phases, start, buckets, bucketOf])

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
    return c.map((v, i) => ({ label: dayShort((i + 1) % 7), value: v }))
  }, [inRange])

  const heat = useMemo(() => {
    const per = new Map<string, number>()
    for (const w of inRange) per.set(w.startedAt.slice(0, 10), (per.get(w.startedAt.slice(0, 10)) ?? 0) + workoutSetCount(w))
    const cells: { date: string; lvl: number }[] = []
    const end = new Date()
    for (let d = new Date(weekKey(start) + 'T12:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const s = per.get(key) ?? 0
      cells.push({ date: key, lvl: s === 0 ? 0 : s < 12 ? 1 : s < 20 ? 2 : 3 })
    }
    return cells
  }, [inRange, start])

  // exercise deep dive: independent of the range, whole history, most used first
  const ranked = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of done) for (const e of w.exercises) m.set(e.exerciseId, (m.get(e.exerciseId) ?? 0) + e.sets.length)
    return exercises.filter((e) => m.has(e.id)).sort((a, b) => (m.get(b.id) ?? 0) - (m.get(a.id) ?? 0))
  }, [done, exercises])
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
    const change = series.length > 1 ? ((series[series.length - 1].y - series[0].y) / series[0].y) * 100 : null
    return { series, volSeries, best, heaviest, mostReps, sets, change, repPR: [...repPR.entries()].sort((a, b) => a[0] - b[0]), sessions: series.length }
  }, [ex, done])

  // records & progress in the selected range
  const [pmode, setPmode] = useState<'both' | 'pr' | 'up'>('both')
  const prog = useMemo(() => {
    let prs = 0, ups = 0
    let best: { w: (typeof inRange)[number]; n: number } | null = null
    const perEx = new Map<string, { prs: number; ups: number }>()
    const perWeek = new Map<string, { prs: number; ups: number }>()
    for (const w of inRange) {
      const r = progress.byId.get(w.id)
      if (!r) continue
      prs += r.prs
      ups += r.ups
      const n = r.prs * 2 + r.ups
      if (n > 0 && (!best || n > best.n)) best = { w, n }
      const wk = bucketOf(w.startedAt)
      const pw = perWeek.get(wk) ?? { prs: 0, ups: 0 }
      pw.prs += r.prs; pw.ups += r.ups
      perWeek.set(wk, pw)
      w.exercises.forEach((e, i) => {
        const x = r.exercises[i]
        if (!x || (!x.prs && !x.ups)) return
        const pe = perEx.get(e.exerciseId) ?? { prs: 0, ups: 0 }
        pe.prs += x.prs; pe.ups += x.ups
        perEx.set(e.exerciseId, pe)
      })
    }
    const top = [...perEx.entries()].sort((a, b) => b[1].prs * 2 + b[1].ups - (a[1].prs * 2 + a[1].ups)).slice(0, 5)
    return { prs, ups, best, top, perWeek, per: inRange.length ? (prs + ups) / inRange.length : 0 }
  }, [inRange, progress, bucketOf])

  const maxMuscle = Math.max(1, ...muscles.map((m) => m[1]))
  const maxSplit = Math.max(1, ...splits.map((m) => m[1]))

  return (
    <div className="screen">
      <div className="eyebrow">{tr('Fortschritt', 'Progress')}</div>
      <h1 className="title">{tr('Statistik', 'Stats')}</h1>

      <WeeklyReport />

      <div className="section-title"><h2>{tr('Muskeln diese Woche', 'Muscles this week')}</h2></div>
      <MuscleMap />
      <div style={{ height: 22 }} />

      {/* everything in this section follows the range; the bar sticks only while the section is on screen */}
      <section className="range-sec">
        <div className="range-bar">
          <div className="range-bar-head">
            <span className="range-dot" />
            <span>{tr('Zeitraum', 'Range')}</span>
            <span className="faint">{tr('· gilt für diesen Bereich', '· applies to this section')}</span>
          </div>
          <div className="chips">
            {RANGES.map((r) => <button key={r.id} className={'chip' + (r.id === range ? ' on' : '')} onClick={() => setRange(r.id)}>{r.label}</button>)}
          </div>
        </div>

        {avg.weeks > 0 && (
          <div className="card avg-score" style={{ marginTop: 14 }}>
            <ScoreGauge score={avg.week} size={112} label={tr('Ø Woche', 'Avg week')} />
            <div className="avg-score-side">
              <div><span className="faint">{tr('Ø Workout-Score', 'Avg workout score')}</span><b className="num">{avg.workout}</b></div>
              <div><span className="faint">{tr('Beste Woche', 'Best week')}</span><b className="num">{avg.best}</b></div>
              <div className="faint" style={{ fontSize: 11 }}>{avg.bestStart ? `${tr('ab', 'from')} ${shortDate(avg.bestStart)} · ` : ''}{avg.weeks} {tr('Wochen ausgewertet', 'weeks rated')}</div>
            </div>
          </div>
        )}

        <div className="grid-2" style={{ marginTop: 14 }}>
          <Kpi label="Workouts" value={k.n} sub={`${dec(k.perWeek, 1)} ${tr('pro Woche', 'per week')}`} />
          <Kpi label={tr('Trainingstage', 'Training days')} value={k.dayCount} sub={tr(`längste Serie ${k.streak} Wo.`, `longest streak ${k.streak} wk`)} />
          <Kpi label={tr('Volumen', 'Volume')} value={k.vol / 1000} unit="t" sub={`${fmtInt(k.sets)} ${tr('Sätze', 'sets')}`} />
          <Kpi label={tr('Ø Dauer', 'Avg duration')} value={k.avgDur ? k.avgDur / 60 : '–'} unit="min" sub={k.skipped ? `${k.skipped}× ${tr('ausgelassen', 'skipped')}` : tr('pro Workout', 'per workout')} />
        </div>

        <RangeTitle title={tr('Trainingstage', 'Training days')} range={R.short} />
        <div className="card">
          {/* keyed by range: a new range starts scrolled to the newest week again */}
          <div className="heat" key={range}>
            {[...heat].reverse().map((c) => <div key={c.date} className={c.lvl ? 'l' + c.lvl : ''} title={`${dateLabel(c.date)}`} />)}
          </div>
          <div className="legend" style={{ justifyContent: 'flex-end' }}>
            <span>{tr('weniger', 'less')}</span>
            <span className="heat" style={{ display: 'flex', gap: 3, direction: 'ltr' }}><div /><div className="l1" /><div className="l2" /><div className="l3" /></span>
            <span>{tr('mehr Sätze', 'more sets')}</span>
          </div>
        </div>

        <RangeTitle title={tr(`Workouts pro ${per}`, `Workouts per ${per}`)} range={R.short} />
        <div className="card"><BarChart bars={weekly.map((w) => ({ label: w.label, value: w.count, tip: monthly ? w.label : tr(`Woche ab ${w.label}`, `Week of ${w.label}`) }))} unit="Workouts" /></div>

        <RangeTitle title={tr(`Volumen pro ${per}`, `Volume per ${per}`)} range={R.short} />
        <div className="card"><BarChart bars={weekly.map((w) => ({ label: w.label, value: w.vol / 1000, tip: monthly ? w.label : tr(`Woche ab ${w.label}`, `Week of ${w.label}`) }))} yFmt={(v) => (v < 10 ? dec(v, 1) : String(Math.round(v)))} unit="t" /></div>

        {kcal.logged > 0 && (
          <>
            <RangeTitle title={tr(`Kalorien pro ${per}`, `Calories per ${per}`)} range={R.short} />
            <div className="card">
              <BarChart bars={kcal.bars} yFmt={(v) => fmtInt(v)} unit={tr('kcal / Tag', 'kcal / day')} />
              <div className="pr-row num"><span className="muted">{tr('Ø pro erfasstem Tag', 'Avg per logged day')}</span><b>{fmtInt(kcal.avg)} kcal</b></div>
              {kcal.target != null && <div className="pr-row num"><span className="muted">{tr('Ø Ziel der Phase', 'Avg phase target')}</span><b>{fmtInt(kcal.target)} kcal</b></div>}
              <div className="pr-row num"><span className="muted">{tr('Erfasste Tage', 'Logged days')}</span><b>{kcal.logged} {tr('von', 'of')} {kcal.total}</b></div>
            </div>
          </>
        )}

        <RangeTitle title={tr('Fortschritt & Rekorde', 'Progress & records')} range={R.short} />
        <div className="grid-3">
          <Kpi label={tr('Rekorde', 'Records')} value={prog.prs} small />
          <Kpi label={tr('Fortschritte', 'Progress')} value={prog.ups} small />
          <Kpi label={tr('Pro Workout', 'Per workout')} value={prog.per} fmt={(v) => dec(v, 1)} sub={tr('Rek. + Fort.', 'Rec. + prog.')} small />
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          <div className="segmented" style={{ marginBottom: 10 }}>
            <button className={pmode === 'both' ? 'on' : ''} onClick={() => setPmode('both')}>{tr('Beides', 'Both')}</button>
            <button className={pmode === 'pr' ? 'on' : ''} onClick={() => setPmode('pr')}>{tr('Rekorde', 'Records')}</button>
            <button className={pmode === 'up' ? 'on' : ''} onClick={() => setPmode('up')}>{tr('Fortschritte', 'Progress')}</button>
          </div>
          <BarChart
            bars={weekly.map((w) => {
              const p = prog.perWeek.get(w.key) ?? { prs: 0, ups: 0 }
              return { label: w.label, value: pmode === 'pr' ? p.prs : pmode === 'up' ? p.ups : p.prs + p.ups, tip: monthly ? w.label : tr(`Woche ab ${w.label}`, `Week of ${w.label}`) }
            })}
            unit={pmode === 'pr' ? tr('Rekorde', 'Records') : pmode === 'up' ? tr('Fortschritte', 'Progress') : tr('Rek. + Fort.', 'Rec. + prog.')}
          />
        </div>
        {prog.top.length > 0 && (
          <div className="card" style={{ marginTop: 12, padding: '4px 14px' }}>
            <div className="eyebrow" style={{ padding: '10px 0 2px' }}>{tr('Am meisten verbessert', 'Most improved')}</div>
            {prog.top.map(([id, p]) => (
              <button key={id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav.push({ kind: 'exercise', id })}>
                <div className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exerciseById.get(id)?.name ?? id}</div>
                <ProgressBadges ups={p.ups} prs={p.prs} />
                <span className="chev"><Icon.chevron /></span>
              </button>
            ))}
          </div>
        )}
        {prog.best && (
          <button className="card list-row" style={{ width: '100%', textAlign: 'left', marginTop: 12, padding: '12px 14px' }} onClick={() => nav.push({ kind: 'workout', id: prog.best!.w.id })}>
            <div className="grow">
              <div className="faint" style={{ fontSize: 12 }}>{tr('Stärkstes Workout', 'Strongest workout')}</div>
              <div style={{ fontWeight: 600 }}>{prog.best.w.name} <span className="faint" style={{ fontWeight: 400, fontSize: 13 }}>· {dateLabel(prog.best.w.startedAt)}</span></div>
            </div>
            <ProgressBadges ups={progress.byId.get(prog.best.w.id)?.ups ?? 0} prs={progress.byId.get(prog.best.w.id)?.prs ?? 0} />
            <span className="chev"><Icon.chevron /></span>
          </button>
        )}

        <RangeTitle title={tr('Sätze pro Muskelgruppe', 'Sets per muscle group')} range={R.short} />
        <div className="card">
          {muscles.map(([m, n]) => (
            <div className="bar-row" key={m}><span>{muscleLabel(m)}</span><div className="track"><div className="fill" style={{ width: `${(n / maxMuscle) * 100}%` }} /></div><span className="n">{n}</span></div>
          ))}
        </div>

        <RangeTitle title="Splits" range={R.short} />
        <div className="card">
          {splits.map(([m, n]) => (
            <div className="bar-row" key={m}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m}</span><div className="track"><div className="fill" style={{ width: `${(n / maxSplit) * 100}%` }} /></div><span className="n">{n}</span></div>
          ))}
        </div>

        <RangeTitle title={tr('Wochentage', 'Weekdays')} range={R.short} />
        <div className="card"><BarChart bars={weekday} unit="Workouts" height={140} /></div>

        <RangeTitle title={tr('Längste Workouts', 'Longest workouts')} range={R.short} />
        <div className="card" style={{ padding: '4px 14px' }}>
          {[...inRange].filter((w) => w.durationSec).sort((a, b) => (b.durationSec ?? 0) - (a.durationSec ?? 0)).slice(0, 5).map((w) => (
            <button className="list-row" style={{ width: '100%', textAlign: 'left' }} key={w.id} onClick={() => nav.push({ kind: 'workout', id: w.id })}>
              <div className="grow">{w.name}<div className="faint" style={{ fontSize: 13 }}>{dateLabel(w.startedAt)}</div></div>
              <span className="num muted">{durationLabel(w.durationSec)}</span>
              <span className="chev"><Icon.chevron /></span>
            </button>
          ))}
        </div>

        <RangeTitle title={tr('Größtes Volumen', 'Biggest volume')} range={R.short} />
        <div className="card" style={{ padding: '4px 14px' }}>
          {[...inRange].sort((a, b) => workoutVolume(b) - workoutVolume(a)).slice(0, 5).map((w) => (
            <button className="list-row" style={{ width: '100%', textAlign: 'left' }} key={w.id} onClick={() => nav.push({ kind: 'workout', id: w.id })}>
              <div className="grow">{w.name}<div className="faint" style={{ fontSize: 13 }}>{dateLabel(w.startedAt)}</div></div>
              <span className="num muted">{fmtInt(workoutVolume(w))} kg</span>
              <span className="chev"><Icon.chevron /></span>
            </button>
          ))}
        </div>
      </section>

      {/* not affected by the range */}
      <div className="range-end"><span>{tr('Unabhängig vom Zeitraum', 'Independent of the range')}</span></div>

      <PhaseList />

      <div className="section-title"><h2>{tr('Übung im Detail', 'Exercise in detail')}</h2><span className="faint" style={{ fontSize: 13 }}>{tr('gesamter Verlauf', 'whole history')}</span></div>
      <div className="chips">
        {ranked.slice(0, 40).map((e) => <button key={e.id} className={'chip' + (e.id === ex ? ' on' : '')} onClick={() => setExId(e.id)}>{e.name}</button>)}
      </div>
      {exStats && (
        <>
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div>
                <div className="faint" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' }}>{tr('Geschätztes 1RM', 'Estimated 1RM')}</div>
                <div style={{ fontSize: 26, fontWeight: 700 }} className="num">{fmtKg(Math.round(exStats.best.e * 10) / 10)} <span className="muted" style={{ fontSize: 14 }}>{tr('kg Bestwert', 'kg best')}</span></div>
              </div>
              {exStats.change != null && (
                <div className="num" style={{ fontWeight: 650, color: exStats.change >= 0 ? 'var(--good)' : 'var(--danger)' }}>
                  {exStats.change >= 0 ? '▲' : '▼'} {dec(Math.abs(exStats.change), 1)} %
                </div>
              )}
            </div>
            <LineChart points={exStats.series} yFmt={(v) => String(Math.round(v))} unit="kg e1RM" dots />
          </div>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => ex && nav.push({ kind: 'exercise', id: ex })}>
            {tr('Komplette Übersicht & Verlauf', 'Full overview & history')} <Icon.chevron />
          </button>
          <div className="grid-3" style={{ marginTop: 12 }}>
            <Kpi label={tr('Schwerster', 'Heaviest')} value={fmtKg(exStats.heaviest.w)} unit="kg" sub={`× ${exStats.heaviest.r} ${tr('Wdh', 'reps')}`} small />
            <Kpi label={tr('Meiste Wdh', 'Most reps')} value={String(exStats.mostReps.r)} sub={`${tr('bei', 'at')} ${fmtKg(exStats.mostReps.w)} kg`} small />
            <Kpi label={tr('Sätze', 'Sets')} value={fmtInt(exStats.sets)} sub={`${exStats.sessions} ${tr('Einheiten', 'sessions')}`} small />
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="faint" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>{tr('Volumen pro Einheit', 'Volume per session')}</div>
            <LineChart points={exStats.volSeries} yFmt={(v) => fmtInt(v)} unit="kg" />
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="faint" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>{tr('Rekorde nach Wiederholungen', 'Records by reps')}</div>
            {exStats.repPR.map(([r, p]) => (
              <div className="pr-row num" key={r}><span className="muted">{r} {tr('Wdh', 'reps')}</span><span><b>{fmtKg(p.w)} kg</b> <span className="faint">· {shortDate(p.date)} {p.date.slice(2, 4)}</span></span></div>
            ))}
          </div>
        </>
      )}

      <button className="btn btn-ghost btn-block" style={{ marginTop: 22 }} onClick={() => nav.push({ kind: 'history' })}>{tr('Gesamten Verlauf ansehen', 'See full history')}</button>
    </div>
  )
}

/** section title inside the range section, tagged with the range it shows */
function RangeTitle({ title, range }: { title: string; range: string }) {
  return <div className="section-title"><h2>{title}</h2><span className="range-tag">{range}</span></div>
}

function Kpi({ label, value, unit, sub, small, fmt = fmtInt }: { label: string; value: string | number; unit?: string; sub?: string; small?: boolean; fmt?: (v: number) => string }) {
  return (
    <div className="card kpi" style={small ? { padding: 12 } : undefined}>
      <div className="label">{label}</div>
      <div className="value" style={small ? { fontSize: 20 } : undefined}>{typeof value === 'number' ? <Num value={value} format={fmt} /> : value}{unit && <small>{unit}</small>}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}
