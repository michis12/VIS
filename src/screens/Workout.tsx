import { t as tr } from '../i18n'
import { muscleLabel, musclesFor } from '../muscles'
import { MuscleIcon } from '../components/MuscleMap'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, ProgressBadges, SetMark, Sheet, Tap, Wheel } from '../components/ui'
import { clock, fmtKg, haptic, isRealSet, localIso, uid, workoutVolume, fmtInt } from '../lib'
import { rateWorkout } from '../progress'
import { cancelRestPush, moveRestPush, scheduleRestPush } from '../push'
import { loadRestEnd, restFinished, storeRestEnd, unlockAudio } from '../rest'
import { useNav } from '../nav'
import { useStore } from '../store'
import type { SetEntry, Template, Workout } from '../types'

const KG_BAR = Array.from({ length: 121 }, (_, i) => i * 2.5) // 0–300 kg in 2,5er Schritten
const KG_DB = Array.from({ length: 41 }, (_, i) => i * 2) // Kurzhanteln: 0–80 kg in 2er Schritten
export const isDumbbell = (name = '') => /dumb+ell|kurzhantel/i.test(name)
/** position of a set among the working sets (warm-ups don't count) */
const workIndex = (sets: SetEntry[], i: number) => sets.slice(0, i).filter((s) => !s.warmup).length
export const isBarbell = (name = '') => /barbell|langhantel/i.test(name)
/** Wheel values for an exercise; a current value off the grid (e.g. 21 kg) is kept as its own stop. */
function kgSteps(dumbbell: boolean, ...keep: (number | null | undefined)[]) {
  const base = dumbbell ? KG_DB : KG_BAR
  const extra = keep.filter((v): v is number => v != null && v >= 0 && !base.includes(v))
  return extra.length ? [...base, ...extra].sort((a, b) => a - b) : base
}
const REPS = Array.from({ length: 51 }, (_, i) => i)

export function newWorkoutFromTemplate(t: Template | null): Workout {
  return {
    id: uid(),
    name: t?.name ?? tr('Freies Training', 'Free workout'),
    templateId: t?.id,
    startedAt: localIso(),
    durationSec: null,
    status: 'active',
    source: 'app',
    exercises: (t?.exercises ?? []).map((e) => ({
      exerciseId: e.exerciseId,
      group: e.group,
      sets: Array.from({ length: Math.max(1, e.sets) }, () => ({ weight: null, reps: null, done: false })),
    })),
  }
}

/** Indices of the exercises forming the superset that `i` belongs to (just [i] when not linked). */
export function supersetOf<T extends { group?: string }>(list: T[], i: number): number[] {
  const g = list[i]?.group
  if (!g) return [i]
  let a = i
  let b = i
  while (a > 0 && list[a - 1].group === g) a--
  while (b < list.length - 1 && list[b + 1].group === g) b++
  return Array.from({ length: b - a + 1 }, (_, k) => a + k)
}

/** Toggles the link between exercise i and i+1 (keeps groups contiguous). */
export function toggleLink<T extends { group?: string }>(list: T[], i: number): T[] {
  if (i < 0 || i >= list.length - 1) return list
  const next = list.map((x) => ({ ...x }))
  const linked = !!next[i].group && next[i].group === next[i + 1].group
  if (linked) {
    // split: everything after i gets a fresh group (or none if alone)
    const old = next[i].group
    const tail: number[] = []
    for (let k = i + 1; k < next.length && next[k].group === old; k++) tail.push(k)
    const fresh = uid()
    for (const k of tail) next[k].group = tail.length > 1 ? fresh : undefined
    const head = supersetOf(next, i)
    if (head.length === 1) next[i].group = undefined
  } else {
    const g = next[i].group ?? next[i + 1].group ?? uid()
    const old = next[i + 1].group
    next[i].group = g
    for (let k = i + 1; k < next.length && (k === i + 1 || (old && next[k].group === old)); k++) next[k].group = g
  }
  return next
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
  const nav = useNav()
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
      cancelRestPush() // app is open and signals itself; no push needed
      // Ended a while ago = the app was in the background and the push already
      // told you. Just tidy up instead of chiming a second time.
      if (now - restEnd > 3000) return
      setRestDone(true)
      restFinished()
      setTimeout(() => setRestDone(false), 4000)
    }
  }, [now, restEnd])

  const startRest = (sec = settings.restSec) => {
    const end = Date.now() + sec * 1000
    setRestEnd(end)
    storeRestEnd(end)
    setRestDone(false)
    // server push so the end of the rest also reaches a locked phone
    const next = w.exercises.find((e) => !e.skipped && e.sets.some((s) => !s.done))
    scheduleRestPush(end, next ? exerciseById.get(next.exerciseId)?.name : undefined)
  }
  const stopRest = () => {
    setRestEnd(null)
    storeRestEnd(null)
    setRestDone(false)
    cancelRestPush()
  }

  const updateSet = (ex: number, set: number, patch: Partial<SetEntry>) => {
    const exercises = w.exercises.map((e, i) =>
      i !== ex ? e : { ...e, sets: e.sets.map((s, j) => (j === set ? { ...s, ...patch } : s)) },
    )
    save({ ...w, exercises })
  }

  const complete = (ex: number, set: number, values?: { weight: number; reps: number; rir?: number }) => {
    unlockAudio()
    const e = w.exercises[ex]
    const s = e.sets[set]
    if (!values && s.done) {
      updateSet(ex, set, { done: false })
      return
    }
    const p = s.warmup ? undefined : prev.get(e.exerciseId)?.[workIndex(e.sets, set)]
    const weight = values?.weight ?? s.weight ?? p?.weight ?? null
    const reps = values?.reps ?? s.reps ?? p?.reps ?? null
    if (weight == null || reps == null) {
      setEditing({ ex, set, focus: weight == null ? 'weight' : 'reps' })
      return
    }
    haptic()
    const sets = e.sets.map((x, j) => {
      if (j === set) return { weight, reps, done: true, ...(s.warmup ? { warmup: true } : {}), ...(values?.rir != null ? { rir: values.rir } : s.rir != null ? { rir: s.rir } : {}) }
      // suggest the next untouched set: same weight, two reps fewer (not after a warm-up)
      if (!s.warmup && j === set + 1 && !x.done && (x.weight == null || x.suggested))
        return { weight, reps: Math.max(1, reps - 2), done: false, suggested: true }
      return x
    })
    const exercises = w.exercises.map((x, i) => (i === ex ? { ...x, sets } : x))
    save({ ...w, exercises })
    // superset: rest only after this round (set index) is done in every linked exercise
    const round = supersetOf(exercises, ex)
    const roundDone = round.every((k) => {
      const other = exercises[k]
      return other.skipped || !other.sets[set] || other.sets[set].done
    })
    if (roundDone) startRest()
  }

  const linkedToNext = (i: number) => !!w.exercises[i]?.group && w.exercises[i].group === w.exercises[i + 1]?.group
  const ssClass = (i: number) => {
    const prevLinked = i > 0 && linkedToNext(i - 1)
    const nextLinked = linkedToNext(i)
    if (!prevLinked && !nextLinked) return ''
    return ' ss' + (prevLinked ? ' ss-cont' : '') + (nextLinked ? ' ss-more' : '')
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

  // ---- warm-up sets: 50 / 70 / 85 % of the first working weight, before the working sets
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [plateau, setPlateau] = useState<number | null>(null)
  const stepOf = (ex: number) => (isDumbbell(exerciseById.get(w.exercises[ex].exerciseId)?.name) ? 2 : 2.5)
  const roundTo = (v: number, step: number) => Math.max(0, Math.round(v / step) * step)
  const workWeight = (ex: number): number | null => {
    const e = w.exercises[ex]
    const first = e.sets.find((s) => !s.warmup)
    const p = prev.get(e.exerciseId)?.[0]
    return first?.weight ?? p?.weight ?? null
  }
  const addWarmups = (ex: number) => {
    const top = workWeight(ex)
    if (top == null) return
    haptic()
    const step = stepOf(ex)
    const warm: SetEntry[] = [[0.5, 10], [0.7, 5], [0.85, 3]].map(([k, r]) => ({ weight: roundTo(top * k, step), reps: r, done: false, warmup: true }))
    save({ ...w, exercises: w.exercises.map((x, i) => (i === ex ? { ...x, sets: [...warm, ...x.sets.filter((s) => !s.warmup)] } : x)) })
  }
  const removeWarmups = (ex: number) => save({ ...w, exercises: w.exercises.map((x, i) => (i === ex ? { ...x, sets: x.sets.filter((s) => !s.warmup) } : x)) })

  // ---- progression hints (Settings › Training): next weight step, plateau
  const fillWeight = (ex: number, kg: number) => {
    haptic()
    save({ ...w, exercises: w.exercises.map((x, i) => (i === ex ? { ...x, sets: x.sets.map((s) => (s.done || s.warmup ? s : { ...s, weight: kg, suggested: true })) } : x)) })
  }
  const deloadWeight = (ex: number) => roundTo((workWeight(ex) ?? 0) * 0.9, stepOf(ex))
  const hints = useMemo(() => {
    const out = new Map<string, { up?: number; plateau?: boolean }>()
    if (settings.progressHints === false) return out
    for (const e of w.exercises) {
      const p = prev.get(e.exerciseId)
      if (!p?.length || out.has(e.exerciseId)) continue
      const h: { up?: number; plateau?: boolean } = {}
      // every working set last time at 10+ reps with the same weight: time for the next step
      const kg = p[0].weight ?? 0
      if (kg > 0 && p.every((s) => (s.reps ?? 0) >= 10 && s.weight === kg)) {
        h.up = kg + (isDumbbell(exerciseById.get(e.exerciseId)?.name) ? 2 : 5)
      }
      // the last 3 sessions without progress or a record: plateau
      let flat = 0
      for (let i = workouts.length - 1; i >= 0 && flat < 3; i--) {
        const o = workouts[i]
        if (o.status !== 'done' || o.id === w.id) continue
        const k = o.exercises.findIndex((x) => x.exerciseId === e.exerciseId && x.sets.some(isRealSet))
        if (k < 0) continue
        const flags = store.progress.byId.get(o.id)?.exercises[k]?.flags ?? []
        if (flags.some((f) => f)) break
        flat++
      }
      if (flat >= 3 && !h.up) h.plateau = true
      if (h.up || h.plateau) out.set(e.exerciseId, h)
    }
    return out
  }, [w.exercises, prev, workouts, store.progress.byId, settings.progressHints, exerciseById])
  const hint = (ex: number) => {
    const e = w.exercises[ex]
    const h = hints.get(e.exerciseId)
    if (!h || e.sets.some((s) => s.done && !s.warmup)) return null
    if (h.up != null) {
      if (e.sets.filter((s) => !s.warmup).every((s) => s.weight === h.up)) return null
      return <button className="ex-hint" onClick={() => fillWeight(ex, h.up!)}>↑ {fmtKg(h.up)} kg</button>
    }
    return <button className="ex-hint flat" onClick={() => setPlateau(ex)}>{tr('Plateau', 'Plateau')}</button>
  }

  const elapsed = Math.floor((now - new Date(w.startedAt).getTime()) / 1000)
  const active = w.exercises.filter((e) => !e.skipped)
  const doneSets = active.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)
  const totalSets = active.reduce((n, e) => n + e.sets.length, 0)
  const skippedCount = w.exercises.length - active.length
  const liveVol = workoutVolume(w)

  const finishWorkout = () => {
    // skipped exercises stay in the record (no values) so the history shows they were left out today
    const exercises = w.exercises
      .map((e) => e.skipped
        ? { exerciseId: e.exerciseId, group: e.group, skipped: true, sets: e.sets.map(() => ({ weight: null, reps: null, done: false })) }
        : { exerciseId: e.exerciseId, group: e.group, sets: e.sets.filter((s) => s.done).map(({ weight, reps, done, warmup, rir }) => ({ weight, reps, done, ...(warmup ? { warmup } : {}), ...(rir != null ? { rir } : {}) })) })
      .filter((e) => e.skipped || e.sets.length)
    const done: Workout = { ...w, exercises, status: 'done', durationSec: elapsed }
    haptic(true)
    save(done)
    storeRestEnd(null)
    cancelRestPush()
    onFinished(done.id)
  }

  const discard = () => {
    store.deleteWorkout(w.id)
    storeRestEnd(null)
    cancelRestPush()
    onClose(tr('Workout verworfen', 'Workout discarded'))
  }

  const ed = editing && w.exercises[editing.ex]?.sets[editing.set] ? editing : null

  // a soft emerald glow behind the exercises that shows the end is near: it starts when
  // you scroll down to the exercise at 60 % of the list (no. 6 of 10) and is full at the bottom
  const root = useRef<HTMLDivElement>(null)
  const fade = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const cards = root.current?.querySelectorAll<HTMLElement>('.ex-card')
      if (!cards?.length || !fade.current) return
      const start = cards[Math.max(0, Math.ceil(cards.length * 0.6) - 1)].getBoundingClientRect().top
      const end = cards[cards.length - 1].getBoundingClientRect().bottom
      const p = end > start ? (window.innerHeight - start) / (end - start) : 0
      fade.current.style.opacity = String(Math.max(0, Math.min(1, p)))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [w.exercises.length])

  return (
    <div className="screen no-tabs" ref={root}>
      <div className="wo-end-fade" ref={fade} style={{ opacity: 0 }} aria-hidden="true" />
      <div className="wo-head">
        <button className="icon-btn" onClick={() => onClose()} aria-label={tr('Minimieren', 'Minimise')}><Icon.back /></button>
        <div className="grow">
          <div className="name">{w.name}</div>
          <div className="wo-timer" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span><b>{clock(elapsed)}</b> · {doneSets}/{totalSets} {tr('Sätze', 'sets')}{skippedCount ? ` · ${skippedCount} ${tr('ausgelassen', 'skipped')}` : ''}{settings.liveVolume !== false && liveVol > 0 ? ` · ${liveVol >= 1000 ? `${fmtKg(Math.round(liveVol / 100) / 10)} t` : `${fmtInt(liveVol)} kg`}` : ''}</span>
            <ProgressBadges ups={live.ups} prs={live.prs} />
          </div>
        </div>
        <button className="icon-btn" onClick={() => setWoMenu(true)} aria-label={tr('Menü', 'Menu')}><Icon.more /></button>
        <Tap className="btn btn-chrome btn-sm" onClick={() => setFinish(true)}>{tr('Beenden', 'Finish')}</Tap>
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
                  <div className="muscle">{tr(`Heute nicht trainiert · ${e.sets.length} Sätze geplant`, `Not trained today · ${e.sets.length} sets planned`)}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setSkipped(ei, false)}>{tr('Doch trainieren', 'Train it after all')}</button>
              </div>
            </div>
          )
        }
        return (
          <div className={'card ex-card' + ssClass(ei)} key={ei}>
            <div className="ex-title">
              <button className="ex-link" onClick={() => nav.push({ kind: 'exercise', id: e.exerciseId })}>
                <div className="name">{ex?.name ?? e.exerciseId} <span className="faint" style={{ fontSize: 13, fontWeight: 500 }}>›</span></div>
                <div className="muscle">{ex && muscleLabel(ex.muscle)}{supersetOf(w.exercises, ei).length > 1 && <span className="ss-label"> · {tr('Supersatz', 'Superset')}</span>}</div>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ProgressBadges ups={live.exercises[ei]?.ups ?? 0} prs={live.exercises[ei]?.prs ?? 0} />
                <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setExMenu(ei)} aria-label={tr('Übungsmenü', 'Exercise menu')}><Icon.more /></button>
              </div>
            </div>
            {(settings.exerciseNotes?.[e.exerciseId] || hint(ei)) && (
                <div className="ex-extra">
                  {settings.exerciseNotes?.[e.exerciseId] && <button className="ex-note" onClick={() => setNoteFor(e.exerciseId)}>✎ {settings.exerciseNotes[e.exerciseId]}</button>}
                  {hint(ei)}
                </div>
              )}
            <div className="set-head"><span>{tr('Satz', 'Set')}</span><span>{tr('Vorher', 'Previous')}</span><span>kg</span><span>{tr('Wdh', 'Reps')}</span><span /></div>
            {e.sets.map((s, si) => {
              const ps = s.warmup ? undefined : p?.[workIndex(e.sets, si)]
              return (
                <div className={'set-row' + (s.done ? ' done' : '') + (s.warmup ? ' warm' : '')} key={si}>
                  <button className="set-no" onClick={() => setSetMenu({ ex: ei, set: si })}>
                    {s.warmup ? 'W' : workIndex(e.sets, si) + 1}
                    <SetMark flag={live.exercises[ei]?.flags[si]} />
                    {settings.rir && s.done && s.rir != null && <span className="set-rir">@{s.rir}</span>}
                  </button>
                  <Tap
                    className="prev"
                    disabled={!ps}
                    onClick={() => { if (!ps) return; haptic(); updateSet(ei, si, { weight: ps.weight, reps: ps.reps, suggested: false }) }}
                  >
                    {ps ? `${fmtKg(ps.weight ?? 0)} × ${ps.reps}` : '–'}
                  </Tap>
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
                    {s.reps != null ? s.reps : ps ? ps.reps : tr('Wdh', 'Reps')}
                  </button>
                  <Tap className={'check' + (s.done ? ' on' : '')} onClick={() => complete(ei, si)} aria-label={tr('Satz bestätigen', 'Confirm set')}>
                    <Icon.check />
                  </Tap>
                </div>
              )
            })}
            <Tap className="add-set" onClick={() => addSet(ei)}>{tr('+ Satz hinzufügen', '+ Add set')}</Tap>
          </div>
        )
      })}

      <button className="btn btn-ghost btn-block" style={{ marginTop: 16 }} onClick={() => setPicker(true)}>
        <Icon.plus /> {tr('Übung hinzufügen', 'Add exercise')}
      </button>

      {prFlash && <div className="pr-flash"><Icon.cup size={18} /> {tr('Neuer Rekord!', 'New record!')}</div>}

      {(restEnd || restDone) && (
        <RestDock
          left={restLeft}
          msLeft={restEnd ? Math.max(0, restEnd - now) : 0}
          total={settings.restSec}
          done={restDone}
          onAdd={(d) => {
            if (!restEnd) return
            const end = restEnd + d * 1000
            setRestEnd(end)
            storeRestEnd(end)
            moveRestPush(end)
          }}
          onSkip={stopRest}
        />
      )}

      {ed && (
        <SetEditor
          key={`${ed.ex}-${ed.set}`}
          initial={w.exercises[ed.ex].sets[ed.set]}
          fallback={w.exercises[ed.ex].sets[ed.set].warmup ? undefined : prev.get(w.exercises[ed.ex].exerciseId)?.[workIndex(w.exercises[ed.ex].sets, ed.set)]}
          rir={!!settings.rir && !w.exercises[ed.ex].sets[ed.set].warmup}
          title={`${exerciseById.get(w.exercises[ed.ex].exerciseId)?.name ?? ''} · ${w.exercises[ed.ex].sets[ed.set].warmup ? tr('Aufwärmsatz', 'Warm-up set') : `${tr('Satz', 'Set')} ${workIndex(w.exercises[ed.ex].sets, ed.set) + 1}`}`}
          dumbbell={isDumbbell(exerciseById.get(w.exercises[ed.ex].exerciseId)?.name)}
          onClose={() => setEditing(null)}
          onApply={(v) => { updateSet(ed.ex, ed.set, { ...v, suggested: false }); setEditing(null) }}
          onComplete={(v) => { complete(ed.ex, ed.set, v); setEditing(null) }}
        />
      )}

      {noteFor && <ExerciseNoteSheet id={noteFor} name={exerciseById.get(noteFor)?.name ?? ''} onClose={() => setNoteFor(null)} />}
      {plateau != null && w.exercises[plateau] && (
        <Sheet onClose={() => setPlateau(null)}>
          <h3>{tr('Plateau', 'Plateau')}</h3>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.5, margin: '6px 0 14px' }}>
            {tr('Bei dieser Übung gab es seit 3 Einheiten keinen Fortschritt. Ein leichter Deload hilft oft: diesmal etwa 10 % weniger Gewicht, sauber und schnell bewegen – danach wieder steigern.',
              'No progress on this exercise for 3 sessions. A light deload often helps: about 10 % less weight this time, clean and fast reps – then build up again.')}
          </p>
          <button className="btn btn-chrome btn-block" onClick={() => { fillWeight(plateau, deloadWeight(plateau)); setPlateau(null) }}>
            {tr(`Diesmal ${fmtKg(deloadWeight(plateau))} kg`, `${fmtKg(deloadWeight(plateau))} kg this time`)}
          </button>
        </Sheet>
      )}

      {setMenu && (
        <Sheet onClose={() => setSetMenu(null)}>
          <h3>{w.exercises[setMenu.ex]?.sets[setMenu.set]?.warmup ? tr('Aufwärmsatz', 'Warm-up set') : `${tr('Satz', 'Set')} ${workIndex(w.exercises[setMenu.ex]?.sets ?? [], setMenu.set) + 1}`}</h3>
          <div className="menu">
            <button onClick={() => { updateSet(setMenu.ex, setMenu.set, { weight: null, reps: null, done: false, suggested: false }); setSetMenu(null) }}>{tr('Werte leeren', 'Clear values')}</button>
            <button className="danger" onClick={() => { deleteSet(setMenu.ex, setMenu.set); setSetMenu(null) }}>{tr('Satz löschen', 'Delete set')}</button>
          </div>
        </Sheet>
      )}

      {exMenu != null && w.exercises[exMenu] && (
        <Sheet onClose={() => setExMenu(null)}>
          <h3>{exerciseById.get(w.exercises[exMenu].exerciseId)?.name}</h3>
          <div className="menu">
            <button onClick={() => { setSkipped(exMenu, true); setExMenu(null) }}>{tr('Heute nicht trainieren', 'Skip today')}</button>
            {exMenu < w.exercises.length - 1 && (
              <button onClick={() => { save({ ...w, exercises: toggleLink(w.exercises, exMenu) }); haptic(); setExMenu(null) }}>
                {linkedToNext(exMenu) ? tr('Kopplung mit nächster Übung lösen', 'Unlink from next exercise') : tr('Mit nächster Übung koppeln (Supersatz)', 'Link with next exercise (superset)')}
              </button>
            )}
            <button onClick={() => { addSet(exMenu); setExMenu(null) }}>{tr('Satz hinzufügen', 'Add set')}</button>
            {w.exercises[exMenu].sets.some((s) => s.warmup)
              ? <button onClick={() => { removeWarmups(exMenu); setExMenu(null) }}>{tr('Aufwärmsätze entfernen', 'Remove warm-up sets')}</button>
              : <button disabled={workWeight(exMenu) == null} onClick={() => { addWarmups(exMenu); setExMenu(null) }}>
                  {tr('Aufwärmsätze hinzufügen', 'Add warm-up sets')}
                  <span className="faint" style={{ fontSize: 12, marginLeft: 'auto' }}>{workWeight(exMenu) == null ? tr('erst ein Gewicht eintragen', 'enter a weight first') : '50 · 70 · 85 %'}</span>
                </button>}
            <button onClick={() => { setNoteFor(w.exercises[exMenu].exerciseId); setExMenu(null) }}>{settings.exerciseNotes?.[w.exercises[exMenu].exerciseId] ? tr('Notiz bearbeiten', 'Edit note') : tr('Notiz hinzufügen', 'Add note')}</button>
            <button className="danger" onClick={() => { removeExercise(exMenu); setExMenu(null) }}>{tr('Übung aus diesem Workout entfernen', 'Remove exercise from this workout')}</button>
          </div>
        </Sheet>
      )}

      {woMenu && (
        <Sheet onClose={() => setWoMenu(false)}>
          <h3>Workout</h3>
          <div className="menu">
            <button onClick={() => { setWoMenu(false); startRest() }}>{tr('Pause jetzt starten', 'Start rest now')} ({clock(settings.restSec)})</button>
            <button className="danger" onClick={() => { setWoMenu(false); discard() }}>{tr('Workout verwerfen', 'Discard workout')}</button>
          </div>
        </Sheet>
      )}

      {finish && (
        <Sheet onClose={() => setFinish(false)}>
          <h3>{tr('Workout beenden?', 'Finish workout?')}</h3>
          <p className="muted" style={{ marginBottom: 16 }}>
            {tr(`${doneSets} von ${totalSets} Sätzen bestätigt`, `${doneSets} of ${totalSets} sets confirmed`)} · {clock(elapsed)}
            {doneSets < totalSets && tr(' · Nicht bestätigte Sätze werden nicht gespeichert.', ' · Unconfirmed sets are not saved.')}
          </p>
          <div className="grid-3" style={{ marginBottom: 18 }}>
            <div className="card kpi"><div className="label">{tr('Dauer', 'Duration')}</div><div className="value" style={{ fontSize: 20 }}>{clock(elapsed)}</div></div>
            <div className="card kpi"><div className="label">{tr('Sätze', 'Sets')}</div><div className="value" style={{ fontSize: 20 }}>{doneSets}</div></div>
            <div className="card kpi"><div className="label">{tr('Volumen', 'Volume')}</div><div className="value" style={{ fontSize: 20 }}>{fmtInt(workoutVolume({ ...w, exercises: w.exercises }))}</div></div>
          </div>
          <button className="btn btn-chrome btn-block" onClick={finishWorkout} disabled={doneSets === 0}>{tr('Speichern & beenden', 'Save & finish')}</button>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setFinish(false)}>{tr('Weiter trainieren', 'Keep training')}</button>
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

function RestDock({ left, msLeft, total, done, onAdd, onSkip }: {
  left: number; msLeft: number; total: number; done: boolean; onAdd: (d: number) => void; onSkip: () => void
}) {
  const r = 20
  const c = 2 * Math.PI * r
  // from the exact milliseconds: with the 0.5 s tick and a 0.5 s linear transition the ring runs without steps
  const frac = done ? 1 : Math.max(0, Math.min(1, msLeft / (total * 1000)))
  return (
    <div className={'dock' + (done ? ' over' : !done && left <= 3 && left > 0 ? ' ending' : '')}>
      <svg className="ring" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="4" />
        <circle
          cx="24" cy="24" r={r} fill="none" stroke={done ? 'var(--good)' : '#e5e5ea'} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 24 24)"
          style={{ transition: 'stroke-dashoffset .5s linear' }}
        />
      </svg>
      <div className="grow">
        <div className="lbl">{done ? tr('Pause vorbei', 'Rest over') : tr('Pause', 'Rest')}</div>
        <div className="t">{done ? tr('Los geht’s', 'Let’s go') : clock(left)}</div>
      </div>
      {!done && <button className="btn btn-ghost btn-sm" onClick={() => onAdd(-15)}>−15</button>}
      {!done && <button className="btn btn-ghost btn-sm" onClick={() => onAdd(15)}>+15</button>}
      <button className="btn btn-ghost btn-sm" onClick={onSkip}>{done ? 'OK' : 'Skip'}</button>
    </div>
  )
}

function SetEditor({ initial, fallback, title, dumbbell, rir: withRir, onClose, onApply, onComplete }: {
  initial: SetEntry
  fallback?: SetEntry
  title: string
  dumbbell: boolean
  /** ask for reps in reserve (Settings › Training) */
  rir?: boolean
  onClose: () => void
  onApply: (v: { weight: number; reps: number; rir?: number }) => void
  onComplete: (v: { weight: number; reps: number; rir?: number }) => void
}) {
  const [mode, setMode] = useState<'wheel' | 'keys' | 'plates'>(() => {
    try { return (localStorage.getItem('vis.inputMode') as 'wheel' | 'keys') || 'wheel' } catch { return 'wheel' }
  })
  // barbell exercises: a third view that shows which plates go on each side
  const barbell = isBarbell(title)
  const [rir, setRir] = useState<number | undefined>(initial.rir)
  const [weight, setWeight] = useState(initial.weight ?? fallback?.weight ?? (dumbbell ? 10 : 20))
  const [kgValues] = useState(() => kgSteps(dumbbell, initial.weight, fallback?.weight))
  const [reps, setReps] = useState(initial.reps ?? fallback?.reps ?? 8)
  const [wText, setWText] = useState(fmtKg(weight))
  const [rText, setRText] = useState(String(reps))

  const switchMode = (m: 'wheel' | 'keys' | 'plates') => {
    // the plates view works on the current numbers, whichever way they were entered
    if (mode === 'keys' && m !== 'keys') {
      setWeight(Math.max(0, Number(wText.replace(',', '.')) || 0))
      setReps(Math.max(0, Math.round(Number(rText) || 0)))
    } else {
      setWText(fmtKg(weight))
      setRText(String(reps))
    }
    setMode(m)
    if (m !== 'plates') try { localStorage.setItem('vis.inputMode', m) } catch { /* ignore */ }
  }
  const values = () => ({
    ...(mode !== 'keys'
      ? { weight, reps }
      : { weight: Math.max(0, Number(wText.replace(',', '.')) || 0), reps: Math.max(0, Math.round(Number(rText) || 0)) }),
    ...(withRir && rir != null ? { rir } : {}),
  })

  return (
    <Sheet onClose={onClose}>
      <h3>{title}</h3>
      {fallback && <p className="faint" style={{ fontSize: 13 }}>{tr('Letztes Mal', 'Last time')}: {fmtKg(fallback.weight ?? 0)} kg × {fallback.reps}</p>}
      <div className="segmented" style={{ marginTop: 14 }}>
        <button className={mode === 'wheel' ? 'on' : ''} onClick={() => switchMode('wheel')}>{tr('Drehrad', 'Wheel')}</button>
        <button className={mode === 'keys' ? 'on' : ''} onClick={() => switchMode('keys')}>{tr('Tastatur', 'Keyboard')}</button>
        {barbell && <button className={mode === 'plates' ? 'on' : ''} onClick={() => switchMode('plates')}>{tr('Scheiben', 'Plates')}</button>}
      </div>
      {mode === 'plates' ? (
        <PlateView kg={weight} onChange={setWeight} />
      ) : mode === 'wheel' ? (
        <div className="wheels">
          <div className="wheel-col"><div className="cap">kg</div><Wheel values={kgValues} value={weight} onChange={setWeight} format={fmtKg} /></div>
          <div className="wheel-col"><div className="cap">{tr('Wdh', 'Reps')}</div><Wheel values={REPS} value={reps} onChange={setReps} /></div>
        </div>
      ) : (
        <div className="grid-2" style={{ margin: '18px 0' }}>
          <div><label className="lbl">kg</label><input className="field" inputMode="decimal" value={wText} onChange={(e) => setWText(e.target.value)} onFocus={(e) => e.target.select()} autoFocus /></div>
          <div><label className="lbl">{tr('Wiederholungen', 'Reps')}</label><input className="field" inputMode="numeric" value={rText} onChange={(e) => setRText(e.target.value)} onFocus={(e) => e.target.select()} /></div>
        </div>
      )}
      {withRir && (
        <div className="rir-row">
          <span className="faint">RIR</span>
          {[0, 1, 2, 3, 4].map((n) => (
            <button key={n} className={'chip' + (rir === n ? ' on' : '')} onClick={() => { haptic(); setRir(rir === n ? undefined : n) }}>{n === 4 ? '4+' : n}</button>
          ))}
        </div>
      )}
      <div className="grid-2">
        <button className="btn btn-ghost" onClick={() => onApply(values())}>{tr('Übernehmen', 'Apply')}</button>
        <Tap className="btn btn-chrome" onClick={() => onComplete(values())}><Icon.check /> {tr('Satz fertig', 'Set done')}</Tap>
      </div>
    </Sheet>
  )
}

/** standard plates in kg, heaviest first; the bar weighs 20 kg */
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25]
const BAR = 20
const PLATE_COLOR: Record<number, string> = { 25: '#d64545', 20: '#3f6fd6', 15: '#e0b43a', 10: '#3fae6a', 5: '#e9e9ee', 2.5: '#9a9aa2', 1.25: '#6c6c74' }

/** Which plates go on each side of the bar for a weight, drawn like a loaded barbell. */
function PlateView({ kg, onChange }: { kg: number; onChange: (v: number) => void }) {
  let rest = Math.max(0, (kg - BAR) / 2)
  const side: number[] = []
  for (const p of PLATES) while (rest + 1e-9 >= p) { side.push(p); rest -= p }
  const off = Math.round(rest * 2 * 100) / 100
  const step = (d: number) => { haptic(); onChange(Math.max(BAR, Math.round((kg + d) / 2.5) * 2.5)) }
  return (
    <div className="plates">
      <div className="plates-kg">
        <button className="icon-btn" onClick={() => step(-2.5)}>−</button>
        <b className="num">{fmtKg(kg)}<span>kg</span></b>
        <button className="icon-btn" onClick={() => step(2.5)}>+</button>
      </div>
      <div className="plates-bar" aria-hidden="true">
        <div className="plates-side left">{[...side].reverse().map((p, i) => <i key={i} style={{ background: PLATE_COLOR[p], height: `${34 + p * 2.2}px` }} />)}</div>
        <div className="plates-shaft" />
        <div className="plates-side">{side.map((p, i) => <i key={i} style={{ background: PLATE_COLOR[p], height: `${34 + p * 2.2}px` }} />)}</div>
      </div>
      <div className="plates-list">
        {kg < BAR ? tr('Weniger als die leere Stange (20 kg)', 'Less than the empty bar (20 kg)')
          : side.length ? <>{tr('Pro Seite', 'Each side')}: <b>{side.map(fmtKg).join(' + ')}</b> kg</> : tr('Nur die Stange (20 kg)', 'Just the bar (20 kg)')}
        {off > 0 && kg >= BAR && <div className="faint" style={{ fontSize: 12 }}>{tr(`${fmtKg(off)} kg gehen mit Standardscheiben nicht auf`, `${fmtKg(off)} kg can't be loaded with standard plates`)}</div>}
      </div>
    </div>
  )
}

/** The user's own note on an exercise (e.g. "Sitz Stufe 4"), shown in every workout. */
function ExerciseNoteSheet({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const store = useStore()
  const [text, setText] = useState(store.settings.exerciseNotes?.[id] ?? '')
  const save = () => {
    const notes = { ...(store.settings.exerciseNotes ?? {}) }
    const v = text.trim().slice(0, 140)
    if (v) notes[id] = v
    else delete notes[id]
    store.saveSettings({ ...store.settings, exerciseNotes: notes })
    onClose()
  }
  return (
    <Sheet onClose={onClose}>
      <h3>{tr('Notiz', 'Note')} · {name}</h3>
      <input className="input" style={{ margin: '12px 0' }} autoFocus value={text} maxLength={140} onChange={(e) => setText(e.target.value)}
        placeholder={tr('z. B. Sitz auf Stufe 4, Griff eng', 'e.g. seat on level 4, close grip')} onKeyDown={(e) => e.key === 'Enter' && save()} />
      <button className="btn btn-chrome btn-block" onClick={save}>{tr('Speichern', 'Save')}</button>
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
      <h3>{tr('Übung hinzufügen', 'Add exercise')}</h3>
      <input className="input" placeholder={tr('Suchen oder neu anlegen', 'Search or create')} value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: '12px 0' }} />
      <div className="menu">
        {list.map((e) => (
          <button key={e.id} onClick={() => onPick(e.id)} style={{ gap: 12 }}>
            <MuscleIcon primary={e.muscle} secondary={musclesFor(e).secondary} name={e.name} size={36} />
            <span style={{ flex: 1 }}>{e.name}</span><span className="faint" style={{ fontSize: 13 }}>{muscleLabel(e.muscle)}</span>
          </button>
        ))}
        {q.trim() && !list.some((e) => e.name.toLowerCase() === q.trim().toLowerCase()) && (
          <button onClick={create}><Icon.plus /> {tr(`„${q.trim()}“ anlegen`, `Create “${q.trim()}”`)}</button>
        )}
      </div>
    </Sheet>
  )
}
