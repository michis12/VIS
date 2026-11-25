// Food AI for the app, modes:
//   photo   - estimate the foods on a meal photo (FOOD_MODEL, default Sonnet)
//   label   - read a nutrition label photo into per-100 g values (FAST_MODEL, Haiku)
//   text    - turn "2 Semmeln mit Schinken" into foods with grams (FAST_MODEL, Haiku)
//   plan    - next bulk/cut/maintain phase from body data + activity text (FAST_MODEL)
//   suggest - what to eat for the rest of the day, from the user's own foods (FAST_MODEL)
//   import-cols / import-ex / import-text - training history from another app (FAST_MODEL):
//             which CSV column is what, which exercise is which, or free text into workouts
// Only signed-in accounts on the ai_access list may call it (plans dev / friend /
// solo / ultra, see migration 0011); paid plans stop at their monthly limit and
// get a percentage back instead of $. The Anthropic key is the function secret
// ANTHROPIC_API_KEY. Each call books its cost in ai_ledger.
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MODEL = Deno.env.get('FOOD_MODEL') || 'claude-sonnet-5-5'
const FAST_MODEL = Deno.env.get('FAST_MODEL') || 'claude-haiku-5-5'

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

const ITEM_PROPS = {
  name: { type: 'string', description: 'Kurzer Name in der Sprache der App, z. B. "Reis, gekocht"' },
  grams: { type: 'number', description: 'Menge in Gramm' },
  kcal: { type: 'number', description: 'kcal für diese Menge' },
  protein: { type: 'number', description: 'Eiweiß in g für diese Menge' },
  carbs: { type: 'number', description: 'Kohlenhydrate in g für diese Menge' },
  fat: { type: 'number', description: 'Fett in g für diese Menge' },
}

const TEXT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { ...ITEM_PROPS, ref: { type: 'string', description: 'id aus der Liste bekannter Lebensmittel, wenn es eindeutig dasselbe ist, sonst ""' } },
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'ref'],
        additionalProperties: false,
      },
    },
    comment: { type: 'string', description: 'Ein kurzer Satz, was unsicher ist (oder leer)' },
  },
  required: ['items', 'comment'],
  additionalProperties: false,
}

const LABEL_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean', description: 'false, wenn keine Nährwerttabelle lesbar ist' },
    name: { type: 'string', description: 'Produktname, falls sichtbar, sonst ""' },
    brand: { type: 'string', description: 'Marke, falls sichtbar, sonst ""' },
    kcal: { type: 'number', description: 'kcal pro 100 g bzw. 100 ml' },
    protein: { type: 'number', description: 'Eiweiß g pro 100 g' },
    carbs: { type: 'number', description: 'Kohlenhydrate g pro 100 g' },
    fat: { type: 'number', description: 'Fett g pro 100 g' },
    serving: { type: 'number', description: 'Portionsgröße in g laut Packung, sonst 0' },
  },
  required: ['found', 'name', 'brand', 'kcal', 'protein', 'carbs', 'fat', 'serving'],
  additionalProperties: false,
}

const LABEL_SYSTEM = `Du liest Nährwerttabellen von Lebensmittelverpackungen ab (Fotos).
- Gib die Werte pro 100 g (bzw. 100 ml) zurück, exakt wie auf der Packung. Steht nur ein Wert pro Portion da, rechne auf 100 g um.
- Steht nur kJ da, rechne kcal = kJ / 4,184.
- Kohlenhydrate = Gesamtkohlenhydrate (nicht "davon Zucker"); Fett = Gesamtfett (nicht "davon gesättigte").
- Rate keine Werte. Wenn keine Tabelle lesbar ist: found = false und alle Zahlen 0.`

const TEXT_SYSTEM = `Du wandelst eine kurze Beschreibung, was jemand gegessen hat, in einzelne Lebensmittel mit Mengen um (Fitness-App, Österreich).
- Übliche Portionen, wenn keine Menge genannt ist (z. B. 1 Semmel 50 g, 1 Scheibe Schinken 20 g, 1 Ei 55 g, 1 großes Glas 300 ml).
- Nährwerte aus üblichen Nährwerttabellen, für genau diese Menge.
- Wenn ein Lebensmittel eindeutig einem Eintrag der Liste bekannter Lebensmittel entspricht, setze ref auf dessen id und nimm dessen Namen; sonst ref = "".
- Rezepte des Nutzers (id beginnt mit r-) haben ein Gewicht für das ganze Gericht; "eine Portion" ohne Angabe = ein Viertel davon.
Antworte auf Deutsch.`

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    maintenance: { type: 'number', description: 'Erhaltungskalorien pro Tag bei der beschriebenen Aktivität' },
    kcal: { type: 'number', description: 'Empfohlene Kalorien pro Tag für die neue Phase' },
    weeks: { type: 'number', description: 'Empfohlene Dauer in Wochen' },
    targetKg: { type: 'number', description: 'Erwartetes Gewicht am Ende' },
    kgPerWeek: { type: 'number', description: 'Erwartete Gewichtsänderung pro Woche (negativ beim Cut)' },
    protein: { type: 'number', description: 'Eiweiß g pro Tag' },
    bullets: { type: 'array', items: { type: 'string' }, description: '2 bis 4 kurze Sätze: wie die Zahl zustande kommt und worauf achten' },
    warning: { type: 'string', description: 'Ein Satz, falls etwas unrealistisch oder ungesund ist, sonst ""' },
  },
  required: ['maintenance', 'kcal', 'weeks', 'targetKg', 'kgPerWeek', 'protein', 'bullets', 'warning'],
  additionalProperties: false,
}

const PLAN_SYSTEM = `Du planst die nächste Ernährungsphase (Bulk, Cut oder Erhalt) für jemanden, der Krafttraining macht. Die App liefert dir alle Daten als JSON, die Rechnungen darin sind korrekt.
Vorgehen:
1. Erhaltungskalorien: Wenn "measured" vorhanden ist, ist das der wichtigste Wert (echte Daten). Passe ihn nur an, wenn die beschriebene Aktivität deutlich von den letzten Wochen abweicht (z. B. neu 2× Fußball dazu: je 90 min Fußball ca. 500-800 kcal, auf den Tag verteilt). Ohne "measured": bmr × Aktivitätsfaktor (1,4 wenig aktiv bis 1,9 sehr aktiv) aus der Beschreibung.
2. Phase:
   - Bulk: Zunahme 0,25-0,5 % des Körpergewichts pro Woche (Fortgeschrittene eher unten), Überschuss meist 200-400 kcal. Dauer 12-24 Wochen.
   - Cut: Abnahme 0,5-1 % pro Woche, Defizit meist 400-700 kcal, nie unter bmr. Dauer bis ein sinnvoller KFA erreicht ist (Männer ca. 10-12 %, Frauen ca. 18-22 %), meist 8-16 Wochen; ohne KFA aus Gewichtsverlauf und Zielwunsch schätzen.
   - Erhalt: Erhaltungskalorien, Dauer 4-8 Wochen.
   - Lerne aus "phases": Hat ein früherer Bulk mit X kcal zu schnell/langsam zugenommen, berücksichtige das.
3. Eiweiß: 1,8-2,2 g pro kg (im Cut eher oben).
4. Wunsch des Nutzers (Termin, Zielgewicht, Tempo) einbeziehen, wenn gesund machbar; sonst warnen.
Runde kcal auf 50. Kurze, konkrete Sätze auf Deutsch, du-Form.`

const SUGGEST_SCHEMA = {
  type: 'object',
  properties: {
    options: {
      type: 'array',
      description: '2 bis 3 Vorschläge',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Kurzer Name, z. B. "Skyr mit Beeren"' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ref: { type: 'string', description: 'id aus der Kandidatenliste' },
                grams: { type: 'number', description: 'Menge in Gramm' },
              },
              required: ['ref', 'grams'],
              additionalProperties: false,
            },
          },
          why: { type: 'string', description: 'Ein kurzer Satz, warum das passt' },
        },
        required: ['title', 'items', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['options'],
  additionalProperties: false,
}

const SUGGEST_SYSTEM = `Du schlägst vor, was jemand heute noch essen kann (Fitness-App, Österreich). Ziel: restliche Kalorien und vor allem Eiweiß treffen – aber mit Essen, das ein normaler Mensch wirklich so isst.
Wichtigste Regel: Jeder Vorschlag ist EINE stimmige Mahlzeit oder EIN Snack, so wie man es am Tisch hätte.
- Am besten: eine Mahlzeit aus "Deine echten Mahlzeiten" (genau diese Kombination, Mengen darfst du anpassen) oder ein Rezept allein.
- Neue Kombinationen nur, wenn sie offensichtlich zusammenpassen (z. B. Skyr + Beeren, Haferflocken + Milch + Banane, Reis + Hühnerbrust + Gemüse). Nie Süßes mit Herzhaftem mischen (kein Whey oder Skyr zu Nudeln/Fleisch, keine Haferflocken zu Hühnchen). Ein fertiges Rezept bekommt keine fremden Zutaten dazu.
- Lieber die Makros knapp verfehlen als eine komische Kombination. Ein einzelner Eiweiß-Snack (z. B. Skyr oder ein Shake) ist ein völlig okayer Vorschlag.
- "Reserve"-Lebensmittel nur, wenn deine echten Sachen nicht reichen, und dann als eigener, stimmiger Snack.
- Nutze NUR ids aus der Kandidatenliste. Werte sind pro 100 g; rechne nach, eher etwas unter den restlichen kcal bleiben.
- Passe zur Uhrzeit (abends Abendessen oder Snack, kein Frühstück um 22 Uhr; echte Mahlzeiten zeigen, wann die Person was isst).
- 2 bis 3 deutlich unterschiedliche Vorschläge, je 1 bis 3 Bestandteile. Titel wie ein Gericht, kurze Sätze auf Deutsch, du-Form.`

const MUSCLES = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Beine', 'Waden', 'Bauch', 'Nacken', 'Unterarme', 'Sonstige']
const col = (d: string) => ({ type: 'integer', description: `${d} (Spaltennummer ab 0, -1 wenn es keine gibt)` })

const COLS_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true, wenn das eine Tabelle mit einer Zeile pro Satz ist' },
    headerRows: { type: 'integer', description: 'Anzahl Kopfzeilen vor den Daten' },
    date: col('Datum bzw. Startzeit des Trainings'),
    time: col('Uhrzeit, falls getrennt vom Datum'),
    end: col('Endzeit des Trainings'),
    duration: col('Trainingsdauer'),
    workout: col('Name des Trainings'),
    exercise: col('Übungsname'),
    weight: col('Gewicht'),
    reps: col('Wiederholungen'),
    setType: col('Satztyp (z. B. warmup / normal)'),
    unit: { type: 'string', enum: ['kg', 'lbs'], description: 'Einheit des Gewichts' },
    unitCol: col('Gewichtseinheit pro Zeile'),
    dateOrder: { type: 'string', enum: ['ymd', 'dmy', 'mdy'], description: 'Reihenfolge im Datum' },
    comment: { type: 'string', description: 'Ein kurzer Satz, was für ein Export das ist (z. B. "Strong-Export")' },
  },
  required: ['ok', 'headerRows', 'date', 'time', 'end', 'duration', 'workout', 'exercise', 'weight', 'reps', 'setType', 'unit', 'unitCol', 'dateOrder', 'comment'],
  additionalProperties: false,
}

const COLS_SYSTEM = `Du bekommst den Anfang einer exportierten Trainingsdatei aus einer anderen Fitness-App (z. B. Strong, Hevy, FitNotes, Excel), Zeilen als "Zeile n: Spalte 0 | Spalte 1 | ...".
Bestimme, in welcher Spalte was steht. Spaltennummern zählen ab 0. Gibt es etwas nicht, nimm -1.
- Gewicht in kg oder lbs: aus Spaltenname oder Werten erkennen (z. B. "weight_kg", "Weight (lbs)").
- Datum: Reihenfolge erkennen (2024-03-05 = ymd, 05.03.2024 = dmy, 3/5/2024 meist mdy).
- Ist das keine Tabelle mit einer Zeile pro Satz (z. B. nur Körpergewicht oder Fließtext), ok = false.`

const EX_SCHEMA = {
  type: 'object',
  properties: {
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name genau wie in der Eingabe' },
          ref: { type: 'string', description: 'id einer vorhandenen Übung, wenn es eindeutig dieselbe Übung ist (gleiche Bewegung UND gleiches Gerät), sonst ""' },
          clean: { type: 'string', description: 'Sauberer Name für eine neue Übung im Stil der vorhandenen, z. B. "Bench Press (Barbell)"' },
          muscle: { type: 'string', enum: MUSCLES, description: 'Hauptmuskelgruppe' },
        },
        required: ['name', 'ref', 'clean', 'muscle'],
        additionalProperties: false,
      },
    },
  },
  required: ['exercises'],
  additionalProperties: false,
}

const EX_SYSTEM = `Du ordnest Übungsnamen aus einer anderen Fitness-App den Übungen der App VIS zu.
- ref nur, wenn es wirklich dieselbe Übung ist: gleiche Bewegung und gleiches Gerät (Kurzhantel ≠ Langhantel ≠ Maschine ≠ Kabel). Im Zweifel ref = "" (dann wird sie neu angelegt).
- clean: kurzer englischer Name wie die vorhandenen, Gerät in Klammern, Tippfehler korrigiert. Deutsche Namen dürfen deutsch bleiben.
- Gib jeden Eingabenamen genau einmal zurück.`

const WORKOUTS_SCHEMA = {
  type: 'object',
  properties: {
    workouts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          name: { type: 'string', description: 'Name des Trainings, z. B. "Push" oder "Beine"' },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Übungsname wie im Text' },
                sets: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { kg: { type: 'number', description: 'Gewicht in kg, 0 bei Körpergewicht' }, reps: { type: 'integer' } },
                    required: ['kg', 'reps'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['name', 'sets'],
              additionalProperties: false,
            },
          },
        },
        required: ['date', 'name', 'exercises'],
        additionalProperties: false,
      },
    },
    comment: { type: 'string', description: 'Ein kurzer Satz, was unklar war (oder leer)' },
  },
  required: ['workouts', 'comment'],
  additionalProperties: false,
}

const WORKOUTS_SYSTEM = `Du liest Trainingsnotizen (Notizen-App, Excel, Chat-Verlauf) in einzelne Trainings mit Sätzen aus.
- Jedes Datum ist ein Training. "3x10 80kg" = drei Sätze à 10 Wiederholungen mit 80 kg. "80x10, 85x8" = zwei Sätze.
- lbs in kg umrechnen (× 0,4536). Fehlt das Jahr, nimm das wahrscheinlichste (heute ist {TODAY}, nichts in der Zukunft).
- Nur Krafttraining mit Wiederholungen; Cardio und reine Zeitangaben weglassen.
- Erfinde nichts: Was nicht im Text steht, kommt nicht hinein.`

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Kurzer Name in der Sprache der App, z. B. "Reis, gekocht"' },
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
  // sign-ups are open: only accounts with a plan may spend the API key
  const { data: quota } = await sb.rpc('ai_quota', { target: user.id }).maybeSingle()
  const q = quota as { plan: string; active: boolean; month_usd: number; limit_usd: number | null } | null
  if (!q) return json({ error: 'access' }, 403)
  if (!q.active) return json({ error: 'expired' }, 403)
  const limit = q.limit_usd == null ? null : Number(q.limit_usd)
  if (limit != null && Number(q.month_usd) >= limit) return json({ error: 'limit', pct: 100 }, 429)

  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return json({ error: 'nokey' }, 503)

  let body: {
    mode?: 'photo' | 'label' | 'text' | 'plan' | 'suggest' | 'import-cols' | 'import-ex' | 'import-text'; image?: string; mediaType?: string; note?: string; grams?: number
    text?: string; foods?: { id: string; name: string; g?: number }[]
    goal?: string; activity?: string; wish?: string; data?: unknown
    left?: { kcal: number; p: number; c: number; f: number }; time?: string
    candidates?: { id: string; name: string; kcal: number; p: number; c: number; f: number; typ: number; count: number; extra?: boolean }[]
    meals?: { text: string; hour: number; count: number }[]
    sample?: string[][]; names?: { name: string; count: number }[]; catalog?: { id: string; name: string }[]
    lang?: 'de' | 'en'
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  const mode = body.mode ?? 'photo'
  const { image, note, grams } = body
  const mediaType = body.mediaType === 'image/png' ? 'image/png' : 'image/jpeg'
  const withImage = mode === 'photo' || mode === 'label'
  if (withImage && (!image || image.length > 4_000_000)) return json({ error: 'image' }, 400)
  if (mode === 'text' && !body.text?.trim()) return json({ error: 'text' }, 400)
  if (mode === 'plan' && !body.activity?.trim()) return json({ error: 'text' }, 400)
  if (mode === 'suggest' && !(body.candidates?.length && body.left)) return json({ error: 'text' }, 400)
  if (mode === 'import-cols' && !body.sample?.length) return json({ error: 'text' }, 400)
  if (mode === 'import-ex' && !body.names?.length) return json({ error: 'text' }, 400)
  if (mode === 'import-text' && !body.text?.trim()) return json({ error: 'text' }, 400)

  // deno-lint-ignore no-explicit-any
  const img: any = withImage ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } } : null
  // deno-lint-ignore no-explicit-any
  let call: any
  const cell = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').slice(0, 60)
  if (mode === 'import-cols') {
    const rows = body.sample!.slice(0, 30).map((r, i) => `Zeile ${i}: ${(Array.isArray(r) ? r : []).slice(0, 30).map(cell).join(' | ')}`).join('\n')
    call = { model: FAST_MODEL, system: COLS_SYSTEM, schema: COLS_SCHEMA, content: [{ type: 'text', text: rows }] }
  } else if (mode === 'import-ex') {
    const names = body.names!.slice(0, 300).map((n) => `${cell(n.name)} | ${Math.round(Number(n.count) || 0)} Sätze`).join('\n')
    const catalog = (body.catalog ?? []).slice(0, 600).map((e) => `${cell(e.id)} | ${cell(e.name)}`).join('\n')
    call = {
      model: FAST_MODEL, system: EX_SYSTEM, schema: EX_SCHEMA, maxTokens: 16000,
      content: [{ type: 'text', text: `Vorhandene Übungen (id | Name):\n${catalog || '(keine)'}\n\nZuzuordnen (Name | Anzahl Sätze):\n${names}` }],
    }
  } else if (mode === 'import-text') {
    call = {
      model: FAST_MODEL, system: WORKOUTS_SYSTEM.replace('{TODAY}', new Date().toISOString().slice(0, 10)), schema: WORKOUTS_SCHEMA, maxTokens: 16000,
      content: [{ type: 'text', text: body.text!.trim().slice(0, 8000) }],
    }
  } else if (mode === 'suggest') {
    const r = (v: unknown) => Math.round(Number(v) || 0)
    const list = body.candidates!.slice(0, 80)
      .map((c) => `${c.id} | ${String(c.name).slice(0, 50)} | ${r(c.kcal)} kcal ${r(c.p)} E ${r(c.c)} K ${r(c.f)} F | typ ${r(c.typ)} g | ${c.extra ? 'Reserve' : `${r(c.count)}×`}`).join('\n')
    const meals = (body.meals ?? []).slice(0, 25)
      .map((m) => `${String(m.text).slice(0, 200)} | um ${r(m.hour)} Uhr | ${r(m.count)}×`).join('\n')
    const l = body.left!
    call = {
      model: FAST_MODEL, system: SUGGEST_SYSTEM, schema: SUGGEST_SCHEMA, effort: 'medium',
      content: [{
        type: 'text',
        text: `Uhrzeit: ${String(body.time ?? '').slice(0, 5)}\nNoch offen heute: ${r(l.kcal)} kcal, ${r(l.p)} g Eiweiß, ${r(l.c)} g Kohlenhydrate, ${r(l.f)} g Fett\n\nKandidaten (id | Name | pro 100 g | übliche Menge | wie oft gegessen):\n${list}\n\nDeine echten Mahlzeiten (was zusammen gegessen wurde | Uhrzeit | wie oft):\n${meals || '(noch keine)'}`,
      }],
    }
  } else if (mode === 'plan') {
    const goal = body.goal === 'cut' ? 'Cut' : body.goal === 'maintain' ? 'Erhalt' : 'Bulk'
    call = {
      model: FAST_MODEL, system: PLAN_SYSTEM, schema: PLAN_SCHEMA, effort: 'medium',
      content: [{
        type: 'text',
        text: `Geplante Phase: ${goal}\nAktivität: ${body.activity!.trim().slice(0, 500)}\nWunsch: ${body.wish?.trim().slice(0, 300) || '(keiner)'}\n\nDaten aus der App:\n${JSON.stringify(body.data ?? {}).slice(0, 6000)}`,
      }],
    }
  } else if (mode === 'label') {
    call = {
      model: FAST_MODEL, system: LABEL_SYSTEM, schema: LABEL_SCHEMA,
      content: [img, { type: 'text', text: 'Lies die Nährwerte ab.' }],
    }
  } else if (mode === 'text') {
    const known = (body.foods ?? []).slice(0, 250)
      .map((f) => `${f.id} | ${String(f.name).slice(0, 60)}${f.g ? ` | Gericht ${Math.round(f.g)} g` : ''}`).join('\n')
    call = {
      model: FAST_MODEL, system: TEXT_SYSTEM, schema: TEXT_SCHEMA,
      content: [{ type: 'text', text: `Bekannte Lebensmittel (id | Name):\n${known || '(keine)'}\n\nGegessen: ${body.text!.trim().slice(0, 500)}` }],
    }
  } else {
    const hints = [
      grams && grams > 0 ? `Gesamtgewicht des Gerichts: ${Math.round(grams)} g.` : '',
      note?.trim() ? `Angaben des Nutzers: ${note.trim().slice(0, 500)}` : '',
    ].filter(Boolean).join('\n')
    call = {
      model: MODEL, system: SYSTEM, schema: SCHEMA,
      content: [img, { type: 'text', text: (hints ? hints + '\n\n' : '') + 'Welche Lebensmittel sind auf dem Foto und wie viel davon?' }],
    }
  }
  // the app's UI language: the German prompts stay, but visible text comes back in English when asked
  // (import modes return exercise names and dates only, so they are left alone)
  if (body.lang === 'en' && !mode.startsWith('import')) {
    call.system += '\n\nIMPORTANT: The app is set to English. Write every user-visible text in your answer (food and dish names, titles, comments, bullets, warnings) in English, du-form becomes a friendly "you". Keep numbers and units as instructed.'
  }
  // Haiku has no server-side fallback; the larger models get the default fallback chain
  const fast = String(call.model).startsWith('claude-haiku')

  const client = new Anthropic({ apiKey: key })
  try {
    const res = await client.beta.messages.create({
      model: call.model,
      max_tokens: call.maxTokens ?? 4000,
      ...(fast ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
      system: call.system,
      output_config: { effort: call.effort ?? (fast ? 'low' : 'medium'), format: { type: 'json_schema', schema: call.schema } },
      messages: [{ role: 'user', content: call.content }],
    // deno-lint-ignore no-explicit-any
    } as any)
    if (res.stop_reason === 'refusal') return json({ error: 'refusal' }, 422)
    // deno-lint-ignore no-explicit-any
    const text = (res.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('')
    const out = JSON.parse(text)
    // book the estimated cost (list prices per million tokens; a fallback bills at its own model's rates)
    const [pin, pout] = PRICES[Object.keys(PRICES).find((k) => String(res.model).startsWith(k)) ?? ''] ?? PRICES['claude-sonnet-5-5']
    const u = res.usage ?? {}
    const usd = ((u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1) * pin / 1e6
      + (u.output_tokens ?? 0) * pout / 1e6
    const label = mode.startsWith('import') ? 'Import' : mode === 'label' ? 'Etikett' : mode === 'text' ? 'Text' : mode === 'plan' ? 'Phase' : mode === 'suggest' ? 'Vorschlag' : 'Foto'
    await sb.from('ai_ledger').insert({ user_id: user.id, kind: 'use', usd, note: `${label} · ${res.model}` })
    // paid plans see how much of their month is used, never the $ amount
    if (limit != null) return json({ ...out, pct: Math.min(100, Math.round((Number(q.month_usd) + usd) / limit * 1000) / 10) })
    return json({ ...out, model: res.model, usd })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'nokey' }, 503)
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 429)
    if (e instanceof Anthropic.APIError) return json({ error: 'api', status: e.status, message: e.message }, 502)
    return json({ error: 'parse', message: String(e) }, 502)
  }
})
