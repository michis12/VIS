/**
 * iOS home-screen apps: when the keyboard opens, Safari scrolls the whole window
 * to reveal the field and does not always scroll it back. Everything still looks
 * right, but taps land ~a keyboard-height off (you hit "+ Satz" instead of the
 * check) until the app is restarted. The app never scrolls the window itself –
 * only its screens and sheets do – so the window is pinned at 0 here.
 *
 * Instead of letting iOS shove the page around, the keyboard height is exposed
 * as --kb: sheets sit on top of the keyboard, and a focused field is scrolled
 * into the visible part of its own scroll container.
 */
const isField = (el: Element | null): el is HTMLElement =>
  !!el &&
  ((el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range'].includes((el as HTMLInputElement).type)) ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    (el as HTMLElement).isContentEditable)

function scrollableParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

export function installViewportFix() {
  const vv = window.visualViewport
  const root = document.documentElement
  let kb = 0

  const pin = () => {
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
    const se = document.scrollingElement
    if (se && se.scrollTop) se.scrollTop = 0
  }

  const reveal = () => {
    const el = document.activeElement
    if (!isField(el)) return
    const visibleBottom = (vv?.height ?? window.innerHeight) - 16
    const r = el.getBoundingClientRect()
    if (r.bottom <= visibleBottom && r.top >= 0) return
    const box = scrollableParent(el)
    if (box) box.scrollBy({ top: r.bottom - visibleBottom + 8, behavior: 'smooth' })
  }

  const update = () => {
    const h = vv ? Math.round(window.innerHeight - vv.height) : 0
    kb = h > 80 ? h : 0
    root.style.setProperty('--kb', kb + 'px')
    root.classList.toggle('kb-open', kb > 0)
    pin()
    if (kb) window.setTimeout(reveal, 60)
  }

  vv?.addEventListener('resize', update)
  vv?.addEventListener('scroll', pin)
  window.addEventListener('scroll', pin, { passive: true })
  document.addEventListener('focusin', (e) => {
    if (!isField(e.target as Element)) return
    // after the keyboard animation
    window.setTimeout(() => { update(); reveal() }, 320)
  })
  document.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!isField(document.activeElement)) update()
      pin()
    }, 120)
  })
  // coming back from the lock screen / app switcher
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update() })
  window.addEventListener('pageshow', update)
  window.addEventListener('orientationchange', () => window.setTimeout(update, 300))
  update()
}
