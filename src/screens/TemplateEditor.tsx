import { t as tr } from '../i18n'
import { useRef, useState } from 'react'
import { requireTemplateSlot } from '../components/AiCredit'
import { Icon } from '../components/ui'
import { shareOrDownload, templatesFile } from '../files'
import { haptic, uid } from '../lib'
import { muscleLabel } from '../muscles'
import { useStore } from '../store'
import type { Template } from '../types'
import { ExercisePicker, toggleLink } from './Workout'

export function TemplateEditor({ template, onClose }: { template: Template | null; onClose: () => void }) {
  const store = useStore()
  const [t, setT] = useState<Template>(template ?? { id: 'tpl-' + uid(), name: '', exercises: [] })
  const [picker, setPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isNew = !template

  const setEx = (exercises: Template['exercises']) => setT({ ...t, exercises })

  // drag & drop: hold the grip on the left and pull the exercise up or down;
  // the others make room live, letting go drops it there
  const rows = useRef<(HTMLDivElement | null)[]>([])
  const [drag, setDrag] = useState<{ from: number; y0: number; dy: number; tops: number[]; h: number } | null>(null)
  const target = (() => {
    if (!drag) return -1
    const mid = drag.tops[drag.from] + drag.dy + drag.h / 2
    let to = 0
    drag.tops.forEach((top, i) => { if (mid > top + (rows.current[i]?.offsetHeight ?? drag.h) / 2) to = i })
    if (mid < drag.tops[0]) to = 0
    return to
  })()
  const startDrag = (i: number, e: React.PointerEvent) => {
    e.preventDefault()
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
    const tops = rows.current.map((r) => r?.getBoundingClientRect().top ?? 0)
    setDrag({ from: i, y0: e.clientY, dy: 0, tops, h: rows.current[i]?.getBoundingClientRect().height ?? 60 })
    haptic()
  }
  const moveDrag = (e: React.PointerEvent) => {
    if (!drag) return
    const dy = e.clientY - drag.y0
    const before = target
    setDrag({ ...drag, dy })
    if (before !== -1 && before !== target) haptic()
  }
  const endDrag = () => {
    if (!drag) return
    const to = target
    if (to !== drag.from && to >= 0) {
      const next = [...t.exercises]
      const [item] = next.splice(drag.from, 1)
      next.splice(to, 0, item)
      setEx(next)
      haptic()
    }
    setDrag(null)
  }
  // where a row is drawn while another one is dragged
  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0
    const to = target
    if (drag.from < to && i > drag.from && i <= to) return -drag.h
    if (drag.from > to && i < drag.from && i >= to) return drag.h
    return 0
  }
  const canSave = t.name.trim() && t.exercises.length > 0

  return (
    <div className="screen no-tabs">
      <div className="wo-head">
        <button className="icon-btn" onClick={onClose} aria-label={tr('Zurück', 'Back')}><Icon.back /></button>
        <div className="grow"><div className="name">{isNew ? tr('Neues Template', 'New template') : tr('Template bearbeiten', 'Edit template')}</div></div>
        <button className="btn btn-chrome btn-sm" disabled={!canSave} style={{ opacity: canSave ? 1 : 0.4 }}
          onClick={() => {
            // a new template on Free counts against the limit of 3
            if (isNew && !store.templates.some((x) => x.id === t.id) && !requireTemplateSlot(store.templates.length)) return
            store.saveTemplate({ ...t, name: t.name.trim() })
            onClose()
          }}>
          {tr('Speichern', 'Save')}
        </button>
      </div>

      <label className="lbl" style={{ marginTop: 20 }}>Name</label>
      <input className="input" placeholder={tr('z. B. Day 4 Lower', 'e.g. Day 4 Lower')} value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} autoFocus={isNew} />

      <div className="section-title"><h2>{tr('Übungen', 'Exercises')}</h2><span className="faint" style={{ fontSize: 13 }}>{t.exercises.reduce((n, e) => n + e.sets, 0)} {tr('Sätze', 'sets')}</span></div>
      {t.exercises.map((e, i) => {
        const ex = store.exerciseById.get(e.exerciseId)
        const linked = !!e.group && e.group === t.exercises[i + 1]?.group
        const last = i === t.exercises.length - 1
        const dragging = drag?.from === i
        return (
          <div
            key={e.exerciseId + '-' + i} ref={(el) => { rows.current[i] = el }}
            className={'tpl-row' + (dragging ? ' dragging' : '') + (drag && !dragging ? ' shifting' : '')}
            style={{ transform: `translateY(${dragging ? drag!.dy : shift(i)}px)` }}
          >
          <div className={'card tpl-edit' + (e.group && (linked || t.exercises[i - 1]?.group === e.group) ? ' tpl-ss' : '')}>
            <div
              className="grip" role="button" aria-label={tr('Ziehen zum Verschieben', 'Drag to reorder')}
              onPointerDown={(ev) => startDrag(i, ev)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
            </div>
            <div className="grow">
              <div style={{ fontWeight: 650 }}>{ex?.name ?? e.exerciseId}</div>
              <div className="faint" style={{ fontSize: 13 }}>{ex && muscleLabel(ex.muscle)}</div>
            </div>
            <div className="stepper">
              <button onClick={() => setEx(t.exercises.map((x, j) => (j === i ? { ...x, sets: Math.max(1, x.sets - 1) } : x)))}>−</button>
              <span className="num">{e.sets}</span>
              <button onClick={() => setEx(t.exercises.map((x, j) => (j === i ? { ...x, sets: Math.min(12, x.sets + 1) } : x)))}>+</button>
            </div>
            <button className="remove" onClick={() => setEx(t.exercises.filter((_, j) => j !== i))} aria-label={tr('Entfernen', 'Remove')}>×</button>
          </div>
          {!last && (
            <button className={'tpl-link' + (linked ? ' on' : '')} onClick={() => setEx(toggleLink(t.exercises, i))}>
              {linked ? tr('⛓ Supersatz', '⛓ Superset') : tr('+ koppeln', '+ link')}
            </button>
          )}
          </div>
        )
      })}
      <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => setPicker(true)}><Icon.plus /> {tr('Übung hinzufügen', 'Add exercise')}</button>

      {canSave && (
        <button className="btn btn-ghost btn-block" style={{ marginTop: 28 }}
          onClick={() => shareOrDownload(templatesFile([{ ...t, name: t.name.trim() }], store.exerciseById), t.name)}>
          {tr('Template exportieren / teilen', 'Export / share template')}
        </button>
      )}
      {!isNew && (
        <button className="btn btn-danger btn-block" style={{ marginTop: 12 }}
          onClick={() => (confirmDelete ? (store.deleteTemplate(t.id), onClose()) : setConfirmDelete(true))}>
          {confirmDelete ? tr('Wirklich löschen?', 'Really delete?') : tr('Template löschen', 'Delete template')}
        </button>
      )}

      {picker && (
        <ExercisePicker onClose={() => setPicker(false)} onPick={(id) => { setEx([...t.exercises, { exerciseId: id, sets: 2 }]); setPicker(false) }} />
      )}
    </div>
  )
}
