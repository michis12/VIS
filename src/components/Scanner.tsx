import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib'

/**
 * Full-screen barcode scanner (EAN/UPC) using the back camera. The ZXing library
 * is loaded on demand so it doesn't weigh down the app start.
 */
export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let stop: (() => void) | null = null
    let cancelled = false
    ;(async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ])
        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E])
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 })
        if (cancelled || !video.current) return
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          video.current,
          (result) => {
            if (!result) return
            controls.stop()
            haptic(true)
            onCode(result.getText())
          },
        )
        stop = () => controls.stop()
        if (cancelled) stop()
      } catch (e) {
        const name = (e as Error).name
        setErr(name === 'NotAllowedError' ? 'Kein Kamerazugriff – in den iPhone-Einstellungen für diese App erlauben.' : 'Kamera konnte nicht gestartet werden.')
      }
    })()
    return () => { cancelled = true; stop?.() }
  }, [onCode])

  return createPortal(
    <div className="scanner">
      <video ref={video} playsInline muted autoPlay />
      <div className="scanner-frame" />
      <div className="scanner-top">
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Abbrechen</button>
      </div>
      <div className="scanner-hint">{err ?? 'Barcode in den Rahmen halten'}</div>
    </div>,
    document.body,
  )
}
