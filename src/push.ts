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

const storedId = () => { try { return localStorage.getItem(KEY) } catch { return null } }
const storeId = (id: string | null) => {
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY) } catch { /* ignore */ }
}

/** Plans (or re-plans) the "Pause vorbei" push for this rest. Fire-and-forget. */
export async function scheduleRestPush(endAt: number, nextExercise?: string) {
  try {
    if (!(await pushActive()) || !(await getSession())) return
    await cancelRestPush()
    const { data, error } = await supabase!
      .from('rest_pushes')
      .insert({
        send_at: new Date(endAt).toISOString(),
        title: 'Pause vorbei',
        body: nextExercise ? `Weiter mit ${nextExercise}` : 'Zeit für den nächsten Satz',
      })
      .select('id')
      .single()
    if (!error && data) storeId(data.id)
  } catch {
    /* offline – the in-app timer still works */
  }
}

/** Moves the planned push (rest extended / shortened). */
export async function moveRestPush(endAt: number) {
  const id = storedId()
  if (!id || !supabase) return
  try {
    await supabase.from('rest_pushes').update({ send_at: new Date(endAt).toISOString() }).eq('id', id)
  } catch { /* ignore */ }
}

export async function cancelRestPush() {
  const id = storedId()
  storeId(null)
  if (!id || !supabase) return
  try {
    await supabase.from('rest_pushes').delete().eq('id', id)
  } catch { /* ignore */ }
}
