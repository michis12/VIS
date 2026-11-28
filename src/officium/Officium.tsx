import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../cloud'

/**
 * VIS-Officium: the owner's own app. Users and how much they use VIS, AI costs,
 * database load, feedback and the product corrections users sent in.
 * Every number comes from security-definer functions (migration 0013) that only
 * answer for the developer account, so the page is useless to anyone else.
 */

interface Overview {
  now: string; users: number; newUsers7: number; active7: number; active30: number; backups: number; dbBytes: number
  aiMonthUsd: number; aiMonthUses: number; aiTotalUsd: number; topups: number
  feedbackOpen: number; correctionsOpen: number; overrides: number; plans: Record<string, number>
  aiDays: { day: string; usd: number; uses: number }[]
  aiModes: { mode: string; usd: number; uses: number }[]
  signups: { week: string; n: number }[]
  tables: { name: string; bytes: number; rows: number }[]
}
interface User {
  user_id: string; email: string; created_at: string; last_sign_in_at: string | null; plan: string | null; friend: boolean
  backups: number; last_backup: string | null; workouts: number | null; backup_bytes: number | null
  ai_month_usd: number; ai_total_usd: number; ai_uses: number; feedback: number
}
interface Feedback { id: number; created_at: string; kind: 'problem' | 'idea'; message: string; meta: Record<string, string>; done: boolean; email: string }
type Vals = { name?: string; brand?: string; kcal?: number; p?: number; c?: number; f?: number; serving?: number }
interface Correction {
  id: number; created_at: string; food_id: string; barcode: string | null; name: string; brand: string | null
  old_values: Vals; new_values: Vals; status: 'open' | 'accepted' | 'rejected'; decided_at: string | null; email: string; user_corrections: number
}

// the Supabase free tier: 500 MB database
const DB_LIMIT = 500 * 1024 * 1024
const TABS = ['Übersicht', 'Nutzer', 'KI', 'Datenbank', 'Feedback', 'Korrekturen'] as const
type Tab = (typeof TABS)[number]

const usd = (v: number) => `${Number(v).toFixed(Number(v) < 1 ? 3 : 2)} $`
const mb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)
const ago = (iso: string | null) => {
  if (!iso) return '–'
  const m = (Date.now() - new Date(iso).getTime()) / 60000
  if (m < 60) return `vor ${Math.max(1, Math.round(m))} min`
  if (m < 60 * 24) return `vor ${Math.round(m / 60)} h`
  const d = Math.round(m / 60 / 24)
  return d === 1 ? 'gestern' : `vor ${d} Tagen`
}
const date = (iso: string) => new Date(iso).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

export function Officium() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    if (!supabase) { setSession(null); return }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <div className="of-boot"><span className="of-ring" /></div>
  if (!session) return <Login />
  return <Board email={session.user.email ?? ''} />
}

function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    if (error) setErr(error.message)
    setBusy(false)
  }
  return (
    <div className="of-login">
      <div className="of-mark"><span className="of-ring" /></div>
      <h1 className="chrome-text">Officium</h1>
      <p className="faint">VIS · nur für den Betreiber</p>
      <form onSubmit={go}>
        <input className="input" type="email" autoComplete="username" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" type="password" autoComplete="current-password" placeholder="Passwort" value={pw} onChange={(e) => setPw(e.target.value)} />
        {err && <div className="of-err">{err}</div>}
        <button className="btn btn-chrome btn-block" disabled={busy || !email || !pw}>{busy ? '…' : 'Anmelden'}</button>
      </form>
    </div>
  )
}

function Board({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>('Übersicht')
  const [ov, setOv] = useState<Overview | null>(null)
  const [users, setUsers] = useState<User[] | null>(null)
  const [feedback, setFeedback] = useState<Feedback[] | null>(null)
  const [corr, setCorr] = useState<Correction[] | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const [a, b, c, d] = await Promise.all([
      supabase.rpc('officium_overview'), supabase.rpc('officium_users'),
      supabase.rpc('officium_feedback'), supabase.rpc('officium_corrections'),
    ])
    const e = a.error ?? b.error ?? c.error ?? d.error
    if (e) setErr(e.message.includes('not allowed') ? 'denied' : e.message)
    else {
      setErr('')
      setOv(a.data as Overview); setUsers(b.data as User[]); setFeedback(c.data as Feedback[]); setCorr(d.data as Correction[])
    }
    setLoading(false)
  }, [])
  useEffect(() => {
    load()
    const onShow = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onShow)
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 60000)
    return () => { document.removeEventListener('visibilitychange', onShow); clearInterval(t) }
  }, [load])

  if (err === 'denied') {
    return (
      <div className="of-login">
        <div className="of-mark"><span className="of-ring off" /></div>
        <h1 className="chrome-text">Kein Zugriff</h1>
        <p className="faint">{email} ist kein Betreiber-Konto.</p>
        <button className="btn btn-ghost" onClick={() => supabase?.auth.signOut()}>Abmelden</button>
      </div>
    )
  }

  const badge = (t: Tab) => (t === 'Feedback' ? ov?.feedbackOpen : t === 'Korrekturen' ? ov?.correctionsOpen : 0) || 0
  return (
    <div className="of">
      <header className="of-head">
        <div className="of-title"><span className="of-ring small" /><b className="chrome-text">Officium</b></div>
        <button className={'of-refresh' + (loading ? ' spin' : '')} onClick={load} aria-label="Aktualisieren">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg>
        </button>
      </header>
      <nav className="of-tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t}{badge(t) > 0 && <i>{badge(t)}</i>}
          </button>
        ))}
      </nav>
      {err && <div className="of-err">{err}</div>}
      <main className="of-main" key={tab}>
        {!ov ? <div className="of-boot"><span className="of-ring" /></div> : (
          <>
            {tab === 'Übersicht' && <OverviewTab ov={ov} users={users ?? []} go={setTab} />}
            {tab === 'Nutzer' && <UsersTab users={users ?? []} />}
            {tab === 'KI' && <AiTab ov={ov} users={users ?? []} />}
            {tab === 'Datenbank' && <DbTab ov={ov} />}
            {tab === 'Feedback' && <FeedbackTab list={feedback ?? []} reload={load} />}
            {tab === 'Korrekturen' && <CorrectionsTab list={corr ?? []} reload={load} />}
          </>
        )}
      </main>
      <footer className="of-foot faint">{email} · <button className="link" onClick={() => supabase?.auth.signOut()}>Abmelden</button></footer>
    </div>
  )
}

function Kpi({ label, value, sub, onClick, accent }: { label: string; value: string | number; sub?: string; onClick?: () => void; accent?: boolean }) {
  return (
    <button className={'of-kpi' + (accent ? ' accent' : '') + (onClick ? ' link' : '')} onClick={onClick} disabled={!onClick}>
      <span>{label}</span>
      <b className="num">{value}</b>
      {sub && <small>{sub}</small>}
    </button>
  )
}

function Bars({ data, fmt }: { data: { label: string; v: number }[]; fmt: (v: number) => string }) {
  const max = Math.max(1e-9, ...data.map((d) => d.v))
  return (
    <div className="of-bars">
      {data.map((d) => (
        <div key={d.label} className="of-bar" title={`${d.label}: ${fmt(d.v)}`}>
          <div style={{ height: `${Math.max(2, (d.v / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  )
}

function Meter({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100)
  return <div className={'of-meter' + (pct > 80 ? ' hot' : '')}><div style={{ width: `${pct}%` }} /></div>
}

function OverviewTab({ ov, users, go }: { ov: Overview; users: User[]; go: (t: Tab) => void }) {
  const balance = ov.topups - ov.aiTotalUsd
  const days = useMemo(() => {
    const m = new Map(ov.aiDays.map((d) => [d.day.slice(0, 10), Number(d.usd)]))
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10)
      return { label: d, v: m.get(d) ?? 0 }
    })
  }, [ov.aiDays])
  const recent = users.filter((u) => u.last_backup).slice(0, 5)
  return (
    <>
      <div className="of-grid">
        <Kpi label="Nutzer" value={ov.users} sub={`+${ov.newUsers7} diese Woche`} onClick={() => go('Nutzer')} />
        <Kpi label="Aktiv" value={ov.active7} sub={`7 Tage · ${ov.active30} in 30 Tagen`} />
        <Kpi label="KI diesen Monat" value={usd(ov.aiMonthUsd)} sub={`${ov.aiMonthUses} Anfragen`} onClick={() => go('KI')} />
        <Kpi label="Guthaben" value={usd(balance)} sub={`${usd(ov.topups)} aufgeladen`} accent={balance < 1} />
        <Kpi label="Feedback offen" value={ov.feedbackOpen} onClick={() => go('Feedback')} accent={ov.feedbackOpen > 0} />
        <Kpi label="Korrekturen offen" value={ov.correctionsOpen} sub={`${ov.overrides} übernommen`} onClick={() => go('Korrekturen')} accent={ov.correctionsOpen > 0} />
      </div>

      <section className="of-card" onClick={() => go('Datenbank')}>
        <div className="of-row"><b>Datenbank</b><span className="num">{mb(ov.dbBytes)} / 500 MB</span></div>
        <Meter value={ov.dbBytes} max={DB_LIMIT} />
        <div className="faint of-small">{ov.backups} Backups · {(ov.dbBytes / DB_LIMIT * 100).toFixed(1)} % vom Gratis-Kontingent</div>
      </section>

      <section className="of-card">
        <div className="of-row"><b>KI-Kosten, 30 Tage</b><span className="num faint">{usd(days.reduce((n, d) => n + d.v, 0))}</span></div>
        <Bars data={days} fmt={usd} />
      </section>

      <section className="of-card">
        <div className="of-row"><b>Pläne</b></div>
        <div className="of-chips">{Object.entries(ov.plans).map(([k, n]) => <span key={k} className="of-chip">{k} · {n}</span>)}<span className="of-chip">free · {Math.max(0, ov.users - Object.values(ov.plans).reduce((a, b) => a + b, 0))}</span></div>
      </section>

      <section className="of-card">
        <div className="of-row"><b>Zuletzt aktiv</b></div>
        {recent.map((u) => (
          <div key={u.user_id} className="of-line"><span className="of-ell">{u.email}</span><span className="faint num">{ago(u.last_backup)}</span></div>
        ))}
      </section>
    </>
  )
}

function UsersTab({ users }: { users: User[] }) {
  const [q, setQ] = useState('')
  const list = users.filter((u) => u.email.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <input className="input of-search" placeholder="Suchen" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.map((u) => (
        <section key={u.user_id} className="of-card of-user">
          <div className="of-row">
            <b className="of-ell">{u.email}</b>
            <span className={'of-plan ' + (u.plan ?? 'free')}>{u.plan ?? 'free'}{u.friend ? ' · friend' : ''}</span>
          </div>
          <div className="of-facts">
            <span><i>Zuletzt</i>{ago(u.last_backup ?? u.last_sign_in_at)}</span>
            <span><i>Workouts</i>{u.workouts ?? '–'}</span>
            <span><i>Backups</i>{u.backups}</span>
            <span><i>Daten</i>{u.backup_bytes ? mb(u.backup_bytes) : '–'}</span>
            <span><i>KI Monat</i>{usd(u.ai_month_usd)}</span>
            <span><i>KI gesamt</i>{usd(u.ai_total_usd)} · {u.ai_uses}×</span>
            <span><i>Feedback</i>{u.feedback}</span>
            <span><i>Seit</i>{new Date(u.created_at).toLocaleDateString('de-AT')}</span>
          </div>
        </section>
      ))}
    </>
  )
}

function AiTab({ ov, users }: { ov: Overview; users: User[] }) {
  const max = Math.max(1e-9, ...ov.aiModes.map((m) => Number(m.usd)))
  const top = [...users].sort((a, b) => b.ai_month_usd - a.ai_month_usd).filter((u) => u.ai_month_usd > 0)
  return (
    <>
      <div className="of-grid">
        <Kpi label="Monat" value={usd(ov.aiMonthUsd)} sub={`${ov.aiMonthUses} Anfragen`} />
        <Kpi label="Gesamt" value={usd(ov.aiTotalUsd)} />
      </div>
      <section className="of-card">
        <div className="of-row"><b>Nach Funktion (Monat)</b></div>
        {ov.aiModes.map((m) => (
          <div key={m.mode} className="of-hbar">
            <span>{m.mode}</span>
            <div><div style={{ width: `${(Number(m.usd) / max) * 100}%` }} /></div>
            <b className="num">{usd(Number(m.usd))}</b><small className="faint num">{m.uses}×</small>
          </div>
        ))}
      </section>
      <section className="of-card">
        <div className="of-row"><b>Nach Nutzer (Monat)</b></div>
        {top.map((u) => <div key={u.user_id} className="of-line"><span className="of-ell">{u.email}</span><span className="num">{usd(u.ai_month_usd)}</span></div>)}
        {!top.length && <div className="faint of-small">Noch nichts diesen Monat.</div>}
      </section>
    </>
  )
}

function DbTab({ ov }: { ov: Overview }) {
  const max = Math.max(1, ...ov.tables.map((t) => t.bytes))
  const weeks = ov.signups.map((s) => ({ label: s.week, v: s.n }))
  return (
    <>
      <section className="of-card">
        <div className="of-row"><b>Auslastung</b><span className="num">{mb(ov.dbBytes)} / 500 MB</span></div>
        <Meter value={ov.dbBytes} max={DB_LIMIT} />
        <div className="faint of-small">Gratis-Kontingent von Supabase. Backups: die letzten 30 pro Nutzer.</div>
      </section>
      <section className="of-card">
        <div className="of-row"><b>Tabellen</b></div>
        {ov.tables.map((t) => (
          <div key={t.name} className="of-hbar">
            <span>{t.name}</span>
            <div><div style={{ width: `${(t.bytes / max) * 100}%` }} /></div>
            <b className="num">{mb(t.bytes)}</b><small className="faint num">{t.rows} Zeilen</small>
          </div>
        ))}
      </section>
      <section className="of-card">
        <div className="of-row"><b>Neue Nutzer pro Woche</b></div>
        {weeks.length ? <Bars data={weeks} fmt={(v) => String(v)} /> : <div className="faint of-small">Keine in den letzten 12 Wochen.</div>}
      </section>
    </>
  )
}

function FeedbackTab({ list, reload }: { list: Feedback[]; reload: () => void }) {
  const [showDone, setShowDone] = useState(false)
  const toggle = async (f: Feedback) => {
    await supabase?.rpc('officium_feedback_done', { target: f.id, is_done: !f.done })
    reload()
  }
  const shown = list.filter((f) => showDone || !f.done)
  return (
    <>
      <div className="of-row of-filter">
        <span className="faint">{list.filter((f) => !f.done).length} offen · {list.length} gesamt</span>
        <button className="link" onClick={() => setShowDone(!showDone)}>{showDone ? 'Nur offene' : 'Auch erledigte'}</button>
      </div>
      {shown.map((f) => (
        <section key={f.id} className={'of-card of-fb ' + f.kind + (f.done ? ' done' : '')}>
          <div className="of-row">
            <span className="of-kind">{f.kind === 'problem' ? 'Problem' : 'Idee'} #{f.id}</span>
            <span className="faint of-small num">{date(f.created_at)}</span>
          </div>
          <p className="of-msg">{f.message}</p>
          <div className="faint of-small">{f.meta?.name ? `${f.meta.name} · ` : ''}{f.email}</div>
          {(f.meta?.version || f.meta?.screen) && <div className="faint of-small">{[f.meta.version, f.meta.screen, f.meta.stats].filter(Boolean).join(' · ')}</div>}
          <div className="of-actions">
            <a className="btn btn-ghost btn-sm" href={`mailto:${f.email}?subject=${encodeURIComponent('Re: dein VIS-Feedback')}`}>Antworten</a>
            <button className={'btn btn-sm ' + (f.done ? 'btn-ghost' : 'btn-chrome')} onClick={() => toggle(f)}>{f.done ? 'Wieder öffnen' : 'Erledigt'}</button>
          </div>
        </section>
      ))}
      {!shown.length && <div className="faint of-empty">Alles erledigt ✓</div>}
    </>
  )
}

function CorrectionsTab({ list, reload }: { list: Correction[]; reload: () => void }) {
  const [busy, setBusy] = useState<number | null>(null)
  const decide = async (c: Correction, accept: boolean) => {
    setBusy(c.id)
    await supabase?.rpc('officium_decide', { target: c.id, accept })
    setBusy(null)
    reload()
  }
  const undo = async (c: Correction) => {
    setBusy(c.id)
    await supabase?.rpc('officium_drop_override', { target: c.food_id })
    setBusy(null)
    reload()
  }
  const fields: [keyof Vals, string][] = [['name', 'Name'], ['brand', 'Marke'], ['kcal', 'kcal'], ['p', 'Eiweiß'], ['c', 'Kohlenhydrate'], ['f', 'Fett'], ['serving', 'Portion g']]
  const fmt = (v: unknown) => (v == null || v === '' ? '–' : typeof v === 'number' ? String(Math.round(v * 10) / 10) : String(v))
  return (
    <>
      <p className="faint of-small of-intro">Ein Nutzer hat die Werte eines Produkts aus der Datenbank geändert. Für ihn gilt das sofort – „Übernehmen“ setzt die Werte für alle.</p>
      {list.map((c) => (
        <section key={c.id} className={'of-card of-corr ' + c.status}>
          <div className="of-row">
            <b className="of-ell">{c.name}{c.brand ? <span className="faint"> · {c.brand}</span> : null}</b>
            <span className={'of-status ' + c.status}>{c.status === 'open' ? 'offen' : c.status === 'accepted' ? 'übernommen' : 'abgelehnt'}</span>
          </div>
          <div className="faint of-small">{c.email} ({c.user_corrections} Anfragen) · {date(c.created_at)}{c.barcode ? ` · ${c.barcode}` : ''}</div>
          <table className="of-diff">
            <thead><tr><th /><th>Vorher</th><th>Neu</th></tr></thead>
            <tbody>
              {fields.map(([k, label]) => {
                const a = c.old_values?.[k], b = c.new_values?.[k]
                if (a == null && b == null) return null
                const changed = fmt(a) !== fmt(b)
                return <tr key={k} className={changed ? 'chg' : ''}><td>{label}</td><td className="num">{fmt(a)}</td><td className="num">{fmt(b)}</td></tr>
              })}
            </tbody>
          </table>
          {c.status === 'open' ? (
            <div className="of-actions">
              <button className="btn btn-ghost btn-sm" disabled={busy === c.id} onClick={() => decide(c, false)}>Ablehnen</button>
              <button className="btn btn-chrome btn-sm" disabled={busy === c.id} onClick={() => decide(c, true)}>Für alle übernehmen</button>
            </div>
          ) : c.status === 'accepted' ? (
            <div className="of-actions"><button className="btn btn-ghost btn-sm" disabled={busy === c.id} onClick={() => undo(c)}>Für alle zurücknehmen</button></div>
          ) : null}
        </section>
      ))}
      {!list.length && <div className="faint of-empty">Noch keine Korrekturen.</div>}
    </>
  )
}
