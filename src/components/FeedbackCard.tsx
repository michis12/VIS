import { t } from '../i18n'
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
        throw new Error(code === 'limit' ? t('Zu viele Nachrichten – in einer Stunde nochmal.', 'Too many messages – try again in an hour.') : t('Senden hat nicht geklappt – Internet prüfen.', 'Sending failed – check your connection.'))
      }
      setText('')
      haptic(true)
      toast(kind === 'problem' ? t('Danke – Problem ist angekommen', 'Thanks – your report arrived') : t('Danke für die Idee!', 'Thanks for the idea!'))
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
          <button className={kind === 'idea' ? 'on' : ''} onClick={() => setKind('idea')}>{t('Idee', 'Idea')}</button>
        </div>
        <textarea
          className="input plan-text" rows={4} style={{ marginTop: 12 }} value={text} maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === 'problem' ? t('Was ist passiert? Wo in der App?', 'What happened? Where in the app?') : t('Was würde VIS besser machen?', 'What would make VIS better?')}
        />
        <Tap className="btn btn-chrome btn-block" style={{ marginTop: 12 }} onClick={send}>
          {busy ? t('Wird gesendet…', 'Sending…') : t('Senden', 'Send')}
        </Tap>
        <div className="hint"><span>{t('Geht direkt an den Entwickler – mit deinem Namen, deiner E-Mail und App-Version, damit er antworten kann.', 'Goes straight to the developer – with your name, email and app version so he can reply.')}</span></div>
      </div>
    </>
  )
}
