import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n'
import { haptic } from '../lib'
import { pushupCounter } from '../native'

/**
 * Push-ups counted with the Face ID camera (iOS app only): the phone lies under
 * the face, every "down and back up" is one rep. A short countdown gives time to
 * get into position; "Fertig" hands the count back to the set.
 */
export function PushupCounter({ onDone, onClose }: { onDone: (reps: number) => void; onClose: () => void }) {
  const [phase, setPhase] = useState<'ready' | 'count' | 'run'>('ready')
  const [left, setLeft] = useState(3)
  const [reps, setReps] = useState(0)
  const [dist, setDist] = useState<{ meters: number; down: boolean; tracking: boolean }>({ meters: 0, down: false, tracking: false })
  const [err, setErr] = useState('')
  const stopRef = useRef<(() => Promise<number>) | null>(null)
  const range = useRef({ lo: 0.12, hi: 0.5 })

  const begin = () => {
    haptic()
    setPhase('count')
    setLeft(3)
  }
  // countdown, then the camera starts counting
  useEffect(() => {
    if (phase !== 'count') return
    if (left === 0) {
      setPhase('run')
      pushupCounter.start(
        (n) => setReps(n),
        (d) => {
          if (d.tracking && d.meters > 0) {
            range.current.lo = Math.min(range.current.lo, d.meters)
            range.current.hi = Math.max(range.current.hi, d.meters)
          }
          setDist(d)
        },
      ).then((stop) => { stopRef.current = stop }).catch((e) => { setErr(String((e as Error).message ?? e)); setPhase('ready') })
      return
    }
    const id = setTimeout(() => { setLeft((x) => x - 1); haptic() }, 1000)
    return () => clearTimeout(id)
  }, [phase, left])
  useEffect(() => () => { stopRef.current?.() }, [])

  const finish = async () => {
    const n = (await stopRef.current?.()) ?? reps
    stopRef.current = null
    onDone(Math.max(n, reps))
  }
  const reset = async () => {
    await stopRef.current?.()
    stopRef.current = null
    setReps(0)
    setPhase('ready')
  }

  // 0 = phone level (chest down), 1 = arms straight
  const level = dist.tracking ? Math.max(0, Math.min(1, (dist.meters - range.current.lo) / Math.max(0.05, range.current.hi - range.current.lo))) : 0

  return createPortal(
    <div className="pc">
      <div className="pc-top">
        <button className="icon-btn" onClick={async () => { await stopRef.current?.(); onClose() }} aria-label={t('Schließen', 'Close')}>✕</button>
        <span className="pc-title">{t('Liegestütze zählen', 'Count push-ups')}</span>
        <span style={{ width: 40 }} />
      </div>

      {phase === 'ready' && (
        <div className="pc-ready">
          <div className="pc-phone" aria-hidden="true"><span /></div>
          <h2>{t('Handy unter dein Gesicht', 'Phone under your face')}</h2>
          <p>{t('Leg dein iPhone mit dem Display nach oben auf den Boden, genau unter dein Gesicht. Die Face-ID-Kamera misst den Abstand – jedes Mal runter und wieder hoch zählt als eine Wiederholung.', 'Lay your iPhone screen up on the floor, right under your face. The Face ID camera measures the distance – every time down and back up counts as one rep.')}</p>
          {err && <div className="hint" style={{ color: 'var(--danger)' }}><span>{err}</span></div>}
          <button className="btn btn-chrome btn-block pc-go" onClick={begin}>{t('Start', 'Start')}</button>
        </div>
      )}

      {phase === 'count' && <div className="pc-countdown num" key={left}>{left || '•'}</div>}

      {phase === 'run' && (
        <div className="pc-run">
          <div className={'pc-status' + (dist.tracking ? ' on' : '')}>{dist.tracking ? t('Gesicht erkannt', 'Face found') : t('Kein Gesicht – schau aufs Display', 'No face – look at the screen')}</div>
          <div className="pc-count num" key={reps}>{reps}</div>
          <div className="pc-label">{reps === 1 ? t('Wiederholung', 'rep') : t('Wiederholungen', 'reps')}</div>
          <div className="pc-meter" aria-hidden="true">
            <div className="pc-meter-fill" style={{ height: `${level * 100}%` }} />
            <span className={'pc-meter-tag' + (dist.down ? ' down' : '')}>{dist.down ? t('hoch!', 'up!') : t('runter', 'down')}</span>
          </div>
          <div className="pc-actions">
            <button className="btn btn-ghost" onClick={reset}>{t('Neu', 'Reset')}</button>
            <button className="btn btn-chrome" onClick={finish}>{t(`Fertig · ${reps} übernehmen`, `Done · use ${reps}`)}</button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
