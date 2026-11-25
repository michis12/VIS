import { getSession, supabase } from './cloud'
import { openPaywall, refreshPlan } from './components/AiCredit'

/** Calls the `food-photo` edge function (all AI modes) with readable errors. */
const ERR: Record<string, string> = {
  access: 'KI-Funktionen gibt es mit VIS Pro (Profil › Einstellungen › KI & Abo).',
  expired: 'Dein Abo ist abgelaufen – unter Einstellungen › KI & Abo verlängern.',
  limit: 'Dein KI-Kontingent für diesen Monat ist aufgebraucht. Am 1. geht es wieder los – oder auf Ultra wechseln.',
  auth: 'Dafür musst du in der Cloud angemeldet sein (Profil › Einstellungen).',
  nokey: 'Die KI ist noch nicht eingerichtet (API-Key fehlt oder Guthaben leer).',
  busy: 'Gerade zu viele Anfragen – gleich nochmal probieren.',
  refusal: 'Das konnte nicht ausgewertet werden.',
}

// each mode returns its own fields plus usd (dev, friend) or pct (paid plans)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function foodAi(body: Record<string, unknown>): Promise<any> {
  if (!supabase || !(await getSession())) throw new Error(ERR.auth)
  const { data, error } = await supabase.functions.invoke('food-photo', { body })
  if (error) {
    let code = ''
    try { code = (await (error as { context?: Response }).context?.json())?.error ?? '' } catch { /* not json */ }
    // no plan (or it ran out): show the plans page instead of only an error
    if (code === 'access' || code === 'expired') { refreshPlan(); openPaywall() }
    throw new Error(ERR[code] ?? 'Hat nicht geklappt – Internet prüfen und nochmal versuchen.')
  }
  if (typeof data?.usd === 'number' || typeof data?.pct === 'number') {
    window.dispatchEvent(new CustomEvent('vis-ai-cost', { detail: { usd: data.usd, pct: data.pct } }))
  }
  return data
}

/** Downscale to max `max` px and re-encode as JPEG: fast upload, fewer tokens. */
export async function shrink(file: File, max = 1024): Promise<string> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return c.toDataURL('image/jpeg', 0.85).split(',')[1]
}
