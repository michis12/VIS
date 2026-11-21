import { useEffect, useRef, useState } from 'react'
import { askCoach, buildContext, type ChatTurn } from '../ai'
import { Icon } from '../components/ui'
import { haptic } from '../lib'
import { useNav } from '../nav'
import { useStore } from '../store'

const KEY = 'vis.coachChat'
const SUGGESTIONS = [
  'Wie hat sich mein Bankdrücken in den letzten 3 Monaten entwickelt?',
  'Welche Muskelgruppen vernachlässige ich gerade?',
  'Wo stagniere ich und was soll ich ändern?',
  'Passt mein Training zu meiner aktuellen Phase?',
]

const load = (): ChatTurn[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] } }
const persist = (t: ChatTurn[]) => { try { localStorage.setItem(KEY, JSON.stringify(t.slice(-30))) } catch { /* ignore */ } }

export function Coach() {
  const store = useStore()
  const nav = useNav()
  const [turns, setTurns] = useState<ChatTurn[]>(load)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns, busy])

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    haptic()
    const next: ChatTurn[] = [...turns, { role: 'user', content: q }]
    setTurns(next)
    setInput('')
    setBusy(true)
    setErr(null)
    try {
      const context = buildContext({ ...store, progress: store.progress.byId, name: store.settings.name })
      const answer = await askCoach({ mode: 'chat', context, messages: next.slice(-10) })
      const done: ChatTurn[] = [...next, { role: 'assistant', content: answer }]
      setTurns(done)
      persist(done)
    } catch (e) {
      setErr((e as Error).message)
      setTurns(turns) // drop the unanswered question
      setInput(q)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen no-tabs">
      <div className="wo-head">
        <button className="icon-btn" onClick={nav.pop} aria-label="Zurück"><Icon.back /></button>
        <div className="grow">
          <div className="name"><span className="ai-spark">✦</span> Coach</div>
          <div className="wo-timer">kennt dein ganzes Training</div>
        </div>
        {turns.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setTurns([]); persist([]) }}>Neu</button>
        )}
      </div>

      {turns.length === 0 && (
        <>
          <p className="muted" style={{ marginTop: 20 }}>Frag mich alles zu deinem Training, deinen Rekorden, deinem Gewicht oder deinem Wochenscore.</p>
          <div className="suggest">
            {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
          </div>
        </>
      )}

      <div className="chat">
        {turns.map((t, i) => <div key={i} className={'bubble ' + (t.role === 'user' ? 'me' : 'ai')}>{t.content}</div>)}
        {busy && <div className="bubble ai faint">Denke nach…</div>}
        {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
        <div ref={endRef} />
      </div>

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input) }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Frag den Coach…" enterKeyHint="send" />
        <button className="btn btn-chrome btn-sm" style={{ height: 44 }} disabled={busy || !input.trim()}>Senden</button>
      </form>
    </div>
  )
}
