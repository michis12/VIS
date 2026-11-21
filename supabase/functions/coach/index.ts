// VIS KI-Coach. The app sends a compact text summary of the training data plus
// the request; this function asks Claude and returns plain text.
// Auth: Supabase verifies the user JWT (verify_jwt); only users listed in
// public.ai_access may use it, so the API key can't be spent by strangers who
// sign up. Secret: ANTHROPIC_API_KEY (set in the Supabase dashboard).
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2.58.0'

const MODEL = 'claude-opus-5-5'

const SYSTEM = `Du bist der persönliche Kraftsport-Coach in der Fitness-App "VIS".
Du bekommst eine kompakte Zusammenfassung aller Trainingsdaten des Athleten (Workouts, Sätze, Rekorde,
Fortschritte, Wochenscores, Körpergewicht, Phase Bulk/Cut/Erhalt, Körpermaße).
Regeln:
- Antworte auf Deutsch, locker und motivierend, aber ehrlich und konkret – wie ein guter Trainer im Gym (duzen).
- Stütze jede Aussage auf die Daten (nenne konkrete Übungen, Gewichte, Daten). Erfinde nichts; wenn Daten fehlen, sag das.
- Kurz halten: Fließtext ohne Überschriften, höchstens ein paar knappe Aufzählungspunkte, keine Tabellen, kein Markdown-Fett.
- Keine medizinischen Diagnosen; bei Schmerzen/Verletzungen an Arzt/Physio verweisen.
- "Rekord" = höchstes Gewicht oder bestes geschätztes 1RM einer Übung; "Fortschritt" = besser als derselbe Satz beim letzten Mal.`

const TASK: Record<string, string> = {
  workout:
    'Gib ein kurzes Feedback (max. ca. 90 Wörter) zum gerade beendeten Workout: was richtig gut war (Rekorde/Fortschritte), ' +
    'was auffällt (Stagnation, Abfall, ausgelassene Übungen) und genau EIN konkreter Tipp fürs nächste Mal (z. B. Gewicht/Wiederholungen bei einer Übung).',
  week:
    'Schreib einen kurzen Wochenbericht (max. ca. 120 Wörter) zur genannten Woche: Einordnung des Wochenscores und seiner Teile, ' +
    'Highlights, vernachlässigte Muskelgruppen oder Übungen, Gewichtstrend im Verhältnis zur Phase, und 2 konkrete Ziele für nächste Woche.',
  chat: 'Beantworte die Frage des Athleten anhand der Daten. Kurz und konkret (max. ca. 150 Wörter, außer er will mehr Detail).',
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // who is calling? (JWT already verified by the platform)
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return json({ error: 'Bitte anmelden.' }, 401)
  const { data: access } = await supabase.from('ai_access').select('user_id').eq('user_id', userData.user.id).maybeSingle()
  if (!access) return json({ error: 'Der KI-Coach ist für dieses Konto nicht freigeschaltet.' }, 403)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'KI ist noch nicht eingerichtet (API-Schlüssel fehlt).' }, 503)

  let body: { mode?: string; context?: string; focus?: string; messages?: { role: string; content: string }[] }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  const mode = body.mode && TASK[body.mode] ? body.mode : 'chat'
  const context = String(body.context ?? '').slice(0, 60000)

  // conversation: data first (cacheable within a chat), then the task
  const messages: Anthropic.Beta.BetaMessageParam[] = []
  if (mode === 'chat') {
    const turns = (body.messages ?? [])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-10)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 4000) }))
    if (!turns.length || turns[0].role !== 'user') return json({ error: 'Keine Frage erhalten.' }, 400)
    messages.push(...turns)
  } else {
    messages.push({ role: 'user', content: `${TASK[mode]}\n\n${String(body.focus ?? '').slice(0, 8000)}` })
  }

  const client = new Anthropic({ apiKey })
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      // if Claude declines (safety classifier), the API retries on a fallback model in the same call
      fallbacks: 'default',
      system: [
        { type: 'text', text: SYSTEM },
        { type: 'text', text: `# Trainingsdaten\n${context}`, cache_control: { type: 'ephemeral' } },
        ...(mode === 'chat' ? [{ type: 'text' as const, text: TASK.chat }] : []),
      ],
      messages,
    } as Anthropic.Beta.MessageCreateParamsNonStreaming)

    if (response.stop_reason === 'refusal') return json({ error: 'Dazu kann der Coach leider nichts sagen.' }, 422)
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    return json({ text: text || 'Keine Antwort.' })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'API-Schlüssel ungültig.' }, 502)
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Gerade zu viele Anfragen – gleich nochmal versuchen.' }, 429)
    if (e instanceof Anthropic.BadRequestError) return json({ error: 'Anfrage abgelehnt: ' + e.message }, 502)
    if (e instanceof Anthropic.APIError) return json({ error: `KI-Fehler (${e.status ?? '?'})` }, 502)
    return json({ error: 'KI nicht erreichbar.' }, 502)
  }
})
