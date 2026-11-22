import { useMemo, useState } from 'react'
import { LineChart } from '../components/charts'
import { MuscleFigures } from '../components/MuscleMap'
import { Icon, SetMark } from '../components/ui'
import { dateLabel, e1rm, fmtInt, fmtKg, isRealSet } from '../lib'
import { musclesFor } from '../muscles'
import { useNav } from '../nav'
import { useStore } from '../store'
import type { SetEntry } from '../types'

type Session = {
  workoutId: string
  workoutName: string
  date: string
  sets: SetEntry[]
  flags: ('up' | 'pr' | null)[]
  maxW: number
  bestE: number
  vol: number
}
type Rec = { label: string; value: string; sub: string; date: string; workoutId: string }

const CHARTS = [
  { id: 'w', label: 'Gewicht' },
  { id: 'e', label: '1RM' },
  { id: 'v', label: 'Volumen' },
] as const

const PAGE = 15

export function ExerciseDetail({ id }: { id: string }) {
  const { workouts, exerciseById, progress } = useStore()
  const nav = useNav()
  const ex = exerciseById.get(id)
  const [chart, setChart] = useState<(typeof CHARTS)[number]['id']>('w')
  const [shown, setShown] = useState(PAGE)

  const sessions = useMemo(() => {
    const out: Session[] = []
    for (const w of workouts) {
      if (w.status !== 'done') continue
      w.exercises.forEach((e, i) => {
        if (e.exerciseId !== id || e.skipped) return
        const real = e.sets.filter(isRealSet)
        if (!real.length) return
        const flags = progress.byId.get(w.id)?.exercises[i]?.flags ?? []
        out.push({
          workoutId: w.id,
          workoutName: w.name,
          date: w.startedAt,
          sets: e.sets,
          flags: e.sets.map((s, j) => (isRealSet(s) ? flags[j] ?? null : null)),
          maxW: Math.max(...real.map((s) => s.weight ?? 0)),
          bestE: Math.max(...real.map((s) => e1rm(s.weight ?? 0, s.reps ?? 0))),
          vol: real.reduce((n, s) => n + (s.weight ?? 0) * (s.reps ?? 0), 0),
        })
      })
    }
    return out
  }, [workouts, progress, id])

  const stats = useMemo(() => {
    let sets = 0, reps = 0, prs = 0, ups = 0
    let heavy = { w: 0, r: 0, s: null as Session | null }
    let best = { e: 0, w: 0, r: 0, s: null as Session | null }
    let most = { w: 0, r: 0, s: null as Session | null }
    let setVol = { v: 0, w: 0, r: 0, s: null as Session | null }
    let sessVol = { v: 0, s: null as Session | null }
    const repPR = new Map<number, { w: number; s: Session }>()
    for (const s of sessions) {
      for (const [j, x] of s.sets.entries()) {
        if (!isRealSet(x)) continue
        const w = x.weight ?? 0, r = x.reps ?? 0
        sets++; reps += r
        if (s.flags[j] === 'pr') prs++
        if (s.flags[j] === 'up') ups++
        if (w > heavy.w || (w === heavy.w && r > heavy.r)) heavy = { w, r, s }
        const est = e1rm(w, r)
        if (est > best.e) best = { e: est, w, r, s }
        if (r > most.r || (r === most.r && w > most.w)) most = { w, r, s }
        if (w * r > setVol.v) setVol = { v: w * r, w, r, s }
        if (r <= 12) { const p = repPR.get(r); if (!p || w > p.w) repPR.set(r, { w, s }) }
      }
      if (s.vol > sessVol.v) sessVol = { v: s.vol, s }
    }
    const recs: Rec[] = []
    const add = (label: string, value: string, sub: string, s: Session | null) => s && recs.push({ label, value, sub, date: s.date, workoutId: s.workoutId })
    add('Schwerstes Gewicht', `${fmtKg(heavy.w)} kg`, `× ${heavy.r} Wdh`, heavy.s)
    add('Bestes 1RM (geschätzt)', `${fmtKg(Math.round(best.e * 10) / 10)} kg`, `${fmtKg(best.w)} × ${best.r}`, best.s)
    add('Meiste Wiederholungen', `${most.r} Wdh`, `bei ${fmtKg(most.w)} kg`, most.s)
    add('Bester Satz (Volumen)', `${fmtInt(setVol.v)} kg`, `${fmtKg(setVol.w)} × ${setVol.r}`, setVol.s)
    add('Beste Einheit (Volumen)', `${fmtInt(sessVol.v)} kg`, 'gesamt', sessVol.s)
    return { sets, reps, prs, ups, recs, best, repPR: [...repPR.entries()].sort((a, b) => a[0] - b[0]) }
  }, [sessions])

  const points = useMemo(
    () => sessions.map((s) => ({
      x: new Date(s.date).getTime(),
      y: chart === 'w' ? s.maxW : chart === 'e' ? s.bestE : s.vol,
      note: s.workoutName,
    })),
    [sessions, chart],
  )
  const change = points.length > 1 && points[0].y ? ((points[points.length - 1].y - points[0].y) / points[0].y) * 100 : null

  const m = musclesFor(ex)
  const fill = (g: string) =>
    g === m.primary ? 'rgba(238,238,242,.92)' : m.secondary.includes(g) ? 'rgba(238,238,242,.38)' : 'rgba(255,255,255,0.06)'

  const recent = [...sessions].reverse()

  // plateau: recent sessions in a row without progress or record
  const plateau = useMemo(() => {
    let n = 0
    for (let i = sessions.length - 1; i >= 0; i--) {
      if (sessions[i].flags.some((f) => f)) break
      n++
    }
    const last = sessions[sessions.length - 1]
    const fresh = last && Date.now() - new Date(last.date).getTime() < 45 * 864e5
    return n >= 6 && fresh ? n : 0
  }, [sessions])

  return (
    <div className="screen no-tabs">
      <div className="wo-head">
        <button className="icon-btn" onClick={nav.pop} aria-label="Zurück"><Icon.back /></button>
        <div className="grow">
          <div className="name">{ex?.name ?? id}</div>
          <div className="wo-timer">{ex?.muscle} · {sessions.length} Einheiten</div>
        </div>
      </div>

      {!sessions.length ? (
        <div className="card faint" style={{ marginTop: 18, textAlign: 'center', padding: 28 }}>Noch keine Sätze zu dieser Übung</div>
      ) : (
        <>
          <div className="grid-3" style={{ marginTop: 18 }}>
            <div className="card kpi" style={{ padding: 12 }}><div className="label">Bestes 1RM</div><div className="value" style={{ fontSize: 20 }}>{fmtKg(Math.round(stats.best.e))}<small>kg</small></div></div>
            <div className="card kpi" style={{ padding: 12 }}><div className="label">Sätze</div><div className="value" style={{ fontSize: 20 }}>{fmtInt(stats.sets)}</div><div className="sub">{fmtInt(stats.reps)} Wdh</div></div>
            <div className="card kpi" style={{ padding: 12 }}>
              <div className="label">Rekorde</div>
              <div className="value" style={{ fontSize: 20 }}>{stats.prs}</div>
              <div className="sub" style={{ color: stats.ups ? 'var(--good)' : undefined }}>{stats.ups} Fortschritte</div>
            </div>
          </div>

          {plateau > 0 && (
            <div className="hint">
              <span>Seit <b>{plateau} Einheiten</b> kein Fortschritt – Wdh-Bereich wechseln oder 1 Woche leichter trainieren.</span>
            </div>
          )}

          <div className="section-title"><h2>Entwicklung</h2>
            {change != null && (
              <span className="num" style={{ fontSize: 13, fontWeight: 650, color: change >= 0 ? 'var(--good)' : 'var(--text-3)' }}>
                {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1).replace('.', ',')} % seit Beginn
              </span>
            )}
          </div>
          <div className="card">
            <div className="segmented" style={{ marginBottom: 10 }}>
              {CHARTS.map((c) => <button key={c.id} className={chart === c.id ? 'on' : ''} onClick={() => setChart(c.id)}>{c.label}</button>)}
            </div>
            <LineChart
              points={points}
              dots={points.length < 60}
              unit={chart === 'w' ? 'kg schwerster Satz' : chart === 'e' ? 'kg 1RM' : 'kg Volumen'}
              yFmt={(v) => (chart === 'v' ? fmtInt(v) : fmtKg(Math.round(v * 10) / 10))}
            />
          </div>

          <div className="section-title"><h2>Rekorde</h2></div>
          <div className="card" style={{ padding: '4px 14px' }}>
            {stats.recs.map((r) => (
              <button key={r.label} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav.push({ kind: 'workout', id: r.workoutId })}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{r.label}</div>
                  <div className="faint" style={{ fontSize: 13 }}>{dateLabel(r.date)}</div>
                </div>
                <div className="num" style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>{r.value}</div>
                  <div className="faint" style={{ fontSize: 12 }}>{r.sub}</div>
                </div>
              </button>
            ))}
          </div>
          {stats.repPR.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Bestes Gewicht nach Wiederholungen</div>
              {stats.repPR.map(([r, p]) => (
                <div className="pr-row num" key={r}><span className="muted">{r} Wdh</span><span><b>{fmtKg(p.w)} kg</b> <span className="faint">· {dateLabel(p.s.date)}</span></span></div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="section-title"><h2>Muskeln</h2></div>
      <div className="card mm">
        <MuscleFigures fill={fill} />
        <div className="ex-muscles">
          <span className="chip on">{m.primary}</span>
          {m.secondary.map((g) => <span key={g} className="chip">{g}</span>)}
        </div>
        <div className="faint" style={{ fontSize: 11, textAlign: 'center', marginTop: 8 }}>hell = Hauptmuskel · gedimmt = unterstützend</div>
      </div>

      {recent.length > 0 && (
        <>
          <div className="section-title"><h2>Verlauf</h2><span className="faint" style={{ fontSize: 13 }}>alle Sätze</span></div>
          {recent.slice(0, shown).map((s) => (
            <button key={s.workoutId + s.date} className="card ex-hist" onClick={() => nav.push({ kind: 'workout', id: s.workoutId })}>
              <div className="ex-hist-head">
                <span style={{ fontWeight: 650 }}>{dateLabel(s.date)}</span>
                <span className="faint" style={{ fontSize: 12 }}>{s.workoutName}</span>
              </div>
              {s.sets.map((x, j) => isRealSet(x) && (
                <div key={j} className="ex-hist-set num">
                  <span className="set-no sm">{j + 1}<SetMark flag={s.flags[j]} /></span>
                  <span><b>{fmtKg(x.weight ?? 0)}</b> kg × <b>{x.reps}</b></span>
                  <span className="faint">1RM {fmtKg(Math.round(e1rm(x.weight ?? 0, x.reps ?? 0)))}</span>
                </div>
              ))}
            </button>
          ))}
          {recent.length > shown && (
            <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => setShown((n) => n + PAGE * 2)}>
              Ältere laden ({recent.length - shown})
            </button>
          )}
        </>
      )}
    </div>
  )
}
