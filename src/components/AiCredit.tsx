import { useEffect, useState, useSyncExternalStore } from 'react'
import { getSession, supabase } from '../cloud'
import { dec, t } from '../i18n'

/**
 * AI access and plans (public.ai_access, migrations 0011 + 0012):
 *   dev    - the developer: estimated API balance, top-ups, everyone's use, hands out plans
 *   fam    - unlimited, own use in $
 *   solo / ultra - paid plans with a monthly quota; they only ever see a percentage
 *   free   - no AI (a friend without a subscription)
 * `friend` is a status on top: half price on Solo / Ultra with a lower limit.
 */
export type Plan = 'dev' | 'fam' | 'free' | 'solo' | 'ultra'

export const PLANS = {
  solo: { name: 'Solo', month: 5, year: 50, photos: 300, friendPhotos: 240 },
  ultra: { name: 'Ultra', month: 10, year: 100, photos: 600, friendPhotos: 480 },
} as const

/** what a plan costs; friends pay half */
export const planPrice = (k: 'solo' | 'ultra', yearly: boolean, friend = false) => {
  const v = yearly ? PLANS[k].year : PLANS[k].month
  return friend ? v / 2 : v
}
export const planPhotos = (k: 'solo' | 'ultra', friend = false) => (friend ? PLANS[k].friendPhotos : PLANS[k].photos)
/** 5 → "5", 2.5 → "2,50" */
export const fmtEuro = (v: number) => (Number.isInteger(v) ? String(v) : dec(v, 2))

/** AI use of one account with access (only the developer sees these). */
export interface Person {
  userId: string; email: string; monthUsd: number; openUsd: number; totalUsd: number
  uses: number; settledAt: string | null; isMe: boolean
  plan: Plan; period: 'month' | 'year' | null; paidUntil: string | null; limitUsd: number | null; friend: boolean
}

export interface Credit {
  /** null = no access yet (offer a plan) */
  plan: Plan | null
  active: boolean
  period: 'month' | 'year' | null
  paidUntil: string | null
  resetsAt: string | null
  /** paid plans: share of this month's quota used, 0–100 */
  usedPct: number | null
  /** friend status: half-price plans */
  friend: boolean
  // dev and fam only ($):
  monthUsed: number; used: number; uses: number
  // dev only:
  balance: number; topups: number; people: Person[]
}

const isPaid = (p: Plan | null) => p === 'solo' || p === 'ultra'

// ---- plan state for the AI buttons. Read synchronously on tap, so a file
// picker can still open from the same tap; undefined = not known yet.
export type PlanState = { plan: Plan | null; active: boolean; signedIn: boolean; friend: boolean; welcome: 'fam' | 'friend' | null } | undefined
let planState: PlanState
const listeners = new Set<() => void>()
const publish = (s: PlanState) => { planState = s; listeners.forEach((f) => f()) }
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }

export function refreshPlan() {
  (async () => {
    if (!supabase || !(await getSession())) return publish({ plan: null, active: false, signedIn: false, friend: false, welcome: null })
    const { data, error } = await supabase.rpc('ai_my_plan')
    if (error) return
    publishRow(((data ?? []) as Record<string, unknown>[])[0])
  })().catch(() => {})
}

const publishRow = (me: Record<string, unknown> | undefined) => publish({
  plan: (me?.plan as Plan) ?? null, active: !!me?.active, signedIn: true,
  friend: !!me?.friend, welcome: (me?.welcome as 'fam' | 'friend' | null) ?? null,
})

export const usePlan = () => useSyncExternalStore(subscribe, () => planState)

/** the welcome pop-up was shown: clear it on the server and here */
export async function ackWelcome() {
  if (planState) publish({ ...planState, welcome: null })
  await supabase?.rpc('ai_ack_welcome')
}
export const openPaywall = () => window.dispatchEvent(new Event('vis-paywall'))

/** true if the AI may be used; otherwise opens the plans page */
export function requireAi(): boolean {
  if (!planState || (planState.plan && planState.active)) return true
  openPaywall()
  return false
}

export async function fetchCredit(): Promise<Credit | null> {
  if (!supabase || !(await getSession())) return null
  const { data: rows, error } = await supabase.rpc('ai_my_plan')
  if (error) return null
  const me = ((rows ?? []) as Record<string, unknown>[])[0]
  publishRow(me)
  const base: Credit = {
    plan: null, active: false, period: null, paidUntil: null, resetsAt: null, usedPct: null, friend: false,
    monthUsed: 0, used: 0, uses: 0, balance: 0, topups: 0, people: [],
  }
  if (!me) return base
  const plan = me.plan as Plan
  const c: Credit = {
    ...base, plan, active: !!me.active,
    period: (me.period as Credit['period']) ?? null,
    paidUntil: (me.paid_until as string | null) ?? null,
    resetsAt: (me.resets_at as string | null) ?? null,
    usedPct: me.used_pct == null ? null : Number(me.used_pct),
    friend: !!me.friend,
    monthUsed: Number(me.month_usd) || 0,
  }
  if (plan !== 'dev' && plan !== 'fam') return c

  // dev and fam: own ledger in $ (paid plans cannot read it)
  const [{ data }, overview] = await Promise.all([
    supabase.from('ai_ledger').select('kind, usd'),
    plan === 'dev' ? supabase.rpc('ai_usage_overview') : Promise.resolve({ data: [] }),
  ])
  for (const r of (data ?? []) as { kind: string; usd: number }[]) {
    const v = Number(r.usd) || 0
    if (r.kind === 'topup') c.topups += v
    else { c.used += v; c.uses++ }
  }
  c.people = ((overview.data ?? []) as Record<string, unknown>[]).map((r) => ({
    userId: String(r.user_id), email: String(r.email ?? ''), monthUsd: Number(r.month_usd) || 0,
    openUsd: Number(r.open_usd) || 0, totalUsd: Number(r.total_usd) || 0, uses: Number(r.uses) || 0,
    settledAt: (r.settled_at as string | null) ?? null, isMe: !!r.is_me,
    plan: r.plan as Plan, period: (r.period as Person['period']) ?? null,
    paidUntil: (r.paid_until as string | null) ?? null,
    limitUsd: r.limit_usd == null ? null : Number(r.limit_usd), friend: !!r.friend,
  }))
  // the developer's balance subtracts everyone's use (all spend the same key)
  c.balance = c.topups - (plan === 'dev' ? c.people.reduce((a, p) => a + p.totalUsd, 0) : c.used)
  return c
}

export async function markSettled(userId: string) {
  const { error } = await supabase!.rpc('ai_mark_settled', { target: userId })
  if (error) throw error
}

export async function addTopup(usd: number) {
  const { error } = await supabase!.from('ai_ledger').insert({ kind: 'topup', usd, note: 'Aufladung' })
  if (error) throw error
}

/** developer: give an account a plan by e-mail ('none' removes the access) */
export async function setPlan(email: string, plan: 'fam' | 'friend' | 'solo' | 'ultra' | 'none', period: 'month' | 'year') {
  const { error } = await supabase!.rpc('ai_set_plan', { target_email: email, new_plan: plan, new_period: period })
  if (error) throw new Error(error.message.includes('unknown user') ? t('Kein Account mit dieser E-Mail', 'No account with this email') : t('Hat nicht geklappt', 'That did not work'))
}

/** green while there is enough, amber below 2 $, red below 1 $ (time to top up) */
export const creditColor = (b: number) => (b < 1 ? 'var(--danger)' : b < 2 ? '#e0a050' : 'var(--good)')
/** same idea for the share of a paid plan that is left */
export const leftColor = (left: number) => (left < 10 ? 'var(--danger)' : left < 30 ? '#e0a050' : 'var(--good)')
export const fmtUsd = (v: number) => dec(v, Math.abs(v) < 10 ? 2 : 1) + ' $'
export const fmtPct = (v: number) => `${Math.round(v)} %`

export function useCredit() {
  const [credit, setCredit] = useState<Credit | null>(null)
  const reload = () => { fetchCredit().then(setCredit).catch(() => {}) }
  useEffect(reload, [])
  // every AI call reports its cost ($) or, for paid plans, the new share used
  useEffect(() => {
    const on = (e: Event) => {
      const { usd, pct } = (e as CustomEvent<{ usd?: number; pct?: number }>).detail
      setCredit((c) => {
        if (!c) return c
        if (typeof pct === 'number') return { ...c, usedPct: pct }
        if (typeof usd === 'number') return { ...c, balance: c.balance - usd, used: c.used + usd, monthUsed: c.monthUsed + usd, uses: c.uses + 1 }
        return c
      })
    }
    window.addEventListener('vis-ai-cost', on)
    return () => window.removeEventListener('vis-ai-cost', on)
  }, [])
  return { credit, reload, setCredit }
}

/**
 * Tiny pill: paid plans see how much of the month is left, the developer the
 * estimated balance (once a top-up was entered). Friends see nothing.
 */
export function CreditPill({ credit }: { credit: Credit | null }) {
  if (!credit) return null
  if (isPaid(credit.plan) && credit.usedPct != null) {
    const left = 100 - credit.usedPct
    return (
      <span className="credit-pill num" title={t('Noch übrig diesen Monat', 'Left this month')}>
        <i style={{ background: leftColor(left) }} />
        {fmtPct(left)}
      </span>
    )
  }
  if (credit.plan !== 'dev' || credit.topups <= 0) return null
  return (
    <span className="credit-pill num" title={t('Geschätztes KI-Guthaben', 'Estimated AI balance')}>
      <i style={{ background: creditColor(credit.balance) }} />
      {fmtUsd(credit.balance)}
    </span>
  )
}
