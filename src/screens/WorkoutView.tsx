import { useState } from 'react'
import { ScorePill } from '../components/ScoreGauge'
import { Icon, ProgressBadges } from '../components/ui'
import { dateLabel, durationLabel, fmtInt, fmtKg, isRealSet, workoutSetCount, workoutVolume } from '../lib'
import { useNav } from '../nav'
import { useStore } from '../store'
import type { Workout } from '../types'
import { ExercisePicker } from './Workout'

type DraftSet = { wt: string; rt: string }
type Draft = Omit<Workout, 'exercises'> & { durationMin: string; exercises: { exerciseId: string; skipped?: boolean; sets: DraftSet[] }[] }

const num = (t: string) => {
  const v = Number(t.replace(',', '.'))
  return t.trim() === '' || Number.isNaN(v) ? null : v
}

export function WorkoutView({ id }: { id: string }) {
  const store = useStore()
  const nav = useNav()
  const w = store.workouts.find((x) => x.id === id)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [picker, setPicker] = useState(false)
  const [confirm, setConfirm] = useState(false)

  if (!w) {
    return (
      <div className="screen no-tabs">
        <div className="wo-head"><button className="icon-btn" onClick={nav.pop}><Icon.back /></button><div className="grow" /></div>
        <p className="muted" style={{ marginTop: 30 }}>Workout nicht gefunden.</p>
      </div>
    )
  }

  const startEdit = () => setDraft({
    ...w,
    durationMin: w.durationSec != null ? String(Math.round(w.durationSec / 60)) : '',
    exercises: w.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      skipped: e.skipped,
      sets: e.sets.map((s) => ({ wt: s.weight == null ? '' : fmtKg(s.weight), rt: s.reps == null ? '' : String(s.reps) })),
    })),
  })

  const save = () => {
    if (!draft) return
    const { durationMin, ...rest } = draft
    const skippedNow = rest.status === 'skipped'
    const exercises = rest.exercises
      .map((e) => e.skipped
        ? { exerciseId: e.exerciseId, skipped: true, sets: e.sets.map(() => ({ weight: null, reps: null, done: false })) }
        : {
          exerciseId: e.exerciseId,
          sets: e.sets
            .map((s) => {
              const weight = num(s.wt)
              const r = num(s.rt)
              const reps = r == null ? null : Math.round(r)
              return { weight, reps, done: !skippedNow && reps != null && reps > 0 }
            })
            .filter((s) => skippedNow || s.weight != null || s.reps != null),
        })
      .filter((e) => e.skipped || e.sets.length)
    const min = num(durationMin)
    store.saveWorkout({ ...rest, exercises, durationSec: min && min > 0 ? Math.round(min * 60) : null })
    setDraft(null)
  }

  const setSet = (ei: number, si: number, key: 'wt' | 'rt', text: string) => {
    if (!draft) return
    setDraft({
      ...draft,
      exercises: draft.exercises.map((e, i) => (i !== ei ? e : { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, [key]: text } : s)) })),
    })
  }
  const mapEx = (ei: number, fn: (e: Draft['exercises'][number]) => Draft['exercises'][number] | null) =>
    draft && setDraft({ ...draft, exercises: draft.exercises.map((e, i) => (i === ei ? fn(e) : e)).filter((e): e is NonNullable<typeof e> => !!e) })

  // ---------- edit mode ----------
  if (draft) {
    return (
      <div className="screen no-tabs">
        <div className="wo-head">
          <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>Abbrechen</button>
          <div className="grow" style={{ textAlign: 'center' }}><div className="name">Bearbeiten</div></div>
          <button className="btn btn-chrome btn-sm" onClick={save}>Sichern</button>
        </div>

        <label className="lbl" style={{ marginTop: 20 }}>Name</label>
        <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <div className="grid-2">
          <div>
            <label className="lbl">Datum & Uhrzeit</label>
            <input className="input" type="datetime-local" value={draft.startedAt.slice(0, 16)}
              onChange={(e) => e.target.value && setDraft({ ...draft, startedAt: e.target.value + ':00' })} />
          </div>
          <div>
            <label className="lbl">Dauer (min)</label>
            <input className="input num" inputMode="numeric" value={draft.durationMin} placeholder="–"
              onChange={(e) => setDraft({ ...draft, durationMin: e.target.value })} />
          </div>
        </div>
        <label className="lbl">Status</label>
        <div className="segmented">
          <button className={draft.status === 'done' ? 'on' : ''} onClick={() => setDraft({ ...draft, status: 'done' })}>Trainiert</button>
          <button className={draft.status === 'skipped' ? 'on' : ''} onClick={() => setDraft({ ...draft, status: 'skipped' })}>Ausgelassen</button>
        </div>

        {draft.exercises.map((e, ei) => e.skipped ? (
          <div className="card ex-card ex-skipped" key={ei}>
            <div className="ex-title">
              <div>
                <div className="name">{store.exerciseById.get(e.exerciseId)?.name ?? e.exerciseId}</div>
                <div className="muscle">Nicht trainiert</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => mapEx(ei, (x) => ({ ...x, skipped: undefined, sets: x.sets.map(() => ({ wt: '', rt: '' })) }))}>Werte eintragen</button>
            </div>
          </div>
        ) : (
          <div className="card ex-card" key={ei}>
            <div className="ex-title">
              <div className="name">{store.exerciseById.get(e.exerciseId)?.name ?? e.exerciseId}</div>
              <button className="remove" onClick={() => mapEx(ei, () => null)} aria-label="Übung entfernen">×</button>
            </div>
            <div className="edit-head"><span>Satz</span><span>kg</span><span>Wdh</span><span /></div>
            {e.sets.map((s, si) => (
              <div className="edit-row" key={si}>
                <span className="set-no">{si + 1}</span>
                <input className="val" inputMode="decimal" value={s.wt} placeholder="kg"
                  onChange={(ev) => setSet(ei, si, 'wt', ev.target.value)} />
                <input className="val" inputMode="numeric" value={s.rt} placeholder="Wdh"
                  onChange={(ev) => setSet(ei, si, 'rt', ev.target.value)} />
                <button className="remove" onClick={() => mapEx(ei, (x) => ({ ...x, sets: x.sets.filter((_, j) => j !== si) }))} aria-label="Satz löschen">×</button>
              </div>
            ))}
            <button className="add-set" onClick={() => mapEx(ei, (x) => {
              const last = x.sets[x.sets.length - 1]
              return { ...x, sets: [...x.sets, { wt: last?.wt ?? '', rt: last?.rt ?? '' }] }
            })}>+ Satz hinzufügen</button>
          </div>
        ))}
        <button className="btn btn-ghost btn-block" style={{ marginTop: 14 }} onClick={() => setPicker(true)}><Icon.plus /> Übung hinzufügen</button>
        {picker && (
          <ExercisePicker onClose={() => setPicker(false)} onPick={(exId) => {
            setDraft({ ...draft, exercises: [...draft.exercises, { exerciseId: exId, sets: [{ wt: '', rt: '' }] }] })
            setPicker(false)
          }} />
        )}
      </div>
    )
  }

  // ---------- view mode ----------
  const skipped = w.status === 'skipped'
  const rating = store.progress.byId.get(w.id)
  return (
    <div className="screen no-tabs">
      <div className="wo-head">
        <button className="icon-btn" onClick={nav.pop} aria-label="Zurück"><Icon.back /></button>
        <div className="grow">
          <div className="name">{w.name}</div>
          <div className="wo-timer">{dateLabel(w.startedAt)} · {w.startedAt.slice(11, 16)} Uhr</div>
        </div>
        {w.status === 'done' && store.workoutScores.has(w.id) && <ScorePill score={store.workoutScores.get(w.id)!} size={36} />}
        {w.status !== 'active' && <button className="btn btn-ghost btn-sm" onClick={startEdit}>Bearbeiten</button>}
      </div>

      {rating && (rating.ups > 0 || rating.prs > 0) && (
        <div className="card" style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span className="muted" style={{ fontSize: 14 }}>Fortschritt in diesem Workout</span>
          <ProgressBadges ups={rating.ups} prs={rating.prs} big />
        </div>
      )}

      {skipped ? (
        <div className="card muted" style={{ marginTop: 18 }}>An diesem Tag wurde nicht trainiert.</div>
      ) : (
        <div className="grid-3" style={{ marginTop: 12 }}>
          <div className="card kpi"><div className="label">Dauer</div><div className="value" style={{ fontSize: 20 }}>{durationLabel(w.durationSec)}</div></div>
          <div className="card kpi"><div className="label">Sätze</div><div className="value" style={{ fontSize: 20 }}>{workoutSetCount(w)}</div></div>
          <div className="card kpi"><div className="label">Volumen</div><div className="value" style={{ fontSize: 20 }}>{fmtInt(workoutVolume(w))}<small>kg</small></div></div>
        </div>
      )}

      {w.exercises.map((e, i) => {
        if (e.skipped && !skipped) {
          return (
            <div className="card ex-skipped" key={i} style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 680, fontSize: 16 }}>{store.exerciseById.get(e.exerciseId)?.name ?? e.exerciseId}</div>
              <div className="faint" style={{ fontSize: 13 }}>Heute nicht trainiert</div>
            </div>
          )
        }
        // keep original indices so the progress flags line up with the sets
        const sets = e.sets.map((s, idx) => ({ s, flag: rating?.exercises[i]?.flags[idx] ?? null })).filter(({ s }) => skipped || isRealSet(s))
        const best = sets.reduce((b, { s }) => Math.max(b, s.weight ?? 0), 0)
        const exr = rating?.exercises[i]
        return (
          <div className="card" key={i} style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontWeight: 680, fontSize: 16 }}>{store.exerciseById.get(e.exerciseId)?.name ?? e.exerciseId}</div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {exr && <ProgressBadges ups={exr.ups} prs={exr.prs} />}
                {!skipped && <span className="faint num" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>max {fmtKg(best)} kg</span>}
              </span>
            </div>
            {skipped ? (
              <div className="faint" style={{ fontSize: 13 }}>{e.sets.length} Sätze geplant</div>
            ) : (
              sets.map(({ s, flag }, j) => (
                <div key={j} className="pr-row num">
                  <span className="faint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    Satz {j + 1}
                    {flag && <span className={'pbadge ' + flag} style={{ height: 20, padding: '0 7px 0 5px', fontSize: 11 }}>{flag === 'pr' ? <><Icon.cup size={11} /> Rekord</> : <><Icon.up size={11} /> mehr</>}</span>}
                  </span>
                  <span><b>{fmtKg(s.weight ?? 0)}</b> kg × <b>{s.reps}</b></span>
                </div>
              ))
            )}
          </div>
        )
      })}

      <button className="btn btn-danger btn-block" style={{ marginTop: 26 }}
        onClick={() => (confirm ? (store.deleteWorkout(w.id), nav.pop()) : setConfirm(true))}>
        {confirm ? 'Wirklich löschen?' : 'Workout löschen'}
      </button>
    </div>
  )
}
