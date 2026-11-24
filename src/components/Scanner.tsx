import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib'
import { Tap } from './ui'

/**
 * Full-screen barcode scanner (EAN/UPC) using the back camera. The ZXing library
 * is loaded on demand so it doesn't weigh down the app start.
 *
 * iOS home-screen apps sometimes hand out a black camera stream when the camera
 * is opened again while the previous stream is not fully released. So the app
 * owns the stream itself: any leftover stream is stopped before asking again,
 * the stream is always stopped and detached on close, and a stream that stays
 * black is thrown away and requested once more.
 */
let live: MediaStream | null = null

function release(video?: HTMLVideoElement | null) {
  live?.getTracks().forEach((t) => t.stop())
  live = null
  if (video) {
    video.pause()
    video.srcObject = null
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  for (let attempt = 0; attempt < 3; attempt++) {
    release(video)
    if (attempt) await wait(350)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
    live = stream
    video.srcObject = stream
    await video.play().catch(() => {})
    // black stream check: a working camera reports a frame size quickly
    for (let i = 0; i < 15 && !video.videoWidth; i++) await wait(100)
    if (video.videoWidth && stream.getVideoTracks()[0]?.readyState === 'live') return stream
  }
  throw new Error('black')
}

export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tryNo, setTryNo] = useState(0)
  // the parent passes a new callback on every render – don't restart the camera for that
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode
  // flashlight: only offered when the camera reports it (or on iPhone, where we just try)
  const track = useRef<MediaStreamTrack | null>(null)
  const [torchAvail, setTorchAvail] = useState(false)
  const [torch, setTorch] = useState(false)
  const [torchMsg, setTorchMsg] = useState<string | null>(null)

  const toggleTorch = async () => {
    const t = track.current
    if (!t || t.readyState !== 'live') return
    try {
      await t.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] })
      setTorch(!torch)
      setTorchMsg(null)
    } catch {
      setTorchAvail(false)
      setTorchMsg('Licht wird hier leider nicht unterstützt')
    }
  }

  useEffect(() => {
    let cancelled = false
    let stopDecoding: (() => void) | null = null
    const el = video.current
    setErr(null)
    setTorch(false)
    ;(async () => {
      try {
        if (!el) return
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ])
        const stream = await openCamera(el)
        if (cancelled) { release(el); return }
        const vt = stream.getVideoTracks()[0] ?? null
        track.current = vt
        const caps = (vt?.getCapabilities?.() ?? {}) as { torch?: boolean }
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
        setTorchAvail(!!caps.torch || ios)
        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E])
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 })
        let done = false
        const controls = await reader.decodeFromStream(stream, el, (result) => {
          if (!result || done) return
          done = true
          haptic(true)
          stopDecoding?.()
          release(el)
          onCodeRef.current(result.getText())
        })
        stopDecoding = () => controls.stop()
        if (cancelled || done) controls.stop()
      } catch (e) {
        if (cancelled) return
        release(el)
        const name = (e as Error).name
        setErr(
          name === 'NotAllowedError'
            ? 'Kein Kamerazugriff – in den iPhone-Einstellungen für diese App erlauben.'
            : 'Kamera bleibt schwarz – tippe auf „Neu starten“.',
        )
      }
    })()
    return () => {
      cancelled = true
      stopDecoding?.()
      release(el)
    }
  }, [tryNo])

  // leaving the app (lock screen, app switcher) kills the camera on iOS: start fresh on return
  useEffect(() => {
    const onVis = () => { if (!document.hidden) setTryNo((n) => n + 1) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return createPortal(
    <div className="scanner">
      <video ref={video} playsInline muted autoPlay />
      <div className="scanner-frame" />
      <div className="scanner-top">
        <button className="btn btn-ghost btn-sm" onClick={() => setTryNo((n) => n + 1)}>Neu starten</button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Abbrechen</button>
      </div>
      {torchAvail && !err && (
        <Tap className={'scanner-torch' + (torch ? ' on' : '')} onClick={toggleTorch} aria-label={torch ? 'Licht aus' : 'Licht an'}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 3h10v3l-2 4v10a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V10L7 6Z" />
            <path d="M7 6h10M12 13v2" />
          </svg>
        </Tap>
      )}
      <div className="scanner-hint">{err ?? torchMsg ?? 'Barcode in den Rahmen halten'}</div>
    </div>,
    document.body,
  )
}
