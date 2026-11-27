import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import * as cloud from '../cloud'
import { refreshPlan } from './AiCredit'
import { normalizeSnapshot, snapshotOf, type Snapshot } from '../db'
import { dateLabel } from '../lib'
import { locale, t } from '../i18n'
import { useStore } from '../store'
import { Sheet } from './ui'

const when = (iso: string) => `${dateLabel(iso)} · ${new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`

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

  const snapshot = useCallback((): Snapshot => snapshotOf(store), [store])

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
        toast(t('Erstes Cloud-Backup erstellt', 'First cloud backup created'))
      }
    }, (e) => setErr(String(e.message ?? e)))
  }, [session, ready, snapshot, toast])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null)
    try { await fn() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const restore = (id: number) => run(async () => {
    const data = await cloud.fetchBackup(id)
    await store.importSnapshot(normalizeSnapshot(data, store.settings))
    // this device now has backup `id`; the automatic pull only loads newer ones
    const meta = (versions ?? []).find((v) => v.id === id) ?? found
    cloud.markSynced(snapshotOf({ ...store, ...normalizeSnapshot(data, store.settings) }), id, meta?.created_at ?? new Date().toISOString())
    cloud.setCloudReady(true)
    setReady(true); setFound(null); setVersions(null)
    toast(t('Aus der Cloud wiederhergestellt', 'Restored from the cloud'))
  })

  if (!cloud.cloudConfigured) {
    return <div className="card muted" style={{ fontSize: 14 }}>{t('Cloud-Backup ist in dieser Version noch nicht eingerichtet.', 'Cloud backup is not set up in this version yet.')}</div>
  }
  if (loading) return <div className="card faint">{t('Verbinde…', 'Connecting…')}</div>

  if (!session) {
    return (
      <div className="card">
        <div style={{ fontWeight: 650 }}>{t('Cloud-Backup', 'Cloud backup')}</div>
        <p className="faint" style={{ fontSize: 13, marginTop: 2 }}>{t('Melde dich an, damit alles automatisch in der Cloud gesichert wird – auch wenn du das Handy verlierst.', 'Sign in so everything is backed up to the cloud automatically – even if you lose your phone.')}</p>
        <label className="lbl">{t('E-Mail', 'Email')}</label>
        <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="lbl">{t('Passwort', 'Password')}</label>
        <input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{err}</p>}
        <div className="grid-2" style={{ marginTop: 14 }}>
          <button className="btn btn-chrome" disabled={busy || !email || !pw} onClick={() => run(async () => { await cloud.signIn(email.trim(), pw); refreshPlan() })}>{t('Anmelden', 'Sign in')}</button>
          <button className="btn btn-ghost" disabled={busy || !email || !pw} onClick={() => run(async () => {
            const r = await cloud.signUp(email.trim(), pw)
            if (r.needsConfirm) setErr(t('Fast fertig: Öffne den Link in der Bestätigungs-Mail und melde dich dann hier an.', 'Almost done: open the link in the confirmation email, then sign in here.'))
          })}>{t('Registrieren', 'Sign up')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="sync-dot" data-on={ready ? '1' : '0'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650 }}>{ready ? t('Cloud-Backup aktiv', 'Cloud backup on') : t('Cloud-Backup wartet', 'Cloud backup waiting')}</div>
          <div className="faint" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.user.email}</div>
        </div>
      </div>
      <p className="faint" style={{ fontSize: 13, marginTop: 10 }}>
        {last ? t(`Zuletzt gesichert: ${when(last)}`, `Last backed up: ${when(last)}`) : t('Noch nicht gesichert.', 'Not backed up yet.')} {t('Änderungen werden automatisch hochgeladen, die letzten 30 Stände bleiben erhalten.', 'Changes are uploaded automatically; the last 30 versions are kept.')}
      </p>
      {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{err}</p>}

      {found && !ready && (
        <div className="card" style={{ marginTop: 12, background: 'var(--surface-2)' }}>
          <div style={{ fontWeight: 650 }}>{t('Cloud-Backup gefunden', 'Cloud backup found')}</div>
          <div className="muted" style={{ fontSize: 13 }}>{when(found.created_at)} · {found.workouts} Workouts</div>
          <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>{t('Dieses Gerät hat', 'This device has')} {store.workouts.filter((w) => w.status === 'done').length} Workouts.</div>
          <button className="btn btn-chrome btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={() => restore(found.id)}>{t('Cloud-Stand laden', 'Load cloud version')}</button>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} disabled={busy} onClick={() => run(async () => {
            await cloud.upload(snapshot(), true)
            cloud.setCloudReady(true); setReady(true); setFound(null); setLast(cloud.lastSync())
            toast(t('Dieses Gerät in die Cloud gesichert', 'This device backed up to the cloud'))
          })}>{t('Stattdessen dieses Gerät hochladen', 'Upload this device instead')}</button>
        </div>
      )}

      {ready && (
        <div className="grid-2" style={{ marginTop: 12 }}>
          <button className="btn btn-chrome" disabled={busy} onClick={() => run(async () => {
            const wrote = await cloud.upload(snapshot(), true)
            setLast(cloud.lastSync())
            toast(wrote ? t('In der Cloud gesichert', 'Backed up to the cloud') : t('Bereits aktuell', 'Already up to date'))
          })}>{t('Jetzt sichern', 'Back up now')}</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => run(async () => setVersions(await cloud.listBackups()))}>{t('Versionen', 'Versions')}</button>
        </div>
      )}
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => run(async () => { await cloud.signOut(); setReady(false); setFound(null); refreshPlan() })}>{t('Abmelden', 'Sign out')}</button>

      {versions && (
        <Sheet onClose={() => setVersions(null)}>
          <h3>{t('Cloud-Versionen', 'Cloud versions')}</h3>
          <p className="faint" style={{ fontSize: 13, marginBottom: 8 }}>{t('Laden ersetzt alle Daten auf diesem Gerät durch den gewählten Stand.', 'Loading replaces all data on this device with the chosen version.')}</p>
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
