import { useMemo, useRef, useState } from 'react'
import { MuscleIcon } from '../components/MuscleMap'
import { Icon, Sheet } from '../components/ui'
import { t } from '../i18n'
import { haptic, isRealSet, uid } from '../lib'
import { muscleLabel, musclesFor } from '../muscles'
import { useNav } from '../nav'
import { useStore } from '../store'

const GROUPS = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Beine', 'Waden', 'Bauch', 'Nacken', 'Unterarme', 'Sonstige']

/**
 * All exercises: search, filter by muscle group, A–Z or most trained, an A–Z
 * index on the right. Each row shows a small anatomy icon with the worked
 * muscles lit up. Tapping opens the exercise's full history.
 */
export function ExerciseLibrary() {
  const nav = useNav()
  const store = useStore()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const [sort, setSort] = useState<'az' | 'used'>('az')
  const [creating, setCreating] = useState(false)
  const anchors = useRef<Record<string, HTMLDivElement | null>>({})

  // sets per exercise over the whole history
  const used = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of store.workouts) if (w.status === 'done') for (const e of w.exercises) m.set(e.exerciseId, (m.get(e.exerciseId) ?? 0) + e.sets.filter(isRealSet).length)
    return m
  }, [store.workouts])

  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const hit = (s: string) => words.every((w) => s.toLowerCase().includes(w))
    const out = store.exercises.filter((e) => (!group || e.muscle === group) && (!words.length || hit(e.name + ' ' + muscleLabel(e.muscle))))
    return sort === 'used'
      ? out.sort((a, b) => (used.get(b.id) ?? 0) - (used.get(a.id) ?? 0) || a.name.localeCompare(b.name))
      : out.sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }, [store.exercises, q, group, sort, used])

  const letter = (name: string) => { const c = name.trim()[0]?.toUpperCase() ?? '#'; return /[A-ZÄÖÜ]/.test(c) ? c.replace('Ä', 'A').replace('Ö', 'O').replace('Ü', 'U') : '#' }
  const letters = useMemo(() => (sort === 'az' ? [...new Set(list.map((e) => letter(e.name)))] : []), [list, sort])
  const groups = GROUPS.filter((g) => store.exercises.some((e) => e.muscle === g))

  const jump = (l: string) => { haptic(); anchors.current[l]?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }

  return (
    <div className="screen no-tabs">
      <div className="wo-head">
        <button className="icon-btn" onClick={nav.pop} aria-label={t('Zurück', 'Back')}><Icon.back /></button>
        <div className="grow"><div className="name">{t('Übungen', 'Exercises')}</div><div className="faint" style={{ fontSize: 12 }}>{list.length} {t('von', 'of')} {store.exercises.length}</div></div>
        <button className="btn btn-ghost btn-sm" onClick={() => setCreating(true)}><Icon.plus /> {t('Neu', 'New')}</button>
      </div>

      <div className="exl-tools">
        <input className="input" placeholder={t('Suchen', 'Search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips" style={{ marginTop: 10 }}>
          <button className={'chip' + (!group ? ' on' : '')} onClick={() => setGroup(null)}>{t('Alle', 'All')}</button>
          {groups.map((g) => <button key={g} className={'chip' + (group === g ? ' on' : '')} onClick={() => setGroup(group === g ? null : g)}>{muscleLabel(g)}</button>)}
        </div>
        <div className="segmented" style={{ marginTop: 10 }}>
          <button className={sort === 'az' ? 'on' : ''} onClick={() => setSort('az')}>A–Z</button>
          <button className={sort === 'used' ? 'on' : ''} onClick={() => setSort('used')}>{t('Meist trainiert', 'Most trained')}</button>
        </div>
      </div>

      <div className="exl-list">
        {list.map((e, i) => {
          const l = letter(e.name)
          const head = sort === 'az' && (i === 0 || letter(list[i - 1].name) !== l)
          const n = used.get(e.id) ?? 0
          return (
            <div key={e.id}>
              {head && <div className="exl-letter" ref={(el) => { anchors.current[l] = el }}>{l}</div>}
              <button className="exl-row" onClick={() => nav.push({ kind: 'exercise', id: e.id })}>
                <MuscleIcon primary={e.muscle} secondary={musclesFor(e).secondary} name={e.name} />
                <div className="grow">
                  <div className="exl-name">{e.name}</div>
                  <div className="faint" style={{ fontSize: 12.5 }}>{muscleLabel(e.muscle)}{n ? ` · ${n} ${t('Sätze', 'sets')}` : ''}</div>
                </div>
                <span className="chev"><Icon.chevron /></span>
              </button>
            </div>
          )
        })}
        {!list.length && <div className="faint" style={{ padding: '24px 4px', textAlign: 'center' }}>{t('Keine Übung gefunden.', 'No exercise found.')}</div>}
      </div>

      {letters.length > 4 && (
        <div className="exl-index" aria-label={t('Alphabet', 'Alphabet')}>
          {letters.map((l) => <button key={l} onClick={() => jump(l)}>{l}</button>)}
        </div>
      )}

      {creating && <NewExercise initial={q} onClose={() => setCreating(false)} />}
    </div>
  )
}

function NewExercise({ initial, onClose }: { initial: string; onClose: () => void }) {
  const store = useStore()
  const [name, setName] = useState(initial)
  const [muscle, setMuscle] = useState('Brust')
  const ok = name.trim().length > 1 && !store.exercises.some((e) => e.name.toLowerCase() === name.trim().toLowerCase())
  const save = () => {
    const n = name.trim()
    store.saveExercise({ id: n.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + uid().slice(0, 4), name: n, muscle })
    haptic(true)
    onClose()
  }
  return (
    <Sheet onClose={onClose}>
      <h3>{t('Neue Übung', 'New exercise')}</h3>
      <input className="input" style={{ marginTop: 12 }} placeholder={t('z. B. Cable Row (Single Arm)', 'e.g. Cable Row (Single Arm)')} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <label className="lbl">{t('Muskelgruppe', 'Muscle group')}</label>
      <div className="chips" style={{ flexWrap: 'wrap', overflow: 'visible', margin: 0, padding: 0 }}>
        {GROUPS.map((g) => <button key={g} className={'chip' + (muscle === g ? ' on' : '')} onClick={() => setMuscle(g)}>{muscleLabel(g)}</button>)}
      </div>
      <button className="btn btn-chrome btn-block" style={{ marginTop: 16 }} disabled={!ok} onClick={save}>{t('Anlegen', 'Create')}</button>
    </Sheet>
  )
}
