import type { SetEntry, Workout } from './types'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export const pad = (n: number) => String(n).padStart(2, '0')

export function localIso(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const today = () => localIso().slice(0, 10)

export function clock(sec: number) {
  sec = Math.max(0, Math.floor(sec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function durationLabel(sec: number | null) {
  if (sec == null) return '–'
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

export function dateLabel(iso: string, withYear = true) {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
  return `${DAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}${withYear ? ' ' + d.getFullYear() : ''}`
}

export const shortDate = (iso: string) => {
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
  return `${d.getDate()}. ${MONTHS[d.getMonth()]}`
}

export const monthLabel = (d: Date) => `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`

export const fmtKg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))
export const fmtInt = (n: number) => Math.round(n).toLocaleString('de-AT')

/** Epley estimated one-rep max. */
export const e1rm = (w: number, r: number) => (r <= 0 ? 0 : r === 1 ? w : w * (1 + r / 30))

export const isRealSet = (s: SetEntry) => s.done && (s.weight ?? 0) >= 0 && (s.reps ?? 0) > 0

export function workoutVolume(w: Workout) {
  let v = 0
  for (const e of w.exercises) for (const s of e.sets) if (isRealSet(s)) v += (s.weight ?? 0) * (s.reps ?? 0)
  return v
}

export function workoutSetCount(w: Workout) {
  let n = 0
  for (const e of w.exercises) for (const s of e.sets) if (isRealSet(s)) n++
  return n
}

/** Monday of the ISO week, as YYYY-MM-DD. */
export function weekKey(iso: string) {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/**
 * iOS 18+: Safari has no working Vibration API, but toggling a native
 * `<input type="checkbox" switch>` plays the system haptic. Same approach as the
 * `ios-haptics` package: a fresh, hidden label wrapping the switch, clicked and
 * removed again. Only fires inside a user gesture (tap / touchend), and only with
 * "System Haptics" enabled in iOS settings.
 */
function iosTick() {
  const label = document.createElement('label')
  label.setAttribute('aria-hidden', 'true')
  label.style.display = 'none'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  label.appendChild(input)
  document.head.appendChild(label)
  label.click()
  document.head.removeChild(label)
}

/** Short haptic tick; `strong` = double tick. */
export function haptic(strong = false) {
  try {
    if (IS_IOS) {
      iosTick()
      if (strong) setTimeout(iosTick, 90)
      return
    }
    navigator.vibrate?.(strong ? 20 : 8)
  } catch {
    /* no haptics */
  }
}
