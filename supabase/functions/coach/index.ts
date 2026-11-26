// VIS Coach: a small chat (Haiku) that knows the user's data and can draft
// workout templates. Ultra feature: plans ultra, fam and dev only. Same access,
// quota and cost booking as food-photo (ai_quota / ai_ledger, migration 0012).
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MODEL = Deno.env.get('FAST_MODEL') || 'claude-haiku-5-5'
// $ per million tokens [input, output]
const PRICES: Record<string, [number, number]> = { 'claude-haiku-5-5': [0.1, 0.5], 'claude-sonnet-5-5': [2, 10] }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Die Antwort an den Nutzer, kurz und konkret' },
    templates: {
      type: 'array',
      description: 'Nur wenn der Nutzer ausdrücklich Vorlagen/einen Plan möchte, sonst leer',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'z. B. "Day 1 Upper"' },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ref: { type: 'string', description: 'id aus dem Übungskatalog' },
                sets: { type: 'integer', description: 'Arbeitssätze, 1 bis 5' },
              },
              required: ['ref', 'sets'],
              additionalProperties: false,
            },
          },
        },
        required: ['name', 'exercises'],
        additionalProperties: false,
      },
    },
  },
  required: ['reply', 'templates'],
  additionalProperties: false,
}

const SYSTEM = `Du bist der Coach in der Fitness-App VIS (Krafttraining + Ernährung). Du siehst die Daten des Nutzers unten.
- Antworte kurz (meist 2–6 Sätze), konkret und mit seinen echten Zahlen. Du-Form, freundlich, kein Fachchinesisch, keine Floskeln.
- Wenn Daten fehlen, sag es ehrlich statt zu raten.
- Vorlagen (Trainingspläne) legst du nur an, wenn der Nutzer darum bittet. Dann: "templates" füllen, nur ids aus dem Übungskatalog, 5–9 Übungen pro Tag, meist 2–3 Arbeitssätze, sinnvolle Reihenfolge (große Übungen zuerst). In "reply" kurz erklären, was du angelegt hast – der Nutzer bestätigt es in der App.
- Fragt jemand nach einem Upper/Lower-Plan oder einer Grundvorlage, nimm den Referenz-Split unten als Basis und passe ihn an seine Wünsche an.
- Keine medizinischen Diagnosen; bei Schmerzen oder Verletzungen zum Arzt/Physio raten.
- Du kannst nichts in der App ändern außer Vorlagen vorzuschlagen; sag das, wenn jemand etwas anderes will.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: { user } } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
  if (!user) return json({ error: 'auth' }, 401)
  const { data: quota } = await sb.rpc('ai_quota', { target: user.id }).maybeSingle()
  const q = quota as { plan: string; active: boolean; month_usd: number; limit_usd: number | null } | null
  if (!q) return json({ error: 'access' }, 403)
  if (!q.active) return json({ error: 'expired' }, 403)
  if (!['ultra', 'fam', 'dev'].includes(q.plan)) return json({ error: 'ultra' }, 403)
  const limit = q.limit_usd == null ? null : Number(q.limit_usd)
  if (limit != null && Number(q.month_usd) >= limit) return json({ error: 'limit', pct: 100 }, 429)

  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return json({ error: 'nokey' }, 503)

  let body: { messages?: { role: string; text: string }[]; context?: string; catalog?: { id: string; name: string }[]; starter?: string; lang?: string }
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  const history = (body.messages ?? []).slice(-12)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && String(m.text ?? '').trim())
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.text).slice(0, 2000) }))
  if (!history.length || history[history.length - 1].role !== 'user') return json({ error: 'text' }, 400)
  while (history.length && history[0].role !== 'user') history.shift()

  const catalog = (body.catalog ?? []).slice(0, 400).map((e) => `${String(e.id).slice(0, 60)} | ${String(e.name).slice(0, 60)}`).join('\n')
  const system = SYSTEM
    + `\n\nDaten des Nutzers (aus der App, JSON):\n${String(body.context ?? '{}').slice(0, 9000)}`
    + `\n\nReferenz-Split (Upper/Lower, 3 Tage):\n${String(body.starter ?? '').slice(0, 1500)}`
    + `\n\nÜbungskatalog (id | Name):\n${catalog}`
    + (body.lang === 'en' ? '\n\nIMPORTANT: The app is set to English. Reply in English (friendly "you"). Template names in English.' : '')

  const client = new Anthropic({ apiKey: key })
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: history,
    // deno-lint-ignore no-explicit-any
    } as any)
    if (res.stop_reason === 'refusal') return json({ error: 'refusal' }, 422)
    // deno-lint-ignore no-explicit-any
    const text = (res.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('')
    const out = JSON.parse(text)
    const [pin, pout] = PRICES[Object.keys(PRICES).find((k) => String(res.model).startsWith(k)) ?? ''] ?? PRICES['claude-haiku-5-5']
    const u = res.usage ?? {}
    const usd = ((u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1) * pin / 1e6
      + (u.output_tokens ?? 0) * pout / 1e6
    await sb.from('ai_ledger').insert({ user_id: user.id, kind: 'use', usd, note: `Coach · ${res.model}` })
    if (limit != null) return json({ ...out, pct: Math.min(100, Math.round((Number(q.month_usd) + usd) / limit * 1000) / 10) })
    return json({ ...out, usd })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'nokey' }, 503)
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 429)
    if (e instanceof Anthropic.APIError) return json({ error: 'api', status: e.status, message: e.message }, 502)
    return json({ error: 'parse', message: String(e) }, 502)
  }
})
