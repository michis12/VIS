import { getSession, supabase } from './cloud'
import { openPaywall, refreshPlan } from './components/AiCredit'
import { getLang, t } from './i18n'

/** Calls the `food-photo` edge function (all AI modes) with readable errors. */
const ERR_DE: Record<string, string> = {
  access: 'KI-Funktionen gibt es mit VIS Pro (Profil › Einstellungen › KI & Abo).',
  expired: 'Dein Abo ist abgelaufen – unter Einstellungen › KI & Abo verlängern.',
  limit: 'Dein KI-Kontingent für diesen Monat ist aufgebraucht. Am 1. geht es wieder los – oder auf Ultra wechseln.',
  auth: 'Dafür musst du in der Cloud angemeldet sein (Profil › Einstellungen).',
  nokey: 'Die KI ist noch nicht eingerichtet (API-Key fehlt oder Guthaben leer).',
  busy: 'Gerade zu viele Anfragen – gleich nochmal probieren.',
  refusal: 'Das konnte nicht ausgewertet werden.',
  ultra: 'Den Coach-Chat gibt es mit VIS Pro Ultra.',
}
const ERR_EN: Record<string, string> = {
  access: 'AI features come with VIS Pro (Profile › Settings › AI & subscription).',
  expired: 'Your subscription has expired – renew it under Settings › AI & subscription.',
  limit: 'Your AI quota for this month is used up. It starts again on the 1st – or switch to Ultra.',
  auth: 'You need to be signed in to the cloud for this (Profile › Settings).',
  nokey: 'The AI is not set up yet (API key missing or balance empty).',
  busy: 'Too many requests right now – try again in a moment.',
  refusal: 'This could not be analysed.',
  ultra: 'The coach chat comes with VIS Pro Ultra.',
}
const err = (code: string) => (getLang() === 'en' ? ERR_EN : ERR_DE)[code]

// each mode returns its own fields plus usd (dev, friend) or pct (paid plans)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function foodAi(body: Record<string, unknown>, fn: 'food-photo' | 'coach' = 'food-photo'): Promise<any> {
  if (!supabase || !(await getSession())) throw new Error(err('auth'))
  const { data, error } = await supabase.functions.invoke(fn, { body: { ...body, lang: getLang() } })
  if (error) {
    let code = ''
    try { code = (await (error as { context?: Response }).context?.json())?.error ?? '' } catch { /* not json */ }
    // no plan (or it ran out): show the plans page instead of only an error
    if (code === 'access' || code === 'expired' || code === 'ultra') { refreshPlan(); openPaywall() }
    throw new Error(err(code) ?? t('Hat nicht geklappt – Internet prüfen und nochmal versuchen.', 'That did not work – check your connection and try again.'))
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
