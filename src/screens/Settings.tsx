import { useEffect, useRef, useState } from 'react'
import { AiCreditCard } from '../components/AiCreditCard'
import { CloudCard } from '../components/CloudCard'
import { FeedbackCard } from '../components/FeedbackCard'
import { enablePush, pushActive, pushSupported } from '../push'
import { clock, localIso } from '../lib'
import { Icon } from '../components/ui'
import { useNav } from '../nav'
import { useStore } from '../store'
import { normalizeSnapshot, snapshotOf, type Snapshot } from '../db'
import { t, type Lang } from '../i18n'

export function Settings({ toast }: { toast: (t: string) => void }) {
  const store = useStore()
  const nav = useNav()
  const file = useRef<HTMLInputElement>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const [lastBackup, setLastBackup] = useState(() => { try { return localStorage.getItem('vis.lastBackup') } catch { return null } })

  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted) }, [])
  useEffect(() => { pushActive().then(setPushOn) }, [])

  const exportBackup = () => {
    const snap: Snapshot = snapshotOf(store)
    const blob = new Blob([JSON.stringify({ app: 'vis', version: 1, exportedAt: localIso(), ...snap })], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `vis-backup-${localIso().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    const now = localIso()
    try { localStorage.setItem('vis.lastBackup', now) } catch { /* ignore */ }
    setLastBackup(now)
  }

  const importBackup = async (f: File) => {
    try {
      const data = JSON.parse(await f.text())
      if (data.app !== 'vis' || !Array.isArray(data.workouts)) throw new Error(t('Keine VIS-Sicherung', 'Not a VIS backup'))
      await store.importSnapshot(normalizeSnapshot(data, store.settings))
      toast(t('Sicherung wiederhergestellt', 'Backup restored'))
    } catch (e) {
      toast(t('Import fehlgeschlagen: ', 'Import failed: ') + (e as Error).message)
    }
  }

  const askNotify = async () => {
    setPushBusy(true)
    try {
      const r = await enablePush()
      if (typeof Notification !== 'undefined') setPerm(Notification.permission)
      if (r === 'ok') { setPushOn(true); toast(t('Push bei Pausenende aktiviert', 'Rest-end push turned on')) }
      else if (r === 'login') toast(t('Bitte zuerst unten bei Cloud anmelden', 'Please sign in to Cloud below first'))
      else if (r === 'denied') toast(t('Mitteilungen wurden nicht erlaubt', 'Notifications were not allowed'))
      else toast(t('Push wird hier nicht unterstützt', 'Push is not supported here'))
    } catch (e) {
      toast(t('Push-Fehler: ', 'Push error: ') + (e as Error).message)
    } finally {
      setPushBusy(false)
    }
  }

  const rest = store.settings.restSec
  const setRest = (d: number) => store.saveSettings({ ...store.settings, restSec: Math.max(30, Math.min(600, rest + d)) })
  const lang = store.settings.lang ?? 'de'
  const setLanguage = (l: Lang) => { if (l !== lang) store.saveSettings({ ...store.settings, lang: l }) }

  return (
    <div className="screen no-tabs">
      <div className="wo-head">
        <button className="icon-btn" onClick={nav.pop} aria-label={t('Zurück', 'Back')}><Icon.back /></button>
        <div className="grow"><div className="name">{t('Einstellungen', 'Settings')}</div></div>
      </div>
      <div style={{ height: 18 }} />

      <div className="section-title" style={{ marginTop: 0 }}><h2>{t('Sprache', 'Language')}</h2></div>
      <div className="card">
        <div className="segmented">
          <button className={lang === 'de' ? 'on' : ''} onClick={() => setLanguage('de')}>Deutsch</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLanguage('en')}>English</button>
        </div>
      </div>

      <div className="section-title"><h2>Training</h2></div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>{t('Pausenzeit', 'Rest time')}<div className="faint" style={{ fontSize: 13 }}>{t('startet nach jedem bestätigten Satz', 'starts after every confirmed set')}</div></div>
        <button className="icon-btn" onClick={() => setRest(-15)}>−</button>
        <span className="num" style={{ fontWeight: 700, fontSize: 18, minWidth: 52, textAlign: 'center' }}>{clock(rest)}</span>
        <button className="icon-btn" onClick={() => setRest(15)}>+</button>
      </div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          {t('Push bei Pausenende', 'Push when rest ends')}
          <div className="faint" style={{ fontSize: 13 }}>
            {pushOn
              ? t('Aktiv – kommt auch bei gesperrtem Handy', 'On – arrives even when the phone is locked')
              : perm === 'denied'
                ? t('In den iOS-Einstellungen blockiert (Mitteilungen → VIS)', 'Blocked in iOS Settings (Notifications → VIS)')
                : !pushSupported()
                  ? t('Nur in der App vom Home-Bildschirm (iOS 16.4+)', 'Only in the app from the Home Screen (iOS 16.4+)')
                  : t('Braucht Cloud-Anmeldung unten', 'Needs Cloud sign-in below')}
          </div>
        </div>
        {!pushOn && perm !== 'denied' && pushSupported() && (
          <button className="btn btn-ghost btn-sm" disabled={pushBusy} onClick={askNotify}>{t('Erlauben', 'Allow')}</button>
        )}
        {pushOn && <span className="sync-dot" data-on="1" />}
      </div>

      <div className="section-title"><h2>Cloud</h2></div>
      <CloudCard toast={toast} />

      <AiCreditCard toast={toast} />

      <FeedbackCard toast={toast} />

      <div className="section-title"><h2>{t('Daten', 'Data')}</h2></div>
      <div className="card">
        <div className="grid-3 num" style={{ textAlign: 'center' }}>
          <div><div style={{ fontSize: 22, fontWeight: 700 }}>{store.workouts.length}</div><div className="faint" style={{ fontSize: 12 }}>Workouts</div></div>
          <div><div style={{ fontSize: 22, fontWeight: 700 }}>{store.exercises.length}</div><div className="faint" style={{ fontSize: 12 }}>{t('Übungen', 'Exercises')}</div></div>
          <div><div style={{ fontSize: 22, fontWeight: 700 }}>{store.weights.length}</div><div className="faint" style={{ fontSize: 12 }}>{t('Gewichte', 'Weights')}</div></div>
        </div>
        <p className="faint" style={{ fontSize: 13, marginTop: 14 }}>
          {t('Alles wird auf diesem Gerät gespeichert', 'Everything is stored on this device')}{persisted ? t(' und ist vor automatischem Löschen geschützt', ' and protected from automatic deletion') : ''}.
          {' '}{t('Mach regelmäßig eine Sicherung, z. B. in iCloud Drive.', 'Make a backup regularly, e.g. to iCloud Drive.')}
          {lastBackup ? t(` Letzte Sicherung: ${lastBackup.slice(0, 10)}.`, ` Last backup: ${lastBackup.slice(0, 10)}.`) : t(' Noch keine Sicherung erstellt.', ' No backup made yet.')}
        </p>
        <div className="grid-2" style={{ marginTop: 14 }}>
          <button className="btn btn-chrome" onClick={exportBackup}>{t('Sichern', 'Back up')}</button>
          <button className="btn btn-ghost" onClick={() => file.current?.click()}>{t('Wiederherstellen', 'Restore')}</button>
        </div>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
      </div>

      <p className="faint num" style={{ fontSize: 12, textAlign: 'center', marginTop: 28 }}>
        VIS · Version {__BUILD__} UTC
      </p>
    </div>
  )
}
