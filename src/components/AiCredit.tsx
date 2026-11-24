import { useEffect, useState } from 'react'
import { getSession, supabase } from '../cloud'

/**
 * Remaining AI credit, estimated: top-ups entered in the app minus the cost the
 * edge function books for every photo (public.ai_ledger). Anthropic has no
 * balance API, so the exact figure is only in the Anthropic Console.
 */
/** AI use of one account on the allow-list (only the key owner sees these). */
export interface Person {
  userId: string; email: string; monthUsd: number; openUsd: number; totalUsd: number
  uses: number; settledAt: string | null; isMe: boolean
}

/**
 * `used` / `monthUsed` / `uses` are the caller's own; for the key owner the
 * balance subtracts everyone's use (friends spend the same key).
 */
export interface Credit {
  balance: number; topups: number; used: number; monthUsed: number; uses: number
  owner: boolean; people: Person[]
}

export async function fetchCredit(): Promise<Credit | null> {
  if (!supabase || !(await getSession())) return null
  const [{ data, error }, overview] = await Promise.all([
    supabase.from('ai_ledger').select('kind, usd, created_at'),
    supabase.rpc('ai_usage_overview'),
  ])
  if (error || !data) return null
  const month = new Date().toISOString().slice(0, 7)
  let topups = 0, used = 0, monthUsed = 0, uses = 0
  for (const r of data as { kind: string; usd: number; created_at: string }[]) {
    const v = Number(r.usd) || 0
    if (r.kind === 'topup') topups += v
    else { used += v; uses++; if (r.created_at.slice(0, 7) === month) monthUsed += v }
  }
  const people: Person[] = ((overview.data ?? []) as Record<string, unknown>[]).map((r) => ({
    userId: String(r.user_id), email: String(r.email ?? ''), monthUsd: Number(r.month_usd) || 0,
    openUsd: Number(r.open_usd) || 0, totalUsd: Number(r.total_usd) || 0, uses: Number(r.uses) || 0,
    settledAt: (r.settled_at as string | null) ?? null, isMe: !!r.is_me,
  }))
  const owner = people.length > 0
  const allUsed = owner ? people.reduce((a, p) => a + p.totalUsd, 0) : used
  return { balance: topups - allUsed, topups, used, monthUsed, uses, owner, people }
}

export async function markSettled(userId: string) {
  const { error } = await supabase!.rpc('ai_mark_settled', { target: userId })
  if (error) throw error
}

export async function addTopup(usd: number) {
  const { error } = await supabase!.from('ai_ledger').insert({ kind: 'topup', usd, note: 'Aufladung' })
  if (error) throw error
}

/** green while there is enough, amber below 2 $, red below 1 $ (time to top up) */
export const creditColor = (b: number) => (b < 1 ? 'var(--danger)' : b < 2 ? '#e0a050' : 'var(--good)')
export const fmtUsd = (v: number) => (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1)).replace('.', ',') + ' $'

export function useCredit() {
  const [credit, setCredit] = useState<Credit | null>(null)
  const reload = () => { fetchCredit().then(setCredit).catch(() => {}) }
  useEffect(reload, [])
  // every AI call reports its cost: keep the pill current without refetching
  useEffect(() => {
    const on = (e: Event) => {
      const usd = (e as CustomEvent<number>).detail
      setCredit((c) => (c ? { ...c, balance: c.balance - usd, used: c.used + usd, monthUsed: c.monthUsed + usd, uses: c.uses + 1 } : c))
    }
    window.addEventListener('vis-ai-cost', on)
    return () => window.removeEventListener('vis-ai-cost', on)
  }, [])
  return { credit, reload, setCredit }
}

/** Tiny pill: coloured dot + remaining credit. Hidden until a top-up was entered. */
export function CreditPill({ credit }: { credit: Credit | null }) {
  if (!credit || credit.topups <= 0) return null
  return (
    <span className="credit-pill num" title="Geschätztes KI-Guthaben">
      <i style={{ background: creditColor(credit.balance) }} />
      {fmtUsd(credit.balance)}
    </span>
  )
}
