// VIS Coach: a chat (Haiku) that knows the user's data and can do things in the
// app: templates (new, change, order), exercises, own foods, recipes, diary
// entries, weight, phase, rest timer. It only proposes actions; the app runs
// them after the user taps them. Ultra feature: plans ultra, fam and dev only.
// Same access, quota and cost booking as food-photo (ai_quota / ai_ledger, migration 0012).
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

const MUSCLES = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Beine', 'Waden', 'Bauch', 'Nacken', 'Unterarme', 'Sonstige']
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack']
const obj = (kind: string, desc: string, props: Record<string, unknown>) => ({
  type: 'object',
  description: desc,
  properties: { kind: { type: 'string', const: kind }, ...props },
  required: ['kind', ...Object.keys(props)],
  additionalProperties: false,
})
const per100 = {
  kcal: { type: 'number', description: 'kcal pro 100 g' },
  protein: { type: 'number', description: 'Eiweiß g pro 100 g' },
  carbs: { type: 'number', description: 'Kohlenhydrate g pro 100 g' },
  fat: { type: 'number', description: 'Fett g pro 100 g' },
}
const exList = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      ref: { type: 'string', description: 'id aus dem Übungskatalog oder "new:<Name>" für eine Übung, die in dieser Antwort angelegt wird' },
      sets: { type: 'integer', description: 'Arbeitssätze, 1 bis 5' },
    },
    required: ['ref', 'sets'],
    additionalProperties: false,
  },
}
const foodItems = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      ref: { type: 'string', description: 'id aus der Lebensmittelliste, wenn es eindeutig dasselbe ist, sonst ""' },
      name: { type: 'string' },
      grams: { type: 'number', description: 'Menge in g' },
      ...per100,
    },
    required: ['ref', 'name', 'grams', 'kcal', 'protein', 'carbs', 'fat'],
    additionalProperties: false,
  },
}
const ACTION = {
  anyOf: [
    obj('template', 'Neue Trainingsvorlage', { name: { type: 'string', description: 'z. B. "Day 1 Upper"' }, exercises: exList }),
    obj('edit_template', 'Vorhandene Vorlage ändern (ganze neue Übungsliste)', { id: { type: 'string', description: 'id der Vorlage' }, name: { type: 'string' }, exercises: exList }),
    obj('order', 'Reihenfolge (Rhythmus) aller Vorlagen festlegen', { ids: { type: 'array', items: { type: 'string' }, description: 'alle Vorlagen-ids in der neuen Reihenfolge' } }),
    obj('exercise', 'Neue Übung anlegen', { name: { type: 'string', description: 'englischer Name mit Gerät in Klammern, z. B. "Hip Thrust (Machine)"' }, muscle: { type: 'string', enum: MUSCLES } }),
    obj('food', 'Eigenes Lebensmittel anlegen', { name: { type: 'string' }, brand: { type: 'string', description: 'oder ""' }, ...per100, servingG: { type: 'number', description: 'Portion in g, sonst 0' } }),
    obj('recipe', 'Rezept anlegen', { name: { type: 'string' }, items: foodItems, cookedWeight: { type: 'number', description: 'Gewicht nach dem Kochen in g, sonst 0' } }),
    obj('log', 'Essen ins Tagebuch eintragen', { date: { type: 'string', description: 'YYYY-MM-DD' }, meal: { type: 'string', enum: MEALS }, items: foodItems }),
    obj('weight', 'Körpergewicht eintragen', { date: { type: 'string', description: 'YYYY-MM-DD' }, kg: { type: 'number' } }),
    obj('phase', 'Phase starten oder Kalorien der Phase ändern', { type: { type: 'string', enum: ['bulk', 'cut', 'maintain'] }, kcal: { type: 'number', description: 'kcal pro Tag' }, start: { type: 'string', description: 'YYYY-MM-DD, ab wann' } }),
    obj('rest', 'Pausenzeit zwischen Sätzen ändern', { sec: { type: 'integer', description: '30 bis 600' } }),
  ],
}

const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Die Antwort an den Nutzer, kurz und konkret' },
    actions: { type: 'array', description: 'Was in der App gemacht werden soll – nur wenn der Nutzer es möchte, sonst leer', items: ACTION },
  },
  required: ['reply', 'actions'],
  additionalProperties: false,
}

const SYSTEM = `Du bist der Coach in der Fitness-App VIS (Krafttraining + Ernährung). Du siehst die Daten des Nutzers unten und kannst in der App Dinge erledigen.
- Antworte kurz (meist 2–6 Sätze), konkret und mit seinen echten Zahlen. Du-Form, freundlich, kein Fachchinesisch, keine Floskeln.
- Wenn Daten fehlen, sag es ehrlich statt zu raten.
- Keine medizinischen Diagnosen; bei Schmerzen oder Verletzungen zum Arzt/Physio raten.

Aktionen ("actions"): Wenn der Nutzer möchte, dass du etwas anlegst, einträgst oder änderst, mach es über actions – auch mehrere auf einmal. Der Nutzer tippt sie in der App an, erst dann passieren sie. In "reply" sag kurz, was du vorbereitet hast. Keine Aktion ohne Wunsch des Nutzers.
- template: 5–9 Übungen, meist 2–3 Arbeitssätze, große Übungen zuerst; nur ids aus dem Übungskatalog. Für Upper/Lower oder eine Grundvorlage den Referenz-Split unten als Basis nehmen.
- edit_template: id einer vorhandenen Vorlage, die komplette neue Übungsliste (auch die unveränderten Übungen).
- order: alle Vorlagen-ids in der Reihenfolge, in der sie trainiert werden sollen (die App zeigt immer die nächste). Sinnvoll: Muskelgruppen abwechseln, z. B. Upper → Lower → Upper.
- exercise: nur wenn es die Übung im Katalog noch nicht gibt. Braucht eine Vorlage eine neue Übung, lege sie zuerst an und verwende in der Vorlage als ref "new:<Name>" (genau der Name der neuen Übung).
- food: Werte pro 100 g, wie auf der Packung (wenn der Nutzer sie nennt) oder übliche Tabellenwerte.
- recipe / log: items mit ref aus der Lebensmittelliste, wenn eindeutig dasselbe (dann zählen deren Werte), sonst ref "" und übliche Werte pro 100 g. Übliche Portionen, wenn keine Menge genannt ist. Rezepte (id beginnt mit r-) haben ein Gewicht für das ganze Gericht; "eine Portion" ohne Angabe = ein Viertel davon. log: date heute, wenn nichts anderes gesagt; meal passend zur Uhrzeit oder zum Gesagten.
- weight: nur, was der Nutzer sagt. phase: gleiche Phase wie die aktuelle = nur die Kalorien ab start ändern.
- Was du nicht kannst: löschen, Trainings eintragen oder ändern, Einstellungen außer der Pausenzeit. Sag das ehrlich.`

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

  let body: {
    messages?: { role: string; text: string }[]; context?: string; catalog?: { id: string; name: string }[]
    foods?: { id: string; name: string; kcal: number; p: number; c: number; f: number; g?: number }[]
    starter?: string; lang?: string; now?: string
  }
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  const history = (body.messages ?? []).slice(-12)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && String(m.text ?? '').trim())
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.text).slice(0, 2000) }))
  if (!history.length || history[history.length - 1].role !== 'user') return json({ error: 'text' }, 400)
  while (history.length && history[0].role !== 'user') history.shift()

  const r = (v: unknown) => Math.round((Number(v) || 0) * 10) / 10
  const catalog = (body.catalog ?? []).slice(0, 400).map((e) => `${String(e.id).slice(0, 60)} | ${String(e.name).slice(0, 60)}`).join('\n')
  const foods = (body.foods ?? []).slice(0, 300)
    .map((f) => `${String(f.id).slice(0, 40)} | ${String(f.name).slice(0, 50)} | ${r(f.kcal)} kcal ${r(f.p)} E ${r(f.c)} K ${r(f.f)} F${f.g ? ` | Gericht ${Math.round(f.g)} g` : ''}`).join('\n')
  const system = SYSTEM
    + `\n\nJetzt: ${String(body.now ?? '').slice(0, 16)}`
    + `\n\nDaten des Nutzers (aus der App, JSON):\n${String(body.context ?? '{}').slice(0, 12000)}`
    + `\n\nReferenz-Split (Upper/Lower, 3 Tage):\n${String(body.starter ?? '').slice(0, 1500)}`
    + `\n\nÜbungskatalog (id | Name):\n${catalog}`
    + `\n\nLebensmittelliste (id | Name | pro 100 g):\n${foods || '(keine)'}`
    + (body.lang === 'en' ? '\n\nIMPORTANT: The app is set to English. Reply in English (friendly "you"). Names of new templates, foods and recipes in English.' : '')

  const client = new Anthropic({ apiKey: key })
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 6000,
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
