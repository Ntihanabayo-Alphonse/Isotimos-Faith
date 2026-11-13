import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { MailCheck } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { authErrorMessage } from './authErrors'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { StatusScreen } from '../../components/ui/StatusScreen'

export function VerificationPage({ callback = false }: { callback?: boolean }) {
  const { session, loading, authError } = useAuth()
  const location = useLocation()
  const state = location.state as { email?: string; sent?: boolean } | null
  const [email, setEmail] = useState(state?.email || session?.user.email || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(state?.sent ? 'If registration can proceed, a confirmation email is on its way. Check your inbox and spam folder.' : '')
  const [nextSendAt, setNextSendAt] = useState(state?.sent ? Date.now() + 60_000 : 0)
  if (loading) return <StatusScreen title="Checking your email verification" message="Restoring your session…" loading />
  if (session?.user.email_confirmed_at) return <Navigate to="/app" replace />

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    if (Date.now() < nextSendAt) { setError('Please wait one minute before requesting another email.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
      if (error) setError(authErrorMessage(error))
      else { setNotice('If this email has an account awaiting confirmation, a new link is on its way.'); setNextSendAt(Date.now() + 60_000) }
    } catch (error) { setError(authErrorMessage(error)) }
    finally { setBusy(false) }
  }

  async function leaveSession() {
    setBusy(true); setError('')
    try { const result = await supabase?.auth.signOut(); if (result?.error) setError(authErrorMessage(result.error)) }
    catch (error) { setError(authErrorMessage(error)) }
    finally { setBusy(false) }
  }

  return <main className="verification-page"><Card className="verification-card auth-form-wrap">
    <span className="placeholder-icon"><MailCheck size={30} /></span><span className="eyebrow text-primary">ONE MORE STEP</span>
    <h1>Check your inbox.</h1><p>Follow the confirmation link to verify your email. Once verified, you can choose your username and finish your member profile.</p>
    {callback && !authError && <p className="notice">No verified session was found. This link may have expired or already been used. Try signing in or request a fresh link.</p>}
    {(error || authError) && <p className="form-error" role="alert">{error || authError}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    <form onSubmit={resend}><label>Email address<input name="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required disabled={!supabase || busy} /></label><Button type="submit" disabled={!supabase || busy}>{busy ? 'Please wait…' : 'Resend confirmation email'}</Button></form>
    <p className="auth-switch"><Link to="/login">Return to sign in</Link></p>
    {session && <Button variant="ghost" onClick={leaveSession} disabled={busy}>Sign out of this account</Button>}
  </Card></main>
}
