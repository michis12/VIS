import { t as tr } from '../i18n'
import { useState } from 'react'
import { Icon } from '../components/ui'
import { shareOrDownload, templatesFile } from '../files'
import { uid } from '../lib'
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
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= t.exercises.length) return
    const next = [...t.exercises]
    ;[next[i], next[j]] = [next[j], next[i]]
    setEx(next)
  }
  const canSave = t.name.trim() && t.exercises.length > 0

  return (
    <div className="screen no-tabs">
      <div className="wo-head">
        <button className="icon-btn" onClick={onClose} aria-label={tr('Zurück', 'Back')}><Icon.back /></button>
        <div className="grow"><div className="name">{isNew ? tr('Neues Template', 'New template') : tr('Template bearbeiten', 'Edit template')}</div></div>
        <button className="btn btn-chrome btn-sm" disabled={!canSave} style={{ opacity: canSave ? 1 : 0.4 }}
          onClick={() => { store.saveTemplate({ ...t, name: t.name.trim() }); onClose() }}>
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
        return (
          <div key={i}>
          <div className={'card tpl-edit' + (e.group && (linked || t.exercises[i - 1]?.group === e.group) ? ' tpl-ss' : '')}>
            <div className="reorder">
              <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={tr('Nach oben', 'Move up')}>▲</button>
              <button onClick={() => move(i, 1)} disabled={i === t.exercises.length - 1} aria-label={tr('Nach unten', 'Move down')}>▼</button>
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
