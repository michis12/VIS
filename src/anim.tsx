import { useEffect, useRef, useState } from 'react'

/**
 * Small, calm motion helpers. Everything is short (≈0.5 s), eases out and is
 * switched off when the phone asks for reduced motion.
 */
export const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export const easeOut = (k: number) => 1 - Math.pow(1 - k, 3)

/**
 * A number that glides to its new value. `from` is where the very first render
 * starts (default: the value itself, i.e. no intro; pass 0 to count up on mount).
 */
const introsSeen = new Set<string>()

export function useTween(value: number, { ms = 550, from, intro }: { ms?: number; from?: number; intro?: string } = {}) {
  // with `intro`, the count-up from `from` plays only the first time per app start
  const [start] = useState(() => {
    if (from == null) return value
    if (!intro) return from
    return introsSeen.has(intro) ? value : from
  })
  // marked after mounting (StrictMode runs the initializer twice)
  useEffect(() => { if (intro) introsSeen.add(intro) }, [intro])
  const [shown, setShown] = useState(reducedMotion() ? value : start)
  const cur = useRef(reducedMotion() ? value : start)
  useEffect(() => {
    if (reducedMotion() || !Number.isFinite(value)) { cur.current = value; setShown(value); return }
    const a = cur.current
    if (a === value) return
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const v = a + (value - a) * easeOut(k)
      cur.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}

/** Animated number in text; `format` gets the in-between value. */
export function Num({ value, format = (v) => String(Math.round(v)), from, ms }: {
  value: number; format?: (v: number) => string; from?: number; ms?: number
}) {
  return <>{format(useTween(value, { from, ms }))}</>
}
