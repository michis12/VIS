import { useRef, useState } from 'react'
import { t } from '../i18n'
import { haptic } from '../lib'
import { useStore } from '../store'
import { orderedTemplates, smartOrder } from '../templateOrder'
import { Sheet } from './ui'

/**
 * Order of the templates (the rhythm): drag them into place, or let VIS sort
 * them from the history / by muscle groups. Saved in settings.templateOrder.
 */
export function TemplateOrder({ onClose }: { onClose: () => void }) {
  const store = useStore()
  const [ids, setIds] = useState(() => orderedTemplates(store.templates, store.settings.templateOrder).map((x) => x.id))
  const [why, setWhy] = useState('')
  const byId = new Map(store.templates.map((x) => [x.id, x]))

  const rows = useRef<(HTMLDivElement | null)[]>([])
  const [drag, setDrag] = useState<{ from: number; y0: number; dy: number; tops: number[]; h: number } | null>(null)
  const target = (() => {
    if (!drag) return -1
    const mid = drag.tops[drag.from] + drag.dy + drag.h / 2
    let to = 0
    drag.tops.forEach((top, i) => { if (mid > top + (rows.current[i]?.offsetHeight ?? drag.h) / 2) to = i })
    return to
  })()
  const startDrag = (i: number, e: React.PointerEvent) => {
    e.preventDefault()
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
    const tops = rows.current.map((r) => r?.getBoundingClientRect().top ?? 0)
    setDrag({ from: i, y0: e.clientY, dy: 0, tops, h: rows.current[i]?.getBoundingClientRect().height ?? 56 })
    haptic()
  }
  const moveDrag = (e: React.PointerEvent) => {
    if (!drag) return
    const before = target
    setDrag({ ...drag, dy: e.clientY - drag.y0 })
    if (before !== -1 && before !== target) haptic()
  }
  const endDrag = () => {
    if (!drag) return
    const to = target
    if (to !== drag.from && to >= 0) {
      const next = [...ids]
      const [item] = next.splice(drag.from, 1)
      next.splice(to, 0, item)
      setIds(next)
      setWhy('')
    }
    setDrag(null)
  }
  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0
    const to = target
    if (drag.from < to && i > drag.from && i <= to) return -drag.h
    if (drag.from > to && i < drag.from && i >= to) return drag.h
    return 0
  }

  const smart = () => {
    const r = smartOrder(orderedTemplates(store.templates, ids), store.workouts, store.exerciseById)
    setIds(r.ids)
    setWhy(r.why)
    haptic(true)
  }
  const save = () => {
    store.saveSettings({ ...store.settings, templateOrder: ids })
    haptic(true)
    onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <h3>{t('Reihenfolge', 'Order')}</h3>
      <p className="muted" style={{ marginBottom: 12, fontSize: 14 }}>
        {t('In dieser Reihenfolge laufen deine Vorlagen. Auf der Trainingsseite steht immer nur die nächste, nach der letzten kommt wieder die erste.',
          'Your templates run in this order. The training page shows only the next one; after the last comes the first again.')}
      </p>
      <button className="btn btn-ghost btn-block" style={{ marginBottom: 12 }} onClick={smart}>
        <span aria-hidden="true">✦</span> {t('Schlau sortieren', 'Sort smartly')}
      </button>
      {why && <div className="hint" style={{ marginBottom: 12 }}><span>{why}</span></div>}
      <div className="tpl-order">
        {ids.map((id, i) => {
          const tp = byId.get(id)
          if (!tp) return null
          const dragging = drag?.from === i
          return (
            <div
              key={id} ref={(el) => { rows.current[i] = el }}
              className={'tpl-row' + (dragging ? ' dragging' : '') + (drag && !dragging ? ' shifting' : '')}
              style={{ transform: `translateY(${dragging ? drag!.dy : shift(i)}px)` }}
            >
              <div className="card tpl-order-row">
                <span className="tpl-order-n num">{i + 1}</span>
                <div className="grow">
                  <div style={{ fontWeight: 650 }}>{tp.name}</div>
                  <div className="faint" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[...new Set(tp.exercises.map((e) => store.exerciseById.get(e.exerciseId)?.muscle).filter(Boolean))].slice(0, 4).join(' · ')}
                  </div>
                </div>
                <div
                  className="grip" role="button" aria-label={t('Ziehen zum Verschieben', 'Drag to reorder')}
                  onPointerDown={(ev) => startDrag(i, ev)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <button className="btn btn-chrome btn-block" style={{ marginTop: 14 }} onClick={save}>{t('Speichern', 'Save')}</button>
    </Sheet>
  )
}
