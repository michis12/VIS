import { t } from '../i18n'
import { useState } from 'react'
import { pickFile } from '../files'
import { useStore } from '../store'
import { Sheet } from './ui'

export function Avatar({ size = 64, onClick }: { size?: number; onClick?: () => void }) {
  const { settings } = useStore()
  const initials = (settings.name || 'VIS').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <button className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }} onClick={onClick} aria-label={t('Profilbild', 'Profile picture')}>
      {settings.avatar ? <img src={settings.avatar} alt="" /> : <span className="chrome-text">{initials}</span>}
    </button>
  )
}

/** Center-crops and scales an image file to a square JPEG data URL. */
export async function squareImage(file: File, size = 256): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error(t('Bild konnte nicht gelesen werden', 'Could not read the image')))
      i.src = url
    })
    const s = Math.min(img.naturalWidth, img.naturalHeight)
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size)
    return c.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function ProfileEditor({ onClose }: { onClose: () => void }) {
  const store = useStore()
  const [name, setName] = useState(store.settings.name ?? '')
  const [avatar, setAvatar] = useState(store.settings.avatar)
  const [err, setErr] = useState<string | null>(null)

  const choose = async () => {
    const f = await pickFile('image/*')
    if (!f) return
    try { setAvatar(await squareImage(f)); setErr(null) } catch (e) { setErr((e as Error).message) }
  }

  return (
    <Sheet onClose={onClose}>
      <h3>{t('Profil bearbeiten', 'Edit profile')}</h3>
      <div style={{ display: 'grid', placeItems: 'center', margin: '16px 0 6px' }}>
        <button className="avatar" style={{ width: 112, height: 112, fontSize: 40 }} onClick={choose}>
          {avatar ? <img src={avatar} alt="" /> : <span className="chrome-text">+</span>}
        </button>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={choose}>{avatar ? t('Foto ändern', 'Change photo') : t('Foto wählen', 'Choose photo')}</button>
          {avatar && <button className="btn btn-ghost btn-sm" onClick={() => setAvatar(undefined)}>{t('Entfernen', 'Remove')}</button>}
        </div>
        {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{err}</p>}
      </div>
      <label className="lbl">Name</label>
      <input className="input" placeholder={t('Dein Name', 'Your name')} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
      <button className="btn btn-chrome btn-block" style={{ marginTop: 18 }} onClick={() => {
        store.saveSettings({ ...store.settings, name: name.trim() || undefined, avatar })
        onClose()
      }}>{t('Speichern', 'Save')}</button>
    </Sheet>
  )
}
