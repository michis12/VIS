import { buzz, haptic } from './lib'

/** Rest timer end-signal: sound + vibration + (if allowed) a system notification. */
let ctx: AudioContext | null = null

/** Must be called from a user gesture once so iOS lets us play audio later. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') ctx.resume()
  } catch {
    /* no audio */
  }
}

function chime() {
  if (!ctx) return
  const t = ctx.currentTime
  ;[880, 1318.5].forEach((f, i) => {
    const o = ctx!.createOscillator()
    const g = ctx!.createGain()
    o.type = 'sine'
    o.frequency.value = f
    g.gain.setValueAtTime(0.0001, t + i * 0.18)
    g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.6)
    o.connect(g).connect(ctx!.destination)
    o.start(t + i * 0.18)
    o.stop(t + i * 0.18 + 0.65)
  })
}

/**
 * In-app end of rest: sound + vibration only. The system notification for a
 * locked phone comes from the server push (push.ts); showing one here as well
 * produced a second notification when the app was opened afterwards.
 */
export function restFinished() {
  chime()
  haptic(true)
  setTimeout(() => haptic(true), 400)
  buzz([220, 120, 220]) // Android: a clear double buzz
}

const KEY = 'vis.restEnd'
export const loadRestEnd = (): number | null => {
  try {
    const v = Number(localStorage.getItem(KEY))
    return v > Date.now() ? v : null
  } catch {
    return null
  }
}
export const storeRestEnd = (v: number | null) => {
  try {
    if (v) localStorage.setItem(KEY, String(v))
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
