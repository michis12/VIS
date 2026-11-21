import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import * as cloud from '../cloud'
import type { Snapshot } from '../db'
import { dateLabel } from '../lib'
import { useStore } from '../store'
import { Sheet } from './ui'

const when = (iso: string) => `${dateLabel(iso)} · ${new Date(iso).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`

export function CloudCard({ toast }: { toast: (t: string) => void }) {
  const store = useStore()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [found, setFound] = useState<cloud.BackupMeta | null>(null)
  const [versions, setVersions] = useState<cloud.BackupMeta[] | null>(null)
  const [ready, setReady] = useState(cloud.cloudReady())
  const [last, setLast] = useState(cloud.lastSync())

  const snapshot = useCallback((): Snapshot => ({
    exercises: store.exercises, workouts: store.workouts, templates: store.templates,
    weights: store.weights, phases: store.phases, settings: store.settings,
  }), [store])

  useEffect(() => {
    if (!cloud.supabase) { setLoading(false); return }
    cloud.getSession().then((s) => { setSession(s); setLoading(false) })
    const { data } = cloud.supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // first time signed in on this device: decide between cloud data and local data
  useEffect(() => {
    if (!session || ready) return
    cloud.listBackups().then(async (list) => {
      if (list.length) setFound(list[0])
      else {
        await cloud.upload(snapshot(), true)
        cloud.setCloudReady(true)
        setReady(true)
        setLast(cloud.lastSync())
        toast('Erstes Cloud-Backup erstellt')
      }
    }, (e) => setErr(String(e.message ?? e)))
  }, [session, ready, snapshot, toast])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null)
    try { await fn() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const restore = (id: number) => run(async () => {
    const data = await cloud.fetchBackup(id)
    await store.importSnapshot({
      exercises: data.exercises ?? [], workouts: data.workouts ?? [], templates: data.templates ?? [],
      weights: data.weights ?? [], phases: data.phases ?? [], settings: data.settings ?? store.settings,
    })
    cloud.setCloudReady(true)
    setReady(true); setFound(null); setVersions(null)
    toast('Aus der Cloud wiederhergestellt')
  })

  if (!cloud.cloudConfigured) {
    return <div className="card muted" style={{ fontSize: 14 }}>Cloud-Backup ist in dieser Version noch nicht eingerichtet.</div>
  }
  if (loading) return <div className="card faint">Verbinde…</div>

  if (!session) {
    return (
      <div className="card">
        <div style={{ fontWeight: 650 }}>Cloud-Backup</div>
        <p className="faint" style={{ fontSize: 13, marginTop: 2 }}>Melde dich an, damit alles automatisch in der Cloud gesichert wird – auch wenn du das Handy verlierst.</p>
        <label className="lbl">E-Mail</label>
        <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="lbl">Passwort</label>
        <input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{err}</p>}
        <div className="grid-2" style={{ marginTop: 14 }}>
          <button className="btn btn-chrome" disabled={busy || !email || !pw} onClick={() => run(() => cloud.signIn(email.trim(), pw))}>Anmelden</button>
          <button className="btn btn-ghost" disabled={busy || !email || !pw} onClick={() => run(async () => {
            const r = await cloud.signUp(email.trim(), pw)
            if (r.needsConfirm) setErr('Fast fertig: Öffne den Link in der Bestätigungs-Mail und melde dich dann hier an.')
          })}>Registrieren</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="sync-dot" data-on={ready ? '1' : '0'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650 }}>Cloud-Backup {ready ? 'aktiv' : 'wartet'}</div>
          <div className="faint" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.user.email}</div>
        </div>
      </div>
      <p className="faint" style={{ fontSize: 13, marginTop: 10 }}>
        {last ? `Zuletzt gesichert: ${when(last)}` : 'Noch nicht gesichert.'} Änderungen werden automatisch hochgeladen, die letzten 30 Stände bleiben erhalten.
      </p>
      {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{err}</p>}

      {found && !ready && (
        <div className="card" style={{ marginTop: 12, background: 'var(--surface-2)' }}>
          <div style={{ fontWeight: 650 }}>Cloud-Backup gefunden</div>
          <div className="muted" style={{ fontSize: 13 }}>{when(found.created_at)} · {found.workouts} Workouts</div>
          <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>Dieses Gerät hat {store.workouts.filter((w) => w.status === 'done').length} Workouts.</div>
          <button className="btn btn-chrome btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={() => restore(found.id)}>Cloud-Stand laden</button>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} disabled={busy} onClick={() => run(async () => {
            await cloud.upload(snapshot(), true)
            cloud.setCloudReady(true); setReady(true); setFound(null); setLast(cloud.lastSync())
            toast('Dieses Gerät in die Cloud gesichert')
          })}>Stattdessen dieses Gerät hochladen</button>
        </div>
      )}

      {ready && (
        <div className="grid-2" style={{ marginTop: 12 }}>
          <button className="btn btn-chrome" disabled={busy} onClick={() => run(async () => {
            const wrote = await cloud.upload(snapshot(), true)
            setLast(cloud.lastSync())
            toast(wrote ? 'In der Cloud gesichert' : 'Bereits aktuell')
          })}>Jetzt sichern</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => run(async () => setVersions(await cloud.listBackups()))}>Versionen</button>
        </div>
      )}
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => run(async () => { await cloud.signOut(); setReady(false); setFound(null) })}>Abmelden</button>

      {versions && (
        <Sheet onClose={() => setVersions(null)}>
          <h3>Cloud-Versionen</h3>
          <p className="faint" style={{ fontSize: 13, marginBottom: 8 }}>Laden ersetzt alle Daten auf diesem Gerät durch den gewählten Stand.</p>
          <div className="menu">
            {versions.map((v) => (
              <button key={v.id} disabled={busy} onClick={() => restore(v.id)}>
                <span style={{ flex: 1 }}>{when(v.created_at)}</span>
                <span className="faint num" style={{ fontSize: 13 }}>{v.workouts} Workouts</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}
