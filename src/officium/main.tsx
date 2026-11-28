import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import './officium.css'
import { Officium } from './Officium'

// The app's service worker also covers this page. An older one still serves an old,
// cached Officium: ask it to update, and reload once when the new one takes over
// (the new one no longer caches the Officium at all).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {})
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    location.reload()
  })
}

// VIS-Officium: the owner's overview, a separate page of the same build (officium.html)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Officium />
  </StrictMode>,
)
