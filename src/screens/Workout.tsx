import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, ProgressBadges, SetMark, Sheet, Wheel } from '../components/ui'
import { clock, fmtKg, haptic, isRealSet, localIso, uid, workoutVolume, fmtInt } from '../lib'
import { rateWorkout } from '../progress'
import { loadRestEnd, restFinished, storeRestEnd, unlockAudio } from '../rest'
import { useStore } from '../store'
import type { SetEntry, Template, Workout } from '../types'

const KG = Array.from({ length: 601 }, (_, i) => i / 2)
const REPS = Array.from({ length: 51 }, (_, i) => i)

export function newWorkoutFromTemplate(t: Template | null): Workout {
  return {
    id: uid(),
    name: t?.name ?? 'Freies Training',
    templateId: t?.id,
    startedAt: localIso(),
    durationSec: null,
    status: 'active',
    source: 'app',
    exercises: (t?.exercises ?? []).map((e) => ({
      exerciseId: e.exerciseId,
      sets: Array.from({ length: Math.max(1, e.sets) }, () => ({ weight: null, reps: null, done: false })),
    })),
  }
}

function useNow(ms = 500) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

type Editing = { ex: number; set: number; focus: 'weight' | 'reps' }

export function WorkoutScreen({ workout, onClose, onFinished }: {
  workout: Workout
  onClose: (msg?: string) => void
  /** called after the workout was saved as done (shows the celebration) */
  onFinished: (id: string) => void
}) {
  const store = useStore()
  const { exerciseById, workouts, settings } = store
  const now = useNow()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [setMenu, setSetMenu] = useState<{ ex: number; set: number } | null>(null)
  const [woMenu, setWoMenu] = useState(false)
  const [exMenu, setExMenu] = useState<number | null>(null)
  const [finish, setFinish] = useState(false)
  const [picker, setPicker] = useState(false)
  const [restEnd, setRestEnd] = useState<number | null>(loadRestEnd)
  const [restDone, setRestDone] = useState(false)

  const w = workout
  const save = (next: Workout) => store.saveWorkout(next)

  /** previous sets per exercise from the most recent other finished workout */
  // live rating against all finished workouts
  const live = useMemo(() => rateWorkout(w, store.progress.state), [w, store.progress.state])
  const [prFlash, setPrFlash] = useState(false)
  const lastPrs = useRef(live.prs)
  const flashTimer = useRef<number>(0)
  useEffect(() => {
    if (live.prs > lastPrs.current) {
      haptic(true)
      setPrFlash(true)
      clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setPrFlash(false), 2200)
    }
    lastPrs.current = live.prs
  }, [live.prs])
  useEffect(() => () => clearTimeout(flashTimer.current), [])

  const prev = useMemo(() => {
    const map = new Map<string, SetEntry[]>()
    for (let i = workouts.length - 1; i >= 0; i--) {
      const o = workouts[i]
      if (o.id === w.id || o.status !== 'done') continue
      for (const e of o.exercises) {
        if (!map.has(e.exerciseId) && e.sets.some(isRealSet)) map.set(e.exerciseId, e.sets.filter(isRealSet))
      }
    }
    return map
  }, [workouts, w.id])

  // rest timer ticking + end signal
  const restLeft = restEnd ? Math.ceil((restEnd - now) / 1000) : 0
  useEffect(() => {
    if (restEnd && now >= restEnd) {
      setRestEnd(null)
      storeRestEnd(null)
      setRestDone(true)
      const next = w.exercises.find((e) => !e.skipped && e.sets.some((s) => !s.done))
      restFinished(next ? exerciseById.get(next.exerciseId)?.name : undefined)
      setTimeout(() => setRestDone(false), 4000)
    }
  }, [now, restEnd, w.exercises, exerciseById])

  const startRest = (sec = settings.restSec) => {
    const end = Date.now() + sec * 1000
    setRestEnd(end)
    storeRestEnd(end)
    setRestDone(false)
  }

  const updateSet = (ex: number, set: number, patch: Partial<SetEntry>) => {
    const exercises = w.exercises.map((e, i) =>
      i !== ex ? e : { ...e, sets: e.sets.map((s, j) => (j === set ? { ...s, ...patch } : s)) },
    )
    save({ ...w, exercises })
  }

  const complete = (ex: number, set: number, values?: { weight: number; reps: number }) => {
    unlockAudio()
    const e = w.exercises[ex]
    const s = e.sets[set]
    if (!values && s.done) {
      updateSet(ex, set, { done: false })
      return
    }
    const p = prev.get(e.exerciseId)?.[set]
    const weight = values?.weight ?? s.weight ?? p?.weight ?? null
    const reps = values?.reps ?? s.reps ?? p?.reps ?? null
    if (weight == null || reps == null) {
      setEditing({ ex, set, focus: weight == null ? 'weight' : 'reps' })
      return
    }
    haptic()
    const sets = e.sets.map((x, j) => {
      if (j === set) return { weight, reps, done: true }
      // suggest the next untouched set: same weight, two reps fewer
      if (j === set + 1 && !x.done && (x.weight == null || x.suggested))
        return { weight, reps: Math.max(1, reps - 2), done: false, suggested: true }
      return x
    })
    save({ ...w, exercises: w.exercises.map((x, i) => (i === ex ? { ...x, sets } : x)) })
    startRest()
  }

  const setSkipped = (ex: number, skipped: boolean) => {
    haptic()
    save({ ...w, exercises: w.exercises.map((x, i) => (i === ex ? { ...x, skipped: skipped || undefined } : x)) })
  }

  const removeExercise = (ex: number) => save({ ...w, exercises: w.exercises.filter((_, i) => i !== ex) })

  const addSet = (ex: number) => {
    haptic()
    const e = w.exercises[ex]
    const last = e.sets[e.sets.length - 1]
    const s: SetEntry =
      last && last.weight != null && last.reps != null
        ? { weight: last.weight, reps: Math.max(1, last.reps - 2), done: false, suggested: true }
        : { weight: null, reps: null, done: false }
    save({ ...w, exercises: w.exercises.map((x, i) => (i === ex ? { ...x, sets: [...x.sets, s] } : x)) })
  }

  const deleteSet = (ex: number, set: number) => {
    const exercises = w.exercises
      .map((e, i) => (i === ex ? { ...e, sets: e.sets.filter((_, j) => j !== set) } : e))
      .filter((e) => e.sets.length > 0)
    save({ ...w, exercises })
  }

  const elapsed = Math.floor((now - new Date(w.startedAt).getTime()) / 1000)
  const active = w.exercises.filter((e) => !e.skipped)
  const doneSets = active.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)
  const totalSets = active.reduce((n, e) => n + e.sets.length, 0)
  const skippedCount = w.exercises.length - active.length

  const finishWorkout = () => {
    // skipped exercises stay in the record (no values) so the history shows they were left out today
    const exercises = w.exercises
      .map((e) => e.skipped
        ? { exerciseId: e.exerciseId, skipped: true, sets: e.sets.map(() => ({ weight: null, reps: null, done: false })) }
        : { exerciseId: e.exerciseId, sets: e.sets.filter((s) => s.done).map(({ weight, reps, done }) => ({ weight, reps, done })) })
      .filter((e) => e.skipped || e.sets.length)
    const done: Workout = { ...w, exercises, status: 'done', durationSec: elapsed }
    haptic(true)
    save(done)
    storeRestEnd(null)
    onFinished(done.id)
  }

  const discard = () => {
    store.deleteWorkout(w.id)
    storeRestEnd(null)
    onClose('Workout verworfen')
  }

  const ed = editing && w.exercises[editing.ex]?.sets[editing.set] ? editing : null

  return (
    <div className="screen no-tabs">
      <div className="wo-head">
        <button className="icon-btn" onClick={() => onClose()} aria-label="Minimieren"><Icon.back /></button>
        <div className="grow">
          <div className="name">{w.name}</div>
          <div className="wo-timer" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span><b>{clock(elapsed)}</b> · {doneSets}/{totalSets} Sätze{skippedCount ? ` · ${skippedCount} ausgelassen` : ''}</span>
            <ProgressBadges ups={live.ups} prs={live.prs} />
          </div>
        </div>
        <button className="icon-btn" onClick={() => setWoMenu(true)} aria-label="Menü"><Icon.more /></button>
        <button className="btn btn-chrome btn-sm" onClick={() => setFinish(true)}>Beenden</button>
      </div>

      {w.exercises.map((e, ei) => {
        const ex = exerciseById.get(e.exerciseId)
        const p = prev.get(e.exerciseId)
        if (e.skipped) {
          return (
            <div className="card ex-card ex-skipped" key={ei}>
              <div className="ex-title">
                <div>
                  <div className="name">{ex?.name ?? e.exerciseId}</div>
                  <div className="muscle">Heute nicht trainiert · {e.sets.length} Sätze geplant</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setSkipped(ei, false)}>Doch trainieren</button>
              </div>
            </div>
          )
        }
        return (
          <div className="card ex-card" key={ei}>
            <div className="ex-title">
              <div>
                <div className="name">{ex?.name ?? e.exerciseId}</div>
                <div className="muscle">{ex?.muscle}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ProgressBadges ups={live.exercises[ei]?.ups ?? 0} prs={live.exercises[ei]?.prs ?? 0} />
                <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setExMenu(ei)} aria-label="Übungsmenü"><Icon.more /></button>
              </div>
            </div>
            <div className="set-head"><span>Satz</span><span>Vorher</span><span>kg</span><span>Wdh</span><span /></div>
            {e.sets.map((s, si) => {
              const ps = p?.[si]
              return (
                <div className={'set-row' + (s.done ? ' done' : '')} key={si}>
                  <button className="set-no" onClick={() => setSetMenu({ ex: ei, set: si })}>
                    {si + 1}
                    <SetMark flag={live.exercises[ei]?.flags[si]} />
                  </button>
                  <button
                    className="prev"
                    disabled={!ps}
                    onClick={() => { if (!ps) return; haptic(); updateSet(ei, si, { weight: ps.weight, reps: ps.reps, suggested: false }) }}
                  >
                    {ps ? `${fmtKg(ps.weight ?? 0)} × ${ps.reps}` : '–'}
                  </button>
                  <button
                    className={'val' + (s.weight == null ? ' empty' : s.suggested ? ' suggested' : '')}
                    onClick={() => setEditing({ ex: ei, set: si, focus: 'weight' })}
                  >
                    {s.weight != null ? fmtKg(s.weight) : ps ? fmtKg(ps.weight ?? 0) : 'kg'}
                  </button>
                  <button
                    className={'val' + (s.reps == null ? ' empty' : s.suggested ? ' suggested' : '')}
                    onClick={() => setEditing({ ex: ei, set: si, focus: 'reps' })}
                  >
                    {s.reps != null ? s.reps : ps ? ps.reps : 'Wdh'}
                  </button>
                  <button className={'check' + (s.done ? ' on' : '')} onClick={() => complete(ei, si)} aria-label="Satz bestätigen">
                    <Icon.check />
                  </button>
                </div>
              )
            })}
            <button className="add-set" onClick={() => addSet(ei)}>+ Satz hinzufügen</button>
          </div>
        )
      })}

      <button className="btn btn-ghost btn-block" style={{ marginTop: 16 }} onClick={() => setPicker(true)}>
        <Icon.plus /> Übung hinzufügen
      </button>

      {prFlash && <div className="pr-flash"><Icon.cup size={18} /> Neuer Rekord!</div>}

      {(restEnd || restDone) && (
        <RestDock
          left={restLeft}
          total={settings.restSec}
          done={restDone}
          onAdd={(d) => restEnd && (setRestEnd(restEnd + d * 1000), storeRestEnd(restEnd + d * 1000))}
          onSkip={() => { setRestEnd(null); storeRestEnd(null); setRestDone(false) }}
        />
      )}

      {ed && (
        <SetEditor
          key={`${ed.ex}-${ed.set}`}
          initial={w.exercises[ed.ex].sets[ed.set]}
          fallback={prev.get(w.exercises[ed.ex].exerciseId)?.[ed.set]}
          title={`${exerciseById.get(w.exercises[ed.ex].exerciseId)?.name ?? ''} · Satz ${ed.set + 1}`}
          onClose={() => setEditing(null)}
          onApply={(v) => { updateSet(ed.ex, ed.set, { ...v, suggested: false }); setEditing(null) }}
          onComplete={(v) => { complete(ed.ex, ed.set, v); setEditing(null) }}
        />
      )}

      {setMenu && (
        <Sheet onClose={() => setSetMenu(null)}>
          <h3>Satz {setMenu.set + 1}</h3>
          <div className="menu">
            <button onClick={() => { updateSet(setMenu.ex, setMenu.set, { weight: null, reps: null, done: false, suggested: false }); setSetMenu(null) }}>Werte leeren</button>
            <button className="danger" onClick={() => { deleteSet(setMenu.ex, setMenu.set); setSetMenu(null) }}>Satz löschen</button>
          </div>
        </Sheet>
      )}

      {exMenu != null && w.exercises[exMenu] && (
        <Sheet onClose={() => setExMenu(null)}>
          <h3>{exerciseById.get(w.exercises[exMenu].exerciseId)?.name}</h3>
          <div className="menu">
            <button onClick={() => { setSkipped(exMenu, true); setExMenu(null) }}>Heute nicht trainieren</button>
            <button onClick={() => { addSet(exMenu); setExMenu(null) }}>Satz hinzufügen</button>
            <button className="danger" onClick={() => { removeExercise(exMenu); setExMenu(null) }}>Übung aus diesem Workout entfernen</button>
          </div>
        </Sheet>
      )}

      {woMenu && (
        <Sheet onClose={() => setWoMenu(false)}>
          <h3>Workout</h3>
          <div className="menu">
            <button onClick={() => { setWoMenu(false); startRest() }}>Pause jetzt starten ({clock(settings.restSec)})</button>
            <button className="danger" onClick={() => { setWoMenu(false); discard() }}>Workout verwerfen</button>
          </div>
        </Sheet>
      )}

      {finish && (
        <Sheet onClose={() => setFinish(false)}>
          <h3>Workout beenden?</h3>
          <p className="muted" style={{ marginBottom: 16 }}>
            {doneSets} von {totalSets} Sätzen bestätigt · {clock(elapsed)}
            {doneSets < totalSets && ' · Nicht bestätigte Sätze werden nicht gespeichert.'}
          </p>
          <div className="grid-3" style={{ marginBottom: 18 }}>
            <div className="card kpi"><div className="label">Dauer</div><div className="value" style={{ fontSize: 20 }}>{clock(elapsed)}</div></div>
            <div className="card kpi"><div className="label">Sätze</div><div className="value" style={{ fontSize: 20 }}>{doneSets}</div></div>
            <div className="card kpi"><div className="label">Volumen</div><div className="value" style={{ fontSize: 20 }}>{fmtInt(workoutVolume({ ...w, exercises: w.exercises }))}</div></div>
          </div>
          <button className="btn btn-chrome btn-block" onClick={finishWorkout} disabled={doneSets === 0}>Speichern & beenden</button>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setFinish(false)}>Weiter trainieren</button>
        </Sheet>
      )}

      {picker && (
        <ExercisePicker
          onClose={() => setPicker(false)}
          onPick={(id) => {
            save({ ...w, exercises: [...w.exercises, { exerciseId: id, sets: [0, 1, 2].map(() => ({ weight: null, reps: null, done: false })) }] })
            setPicker(false)
          }}
        />
      )}
    </div>
  )
}

function RestDock({ left, total, done, onAdd, onSkip }: {
  left: number; total: number; done: boolean; onAdd: (d: number) => void; onSkip: () => void
}) {
  const r = 20
  const c = 2 * Math.PI * r
  const frac = done ? 1 : Math.max(0, Math.min(1, left / total))
  return (
    <div className={'dock' + (done ? ' over' : '')}>
      <svg className="ring" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="4" />
        <circle
          cx="24" cy="24" r={r} fill="none" stroke={done ? 'var(--good)' : '#e5e5ea'} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 24 24)"
          style={{ transition: 'stroke-dashoffset .5s linear' }}
        />
      </svg>
      <div className="grow">
        <div className="lbl">{done ? 'Pause vorbei' : 'Pause'}</div>
        <div className="t">{done ? 'Los geht’s' : clock(left)}</div>
      </div>
      {!done && <button className="btn btn-ghost btn-sm" onClick={() => onAdd(-15)}>−15</button>}
      {!done && <button className="btn btn-ghost btn-sm" onClick={() => onAdd(15)}>+15</button>}
      <button className="btn btn-ghost btn-sm" onClick={onSkip}>{done ? 'OK' : 'Skip'}</button>
    </div>
  )
}

function SetEditor({ initial, fallback, title, onClose, onApply, onComplete }: {
  initial: SetEntry
  fallback?: SetEntry
  title: string
  onClose: () => void
  onApply: (v: { weight: number; reps: number }) => void
  onComplete: (v: { weight: number; reps: number }) => void
}) {
  const [mode, setMode] = useState<'wheel' | 'keys'>(() => {
    try { return (localStorage.getItem('vis.inputMode') as 'wheel' | 'keys') || 'wheel' } catch { return 'wheel' }
  })
  const [weight, setWeight] = useState(initial.weight ?? fallback?.weight ?? 20)
  const [reps, setReps] = useState(initial.reps ?? fallback?.reps ?? 8)
  const [wText, setWText] = useState(fmtKg(weight))
  const [rText, setRText] = useState(String(reps))

  const switchMode = (m: 'wheel' | 'keys') => {
    setMode(m)
    setWText(fmtKg(weight))
    setRText(String(reps))
    try { localStorage.setItem('vis.inputMode', m) } catch { /* ignore */ }
  }
  const values = () =>
    mode === 'wheel'
      ? { weight, reps }
      : { weight: Math.max(0, Number(wText.replace(',', '.')) || 0), reps: Math.max(0, Math.round(Number(rText) || 0)) }

  return (
    <Sheet onClose={onClose}>
      <h3>{title}</h3>
      {fallback && <p className="faint" style={{ fontSize: 13 }}>Letztes Mal: {fmtKg(fallback.weight ?? 0)} kg × {fallback.reps}</p>}
      <div className="segmented" style={{ marginTop: 14 }}>
        <button className={mode === 'wheel' ? 'on' : ''} onClick={() => switchMode('wheel')}>Drehrad</button>
        <button className={mode === 'keys' ? 'on' : ''} onClick={() => switchMode('keys')}>Tastatur</button>
      </div>
      {mode === 'wheel' ? (
        <div className="wheels">
          <div className="wheel-col"><div className="cap">kg</div><Wheel values={KG} value={weight} onChange={setWeight} format={fmtKg} /></div>
          <div className="wheel-col"><div className="cap">Wdh</div><Wheel values={REPS} value={reps} onChange={setReps} /></div>
        </div>
      ) : (
        <div className="grid-2" style={{ margin: '18px 0' }}>
          <div><label className="lbl">kg</label><input className="field" inputMode="decimal" value={wText} onChange={(e) => setWText(e.target.value)} onFocus={(e) => e.target.select()} autoFocus /></div>
          <div><label className="lbl">Wiederholungen</label><input className="field" inputMode="numeric" value={rText} onChange={(e) => setRText(e.target.value)} onFocus={(e) => e.target.select()} /></div>
        </div>
      )}
      <div className="grid-2">
        <button className="btn btn-ghost" onClick={() => onApply(values())}>Übernehmen</button>
        <button className="btn btn-chrome" onClick={() => onComplete(values())}><Icon.check /> Satz fertig</button>
      </div>
    </Sheet>
  )
}

export function ExercisePicker({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const store = useStore()
  const [q, setQ] = useState('')
  const list = store.exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
  const create = () => {
    const name = q.trim()
    if (!name) return
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + uid().slice(0, 4)
    store.saveExercise({ id, name, muscle: 'Sonstige' })
    onPick(id)
  }
  return (
    <Sheet onClose={onClose}>
      <h3>Übung hinzufügen</h3>
      <input className="input" placeholder="Suchen oder neu anlegen" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: '12px 0' }} />
      <div className="menu">
        {list.map((e) => (
          <button key={e.id} onClick={() => onPick(e.id)}>
            <span style={{ flex: 1 }}>{e.name}</span><span className="faint" style={{ fontSize: 13 }}>{e.muscle}</span>
          </button>
        ))}
        {q.trim() && !list.some((e) => e.name.toLowerCase() === q.trim().toLowerCase()) && (
          <button onClick={create}><Icon.plus /> „{q.trim()}“ anlegen</button>
        )}
      </div>
    </Sheet>
  )
}
