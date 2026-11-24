// Estimates the foods on a meal photo with Claude (vision) and returns them as a
// list with grams, kcal and macros. Only signed-in users of the app may call it.
// The Anthropic key lives in the function secret ANTHROPIC_API_KEY; the model can
// be changed with the optional secret FOOD_MODEL without a new deploy of the app.
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MODEL = Deno.env.get('FOOD_MODEL') || 'claude-sonnet-5-5'

// $ per million tokens [input, output]
const PRICES: Record<string, [number, number]> = {
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-opus-4-8': [5, 25],
}

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
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Kurzer deutscher Name, z. B. "Reis, gekocht"' },
          grams: { type: 'number', description: 'Geschätzte Menge in Gramm' },
          kcal: { type: 'number', description: 'kcal für diese Menge' },
          protein: { type: 'number', description: 'Eiweiß in g für diese Menge' },
          carbs: { type: 'number', description: 'Kohlenhydrate in g für diese Menge' },
          fat: { type: 'number', description: 'Fett in g für diese Menge' },
        },
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat'],
        additionalProperties: false,
      },
    },
    comment: { type: 'string', description: 'Ein kurzer Satz, was unsicher ist (oder leer)' },
  },
  required: ['items', 'comment'],
  additionalProperties: false,
}

const SYSTEM = `Du schätzt Nährwerte von Mahlzeiten auf Fotos für eine Fitness-App (Österreich).
Zerlege das Gericht in seine sichtbaren und typischen Bestandteile (z. B. Reis, Hühnerbrust, Sauce, Öl) und schätze für jeden die Menge in Gramm und die Nährwerte für genau diese Menge.
- Nutze übliche Nährwerttabellen (gekocht vs. roh beachten).
- Denk an unsichtbare Fette: Bratöl, Butter, Dressing, Sauce. Wenn ein Gericht offensichtlich gebraten ist, nimm Öl als eigenen Bestandteil auf.
- Schätze Portionen anhand von Teller, Besteck und Händen realistisch, eher genau als vorsichtig.
- Wenn der Nutzer ein Gesamtgewicht angibt, müssen die Gramm aller Bestandteile zusammen ungefähr diesem Gewicht entsprechen.
- Angaben des Nutzers (Zutaten, Mengen, Zubereitung) haben Vorrang vor deiner Schätzung.
- Wenn auf dem Foto kein Essen zu sehen ist, gib eine leere Liste zurück und erkläre es im Kommentar.
Antworte auf Deutsch.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  // only signed-in users of the app
  const auth = req.headers.get('Authorization') ?? ''
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: { user } } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
  if (!user) return json({ error: 'auth' }, 401)
  // sign-ups are open: only accounts on the allow-list may spend the API key
  const { data: allowed } = await sb.from('ai_access').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!allowed) return json({ error: 'access' }, 403)

  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return json({ error: 'nokey' }, 503)

  let body: { image?: string; mediaType?: string; note?: string; grams?: number }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  const { image, note, grams } = body
  const mediaType = body.mediaType === 'image/png' ? 'image/png' : 'image/jpeg'
  if (!image || image.length > 4_000_000) return json({ error: 'image' }, 400)

  const hints = [
    grams && grams > 0 ? `Gesamtgewicht des Gerichts: ${Math.round(grams)} g.` : '',
    note?.trim() ? `Angaben des Nutzers: ${note.trim().slice(0, 500)}` : '',
  ].filter(Boolean).join('\n')

  const client = new Anthropic({ apiKey: key })
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: (hints ? hints + '\n\n' : '') + 'Welche Lebensmittel sind auf dem Foto und wie viel davon?' },
        ],
      }],
    // deno-lint-ignore no-explicit-any
    } as any)
    if (res.stop_reason === 'refusal') return json({ error: 'refusal' }, 422)
    // deno-lint-ignore no-explicit-any
    const text = (res.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('')
    const out = JSON.parse(text)
    // book the estimated cost (list prices per million tokens; a fallback bills at its own model's rates)
    const [pin, pout] = PRICES[Object.keys(PRICES).find((k) => String(res.model).startsWith(k)) ?? MODEL] ?? PRICES['claude-sonnet-5-5']
    const u = res.usage ?? {}
    const usd = ((u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1) * pin / 1e6
      + (u.output_tokens ?? 0) * pout / 1e6
    await sb.from('ai_ledger').insert({ user_id: user.id, kind: 'use', usd, note: 'Foto · ' + res.model })
    return json({ items: out.items ?? [], comment: out.comment ?? '', model: res.model, usd })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'nokey' }, 503)
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 429)
    if (e instanceof Anthropic.APIError) return json({ error: 'api', status: e.status, message: e.message }, 502)
    return json({ error: 'parse', message: String(e) }, 502)
  }
})
