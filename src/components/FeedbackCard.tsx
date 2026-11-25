import { useEffect, useState } from 'react'
import { getSession, supabase } from '../cloud'
import { haptic } from '../lib'
import { useStore } from '../store'
import { Tap } from './ui'

/** Settings: send a problem or an idea straight to the developer (signed-in users only). */
export function FeedbackCard({ toast }: { toast: (t: string) => void }) {
  const store = useStore()
  const [signedIn, setSignedIn] = useState(false)
  const [kind, setKind] = useState<'problem' | 'idea'>('problem')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { getSession().then((s) => setSignedIn(!!s)).catch(() => {}) }, [])
  if (!signedIn || !supabase) return null

  const send = async () => {
    const message = text.trim()
    if (!message || busy) return
    setBusy(true)
    try {
      const { error } = await supabase!.functions.invoke('feedback', {
        body: {
          kind, message, name: store.settings.name ?? '',
          meta: {
            version: __BUILD__,
            screen: `${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x`,
            userAgent: navigator.userAgent,
            stats: `${store.workouts.length} Workouts · ${store.weights.length} Gewichte · ${store.foodLog.length} Essenseinträge · ${store.phases.length} Phasen`,
          },
        },
      })
      if (error) {
        let code = ''
        try { code = (await (error as { context?: Response }).context?.json())?.error ?? '' } catch { /* not json */ }
        throw new Error(code === 'limit' ? 'Zu viele Nachrichten – in einer Stunde nochmal.' : 'Senden hat nicht geklappt – Internet prüfen.')
      }
      setText('')
      haptic(true)
      toast(kind === 'problem' ? 'Danke – Problem ist angekommen' : 'Danke für die Idee!')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="section-title"><h2>Feedback</h2></div>
      <div className="card">
        <div className="segmented">
          <button className={kind === 'problem' ? 'on' : ''} onClick={() => setKind('problem')}>Problem</button>
          <button className={kind === 'idea' ? 'on' : ''} onClick={() => setKind('idea')}>Idee</button>
        </div>
        <textarea
          className="input plan-text" rows={4} style={{ marginTop: 12 }} value={text} maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === 'problem' ? 'Was ist passiert? Wo in der App?' : 'Was würde VIS besser machen?'}
        />
        <Tap className="btn btn-chrome btn-block" style={{ marginTop: 12 }} onClick={send}>
          {busy ? 'Wird gesendet…' : 'Senden'}
        </Tap>
        <div className="hint"><span>Geht direkt an den Entwickler – mit deinem Namen, deiner E-Mail und App-Version, damit er antworten kann.</span></div>
      </div>
    </>
  )
}
