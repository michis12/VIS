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
      if (data.app !== 'vis' || !Array.isArray(data.workouts)) throw new Error('Keine VIS-Sicherung')
      await store.importSnapshot(normalizeSnapshot(data, store.settings))
      toast('Sicherung wiederhergestellt')
    } catch (e) {
      toast('Import fehlgeschlagen: ' + (e as Error).message)
    }
  }

  const askNotify = async () => {
    setPushBusy(true)
    try {
      const r = await enablePush()
      if (typeof Notification !== 'undefined') setPerm(Notification.permission)
      if (r === 'ok') { setPushOn(true); toast('Push bei Pausenende aktiviert') }
      else if (r === 'login') toast('Bitte zuerst unten bei Cloud anmelden')
      else if (r === 'denied') toast('Mitteilungen wurden nicht erlaubt')
      else toast('Push wird hier nicht unterstützt')
    } catch (e) {
      toast('Push-Fehler: ' + (e as Error).message)
    } finally {
      setPushBusy(false)
    }
  }

  const rest = store.settings.restSec
  const setRest = (d: number) => store.saveSettings({ ...store.settings, restSec: Math.max(30, Math.min(600, rest + d)) })

  return (
    <div className="screen no-tabs">
      <div className="wo-head">
        <button className="icon-btn" onClick={nav.pop} aria-label="Zurück"><Icon.back /></button>
        <div className="grow"><div className="name">Einstellungen</div></div>
      </div>
      <div style={{ height: 18 }} />

      <div className="section-title" style={{ marginTop: 0 }}><h2>Training</h2></div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>Pausenzeit<div className="faint" style={{ fontSize: 13 }}>startet nach jedem bestätigten Satz</div></div>
        <button className="icon-btn" onClick={() => setRest(-15)}>−</button>
        <span className="num" style={{ fontWeight: 700, fontSize: 18, minWidth: 52, textAlign: 'center' }}>{clock(rest)}</span>
        <button className="icon-btn" onClick={() => setRest(15)}>+</button>
      </div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          Push bei Pausenende
          <div className="faint" style={{ fontSize: 13 }}>
            {pushOn
              ? 'Aktiv – kommt auch bei gesperrtem Handy'
              : perm === 'denied'
                ? 'In den iOS-Einstellungen blockiert (Mitteilungen → VIS)'
                : !pushSupported()
                  ? 'Nur in der App vom Home-Bildschirm (iOS 16.4+)'
                  : 'Braucht Cloud-Anmeldung unten'}
          </div>
        </div>
        {!pushOn && perm !== 'denied' && pushSupported() && (
          <button className="btn btn-ghost btn-sm" disabled={pushBusy} onClick={askNotify}>Erlauben</button>
        )}
        {pushOn && <span className="sync-dot" data-on="1" />}
      </div>

      <div className="section-title"><h2>Cloud</h2></div>
      <CloudCard toast={toast} />

      <AiCreditCard toast={toast} />

      <FeedbackCard toast={toast} />

      <div className="section-title"><h2>Daten</h2></div>
      <div className="card">
        <div className="grid-3 num" style={{ textAlign: 'center' }}>
          <div><div style={{ fontSize: 22, fontWeight: 700 }}>{store.workouts.length}</div><div className="faint" style={{ fontSize: 12 }}>Workouts</div></div>
          <div><div style={{ fontSize: 22, fontWeight: 700 }}>{store.exercises.length}</div><div className="faint" style={{ fontSize: 12 }}>Übungen</div></div>
          <div><div style={{ fontSize: 22, fontWeight: 700 }}>{store.weights.length}</div><div className="faint" style={{ fontSize: 12 }}>Gewichte</div></div>
        </div>
        <p className="faint" style={{ fontSize: 13, marginTop: 14 }}>
          Alles wird auf diesem Gerät gespeichert{persisted ? ' und ist vor automatischem Löschen geschützt' : ''}.
          Mach regelmäßig eine Sicherung, z. B. in iCloud Drive.
          {lastBackup ? ` Letzte Sicherung: ${lastBackup.slice(0, 10)}.` : ' Noch keine Sicherung erstellt.'}
        </p>
        <div className="grid-2" style={{ marginTop: 14 }}>
          <button className="btn btn-chrome" onClick={exportBackup}>Sichern</button>
          <button className="btn btn-ghost" onClick={() => file.current?.click()}>Wiederherstellen</button>
        </div>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
      </div>

      <p className="faint num" style={{ fontSize: 12, textAlign: 'center', marginTop: 28 }}>
        VIS · Version {__BUILD__} UTC
      </p>
    </div>
  )
}
