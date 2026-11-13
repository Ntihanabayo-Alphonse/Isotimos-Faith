import { supabase } from '../../lib/supabase'

export type Member = {
  id: string; username: string; display_name: string; bio: string
  avatar_url: string | null; cover_url: string | null; created_at: string
  follower_count: number; following_count: number; is_following: boolean
}
export type PeopleFilter = 'suggested' | 'popular' | 'new' | 'following'
export const PAGE_SIZE = 24
export const memberColumns = 'id,username,display_name,bio,avatar_url,cover_url,created_at,follower_count,following_count,is_following'

export function peopleErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (['42P01', '42703', 'PGRST202', 'PGRST205'].includes(code)) return 'Member discovery is not configured yet. Ask the administrator to review migration 202611130004_member_directory_and_follows.sql.'
  if (code === '42501') return 'This action requires a verified account and a completed member profile. Please sign in again.'
  return 'We could not reach the member directory. Please try again.'
}

export async function discoverPeople(query: string, filter: PeopleFilter, offset = 0): Promise<Member[]> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('discover_people', {
    p_query: query.trim().slice(0, 80), p_filter: filter, p_limit: PAGE_SIZE, p_offset: offset,
  })
  if (error) throw error
  return data ?? []
}

export async function getMember(username: string): Promise<Member | null> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('member_directory').select(memberColumns)
    .eq('username', username.toLowerCase()).maybeSingle()
  if (error) throw error
  return data as Member | null
}

export async function setFollowing(followerId: string, followingId: string, follow: boolean) {
  if (!supabase) throw new Error('Supabase is not configured')
  if (followerId === followingId) throw new Error('You cannot follow yourself')
  const result = follow
    ? await supabase.from('follows').insert({ follower_id: followerId, following_id: followingId })
    : await supabase.from('follows').delete().eq('follower_id', followerId).eq('following_id', followingId)
  // A duplicate follow is already the requested state; no counters are written.
  if (result.error && !(follow && result.error.code === '23505')) throw result.error
}
