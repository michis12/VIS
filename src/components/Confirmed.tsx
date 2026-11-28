import { useEffect, useState } from 'react'
import { supabase } from '../cloud'
import { t } from '../i18n'

/**
 * Where the link in the sign-up e-mail lands. Instead of opening the whole web
 * app in the browser (easy to mix up with the installed app), it only confirms
 * and sends the user back to the VIS app.
 */
export function Confirmed({ error }: { error: string | null }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    // let Supabase take the session from the link (shared with the installed app
    // where the browser and the app share storage), then clean the address
    ;(async () => {
      try { await supabase?.auth.getSession() } catch { /* the link still confirmed the address */ }
      history.replaceState(null, '', location.pathname)
      setDone(true)
    })()
  }, [])
  return (
    <div className="cf">
      <div className="cf-glow" />
      <div className={'cf-mark' + (error ? ' err' : '')}>
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle className="cf-ring" cx="32" cy="32" r="28" />
          {error
            ? <path className="cf-check" d="M23 23l18 18M41 23L23 41" />
            : <path className="cf-check" d="M19 33l9 9 17-19" />}
        </svg>
      </div>
      <div className="cf-brand chrome-text">VIS</div>
      {error ? (
        <>
          <h1>{t('Link abgelaufen', 'Link expired')}</h1>
          <p>{t('Dieser Bestätigungslink gilt nicht mehr. Öffne die VIS-App und melde dich an oder registriere dich erneut – du bekommst einen neuen Link.', 'This confirmation link is no longer valid. Open the VIS app and sign in or register again – you’ll get a new link.')}</p>
        </>
      ) : (
        <>
          <h1>{t('E-Mail bestätigt', 'E-mail confirmed')}</h1>
          <p>{t('Dein Konto ist aktiv. Geh jetzt zurück in die VIS-App und melde dich dort mit deiner E-Mail und deinem Passwort an – ab dann sichert VIS alles automatisch in der Cloud.', 'Your account is active. Go back to the VIS app and sign in there with your e-mail and password – from then on VIS backs up everything to the cloud automatically.')}</p>
        </>
      )}
      <div className={'cf-hint' + (done ? ' in' : '')}>{t('Du kannst dieses Fenster jetzt schließen.', 'You can close this window now.')}</div>
    </div>
  )
}

/** The e-mail link's result in the address, or null when this is a normal start. */
export function confirmationFromUrl(): { error: string | null } | null {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''))
  const q = new URLSearchParams(location.search)
  const type = h.get('type') ?? q.get('type')
  const err = h.get('error_code') ?? q.get('error_code') ?? h.get('error') ?? q.get('error')
  if (type === 'signup' || type === 'email_change' || type === 'email') return { error: null }
  if (err && (h.get('error_description') ?? q.get('error_description') ?? '').toLowerCase().match(/link|otp|expired|invalid/)) return { error: err }
  return null
}
