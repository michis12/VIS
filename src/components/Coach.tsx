import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { STARTER_SPLIT } from '../data/starterSplit'
import { foodAi } from '../foodAi'
import { getLang, t } from '../i18n'
import { e1rm, haptic, isRealSet, today, uid, workoutSetCount, workoutVolume } from '../lib'
import { dayTotals, kcalTarget } from '../nutrition'
import { useStore } from '../store'
import { CreditPill, useCredit } from './AiCredit'
import { useWeekScore } from './WeeklyReport'
import { Icon } from './ui'

/**
 * VIS Coach (Ultra): a chat with Haiku that sees a compact summary of the
 * user's data and can draft workout templates, which are only created after
 * tapping "Anlegen". The conversation stays on this device.
 */
interface Draft { name: string; exercises: { ref: string; sets: number }[]; saved?: boolean }
interface Msg { id: string; role: 'user' | 'assistant'; text: string; templates?: Draft[] }

const KEY = 'vis.coach.v1'
const load = (): Msg[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] } }
const keep = (m: Msg[]) => { try { localStorage.setItem(KEY, JSON.stringify(m.slice(-30))) } catch { /* ignore */ } }

export function Coach({ onClose }: { onClose: () => void }) {
  const store = useStore()
  const week = useWeekScore(0)
  const { credit } = useCredit()
  const [msgs, setMsgs] = useState<Msg[]>(load)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs.length, busy])

  const name = (id: string) => store.exerciseById.get(id)?.name ?? id

  // what the coach knows: a compact summary of the user's data
  const context = useMemo(() => {
    const done = store.workouts.filter((w) => w.status === 'done')
    const phase = store.phases[store.phases.length - 1]
    const d = today()
    const eaten = dayTotals(store.foodLog, d)
    const days7 = Array.from({ length: 7 }, (_, i) => { const x = new Date(); x.setDate(x.getDate() - i - 1); return x.toISOString().slice(0, 10) })
    const logged = days7.map((x) => dayTotals(store.foodLog, x).kcal).filter((k) => k > 0)
    const since90 = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
    const lifts = new Map<string, { sets: number; best: number }>()
    for (const w of done) if (w.startedAt.slice(0, 10) >= since90) for (const e of w.exercises) {
      const l = lifts.get(e.exerciseId) ?? { sets: 0, best: 0 }
      for (const s of e.sets) if (isRealSet(s)) { l.sets++; l.best = Math.max(l.best, e1rm(s.weight ?? 0, s.reps ?? 0)) }
      lifts.set(e.exerciseId, l)
    }
    return JSON.stringify({
      today: d,
      name: store.settings.name || undefined,
      body: { heightCm: store.settings.heightCm, birthYear: store.settings.birthYear, sex: store.settings.sex },
      phase: phase ? { type: phase.type, since: phase.start, kcal: phase.calories } : null,
      weights: store.weights.slice(-10).map((w) => `${w.date}: ${w.kg} kg`),
      nutrition: { today: { kcal: Math.round(eaten.kcal), protein: Math.round(eaten.p), target: kcalTarget(store.phases, d) }, avgKcalLast7Logged: logged.length ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : null },
      weekScore: { score: week.score, workouts: week.workouts, parts: week.parts.map((p) => `${p.label} ${p.pts}/${p.max} (${p.detail})`) },
      recentWorkouts: done.slice(-8).map((w) => ({
        date: w.startedAt.slice(0, 10), name: w.name, sets: workoutSetCount(w), volumeKg: Math.round(workoutVolume(w)),
        records: store.progress.byId.get(w.id)?.prs ?? 0, progress: store.progress.byId.get(w.id)?.ups ?? 0, score: store.workoutScores.get(w.id),
        exercises: w.exercises.map((e) => name(e.exerciseId)).join(', '),
      })),
      templates: store.templates.map((tp) => ({ name: tp.name, exercises: tp.exercises.map((e) => `${name(e.exerciseId)} ×${e.sets}`).join(', ') })),
      topLifts90d: [...lifts].sort((a, b) => b[1].sets - a[1].sets).slice(0, 10).map(([id, l]) => `${name(id)}: ${l.sets} Sätze, bestes e1RM ${Math.round(l.best)} kg`),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.workouts, store.phases, store.weights, store.foodLog, store.templates, store.settings, week.score])

  const starter = useMemo(() => STARTER_SPLIT.map((d) => `${d.name}: ${d.exercises.map((e) => `${e.id} ×${e.sets}`).join(', ')}`).join('\n'), [])

  const send = async (raw?: string) => {
    const q = (raw ?? text).trim()
    if (!q || busy) return
    haptic()
    const next: Msg[] = [...msgs, { id: uid(), role: 'user', text: q }]
    setMsgs(next); keep(next); setText(''); setError(''); setBusy(true)
    try {
      const res = await foodAi({
        messages: next.map((m) => ({ role: m.role, text: m.text })),
        context, starter,
        catalog: store.exercises.map((e) => ({ id: e.id, name: e.name })),
      }, 'coach')
      const templates = ((res.templates ?? []) as Draft[])
        .map((d) => ({ name: String(d.name).slice(0, 40), exercises: d.exercises.filter((e) => store.exerciseById.has(e.ref)).map((e) => ({ ref: e.ref, sets: Math.max(1, Math.min(6, Math.round(e.sets))) })) }))
        .filter((d) => d.exercises.length)
      const withReply: Msg[] = [...next, { id: uid(), role: 'assistant', text: String(res.reply ?? ''), templates }]
      setMsgs(withReply); keep(withReply)
      haptic()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const create = (msgId: string, i: number) => {
    const m = msgs.find((x) => x.id === msgId)
    const d = m?.templates?.[i]
    if (!d || d.saved) return
    store.saveTemplate({ id: 'tpl-' + uid(), name: d.name, exercises: d.exercises.map((e) => ({ exerciseId: e.ref, sets: e.sets })) })
    haptic(true)
    const next = msgs.map((x) => (x.id === msgId ? { ...x, templates: x.templates!.map((y, j) => (j === i ? { ...y, saved: true } : y)) } : x))
    setMsgs(next); keep(next)
  }

  const ideas = getLang() === 'en'
    ? ['How was my week?', 'What should I train today?', 'Create an Upper/Lower plan for me', 'Am I eating enough protein?']
    : ['Wie lief meine Woche?', 'Was soll ich heute trainieren?', 'Erstell mir einen Upper/Lower-Plan', 'Esse ich genug Eiweiß?']

  return createPortal(
    <div className="fullsheet coach">
      <div className="fullsheet-head">
        <button className="icon-btn" onClick={onClose} aria-label={t('Schließen', 'Close')}><Icon.back /></button>
        <div className="grow">
          <div style={{ fontWeight: 700, fontSize: 18 }}>Coach</div>
          <div className="faint" style={{ fontSize: 12 }}>{t('kennt deine Trainings, Ernährung und Phasen', 'knows your training, food and phases')}</div>
        </div>
        <CreditPill credit={credit} />
        {msgs.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => { setMsgs([]); keep([]) }}>{t('Neu', 'New')}</button>}
      </div>
      <div className="fullsheet-body coach-body">
        {msgs.length === 0 && (
          <div className="coach-empty">
            <div className="coach-spark" aria-hidden="true">✦</div>
            <p>{t('Frag mich alles zu deinem Training und deiner Ernährung – oder lass dir eine Vorlage bauen.', 'Ask me anything about your training and food – or let me build a template.')}</p>
            <div className="coach-ideas">{ideas.map((x) => <button key={x} className="chip" onClick={() => send(x)}>{x}</button>)}</div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={'coach-msg ' + m.role}>
            <div className="coach-bubble">{m.text}</div>
            {m.templates?.map((d, i) => (
              <div key={i} className="coach-tpl">
                <div className="coach-tpl-name">{d.name}</div>
                <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.45 }}>{d.exercises.map((e) => `${name(e.ref)} ×${e.sets}`).join(' · ')}</div>
                <button className={'btn btn-sm ' + (d.saved ? 'btn-ghost' : 'btn-chrome')} disabled={d.saved} onClick={() => create(m.id, i)}>
                  {d.saved ? t('Angelegt ✓', 'Created ✓') : t('Als Vorlage anlegen', 'Create template')}
                </button>
              </div>
            ))}
          </div>
        ))}
        {busy && <div className="coach-msg assistant"><div className="coach-bubble coach-typing"><i /><i /><i /></div></div>}
        {error && <div className="hint" style={{ color: 'var(--danger)' }}><span>{error}</span></div>}
        <div ref={end} />
      </div>
      <form className="coach-input" onSubmit={(e) => { e.preventDefault(); send() }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Nachricht an den Coach', 'Message the coach')} />
        <button className="coach-send" type="submit" disabled={!text.trim() || busy} aria-label={t('Senden', 'Send')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </form>
    </div>,
    document.body,
  )
}
