// Sends due "Pause vorbei" web pushes. Called every few seconds by pg_cron via
// app_private.dispatch_rest_pushes(), which passes the due messages and the VAPID
// private key (from Supabase Vault). The public key is fixed here, so the function
// is useless to anyone who does not hold the matching private key.
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC = 'BEXv7o1J_39duBh3xMO1ZJqvwuFJV8vbUyFKhio0pcBfheE6pFEowZFPqthFVt_JHxFXLZn2oYzgDGM38Nia3Hk'
const SUBJECT = 'https://pgorg-git.github.io/VIS/'

interface Message {
  endpoint: string
  p256dh: string
  auth: string
  title: string
  body: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  let payload: { vapidPrivate?: string; messages?: Message[] }
  try {
    payload = await req.json()
  } catch {
    return new Response('bad json', { status: 400 })
  }
  const { vapidPrivate, messages = [] } = payload
  if (!vapidPrivate || !Array.isArray(messages)) return new Response('bad request', { status: 400 })

  try {
    webpush.setVapidDetails(SUBJECT, VAPID_PUBLIC, vapidPrivate)
  } catch {
    return new Response('bad key', { status: 403 })
  }

  const gone: string[] = []
  let sent = 0
  await Promise.all(
    messages.slice(0, 50).map(async (m) => {
      try {
        await webpush.sendNotification(
          { endpoint: m.endpoint, keys: { p256dh: m.p256dh, auth: m.auth } },
          JSON.stringify({ title: m.title, body: m.body, tag: 'rest' }),
          { TTL: 120, urgency: 'high' },
        )
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) gone.push(m.endpoint)
        console.error('push failed', status, (e as Error).message)
      }
    }),
  )

  // forget subscriptions the push service says no longer exist
  if (gone.length) {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (url && key) {
      const list = gone.map((g) => `"${g.replace(/"/g, '\\"')}"`).join(',')
      await fetch(`${url}/rest/v1/push_subscriptions?endpoint=in.(${encodeURIComponent(list)})`, {
        method: 'DELETE',
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      }).catch(() => {})
    }
  }

  return new Response(JSON.stringify({ sent, gone: gone.length }), { headers: { 'Content-Type': 'application/json' } })
})
