import { t } from './i18n'
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { Snapshot } from './db'

/**
 * Cloud backup: every change uploads a full snapshot as a new row in `backups`
 * (the database keeps the latest 30 per user). Row level security limits every
 * user to their own rows, so the public publishable key is safe to ship.
 */
const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined

export const cloudConfigured = !!(URL && KEY)
export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'vis.auth' } })
  : null

export interface BackupMeta { id: number; created_at: string; workouts: number }

const LS = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string | null) => {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* ignore */ }
  },
}

/** Auto-upload starts only after the user decided what to do with existing cloud data. */
export const cloudReady = () => LS.get('vis.cloudReady') === '1'
export const setCloudReady = (v: boolean) => LS.set('vis.cloudReady', v ? '1' : null)
export const lastSync = () => LS.get('vis.lastSync')

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return `${s.length}:${h}`
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null
  return (await supabase.auth.getSession()).data.session
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase!.auth.signInWithPassword({ email, password })
  if (error) throw new Error(translate(error.message))
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase!.auth.signUp({
    email, password, options: { emailRedirectTo: location.origin + location.pathname },
  })
  if (error) throw new Error(translate(error.message))
  return { needsConfirm: !data.session }
}

export async function signOut() {
  await supabase?.auth.signOut()
  setCloudReady(false)
  LS.set('vis.lastHash', null)
}

export async function listBackups(): Promise<BackupMeta[]> {
  const { data, error } = await supabase!.from('backups').select('id, created_at, workouts').order('created_at', { ascending: false }).limit(30)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchBackup(id: number): Promise<Snapshot> {
  const { data, error } = await supabase!.from('backups').select('data').eq('id', id).single()
  if (error) throw new Error(error.message)
  return data.data as Snapshot
}

/** Uploads unless identical to the last upload. Returns true if a row was written. */
export async function upload(snap: Snapshot, force = false): Promise<boolean> {
  if (!supabase) return false
  const session = await getSession()
  if (!session) return false
  const json = JSON.stringify(snap)
  const h = hash(json)
  if (!force && LS.get('vis.lastHash') === h) return false
  const workouts = snap.workouts.filter((w) => w.status === 'done').length
  const { error } = await supabase.from('backups').insert({ data: snap, workouts })
  if (error) throw new Error(error.message)
  LS.set('vis.lastHash', h)
  LS.set('vis.lastSync', new Date().toISOString())
  return true
}

function translate(msg: string) {
  if (/invalid login credentials/i.test(msg)) return t('E-Mail oder Passwort falsch', 'Wrong email or password')
  if (/email not confirmed/i.test(msg)) return t('Bitte zuerst den Link in der Bestätigungs-Mail öffnen', 'Please open the link in the confirmation email first')
  if (/already registered/i.test(msg)) return t('Diese E-Mail ist schon registriert – bitte anmelden', 'This email is already registered – please sign in')
  if (/password/i.test(msg) && /6/.test(msg)) return t('Passwort braucht mindestens 6 Zeichen', 'Password needs at least 6 characters')
  return msg
}
