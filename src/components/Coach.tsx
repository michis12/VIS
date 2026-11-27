import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { describe, knownFoods, runActions, sanitize, type Action } from '../coachActions'
import { STARTER_SPLIT } from '../data/starterSplit'
import { foodAi } from '../foodAi'
import { getLang, t } from '../i18n'
import { e1rm, haptic, isRealSet, localIso, today, uid, workoutSetCount, workoutVolume } from '../lib'
import { dayTotals, kcalTarget } from '../nutrition'
import { useStore } from '../store'
import { nextTemplate, orderedTemplates } from '../templateOrder'
import { CreditPill, useCredit } from './AiCredit'
import { useWeekScore } from './WeeklyReport'
import { Icon } from './ui'

/**
 * VIS Coach (Ultra): a chat with Haiku that sees a compact summary of the
 * user's data and can do things in the app (templates, exercises, foods,
 * recipes, diary, weight, phase, rest timer). Every action shows up as a card
 * and only runs after a tap. The conversation stays on this device.
 */
interface Act { a: Action; done?: boolean; title?: string; detail?: string }
interface Msg { id: string; role: 'user' | 'assistant'; text: string; actions?: Act[]; templates?: { name: string; exercises: { ref: string; sets: number }[]; saved?: boolean }[] }

const KEY = 'vis.coach.v1'
const load = (): Msg[] => {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Msg[]
    // older answers kept template drafts in their own field
    return list.map((m) => (m.templates?.length && !m.actions ? { ...m, actions: m.templates.map((d) => ({ a: { kind: 'template', name: d.name, exercises: d.exercises } as Action, done: d.saved })), templates: undefined } : m))
  } catch { return [] }
}
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
      templates: orderedTemplates(store.templates, store.settings.templateOrder).map((tp) => ({ id: tp.id, name: tp.name, exercises: tp.exercises.map((e) => `${e.exerciseId} ×${e.sets}`).join(', ') })),
      templatesNote: 'in dieser Reihenfolge (Rhythmus); als Nächstes: ' + (nextTemplate(orderedTemplates(store.templates, store.settings.templateOrder), store.workouts)?.name ?? '-'),
      diaryToday: store.foodLog.filter((e) => e.date === d).map((e) => `${e.meal}: ${Math.round(e.grams)} g ${e.name} (${Math.round(e.kcal)} kcal)`),
      recipes: store.recipes.map((r) => r.name),
      restSec: store.settings.restSec,
      topLifts90d: [...lifts].sort((a, b) => b[1].sets - a[1].sets).slice(0, 10).map(([id, l]) => `${name(id)}: ${l.sets} Sätze, bestes e1RM ${Math.round(l.best)} kg`),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.workouts, store.phases, store.weights, store.foodLog, store.templates, store.recipes, store.settings, week.score])
  const known = useMemo(() => knownFoods(store), [store])
  const knownMap = useMemo(() => new Map(known.map((k) => [k.id, k])), [known])

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
        foods: known.map((k) => ({ id: k.id, name: k.food.name + (k.food.brand ? ` (${k.food.brand})` : ''), kcal: k.food.kcal, p: k.food.p, c: k.food.c, f: k.food.f, ...(k.g ? { g: k.g } : {}) })),
        now: localIso().slice(0, 16),
      }, 'coach')
      const actions = sanitize(Array.isArray(res.actions) ? res.actions : [], store).map((a) => ({ a, ...describe(a, store, knownMap) }))
      const withReply: Msg[] = [...next, { id: uid(), role: 'assistant', text: String(res.reply ?? ''), actions }]
      setMsgs(withReply); keep(withReply)
      haptic()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // run one action (i) or all open ones (i = -1) of an answer
  const run = (msgId: string, i: number) => {
    const m = msgs.find((x) => x.id === msgId)
    if (!m?.actions) return
    const open = m.actions.map((x, j) => ({ ...x, j })).filter((x) => !x.done && (i < 0 || x.j === i))
    if (!open.length) return
    runActions(open.map((x) => x.a), m.actions.map((x) => x.a), store, knownMap)
    haptic(true)
    const did = new Set(open.map((x) => x.j))
    // a template that needed a new exercise has created it, so that card is done too
    const made = new Set(open.flatMap((x) => ('exercises' in x.a ? x.a.exercises : []).filter((e) => e.ref.startsWith('new:')).map((e) => e.ref.slice(4).trim().toLowerCase())))
    const next = msgs.map((x) => (x.id === msgId ? { ...x, actions: x.actions!.map((y, j) => (did.has(j) || (y.a.kind === 'exercise' && made.has(y.a.name.trim().toLowerCase())) ? { ...y, done: true } : y)) } : x))
    setMsgs(next); keep(next)
  }

  const ideas = getLang() === 'en'
    ? ['How was my week?', 'Create an Upper/Lower plan for me', 'Log 2 eggs and a slice of toast for breakfast', 'Sort my templates smartly']
    : ['Wie lief meine Woche?', 'Erstell mir einen Upper/Lower-Plan', 'Trag 2 Eier und eine Semmel zum Frühstück ein', 'Sortier meine Vorlagen sinnvoll']

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
            <p>{t('Frag mich alles zu deinem Training und deiner Ernährung – oder lass mich etwas erledigen: Vorlagen, Übungen, Rezepte, Essen eintragen, Gewicht, Phase.', 'Ask me anything about your training and food – or let me do things: templates, exercises, recipes, logging food, weight, phase.')}</p>
            <div className="coach-ideas">{ideas.map((x) => <button key={x} className="chip" onClick={() => send(x)}>{x}</button>)}</div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={'coach-msg ' + m.role}>
            <div className="coach-bubble">{m.text}</div>
            {m.actions?.map((x, i) => {
              // the text from when the answer came (afterwards the data has changed)
              const d = x.title ? { title: x.title, detail: x.detail ?? '' } : describe(x.a, store, knownMap)
              return (
                <div key={i} className={'coach-tpl' + (x.done ? ' done' : '')}>
                  <div className="coach-tpl-name">{d.title}</div>
                  {d.detail && <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.45 }}>{d.detail}</div>}
                  <button className={'btn btn-sm ' + (x.done ? 'btn-ghost' : 'btn-chrome')} disabled={x.done} onClick={() => run(m.id, i)}>
                    {x.done ? t('Erledigt ✓', 'Done ✓') : t('Übernehmen', 'Apply')}
                  </button>
                </div>
              )
            })}
            {(m.actions?.filter((x) => !x.done).length ?? 0) > 1 && (
              <button className="btn btn-sm btn-ghost coach-all" onClick={() => run(m.id, -1)}>{t('Alles übernehmen', 'Apply all')}</button>
            )}
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
