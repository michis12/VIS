import { getSession, supabase } from './cloud'

/**
 * Friends (migration 0014): a profile is a chosen name and a 6-letter code.
 * Requests go by code; accepted friends see each other's small summary
 * (friend_stats), never an e-mail address or the actual data.
 */
export interface FriendStats {
  name: string
  weekScore: number
  weekWorkouts: number
  totalWorkouts: number
  streakWeeks: number
  rank: string
  stars: number
  achievements: number
  volumeWeek: number
  lifts: { bench?: number; squat?: number; deadlift?: number }
  lastWorkout?: string
}
export interface Friend { userId: string; name: string; since: string; stats: FriendStats | null; updatedAt: string | null }
export interface Request { id: number; userId: string; name: string; incoming: boolean; at: string }
export interface FriendsData { me: { name: string; code: string } | null; friends: Friend[]; requests: Request[] }

const sb = () => supabase!

export async function signedIn() { return !!supabase && !!(await getSession()) }

export async function loadFriends(): Promise<FriendsData> {
  const s = await getSession()
  if (!supabase || !s) return { me: null, friends: [], requests: [] }
  const me = s.user.id
  const [p, f] = await Promise.all([
    sb().from('friend_profiles').select('user_id, name, code'),
    sb().from('friendships').select('id, requester, addressee, status, created_at'),
  ])
  if (p.error) throw new Error(p.error.message)
  if (f.error) throw new Error(f.error.message)
  const profiles = new Map((p.data ?? []).map((x) => [x.user_id as string, x as { user_id: string; name: string; code: string }]))
  const mine = profiles.get(me)
  const rows = (f.data ?? []) as { id: number; requester: string; addressee: string; status: string; created_at: string }[]
  const friendIds = rows.filter((r) => r.status === 'accepted').map((r) => (r.requester === me ? r.addressee : r.requester))
  const st = friendIds.length ? await sb().from('friend_stats').select('user_id, stats, updated_at').in('user_id', friendIds) : { data: [], error: null }
  const stats = new Map(((st.data ?? []) as { user_id: string; stats: FriendStats; updated_at: string }[]).map((x) => [x.user_id, x]))
  return {
    me: mine ? { name: mine.name, code: mine.code } : null,
    friends: rows.filter((r) => r.status === 'accepted').map((r) => {
      const id = r.requester === me ? r.addressee : r.requester
      return { userId: id, name: profiles.get(id)?.name ?? '?', since: r.created_at, stats: stats.get(id)?.stats ?? null, updatedAt: stats.get(id)?.updated_at ?? null }
    }).sort((a, b) => (b.stats?.weekScore ?? -1) - (a.stats?.weekScore ?? -1)),
    requests: rows.filter((r) => r.status === 'pending').map((r) => {
      const incoming = r.addressee === me
      const id = incoming ? r.requester : r.addressee
      return { id: r.id, userId: id, name: profiles.get(id)?.name ?? '?', incoming, at: r.created_at }
    }),
  }
}

export async function saveProfile(name: string) {
  const { data, error } = await sb().rpc('friend_profile', { new_name: name.trim().slice(0, 40) })
  if (error) throw new Error(error.message)
  return ((data ?? []) as { name: string; code: string }[])[0]
}
export async function sendRequest(code: string): Promise<string> {
  const { data, error } = await sb().rpc('friend_request', { friend_code: code.replace(/[^a-z0-9]/gi, '').toUpperCase() })
  if (error) throw new Error(error.message)
  return String(data)
}
export async function respond(id: number, accept: boolean) {
  const { error } = await sb().rpc('friend_respond', { request_id: id, accept })
  if (error) throw new Error(error.message)
}
export async function removeFriend(userId: string) {
  const { error } = await sb().rpc('friend_remove', { other: userId })
  if (error) throw new Error(error.message)
}

/** Publishes the own summary for friends (only when something changed). */
export async function publishStats(stats: FriendStats) {
  const s = await getSession()
  if (!supabase || !s) return
  const json = JSON.stringify(stats)
  const key = 'vis.friendStats'
  try { if (localStorage.getItem(key) === json) return } catch { /* ignore */ }
  const { error } = await sb().from('friend_stats').upsert({ user_id: s.user.id, stats, updated_at: new Date().toISOString() })
  if (!error) try { localStorage.setItem(key, json) } catch { /* ignore */ }
}

/** Number of open incoming requests (badge on the friends button). */
export async function incomingCount(): Promise<number> {
  const s = await getSession()
  if (!supabase || !s) return 0
  const { count } = await sb().from('friendships').select('id', { count: 'exact', head: true }).eq('addressee', s.user.id).eq('status', 'pending')
  return count ?? 0
}
