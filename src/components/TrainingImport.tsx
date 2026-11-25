import { t } from '../i18n'
import { useMemo, useRef, useState } from 'react'
import { foodAi } from '../foodAi'
import { dateLabel, fmtInt, haptic, pad, uid } from '../lib'
import { useStore } from '../store'
import type { Exercise, Workout } from '../types'
import { CreditPill, useCredit } from './AiCredit'
import { AiWait, Sheet, Tap } from './ui'

/**
 * Training history from another app (Strong, Hevy, FitNotes, Excel as CSV) or
 * from free-text notes. The AI (Haiku) only works out which column is what and
 * which exercise is which; the rows themselves are read here, so even years of
 * history cost a fraction of a cent. Free text goes to the AI in parts.
 */

interface RawWorkout {
  date: string; time: string | null; name: string; durationSec: number | null
  exercises: { name: string; sets: { kg: number; reps: number }[] }[]
}
interface Cols {
  ok: boolean; headerRows: number; date: number; time: number; end: number; duration: number
  workout: number; exercise: number; weight: number; reps: number; setType: number
  unit: 'kg' | 'lbs'; unitCol: number; dateOrder: 'ymd' | 'dmy' | 'mdy'; comment: string
}
interface Match { name: string; ref: string; clean: string; muscle: string }

// ---- reading files

function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const rows: string[][] = []
  let row: string[] = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch
    } else if (ch === '"') q = true
    else if (ch === delim) { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur); rows.push(row); row = []; cur = ''
    } else cur += ch
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim()))
}

const MON: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, mär: 3, apr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dez: 12,
}

function parseWhen(v: string, order: Cols['dateOrder']): { date: string; time: string | null } | null {
  const s = v.trim()
  let y = 0, m = 0, d = 0, r: RegExpMatchArray | null
  if ((r = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) [y, m, d] = [+r[1], +r[2], +r[3]]
  else if ((r = s.match(/(\d{1,4})[./-](\d{1,2})[./-](\d{2,4})/))) {
    const [a, b, c] = [+r[1], +r[2], +r[3]]
    if (r[1].length === 4) [y, m, d] = [a, b, c]
    else if (order === 'mdy') [m, d, y] = [a, b, c]
    else [d, m, y] = [a, b, c]
  } else if ((r = s.match(/(\d{1,2})\.?\s+([a-zA-ZäÄ]{3,})\.?,?\s+(\d{4})/))) [d, m, y] = [+r[1], MON[r[2].slice(0, 3).toLowerCase()] ?? 0, +r[3]]
  else if ((r = s.match(/([a-zA-Z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/))) [m, d, y] = [MON[r[1].slice(0, 3).toLowerCase()] ?? 0, +r[2], +r[3]]
  if (y > 0 && y < 100) y += 2000
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null
  const t = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i)
  let time: string | null = null
  if (t) {
    let h = +t[1]
    const ap = t[3]?.toLowerCase()
    if (ap?.startsWith('p') && h < 12) h += 12
    if (ap?.startsWith('a') && h === 12) h = 0
    if (h < 24) time = `${pad(h)}:${t[2]}`
  }
  return { date: `${y}-${pad(m)}-${pad(d)}`, time }
}

const num = (v: string) => {
  const x = parseFloat(v.replace(',', '.').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(x) ? x : NaN
}

function parseDuration(v: string): number | null {
  const s = v.trim().toLowerCase()
  if (!s) return null
  const hm = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/)
  if (hm) return +hm[1] * 3600 + +hm[2] * 60 + (hm[3] ? +hm[3] : 0)
  let sec = 0, any = false
  for (const [re, k] of [[/(\d+)\s*h/, 3600], [/(\d+)\s*m(?!s)/, 60], [/(\d+)\s*s/, 1]] as const) {
    const r = s.match(re)
    if (r) { sec += +r[1] * k; any = true }
  }
  if (any) return sec || null
  const n = num(s)
  return n > 0 ? (n >= 300 ? Math.round(n) : Math.round(n * 60)) : null
}

/** one row per set -> workouts (warm-up sets and rows without reps are left out) */
function workoutsFromRows(rows: string[][], c: Cols): RawWorkout[] {
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
  const byKey = new Map<string, RawWorkout>()
  for (const r of rows.slice(Math.max(0, c.headerRows))) {
    const when = parseWhen(`${get(r, c.date)} ${get(r, c.time)}`, c.dateOrder)
    const exName = get(r, c.exercise)
    if (!when || !exName) continue
    const type = get(r, c.setType).toLowerCase()
    if (type.includes('warm') || type === 'w') continue
    const reps = Math.round(num(get(r, c.reps)))
    if (!(reps > 0)) continue
    let kg = num(get(r, c.weight))
    if (!(kg >= 0)) kg = 0
    if ((get(r, c.unitCol) || c.unit).toLowerCase().startsWith('lb')) kg = Math.round(kg * 0.45359237 * 4) / 4
    const wName = get(r, c.workout)
    const key = `${when.date}|${when.time ?? ''}|${wName}`
    let w = byKey.get(key)
    if (!w) {
      let dur = parseDuration(get(r, c.duration))
      if (dur == null && c.end >= 0 && when.time) {
        const end = parseWhen(get(r, c.end), c.dateOrder)
        if (end?.time) {
          const s = (new Date(`${end.date}T${end.time}`).getTime() - new Date(`${when.date}T${when.time}`).getTime()) / 1000
          if (s > 0 && s < 6 * 3600) dur = s
        }
      }
      w = { date: when.date, time: when.time, name: wName, durationSec: dur, exercises: [] }
      byKey.set(key, w)
    }
    let ex = w.exercises.find((e) => e.name === exName)
    if (!ex) { ex = { name: exName, sets: [] }; w.exercises.push(ex) }
    ex.sets.push({ kg, reps })
  }
  return [...byKey.values()]
}

/** free text in parts of at most ~7500 characters, cut at line breaks */
function chunks(text: string, max = 7500): string[] {
  const out: string[] = []
  let cur = ''
  for (const line of text.split(/\r?\n/)) {
    if (cur.length + line.length + 1 > max && cur) { out.push(cur); cur = '' }
    cur += (cur ? '\n' : '') + line.slice(0, max)
  }
  if (cur.trim()) out.push(cur)
  return out
}

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'uebung'

// ---- sheet

type Step = { kind: 'pick' } | { kind: 'busy'; text: string } | { kind: 'preview' } | { kind: 'done'; count: number }

export function TrainingImport({ onClose, toast }: { onClose: () => void; toast: (t: string) => void }) {
  const store = useStore()
  const { credit } = useCredit()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>({ kind: 'pick' })
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [raw, setRaw] = useState<RawWorkout[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [asNew, setAsNew] = useState<Set<string>>(new Set())
  const [comment, setComment] = useState('')
  const [showEx, setShowEx] = useState(false)

  const fail = (msg: string) => { setError(msg); setStep({ kind: 'pick' }) }

  /** exercise names -> VIS exercises, 150 names per request */
  const matchExercises = async (list: RawWorkout[]) => {
    const counts = new Map<string, number>()
    for (const w of list) for (const e of w.exercises) counts.set(e.name, (counts.get(e.name) ?? 0) + e.sets.length)
    const names = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    const catalog = store.exercises.map((e) => ({ id: e.id, name: e.name }))
    const out: Match[] = []
    for (let i = 0; i < names.length; i += 150) {
      setStep({ kind: 'busy', text: t(`Übungen zuordnen… (${Math.min(names.length, i + 150)} von ${names.length})`, `Matching exercises… (${Math.min(names.length, i + 150)} of ${names.length})`) })
      const res = await foodAi({ mode: 'import-ex', names: names.slice(i, i + 150), catalog })
      out.push(...((res.exercises ?? []) as Match[]))
    }
    // every name gets a match, even if the AI skipped one
    for (const n of names) if (!out.some((m) => m.name === n.name)) out.push({ name: n.name, ref: '', clean: n.name, muscle: 'Sonstige' })
    return out.filter((m) => counts.has(m.name))
  }

  const analyse = async (fileText: string | null) => {
    setError('')
    try {
      let list: RawWorkout[] = []
      let note = ''
      const rows = fileText ? parseCsv(fileText) : []
      const tabular = rows.length >= 3 && rows.slice(0, 10).every((r) => r.length >= 4)
      if (tabular) {
        setStep({ kind: 'busy', text: t('Datei wird gelesen…', 'Reading file…') })
        const cols = (await foodAi({ mode: 'import-cols', sample: rows.slice(0, 30) })) as Cols
        if (cols.ok && cols.exercise >= 0 && cols.reps >= 0 && cols.date >= 0) {
          list = workoutsFromRows(rows, cols)
          note = cols.comment
        }
      }
      if (!list.length) {
        const src = (fileText ?? text).trim()
        if (!src) return fail(t('Keine Trainings gefunden.', 'No workouts found.'))
        const parts = chunks(src)
        if (parts.length > 12) return fail(t('Der Text ist zu lang – bitte in mehreren Teilen importieren (je ca. 90.000 Zeichen).', 'The text is too long – please import it in several parts (about 90,000 characters each).'))
        for (let i = 0; i < parts.length; i++) {
          setStep({ kind: 'busy', text: parts.length > 1 ? t(`Notizen werden gelesen… (Teil ${i + 1} von ${parts.length})`, `Reading notes… (part ${i + 1} of ${parts.length})`) : t('Notizen werden gelesen…', 'Reading notes…') })
          const res = await foodAi({ mode: 'import-text', text: parts[i] })
          for (const w of (res.workouts ?? []) as { date: string; name: string; exercises: RawWorkout['exercises'] }[]) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date)) continue
            const exercises = w.exercises
              .map((e) => ({ name: e.name.trim(), sets: e.sets.filter((s) => s.reps > 0).map((s) => ({ kg: Math.max(0, s.kg), reps: Math.round(s.reps) })) }))
              .filter((e) => e.name && e.sets.length)
            if (exercises.length) list.push({ date: w.date, time: null, name: w.name, durationSec: null, exercises })
          }
          if (res.comment) note = res.comment
        }
      }
      if (!list.length) return fail(t('Keine Trainings mit Sätzen gefunden. Ist das ein Trainings-Export?', 'No workouts with sets found. Is this a workout export?'))
      list.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
      const m = await matchExercises(list)
      setRaw(list)
      setMatches(m)
      setAsNew(new Set())
      setComment(note)
      setStep({ kind: 'preview' })
    } catch (e) {
      fail((e as Error).message)
    }
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    if (/\.(xlsx?|numbers)$/i.test(f.name)) return fail('Excel-Dateien bitte zuerst als CSV speichern.')
    if (f.size > 15_000_000) return fail(t('Die Datei ist zu groß (max. 15 MB).', 'The file is too big (max. 15 MB).'))
    analyse(await f.text())
  }

  // what the import will do: exercise ids, new exercises, days that already have a workout
  const plan = useMemo(() => {
    const byName = new Map(store.exercises.map((e) => [e.name.toLowerCase(), e.id]))
    const ids = new Set(store.exercises.map((e) => e.id))
    const idFor = new Map<string, string>()
    const created: Exercise[] = []
    for (const m of matches) {
      const keep = m.ref && store.exerciseById.has(m.ref) && !asNew.has(m.name)
      if (keep) { idFor.set(m.name, m.ref); continue }
      const clean = (m.clean || m.name).trim()
      const known = byName.get(clean.toLowerCase())
      if (known && !asNew.has(m.name)) { idFor.set(m.name, known); continue }
      let id = slug(clean), n = 2
      while (ids.has(id)) id = `${slug(clean)}-${n++}`
      ids.add(id)
      byName.set(clean.toLowerCase(), id)
      created.push({ id, name: clean, muscle: m.muscle || 'Sonstige' })
      idFor.set(m.name, id)
    }
    const taken = new Set(store.workouts.map((w) => w.startedAt.slice(0, 10)))
    const fresh = raw.filter((w) => !taken.has(w.date))
    const sets = fresh.reduce((a, w) => a + w.exercises.reduce((b, e) => b + e.sets.length, 0), 0)
    return { idFor, created, fresh, skipped: raw.length - fresh.length, sets }
  }, [matches, asNew, raw, store.exercises, store.exerciseById, store.workouts])

  const save = () => {
    const muscleOf = new Map([...store.exercises, ...plan.created].map((e) => [e.id, e.muscle]))
    for (const e of plan.created) store.saveExercise(e)
    for (const w of plan.fresh) {
      const exercises = w.exercises.map((e) => ({
        exerciseId: plan.idFor.get(e.name)!,
        sets: e.sets.map((s) => ({ weight: s.kg, reps: s.reps, done: true })),
      }))
      let name = w.name.trim()
      if (!name) {
        // like the FitNotes import: name a workout after its main muscle groups
        const by = new Map<string, number>()
        for (const e of exercises) by.set(muscleOf.get(e.exerciseId) ?? 'Sonstige', (by.get(muscleOf.get(e.exerciseId) ?? 'Sonstige') ?? 0) + e.sets.length)
        name = [...by].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g).join(' · ') || 'Training'
      }
      const workout: Workout = {
        id: uid(), name, startedAt: `${w.date}T${w.time ?? '18:00'}:00`, durationSec: w.durationSec,
        status: 'done', source: 'import', exercises,
      }
      store.saveWorkout(workout)
    }
    haptic(true)
    toast(t(`${plan.fresh.length} Trainings importiert`, `${plan.fresh.length} workouts imported`))
    setStep({ kind: 'done', count: plan.fresh.length })
  }

  const first = plan.fresh[0]?.date, last = plan.fresh[plan.fresh.length - 1]?.date
  return (
    <Sheet onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>{t('Trainings importieren', 'Import workouts')}</h3>
        <CreditPill credit={credit} />
      </div>

      {step.kind === 'pick' && (
        <>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>
            {t('Export aus deiner alten App (Strong, Hevy, FitNotes, Excel als CSV) oder einfach deine Notizen. Die KI ordnet Übungen und Sätze zu, du siehst vorher alles.', 'An export from your old app (Strong, Hevy, FitNotes, Excel as CSV) or simply your notes. The AI matches exercises and sets, and you see everything first.')}
          </p>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
          <Tap className="btn btn-chrome btn-block" onClick={() => fileRef.current?.click()}>{t('Datei wählen', 'Choose file')}</Tap>
          <label className="lbl">{t('oder Notizen einfügen', 'or paste notes')}</label>
          <textarea
            className="input plan-text" rows={6} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={t('12.03. Push\nBankdrücken 80 kg 3×8\nSchrägbank KH 30 kg 10, 10, 8', '12/03 Push\nBench press 80 kg 3×8\nIncline DB press 30 kg 10, 10, 8')}
          />
          <Tap className="btn btn-ghost btn-block" style={{ marginTop: 10 }} disabled={!text.trim()} onClick={() => analyse(null)}>{t('Notizen auswerten', 'Analyse notes')}</Tap>
          {error && <div className="hint" style={{ color: 'var(--danger)' }}><span>{error}</span></div>}
        </>
      )}

      {step.kind === 'busy' && <AiWait text={step.text} rows={4} />}

      {step.kind === 'preview' && (
        <>
          <div className="card" style={{ marginTop: 4 }}>
            <div className="pr-row num"><span className="muted">{t('Trainings', 'Workouts')}</span><b>{fmtInt(plan.fresh.length)}</b></div>
            <div className="pr-row num"><span className="muted">{t('Sätze', 'Sets')}</span><b>{fmtInt(plan.sets)}</b></div>
            {first && <div className="pr-row num"><span className="muted">{t('Zeitraum', 'Period')}</span><b>{dateLabel(first)} – {dateLabel(last!)}</b></div>}
            <button className="pr-row" style={{ width: '100%' }} onClick={() => setShowEx((v) => !v)}>
              <span className="muted">{t('Übungen', 'Exercises')}</span>
              <b>{matches.length - plan.created.length} {t('zugeordnet', 'matched')} · {plan.created.length} {t('neu', 'new')} {showEx ? '▴' : '▾'}</b>
            </button>
          </div>
          {showEx && (
            <div className="card" style={{ marginTop: 8 }}>
              {matches.map((m) => {
                const id = plan.idFor.get(m.name)!
                const isNew = plan.created.some((e) => e.id === id)
                const target = isNew ? plan.created.find((e) => e.id === id)!.name : store.exerciseById.get(id)?.name
                const canToggle = !!m.ref && store.exerciseById.has(m.ref)
                return (
                  <button
                    key={m.name} className="pr-row" style={{ width: '100%', textAlign: 'left', gap: 10 }} disabled={!canToggle}
                    onClick={() => setAsNew((s) => { const n = new Set(s); if (n.has(m.name)) n.delete(m.name); else n.add(m.name); return n })}
                  >
                    <span className="muted" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                    <b style={{ textAlign: 'right' }}>{target}{isNew && <span className="faint" style={{ fontWeight: 500 }}> · {t('neu', 'new')}</span>}</b>
                  </button>
                )
              })}
              <div className="hint"><span>{t('Tippe auf eine Zuordnung, um die Übung stattdessen neu anzulegen (oder zurück).', 'Tap a match to create the exercise as new instead (or back).')}</span></div>
            </div>
          )}
          {plan.skipped > 0 && <div className="hint"><span>{t(`${plan.skipped} Tage übersprungen – da hast du schon ein Training eingetragen.`, `${plan.skipped} days skipped – you already logged a workout there.`)}</span></div>}
          {comment && <div className="hint"><span>{comment}</span></div>}
          <Tap className="btn btn-chrome btn-block" style={{ marginTop: 14 }} disabled={!plan.fresh.length} onClick={save}>
            {plan.fresh.length ? t(`${fmtInt(plan.fresh.length)} Trainings importieren`, `Import ${fmtInt(plan.fresh.length)} workouts`) : t('Nichts Neues zum Importieren', 'Nothing new to import')}
          </Tap>
          <Tap className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => setStep({ kind: 'pick' })}>{t('Andere Datei', 'Other file')}</Tap>
        </>
      )}

      {step.kind === 'done' && (
        <>
          <p className="muted" style={{ fontSize: 15 }}>{t(`${step.count} Trainings sind jetzt in deinem Verlauf und zählen für Fortschritt, Rekorde und Statistiken.`, `${step.count} workouts are now in your history and count for progress, records and stats.`)}</p>
          <Tap className="btn btn-chrome btn-block" onClick={onClose}>{t('Fertig', 'Done')}</Tap>
        </>
      )}
    </Sheet>
  )
}
