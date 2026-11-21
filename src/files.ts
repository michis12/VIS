import { localIso, uid } from './lib'
import type { Exercise, Template } from './types'

/** Opens the iOS share sheet with a file, or downloads it where sharing files is not supported. */
export async function shareOrDownload(file: File, title?: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // fall through to download
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  return 'downloaded'
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

// ---------- templates ----------

interface TemplateFile {
  app: 'vis'
  kind: 'templates'
  version: 1
  exportedAt: string
  templates: Template[]
  exercises: Exercise[]
}

export function templatesFile(templates: Template[], exerciseById: Map<string, Exercise>): File {
  const ids = new Set(templates.flatMap((t) => t.exercises.map((e) => e.exerciseId)))
  const data: TemplateFile = {
    app: 'vis', kind: 'templates', version: 1, exportedAt: localIso(),
    templates, exercises: [...ids].map((id) => exerciseById.get(id)).filter((e): e is Exercise => !!e),
  }
  const name = templates.length === 1 ? templates[0].name : 'Templates'
  const safe = name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'Templates'
  return new File([JSON.stringify(data, null, 2)], `VIS-${safe}.json`, { type: 'application/json' })
}

/**
 * Parses an exported template file. Exercises are matched by id, then by name;
 * unknown ones are returned to be created. Imported templates get fresh ids so
 * nothing existing is overwritten.
 */
export async function parseTemplatesFile(file: File, existing: Exercise[]) {
  let data: TemplateFile
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('Datei ist kein gültiges JSON')
  }
  if (data?.app !== 'vis' || data.kind !== 'templates' || !Array.isArray(data.templates)) {
    throw new Error('Keine VIS-Template-Datei')
  }
  const byId = new Map(existing.map((e) => [e.id, e]))
  const byName = new Map(existing.map((e) => [e.name.toLowerCase(), e]))
  const newExercises: Exercise[] = []
  const remap = new Map<string, string>()
  for (const ex of data.exercises ?? []) {
    const hit = byId.get(ex.id) ?? byName.get(ex.name.toLowerCase())
    if (hit) remap.set(ex.id, hit.id)
    else { newExercises.push(ex); remap.set(ex.id, ex.id) }
  }
  const templates: Template[] = data.templates.map((t) => ({
    id: 'tpl-' + uid(),
    name: t.name,
    exercises: t.exercises
      .map((e) => ({ exerciseId: remap.get(e.exerciseId) ?? e.exerciseId, sets: Math.max(1, Math.min(12, Number(e.sets) || 1)) }))
      .filter((e) => byId.has(e.exerciseId) || newExercises.some((n) => n.id === e.exerciseId)),
  })).filter((t) => t.name && t.exercises.length)
  return { templates, newExercises }
}
