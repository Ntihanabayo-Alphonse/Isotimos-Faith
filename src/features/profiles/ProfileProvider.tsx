import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ensureMyProfile, profileErrorMessage } from './profileService'
import type { Profile } from './profileService'

type ProfileState = {
  profile: Profile | null; loading: boolean; error: string
  retry: () => void; updateProfile: (profile: Profile) => void
}
const ProfileContext = createContext<ProfileState | undefined>(undefined)

export function ProfileProvider({ children }: PropsWithChildren) {
  const { session } = useAuth()
  const token = session?.access_token
  const verified = Boolean(session?.user.email_confirmed_at)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ token: string; profile: Profile | null; error: string } | null>(null)
  useEffect(() => {
    let active = true
    if (!token || !verified) return
    void ensureMyProfile().then(profile => {
      if (active) setState({ token, profile, error: '' })
    }, error => {
      if (active) setState({ token, profile: null, error: profileErrorMessage(error) })
    })
    return () => { active = false }
  }, [token, verified, attempt])
  const retry = useCallback(() => { setState(null); setAttempt(value => value + 1) }, [])
  const updateProfile = useCallback((profile: Profile) => {
    // Ignore a late save from a component belonging to a previous session.
    if (token && profile.id === session?.user.id) {
      setState(current => current?.token === token ? { token, profile, error: '' } : current)
    }
  }, [token, session?.user.id])
  const current = token && state?.token === token ? state : null
  return <ProfileContext.Provider value={{ profile: current?.profile ?? null,
    loading: Boolean(token && verified && !current), error: current?.error ?? '', retry, updateProfile }}>
    {children}
  </ProfileContext.Provider>
}

export function useProfile() {
  const value = useContext(ProfileContext)
  if (!value) throw new Error('useProfile requires ProfileProvider')
  return value
}
