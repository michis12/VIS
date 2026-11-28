import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { rankFor } from '../achievements'
import * as fr from '../friends'
import { t } from '../i18n'
import { fmtInt, fmtKg, haptic, weekKey } from '../lib'
import { useStore } from '../store'
import { useAchievements } from '../screens/Profile'
import { useWeekScore } from './WeeklyReport'
import { Icon, Sheet } from './ui'

/** The own summary friends see; published in the background (App). */
export function useMyFriendStats(): fr.FriendStats {
  const store = useStore()
  const week = useWeekScore(0)
  const ach = useAchievements()
  return useMemo(() => {
    const done = store.workouts.filter((w) => w.status === 'done')
    // weeks in a row with at least one workout (this week counts once trained)
    const weeks = new Set(done.map((w) => weekKey(w.startedAt.slice(0, 10))))
    let streak = 0
    const d = new Date()
    if (!weeks.has(weekKey(d.toISOString().slice(0, 10)))) d.setDate(d.getDate() - 7)
    while (weeks.has(weekKey(d.toISOString().slice(0, 10)))) { streak++; d.setDate(d.getDate() - 7) }
    // best estimated 1RM of the big three (barbell or machine variants, never assisted)
    const best = (re: RegExp) => {
      let b = 0
      for (const [id, st] of store.progress.state) if (re.test(id) && !/assist/.test(id)) b = Math.max(b, st.bestE)
      return b ? Math.round(b) : undefined
    }
    const stars = ach.reduce((n, a) => n + a.stars, 0)
    return {
      name: store.settings.name ?? '',
      weekScore: week.score, weekWorkouts: week.workouts, totalWorkouts: done.length, streakWeeks: streak,
      rank: rankFor(stars).name, stars, achievements: ach.filter((a) => a.stars > 0).length,
      volumeWeek: Math.round(week.volume),
      lifts: { bench: best(/bench-press/), squat: best(/squat/), deadlift: best(/deadlift/) },
      lastWorkout: done[done.length - 1]?.startedAt.slice(0, 10),
    }
  }, [store.workouts, store.progress.state, store.settings.name, week, ach])
}

/** Publishes the summary after changes (signed in with a friend profile only). */
export function FriendsSync() {
  const stats = useMyFriendStats()
  useEffect(() => {
    const id = setTimeout(() => { fr.publishStats(stats).catch(() => {}) }, 4000)
    return () => clearTimeout(id)
  }, [stats])
  return null
}

/** Button in the profile header with a dot for open requests. */
export function FriendsButton() {
  const [open, setOpen] = useState(false)
  const [badge, setBadge] = useState(0)
  useEffect(() => { fr.incomingCount().then(setBadge).catch(() => {}) }, [open])
  return (
    <>
      <button className="icon-btn friends-btn" onClick={() => { haptic(); setOpen(true) }} aria-label={t('Freunde', 'Friends')} style={{ width: 44, height: 44 }}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="8" r="3.4" /><path d="M2.8 19.5c.6-3.3 3.1-5.3 6.2-5.3s5.6 2 6.2 5.3" /><path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2M17.6 14.4c2 .6 3.3 2.3 3.6 5.1" />
        </svg>
        {badge > 0 && <i className="friends-dot">{badge}</i>}
      </button>
      {open && <Friends onClose={() => setOpen(false)} />}
    </>
  )
}

function Friends({ onClose }: { onClose: () => void }) {
  const store = useStore()
  const mine = useMyFriendStats()
  const [data, setData] = useState<fr.FriendsData | null>(null)
  const [signed, setSigned] = useState<boolean | null>(null)
  const [err, setErr] = useState('')
  const [name, setName] = useState(store.settings.name ?? '')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [cmp, setCmp] = useState<fr.Friend | null>(null)

  const load = useCallback(async () => {
    try {
      const s = await fr.signedIn()
      setSigned(s)
      if (s) setData(await fr.loadFriends())
    } catch (e) { setErr((e as Error).message) }
  }, [])
  useEffect(() => { load() }, [load])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(''); setMsg('')
    try { await fn(); await load() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const createProfile = () => run(async () => {
    await fr.saveProfile(name || t('Sportler', 'Athlete'))
    fr.publishStats({ ...mine, name: name || mine.name }).catch(() => {})
  })
  const request = () => run(async () => {
    const r = await fr.sendRequest(code)
    setMsg({
      sent: t('Anfrage gesendet ✓', 'Request sent ✓'), accepted: t('Ihr seid jetzt Freunde ✓', 'You are friends now ✓'),
      unknown: t('Diesen Code gibt es nicht.', 'That code does not exist.'), self: t('Das ist dein eigener Code.', 'That is your own code.'),
      exists: t('Anfrage läuft schon.', 'Request already sent.'), limit: t('Heute schon zu viele Anfragen.', 'Too many requests today.'),
      no_profile: t('Leg zuerst deinen Namen an.', 'Set your name first.'),
    }[r] ?? r)
    if (r === 'sent' || r === 'accepted') { setCode(''); haptic(true) }
  })
  const share = async () => {
    if (!data?.me) return
    const text = t(`Füg mich in VIS als Freund hinzu – mein Code: ${data.me.code}`, `Add me as a friend in VIS – my code: ${data.me.code}`)
    try {
      if (navigator.share) await navigator.share({ text })
      else { await navigator.clipboard.writeText(data.me.code); setMsg(t('Code kopiert ✓', 'Code copied ✓')) }
    } catch { /* cancelled */ }
  }

  const incoming = data?.requests.filter((r) => r.incoming) ?? []
  const outgoing = data?.requests.filter((r) => !r.incoming) ?? []

  return createPortal(
    <div className="fullsheet friends">
      <div className="fullsheet-head">
        <button className="icon-btn" onClick={onClose} aria-label={t('Schließen', 'Close')}><Icon.back /></button>
        <div className="grow" style={{ fontWeight: 700, fontSize: 18 }}>{t('Freunde', 'Friends')}</div>
      </div>
      <div className="fullsheet-body">
        {signed === false && (
          <div className="card fr-empty">
            <b>{t('Für Freunde brauchst du ein Konto', 'Friends need an account')}</b>
            <span className="faint">{t('Melde dich unter Profil › Einstellungen › Cloud an – dann kannst du Freunde hinzufügen und euch vergleichen.', 'Sign in under Profile › Settings › Cloud – then you can add friends and compare.')}</span>
          </div>
        )}
        {signed && data && !data.me && (
          <div className="card fr-setup">
            <b>{t('Wie sollen dich Freunde sehen?', 'How should friends see you?')}</b>
            <span className="faint">{t('Nur dieser Name und dein Fortschritt sind für Freunde sichtbar – nie deine E-Mail.', 'Friends only see this name and your progress – never your e-mail.')}</span>
            <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t('Dein Name', 'Your name')} />
            <button className="btn btn-chrome btn-block" disabled={busy || !name.trim()} onClick={createProfile}>{t('Freundescode erstellen', 'Create friend code')}</button>
          </div>
        )}
        {data?.me && (
          <>
            <div className="card fr-code">
              <span className="eyebrow" style={{ margin: 0 }}>{t('Dein Freundescode', 'Your friend code')}</span>
              <b className="num">{data.me.code}</b>
              <button className="btn btn-ghost btn-sm" onClick={share}>{t('Teilen', 'Share')}</button>
            </div>
            <form className="fr-add" onSubmit={(e) => { e.preventDefault(); if (code.trim()) request() }}>
              <input className="input" value={code} maxLength={8} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('Code eines Freundes', 'A friend’s code')} autoCapitalize="characters" />
              <button className="btn btn-chrome" disabled={busy || code.trim().length < 6}>{t('Anfragen', 'Request')}</button>
            </form>
            {msg && <div className="hint" style={{ marginTop: 8 }}><span>{msg}</span></div>}

            {incoming.length > 0 && (
              <>
                <div className="section-title"><h2>{t('Anfragen', 'Requests')}</h2></div>
                {incoming.map((r) => (
                  <div key={r.id} className="card fr-req">
                    <span className="fr-avatar">{r.name.slice(0, 1).toUpperCase()}</span>
                    <b className="grow">{r.name}</b>
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => fr.respond(r.id, false))}>{t('Ablehnen', 'Decline')}</button>
                    <button className="btn btn-chrome btn-sm" disabled={busy} onClick={() => run(() => fr.respond(r.id, true))}>{t('Annehmen', 'Accept')}</button>
                  </div>
                ))}
              </>
            )}

            <div className="section-title"><h2>{t('Rangliste dieser Woche', 'This week’s ranking')}</h2></div>
            <div className="card fr-list">
              {[{ userId: 'me', name: t('Du', 'You'), stats: mine, since: '', updatedAt: null } as fr.Friend, ...(data.friends)]
                .sort((a, b) => (b.stats?.weekScore ?? -1) - (a.stats?.weekScore ?? -1))
                .map((f, i) => (
                  <button key={f.userId} className={'fr-row' + (f.userId === 'me' ? ' me' : '')} disabled={f.userId === 'me'} onClick={() => setCmp(f)}>
                    <span className="fr-pos num">{i + 1}</span>
                    <span className="fr-avatar">{f.name.slice(0, 1).toUpperCase()}</span>
                    <span className="grow">
                      <b>{f.name}</b>
                      <small className="faint">{f.stats ? `${f.stats.rank} · ${f.stats.weekWorkouts} ${t('Workouts', 'workouts')}` : t('noch keine Daten', 'no data yet')}</small>
                    </span>
                    <span className="fr-score num">{f.stats?.weekScore ?? '–'}</span>
                  </button>
                ))}
              {!data.friends.length && <div className="faint" style={{ fontSize: 13, padding: '10px 4px' }}>{t('Noch keine Freunde – teil deinen Code oder gib den eines Freundes ein.', 'No friends yet – share your code or enter a friend’s.')}</div>}
            </div>
            {outgoing.length > 0 && <div className="faint" style={{ fontSize: 12.5, marginTop: 8 }}>{t('Wartet auf Antwort', 'Waiting for an answer')}: {outgoing.map((r) => r.name).join(', ')}</div>}
          </>
        )}
        {err && <div className="hint" style={{ color: 'var(--danger)', marginTop: 10 }}><span>{err}</span></div>}
      </div>
      {cmp && <Compare me={mine} friend={cmp} onClose={() => setCmp(null)} onRemove={() => run(async () => { await fr.removeFriend(cmp.userId); setCmp(null) })} />}
    </div>,
    document.body,
  )
}

function Compare({ me, friend, onClose, onRemove }: { me: fr.FriendStats; friend: fr.Friend; onClose: () => void; onRemove: () => void }) {
  const o = friend.stats
  const [sure, setSure] = useState(false)
  const rows: [string, number | undefined, number | undefined, (v: number) => string][] = [
    [t('Wochenscore', 'Week score'), me.weekScore, o?.weekScore, String],
    [t('Workouts diese Woche', 'Workouts this week'), me.weekWorkouts, o?.weekWorkouts, String],
    [t('Volumen diese Woche', 'Volume this week'), me.volumeWeek, o?.volumeWeek, (v) => (v >= 1000 ? `${fmtKg(Math.round(v / 100) / 10)} t` : `${fmtInt(v)} kg`)],
    [t('Wochen-Serie', 'Week streak'), me.streakWeeks, o?.streakWeeks, String],
    [t('Workouts gesamt', 'Total workouts'), me.totalWorkouts, o?.totalWorkouts, String],
    [t('Sterne', 'Stars'), me.stars, o?.stars, String],
    [t('Bankdrücken 1RM', 'Bench 1RM'), me.lifts.bench, o?.lifts.bench, (v) => `${v} kg`],
    [t('Kniebeuge 1RM', 'Squat 1RM'), me.lifts.squat, o?.lifts.squat, (v) => `${v} kg`],
    [t('Kreuzheben 1RM', 'Deadlift 1RM'), me.lifts.deadlift, o?.lifts.deadlift, (v) => `${v} kg`],
  ]
  return (
    <Sheet onClose={onClose}>
      <div className="fr-vs">
        <div><span className="fr-avatar big">{(me.name || t('Du', 'You')).slice(0, 1).toUpperCase()}</span><b>{t('Du', 'You')}</b><small className="faint">{me.rank}</small></div>
        <span className="fr-vs-mid">vs</span>
        <div><span className="fr-avatar big">{friend.name.slice(0, 1).toUpperCase()}</span><b>{friend.name}</b><small className="faint">{o?.rank ?? '–'}</small></div>
      </div>
      <div className="fr-cmp">
        {rows.filter(([, a, b]) => a != null || b != null).map(([label, a, b, f]) => (
          <div key={label} className="fr-cmp-row">
            <b className={'num' + (a != null && b != null && a > b ? ' win' : '')}>{a != null ? f(a) : '–'}</b>
            <span>{label}</span>
            <b className={'num' + (a != null && b != null && b > a ? ' win' : '')}>{b != null ? f(b) : '–'}</b>
          </div>
        ))}
      </div>
      {!o && <p className="faint" style={{ fontSize: 13, textAlign: 'center' }}>{t(`${friend.name} hat noch keine Daten geteilt.`, `${friend.name} hasn’t shared any data yet.`)}</p>}
      <button className="btn btn-ghost btn-block" style={{ marginTop: 14, color: sure ? 'var(--danger)' : undefined }} onClick={() => (sure ? onRemove() : setSure(true))}>
        {sure ? t('Wirklich entfernen?', 'Really remove?') : t('Freund entfernen', 'Remove friend')}
      </button>
    </Sheet>
  )
}

