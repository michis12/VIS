import { t } from './i18n'
import { getSession, supabase } from './cloud'

/**
 * Rest-timer pushes that arrive while the phone is locked.
 * The device registers a Web Push subscription (push_subscriptions); each rest
 * inserts a row in rest_pushes with its end time. A pg_cron job in Supabase sends
 * the push when it is due (see supabase/migrations/0004_rest_push.sql).
 * iPhone: only for the home-screen app (iOS 16.4+), after allowing notifications.
 */
const VAPID = import.meta.env.VITE_VAPID_PUBLIC as string | undefined
const KEY = 'vis.restPushId'

export const pushSupported = () =>
  !!VAPID && !!supabase && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function urlB64ToUint8Array(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Subscribes this device and stores the subscription for the signed-in user. */
export async function enablePush(): Promise<'ok' | 'denied' | 'unsupported' | 'login'> {
  if (!pushSupported()) return 'unsupported'
  if (!(await getSession())) return 'login'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID!) }))
  const json = sub.toJSON()
  const { error } = await supabase!.from('push_subscriptions').upsert(
    { endpoint: sub.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    { onConflict: 'endpoint' },
  )
  if (error) throw new Error(error.message)
  return 'ok'
}

/** True when this device has a push subscription and notifications are allowed. */
export async function pushActive(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.getRegistration()
  return !!(await reg?.pushManager.getSubscription())
}

// There is at most one planned rest push per user (a DB trigger removes older
// ones on insert). Requests run one after another so a quick cancel can't
// overtake the insert it is meant to undo.
let queue: Promise<unknown> = Promise.resolve()
const enqueue = (job: () => Promise<unknown>) => {
  queue = queue.then(job, job).catch(() => { /* offline – the in-app timer still works */ })
  return queue
}
const ALL = '1970-01-01T00:00:00Z' // filter that matches every own row (RLS limits it to this user)

/** Plans (or re-plans) the "Pause vorbei" push for this rest. Fire-and-forget. */
export function scheduleRestPush(endAt: number, nextExercise?: string) {
  return enqueue(async () => {
    if (!(await pushActive()) || !(await getSession())) return
    await supabase!.from('rest_pushes').insert({
      send_at: new Date(endAt).toISOString(),
      title: t('Pause vorbei', 'Rest over'),
      body: nextExercise ? t(`Weiter mit ${nextExercise}`, `Next up: ${nextExercise}`) : t('Zeit für den nächsten Satz', 'Time for the next set'),
    })
  })
}

/** Moves the planned push (rest extended / shortened). */
export function moveRestPush(endAt: number) {
  return enqueue(async () => {
    if (!supabase || !(await getSession())) return
    await supabase.from('rest_pushes').update({ send_at: new Date(endAt).toISOString() }).gte('send_at', ALL)
  })
}

/** Removes every planned rest push of this user. */
export function cancelRestPush() {
  try { localStorage.removeItem(KEY) } catch { /* old versions stored an id here */ }
  return enqueue(async () => {
    if (!supabase || !(await getSession())) return
    await supabase.from('rest_pushes').delete().gte('send_at', ALL)
  })
}
