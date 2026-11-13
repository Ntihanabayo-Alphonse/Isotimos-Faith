import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useProfile } from './ProfileProvider'
import { StatusScreen } from '../../components/ui/StatusScreen'
import { Button } from '../../components/ui/Button'
import { supabase } from '../../lib/supabase'

export function ProfileGate() {
  const { profile, loading, error, retry } = useProfile()
  const location = useLocation()
  const [signOutError, setSignOutError] = useState('')
  const [busy, setBusy] = useState(false)
  if (loading) return <StatusScreen title="Opening your profile" message="Preparing your secure member profile…" loading />
  if (error || !profile) return <main className="status-screen"><h1>Profile setup needs attention</h1><p role="alert">{error || 'Your profile could not be found. Please retry.'}</p><Button onClick={retry}>Retry profile setup</Button><Button variant="ghost" disabled={busy} onClick={async () => {
    setBusy(true); setSignOutError('')
    try { const result = await supabase?.auth.signOut(); if (result?.error) setSignOutError('Sign-out failed. Please try again.') }
    catch { setSignOutError('Unable to sign out. Check your connection and try again.') }
    finally { setBusy(false) }
  }}>Sign out</Button>{signOutError && <p role="alert">{signOutError}</p>}</main>
  if (!profile.username && location.pathname !== '/app/onboarding') return <Navigate to="/app/onboarding" replace />
  return <Outlet />
}
