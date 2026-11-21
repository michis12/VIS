import { useEffect, useRef, useState } from 'react'
import { CloudCard } from '../components/CloudCard'
import { clock, localIso } from '../lib'
import { useStore } from '../store'
import type { Snapshot } from '../db'

export function Settings({ toast }: { toast: (t: string) => void }) {
  const store = useStore()
  const file = useRef<HTMLInputElement>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const [lastBackup, setLastBackup] = useState(() => { try { return localStorage.getItem('vis.lastBackup') } catch { return null } })

  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted) }, [])

  const exportBackup = () => {
    const snap: Snapshot = {
      exercises: store.exercises, workouts: store.workouts, templates: store.templates,
      weights: store.weights, phases: store.phases, settings: store.settings,
    }
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
      await store.importSnapshot({
        exercises: data.exercises ?? [], workouts: data.workouts, templates: data.templates ?? [],
        weights: data.weights ?? [], phases: data.phases ?? [], settings: data.settings ?? store.settings,
      })
      toast('Sicherung wiederhergestellt')
    } catch (e) {
      toast('Import fehlgeschlagen: ' + (e as Error).message)
    }
  }

  const askNotify = async () => {
    if (typeof Notification === 'undefined') return
    setPerm(await Notification.requestPermission())
  }

  const rest = store.settings.restSec
  const setRest = (d: number) => store.saveSettings({ ...store.settings, restSec: Math.max(30, Math.min(600, rest + d)) })

  return (
    <div className="screen">
      <div className="eyebrow">VIS</div>
      <h1 className="title">Einstellungen</h1>

      <div className="section-title" style={{ marginTop: 0 }}><h2>Training</h2></div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>Pausenzeit<div className="faint" style={{ fontSize: 13 }}>startet nach jedem bestätigten Satz</div></div>
        <button className="icon-btn" onClick={() => setRest(-15)}>−</button>
        <span className="num" style={{ fontWeight: 700, fontSize: 18, minWidth: 52, textAlign: 'center' }}>{clock(rest)}</span>
        <button className="icon-btn" onClick={() => setRest(15)}>+</button>
      </div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          Benachrichtigung bei Pausenende
          <div className="faint" style={{ fontSize: 13 }}>
            {perm === 'granted' ? 'Aktiv' : perm === 'denied' ? 'In den iOS-Einstellungen blockiert' : perm === 'unsupported' ? 'Erst nach „Zum Home-Bildschirm“ verfügbar' : 'Noch nicht erlaubt'}
          </div>
        </div>
        {perm === 'default' && <button className="btn btn-ghost btn-sm" onClick={askNotify}>Erlauben</button>}
      </div>

      <div className="section-title"><h2>Cloud</h2></div>
      <CloudCard toast={toast} />

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
