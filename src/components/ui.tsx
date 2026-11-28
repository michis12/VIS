import { t } from '../i18n'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib'

const IS_TOUCH_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // Rendered into <body>: inside a scrolling screen iOS traps position:fixed
  // children below the tab bar, which then covered the sheet's buttons.
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog">
        <div className="grab" />
        {children}
      </div>
    </>,
    document.body,
  )
}

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const Icon = {
  dumbbell: () => (
    // the outer plates in emerald, like the app icon
    <svg viewBox="0 0 24 24" {...P}><path d="M6.5 6.5v11M17.5 6.5v11M6.5 12h11" /><path className="ico-plate" d="M3.5 9v6M20.5 9v6" stroke="#3fd69a" /></svg>
  ),
  chart: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
  ),
  body: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M12 3a8 8 0 1 0 0 18 8 8 0 0 0 0-18Z" /><path d="M12 7v5l3 2" /></svg>
  ),
  share: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" {...P}><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" /><path d="M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2" /></svg>
  ),
  up: ({ size = 14 }: { size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} {...P} strokeWidth={2.6}><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /></svg>
  ),
  cup: ({ size = 14 }: { size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} {...P} strokeWidth={2.2}><path d="M8 4h8v6a4 4 0 0 1-8 0Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8" /></svg>
  ),
  trophy: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M8 4h8v6a4 4 0 0 1-8 0Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8" /></svg>
  ),
  food: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M12 7c-1.2-1.6-3.4-2.3-5.3-1.4C4.4 6.7 3.6 9.6 4.5 12.6 5.6 16.4 8 20 10 20c.8 0 1.3-.5 2-.5s1.2.5 2 .5c2 0 4.4-3.6 5.5-7.4.9-3-.1-5.9-2.2-7-1.9-.9-4.1-.2-5.3 1.4Z" /><path d="M12 7c0-1.8.8-3.2 2.4-4" /></svg>
  ),
  gear: () => (
    <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
  ),
  check: () => (
    <svg viewBox="0 0 24 24" width="20" height="20" {...P} strokeWidth={2.6}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
  ),
  chevron: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" {...P}><path d="m9 6 6 6-6 6" /></svg>
  ),
  back: () => (
    <svg viewBox="0 0 24 24" width="22" height="22" {...P}><path d="m15 6-6 6 6 6" /></svg>
  ),
  more: () => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
  ),
  plus: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" {...P}><path d="M12 5v14M5 12h14" /></svg>
  ),
}

/** iOS-style scroll-snap wheel. */
export function Wheel({ values, value, onChange, format = String }: {
  values: number[]
  value: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const ITEM = 44
  const idx = Math.max(0, values.findIndex((v) => v >= value - 1e-9))
  const [sel, setSel] = useState(idx)
  const settle = useRef<number>(0)

  useEffect(() => {
    ref.current?.scrollTo({ top: idx * ITEM })
    setSel(idx)
    // only on mount / external value jumps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const i = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)))
    if (i !== sel) {
      setSel(i)
      if (!IS_TOUCH_IOS) haptic() // Android: tick per step; iOS ignores haptics outside gestures
    }
    clearTimeout(settle.current)
    settle.current = window.setTimeout(() => onChange(values[i]), 80)
  }

  return (
    <div className="wheel">
      <div className="wheel-band" />
      {/* iOS only allows haptics inside a gesture, so tick on touchend as well */}
      <div className="wheel-scroll" ref={ref} onScroll={onScroll} onTouchEnd={() => haptic()}>
        <div className="wheel-pad" />
        {values.map((v, i) => (
          // each value is a Tap (native switch inside): tapping a number jumps there and vibrates on iPhone
          <Tap
            key={v}
            className={'wheel-item' + (i === sel ? ' sel' : '')}
            onClick={() => ref.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' })}
          >
            <span>{format(v)}</span>
          </Tap>
        ))}
        <div className="wheel-pad" />
      </div>
    </div>
  )
}

/** Flat, horizontal wheel (e.g. how many portions): swipe sideways, the middle value counts. */
export function HWheel({ values, value, onChange, format = String }: {
  values: number[]
  value: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const ITEM = 58
  const idx = Math.max(0, values.findIndex((v) => v >= value - 1e-9))
  const [sel, setSel] = useState(idx)
  const settle = useRef<number>(0)

  useEffect(() => {
    ref.current?.scrollTo({ left: idx * ITEM })
    setSel(idx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const i = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollLeft / ITEM)))
    if (i !== sel) {
      setSel(i)
      if (!IS_TOUCH_IOS) haptic()
    }
    clearTimeout(settle.current)
    settle.current = window.setTimeout(() => onChange(values[i]), 60)
  }

  return (
    <div className="hwheel">
      <div className="hwheel-band" />
      <div className="hwheel-scroll" ref={ref} onScroll={onScroll} onTouchEnd={() => haptic()}>
        <div className="hwheel-pad" />
        {values.map((v, i) => (
          <Tap key={v} className={'hwheel-item' + (i === sel ? ' sel' : '')} onClick={() => ref.current?.scrollTo({ left: i * ITEM, behavior: 'smooth' })}>
            <span>{format(v)}</span>
          </Tap>
        ))}
        <div className="hwheel-pad" />
      </div>
    </div>
  )
}

/**
 * A tappable element that carries an invisible native iOS switch. The user's own
 * tap toggles the switch, and iOS (18+) plays its system haptic for that – this
 * works even where programmatic "haptic tricks" are blocked. Renders as a <label>
 * with button semantics; the click the label forwards to the switch is ignored so
 * `onClick` fires exactly once per tap.
 */
export function Tap({ onClick, className, children, disabled, ...rest }: {
  onClick: () => void
  className?: string
  children: ReactNode
  disabled?: boolean
  'aria-label'?: string
  style?: React.CSSProperties
}) {
  return (
    <label
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      className={(className ?? '') + ' tap' + (disabled ? ' tap-disabled' : '')}
      onClick={(e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return // forwarded click
        if (disabled) { e.preventDefault(); return }
        if (!IS_TOUCH_IOS) { try { navigator.vibrate?.(14) } catch { /* no vibration */ } }
        onClick()
      }}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
      {...rest}
    >
      <input type="checkbox" {...{ switch: '' }} className="haptic-sink" tabIndex={-1} aria-hidden="true" disabled={disabled} />
      {children}
    </label>
  )
}

/** Counters for records (trophy) and progress (arrow). Renders nothing when both are 0. */
export function ProgressBadges({ ups, prs, big = false }: { ups: number; prs: number; big?: boolean }) {
  if (!ups && !prs) return null
  return (
    <span className={'pbadges' + (big ? ' big' : '')}>
      {prs > 0 && <span className="pbadge pr" title={t(`${prs} Rekord${prs > 1 ? 'e' : ''}`, `${prs} record${prs > 1 ? 's' : ''}`)}><Icon.cup size={big ? 16 : 12} />{prs}</span>}
      {ups > 0 && <span className="pbadge up" title={t(`${ups}× Fortschritt`, `${ups}× progress`)}><Icon.up size={big ? 16 : 12} />{ups}</span>}
    </span>
  )
}

/** Small marker on a set number. */
export function SetMark({ flag }: { flag: 'up' | 'pr' | null | undefined }) {
  if (!flag) return null
  return (
    <span className={'set-mark ' + flag} aria-label={flag === 'pr' ? t('Rekord', 'Record') : t('Fortschritt', 'Progress')}>
      {flag === 'pr' ? <Icon.cup size={10} /> : <Icon.up size={10} />}
    </span>
  )
}

/** Waiting for the AI: a few shimmering placeholder rows shaped like the coming result. */
export function AiWait({ text, rows = 3 }: { text: string; rows?: number }) {
  return (
    <div className="ai-sk" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ai-sk-row" style={{ animationDelay: `${i * 0.08}s` }}>
          <i style={{ width: `${[62, 48, 70, 54][i % 4]}%` }} /><i className="sm" />
        </div>
      ))}
      <div className="ai-sk-txt">{text}</div>
    </div>
  )
}

export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800)
    return () => clearTimeout(t)
  }, [onDone])
  return <div className="toast">{text}</div>
}
