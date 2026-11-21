import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

registerSW({ immediate: true })

/**
 * iOS standalone (home screen) bug: with a translucent status bar the layout
 * viewport can be shorter than the screen, leaving a strip under fixed bottom
 * bars. Measure the shortfall and let CSS push those bars down by it.
 */
function fixIosBottomGap() {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  const portrait = window.innerHeight > window.innerWidth
  const gap = standalone && portrait ? Math.round(screen.height - window.innerHeight) : 0
  document.documentElement.style.setProperty('--ios-gap', gap > 0 && gap < 120 ? `${gap}px` : '0px')
}
fixIosBottomGap()
window.addEventListener('resize', fixIosBottomGap)
window.addEventListener('orientationchange', () => setTimeout(fixIosBottomGap, 300))
window.addEventListener('pageshow', fixIosBottomGap)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
