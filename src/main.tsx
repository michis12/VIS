import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { Confirmed, confirmationFromUrl } from './components/Confirmed'
import './styles.css'
import { installViewportFix } from './viewport'

registerSW({ immediate: true })
installViewportFix()

// opened from the link in the sign-up e-mail: only confirm, don't start the web app
const confirmation = confirmationFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {confirmation ? <Confirmed error={confirmation.error} /> : <App />}
  </StrictMode>,
)
