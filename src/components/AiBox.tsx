import { useState } from 'react'
import { askCoach, buildContext, cacheGet, cacheSet, describeWorkout } from '../ai'
import { useStore } from '../store'

/** "✦ KI-…" button that fetches a coach comment once and caches it. */
export function AiBox({ mode, workoutId, weekStart, label }: {
  mode: 'workout' | 'week'
  workoutId?: string
  weekStart?: string
  label: string
}) {
  const store = useStore()
  const key = mode === 'workout' ? `w-${workoutId}` : `week-${weekStart}`
  const [text, setText] = useState<string | null>(() => cacheGet(key))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setErr(null)
    try {
      const context = buildContext({ ...store, progress: store.progress.byId, name: store.settings.name })
      const w = workoutId ? store.workouts.find((x) => x.id === workoutId) : undefined
      const focus = w ? describeWorkout(w, store.exercises, store.progress.byId.get(w.id)) : `Woche ab ${weekStart}`
      const t = await askCoach({ mode, context, focus })
      setText(t)
      cacheSet(key, t)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (text) {
    return (
      <div className="ai-box">
        <div className="ai-head"><span className="ai-spark">✦</span> {label}</div>
        <div className="ai-text">{text}</div>
        <button className="ai-again" onClick={run} disabled={busy}>{busy ? 'Denke nach…' : 'Neu erstellen'}</button>
      </div>
    )
  }
  return (
    <div style={{ marginTop: 12 }}>
      <button className="btn btn-ghost btn-block ai-btn" onClick={run} disabled={busy}>
        <span className="ai-spark">✦</span> {busy ? 'Denke nach…' : label}
      </button>
      {err && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6, textAlign: 'center' }}>{err}</p>}
    </div>
  )
}
