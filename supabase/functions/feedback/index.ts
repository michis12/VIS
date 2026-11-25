// Feedback from the app (Settings > Feedback): stores the message in
// public.feedback and mails it, nicely laid out, to the owner via Resend.
// Secrets: RESEND_API_KEY, FEEDBACK_TO (recipient), optional FEEDBACK_FROM
// (without an own domain Resend only sends from onboarding@resend.dev to the
// address the Resend account was created with).
// Only signed-in users; at most 5 messages per user and hour.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function mail(o: { kind: string; message: string; name: string; email: string; userId: string; id: number; at: string; meta: Record<string, unknown> }) {
  const problem = o.kind === 'problem'
  const accent = problem ? '#d9534f' : '#5fae73'
  const label = problem ? 'Problem' : 'Verbesserungsvorschlag'
  const row = (k: string, v: unknown) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#8e8e93;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;color:#1c1c1e">${esc(v)}</td></tr>`
  const m = o.meta
  const html = `<!doctype html><html><body style="margin:0;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f7;padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
  <tr><td style="background:#111;padding:18px 22px;color:#fff">
    <div style="font-size:12px;letter-spacing:.12em;color:#a1a1a6">VIS · FEEDBACK #${o.id}</div>
    <div style="font-size:20px;font-weight:700;margin-top:4px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${accent};margin-right:8px"></span>${label}</div>
  </td></tr>
  <tr><td style="padding:20px 22px">
    <div style="font-size:15px;line-height:1.55;color:#1c1c1e;white-space:pre-wrap;border-left:3px solid ${accent};padding:4px 0 4px 14px">${esc(o.message)}</div>
  </td></tr>
  <tr><td style="padding:0 22px 20px">
    <div style="font-size:12px;letter-spacing:.1em;color:#8e8e93;margin-bottom:6px">VON</div>
    <table cellpadding="0" cellspacing="0" style="font-size:14px">
      ${row('Name', o.name || '–')}
      ${row('E-Mail', o.email)}
      ${row('User-ID', o.userId)}
      ${row('Gesendet', o.at)}
    </table>
    <div style="font-size:12px;letter-spacing:.1em;color:#8e8e93;margin:16px 0 6px">GERÄT & APP</div>
    <table cellpadding="0" cellspacing="0" style="font-size:14px">
      ${row('App-Version', m.version)}
      ${row('Bildschirm', m.screen)}
      ${row('Gerät', m.userAgent)}
      ${row('Daten', m.stats)}
    </table>
  </td></tr>
  <tr><td style="padding:14px 22px;background:#fafafa;color:#8e8e93;font-size:12px">Direkt antworten geht an ${esc(o.email)}.</td></tr>
</table></td></tr></table></body></html>`
  const text = `VIS Feedback #${o.id} – ${label}\n\n${o.message}\n\nVon: ${o.name || '–'} <${o.email}>\nUser-ID: ${o.userId}\nGesendet: ${o.at}\nApp: ${m.version ?? ''} · ${m.screen ?? ''}\nGerät: ${m.userAgent ?? ''}\nDaten: ${m.stats ?? ''}`
  const preview = o.message.replace(/\s+/g, ' ').slice(0, 60)
  return { subject: `[VIS ${label}] ${preview}${o.message.length > 60 ? '…' : ''}`, html, text }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: { user } } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
  if (!user) return json({ error: 'auth' }, 401)

  let body: { kind?: string; message?: string; name?: string; meta?: Record<string, unknown> }
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  const kind = body.kind === 'idea' ? 'idea' : 'problem'
  const message = String(body.message ?? '').trim().slice(0, 4000)
  if (!message) return json({ error: 'empty' }, 400)

  // spam guard: 5 per hour
  const since = new Date(Date.now() - 3600e3).toISOString()
  const { count } = await sb.from('feedback').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since)
  if ((count ?? 0) >= 5) return json({ error: 'limit' }, 429)

  const m = body.meta ?? {}
  const meta = {
    version: String(m.version ?? '').slice(0, 40),
    screen: String(m.screen ?? '').slice(0, 40),
    userAgent: String(m.userAgent ?? '').slice(0, 300),
    stats: String(m.stats ?? '').slice(0, 200),
    name: String(body.name ?? '').slice(0, 80),
  }
  const { data: row, error } = await sb.from('feedback').insert({ user_id: user.id, kind, message, meta }).select('id, created_at').single()
  if (error || !row) return json({ error: 'store' }, 500)

  // mail (the message is stored either way)
  const key = Deno.env.get('RESEND_API_KEY')
  const to = Deno.env.get('FEEDBACK_TO')
  if (!key || !to) return json({ ok: true, mailed: false })
  const at = new Date(row.created_at).toLocaleString('de-AT', { timeZone: 'Europe/Vienna', dateStyle: 'medium', timeStyle: 'short' })
  const { subject, html, text } = mail({ kind, message, name: meta.name, email: user.email ?? '', userId: user.id, id: row.id, at, meta })
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('FEEDBACK_FROM') || 'VIS Feedback <onboarding@resend.dev>',
      to: [to], subject, html, text,
      ...(user.email ? { reply_to: user.email } : {}),
    }),
  })
  const mailed = res.ok
  if (mailed) await sb.from('feedback').update({ mailed: true }).eq('id', row.id)
  return json({ ok: true, mailed })
})
