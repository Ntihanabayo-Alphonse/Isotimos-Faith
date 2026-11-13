import { createContext, useContext, useEffect, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { Session } from '@supabase/supabase-js'
import { authRedirectError, supabase } from '../../lib/supabase'

export type AppRole = 'member' | 'moderator' | 'admin'
type AuthState = {
  session: Session | null
  loading: boolean
  authError: string
  role: AppRole | null
  roleLoading: boolean
  roleError: boolean
}
const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [authError, setAuthError] = useState(authRedirectError ? 'This verification link is invalid or has expired. Request a new confirmation email.' : '')
  const [access, setAccess] = useState<{ token: string; role: AppRole | null; error: boolean } | null>(null)

  useEffect(() => {
    if (!supabase) return
    let active = true
    // INITIAL_SESSION and subsequent auth events share one source of truth.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return
      setSession(next)
      setLoading(false)
      if (next) setAuthError('')
    })
    // Report initialization/storage/confirmation errors without racing newer auth events.
    void supabase.auth.getSession().then(({ error }) => {
      if (active && error) {
        setAuthError('Your session could not be restored. Please sign in again or request a new verification link.')
        setLoading(false)
      }
    }, () => {
      if (active) { setAuthError('Unable to restore your session. Please sign in again.'); setLoading(false) }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    let active = true
    if (!session || !supabase) return
    const token = session.access_token
    void supabase.rpc('current_app_role').then(({ data, error }) => {
      if (!active) return
      const validRole = data === 'member' || data === 'moderator' || data === 'admin'
      setAccess({ token, role: validRole && !error ? data : null, error: Boolean(error) || !validRole })
    }, () => {
      if (active) setAccess({ token, role: null, error: true })
    })
    return () => { active = false }
  }, [session])

  const currentAccess = session && access?.token === session.access_token ? access : null
  return (
    <AuthContext.Provider value={{ session, loading, authError, role: currentAccess?.role ?? null,
      roleLoading: Boolean(session) && !currentAccess, roleError: currentAccess?.error ?? false }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth requires AuthProvider')
  return context
}
