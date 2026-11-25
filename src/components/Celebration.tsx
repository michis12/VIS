import { t } from '../i18n'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { durationLabel, fmtInt, haptic, workoutSetCount, workoutVolume } from '../lib'
import { useStore } from '../store'
import { Num } from '../anim'
import { ScorePill } from './ScoreGauge'
import { Icon, ProgressBadges } from './ui'

/** Chrome (or emerald) confetti: flipping metallic ribbons and dots, ~3 s, no loop. */
export function ChromeConfetti({ tint = 'chrome', burst = 70, rain = 60, top = 0.3 }: { tint?: 'chrome' | 'emerald'; burst?: number; rain?: number; top?: number } = {}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const c = ref.current!
    const ctx = c.getContext('2d')!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = window.innerWidth
    const H = window.innerHeight
    c.width = W * dpr
    c.height = H * dpr
    ctx.scale(dpr, dpr)

    const rand = (a: number, b: number) => a + Math.random() * (b - a)
    type P = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; flip: number; vf: number; w: number; h: number; dot: boolean; base: number }
    const parts: P[] = []
    const add = (x: number, y: number, vx: number, vy: number) => {
      const dot = Math.random() < 0.2
      parts.push({
        x, y, vx, vy,
        rot: rand(0, Math.PI * 2), vr: rand(-0.15, 0.15), flip: rand(0, Math.PI * 2), vf: rand(0.07, 0.2),
        w: dot ? rand(1.8, 3) : rand(3, 5), h: dot ? 0 : rand(8, 14), dot, base: rand(160, 250),
      })
    }
    // radial burst from behind the check mark …
    const cx = W / 2
    const cy = Math.min(H * top, 260)
    for (let i = 0; i < burst; i++) {
      const a = rand(0, Math.PI * 2)
      const speed = rand(4, 11)
      add(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20, Math.cos(a) * speed, Math.sin(a) * speed - 3)
    }
    // … plus a light rain over the whole width
    for (let i = 0; i < rain; i++) add(rand(0, W), rand(-H * 0.5, -10), rand(-0.8, 0.8), rand(1, 3))

    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const age = (t - start) / 1000
      ctx.clearRect(0, 0, W, H)
      const fade = age > 2.6 ? Math.max(0, 1 - (age - 2.6) / 0.9) : 1
      for (const p of parts) {
        p.vy += 0.18 // gravity
        p.vx *= 0.98
        p.vy = Math.min(p.vy * 0.985, 4.5) // terminal velocity → floats down like paper
        p.x += p.vx + Math.sin(age * 3 + p.base) * 0.4
        p.y += p.vy
        p.rot += p.vr
        p.flip += p.vf
        const sheen = Math.abs(Math.cos(p.flip)) // metallic glint as the ribbon turns
        const v = Math.round(Math.min(255, p.base * 0.55 + sheen * 120))
        ctx.save()
        ctx.globalAlpha = fade
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = tint === 'emerald'
          ? `rgb(${Math.round(v * 0.35)},${Math.min(255, v + 20)},${Math.round(v * 0.68)})`
          : `rgb(${v},${v},${Math.min(255, v + 6)})`
        if (p.dot) {
          ctx.beginPath(); ctx.arc(0, 0, p.w, 0, Math.PI * 2); ctx.fill()
        } else {
          ctx.scale(1, Math.max(0.12, Math.abs(Math.sin(p.flip))))
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        }
        ctx.restore()
      }
      if (age < 3.6) raf = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, W, H)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [tint, burst, rain, top])
  return <canvas ref={ref} className="confetti" />
}

export function Celebration({ id, onClose }: { id: string; onClose: () => void }) {
  const { workouts, progress, exerciseById, workoutScores } = useStore()
  const w = workouts.find((x) => x.id === id)
  const rating = progress.byId.get(id)

  useEffect(() => {
    haptic(true)
    const t = setTimeout(() => haptic(true), 350)
    return () => clearTimeout(t)
  }, [])

  if (!w) return null
  const highlights = w.exercises
    .map((e, i) => ({ e, r: rating?.exercises[i] }))
    .filter(({ r }) => r && (r.ups || r.prs))
    .sort((a, b) => (b.r!.prs - a.r!.prs) || (b.r!.ups - a.r!.ups))

  return createPortal(
    <div className="celebrate">
      <ChromeConfetti />
      <div className="celebrate-card stagger">
        <div className="celebrate-check"><Icon.check /></div>
        <div className="eyebrow" style={{ textAlign: 'center', marginTop: 14 }}>{t('Workout abgeschlossen', 'Workout complete')}</div>
        <h2 className="chrome-text celebrate-title">{w.name}</h2>
        {workoutScores.has(id) && (
          <div className="celebrate-score">
            <ScorePill score={workoutScores.get(id)!} size={44} animate />
            <span>{t('Workout-Score', 'Workout score')}</span>
          </div>
        )}

        <div className="grid-3" style={{ marginTop: 18 }}>
          <div className="card kpi"><div className="label">{t('Dauer', 'Duration')}</div><div className="value" style={{ fontSize: 19 }}>{durationLabel(w.durationSec)}</div></div>
          <div className="card kpi"><div className="label">{t('Sätze', 'Sets')}</div><div className="value" style={{ fontSize: 19 }}><Num value={workoutSetCount(w)} from={0} ms={900} /></div></div>
          <div className="card kpi"><div className="label">{t('Volumen', 'Volume')}</div><div className="value" style={{ fontSize: 19 }}><Num value={workoutVolume(w)} format={fmtInt} from={0} ms={900} /><small>kg</small></div></div>
        </div>

        <div className="grid-2" style={{ marginTop: 10 }}>
          <div className={'card celebrate-stat' + (rating?.prs ? ' hot' : '')}>
            <Icon.cup size={22} />
            <div><div className="n"><Num value={rating?.prs ?? 0} from={0} ms={900} /></div><div className="l">{t('Rekorde', 'Records')}</div></div>
          </div>
          <div className={'card celebrate-stat' + (rating?.ups ? ' good' : '')}>
            <Icon.up size={22} />
            <div><div className="n"><Num value={rating?.ups ?? 0} from={0} ms={900} /></div><div className="l">{t('Fortschritte', 'Progress')}</div></div>
          </div>
        </div>

        {highlights.length > 0 && (
          <div className="card" style={{ marginTop: 10, padding: '6px 14px' }}>
            {highlights.slice(0, 5).map(({ e, r }) => (
              <div key={e.exerciseId} className="pr-row" style={{ alignItems: 'center' }}>
                <span>{exerciseById.get(e.exerciseId)?.name ?? e.exerciseId}</span>
                <ProgressBadges ups={r!.ups} prs={r!.prs} />
              </div>
            ))}
          </div>
        )}
        {!highlights.length && (
          <p className="faint" style={{ textAlign: 'center', fontSize: 13, marginTop: 12 }}>{t('Heute keine neuen Bestwerte – Konstanz zählt genauso. 💪', 'No new bests today – consistency counts just as much. 💪')}</p>
        )}

        <button className="btn btn-chrome btn-block" style={{ marginTop: 18 }} onClick={onClose}>{t('Fertig', 'Done')}</button>
      </div>
    </div>,
    document.body,
  )
}
