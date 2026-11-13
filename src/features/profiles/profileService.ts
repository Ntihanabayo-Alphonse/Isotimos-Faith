import { supabase } from '../../lib/supabase'

export type Profile = {
  id: string
  username: string | null
  display_name: string
  bio: string
  avatar_url: string | null
  cover_url?: string | null
  created_at: string
  updated_at: string
}
export type ProfileInput = Pick<Profile, 'username' | 'display_name' | 'bio' | 'avatar_url' | 'cover_url'>
export const profileColumns = 'id,username,display_name,bio,avatar_url,cover_url,created_at,updated_at'
export const normalizeUsername = (value: string) => value.trim().toLowerCase()
export const validUsername = (value: string) => /^[a-z][a-z0-9_]{2,29}$/.test(value)

export function profileErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  if (code === '23505') return 'That username has just been taken. Please choose another one.'
  if (code === '23514' || code === '22001') return 'Check the username, display name, bio length, and HTTPS avatar URL.'
  if (code === '42501') return 'You do not have permission to change this profile. Verify your email and sign in again.'
  if (code === '42703') return 'Profile media fields are unavailable. Ask the administrator to review 202611130004_member_directory_and_follows.sql.'
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)) return 'Profile setup is unavailable. The database migration may not have been applied. Ask the project administrator to review 202611130003_profiles_recovery.sql, then retry profile setup.'
  return 'Your profile could not be loaded or saved. Check your connection and try again.'
}

export async function ensureMyProfile(): Promise<Profile> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('ensure_my_profile')
  if (error) throw error
  // PostgREST may represent a composite return type as a one-row result set.
  // Accept exactly one row, never silently select the first of multiple profiles.
  const profile = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data
  if (!profile?.id) throw new Error('No profile returned')
  return profile as Profile
}

export async function usernameAvailable(username: string, ownId: string): Promise<boolean> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle()
  if (error) throw error
  return !data || data.id === ownId
}

export async function saveMyProfile(id: string, input: ProfileInput): Promise<Profile> {
  if (!supabase) throw new Error('Supabase is not configured')
  // Explicit allowlist: never forward arbitrary form fields or user IDs in payloads.
  const { data, error } = await supabase.from('profiles').update({
    username: normalizeUsername(input.username ?? ''), display_name: input.display_name.trim(),
    bio: input.bio.trim(), avatar_url: input.avatar_url?.trim() || null,
    ...(input.cover_url !== undefined ? { cover_url: input.cover_url?.trim() || null } : {}),
  }).eq('id', id).select(profileColumns).single()
  if (error) throw error
  return data as Profile
}
