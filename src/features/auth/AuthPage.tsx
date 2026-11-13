import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { ArrowRight, BookOpen, Cross, Eye, EyeOff } from 'lucide-react'
import { supabase, supabaseConfigured } from '../../lib/supabase'
import { useAuth } from './AuthProvider'
import { Button } from '../../components/ui/Button'
import { StatusScreen } from '../../components/ui/StatusScreen'
import { authErrorMessage, safeDestination } from './authErrors'

export function AuthPage({ register = false }: { register?: boolean }) {
  const { session, loading, authError } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const destination = safeDestination((location.state as { from?: unknown } | null)?.from)
  if (loading) return <StatusScreen title="Opening your community" message="Checking your session…" loading />
  if (session) return <Navigate to={session.user.email_confirmed_at ? destination : '/auth/verify'} replace />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    const form = new FormData(event.currentTarget)
    setError('')
    if (register && form.get('password') !== form.get('confirmPassword')) {
      setError('Passwords do not match. Please enter them again.'); return
    }
    setBusy(true)
    try {
      const email = String(form.get('email')).trim()
      const password = String(form.get('password'))
      const result = register
        ? await supabase.auth.signUp({ email, password, options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { display_name: String(form.get('name')).trim() },
          } })
        : await supabase.auth.signInWithPassword({ email, password })
      if (result.error) setError(authErrorMessage(result.error))
      else if (register && !result.data.session) navigate('/auth/verify', { state: { email, sent: true } })
    } catch (error) { setError(authErrorMessage(error)) }
    finally { setBusy(false) }
  }

  return <main className="auth-page">
    <section className="auth-story">
      <Link to="/login" className="brand"><span className="brand-mark"><Cross size={25} /></span><span>isotimos<span className="brand-faith">faith</span></span></Link>
      <div className="auth-story-body"><span className="eyebrow">ROOTED IN CHRIST. CONNECTED IN FAITH.</span><h1>Life is better<br />in fellowship.</h1><p>A place to grow in faith, share encouragement, and walk alongside one another.</p><div className="auth-verse"><BookOpen size={25} /><blockquote>“Therefore encourage one another and build each other up.”<cite>1 Thessalonians 5:11</cite></blockquote></div></div>
      <span className="auth-footnote">One faith. Many stories. A shared journey.</span>
    </section>
    <section className="auth-form-panel"><div className="auth-form-wrap">
      <span className="eyebrow text-primary">YOUR FAITH COMMUNITY</span>
      <h2>{register ? 'Find your fellowship.' : 'Welcome back.'}</h2>
      <p>{register ? 'Create your account and begin your journey with us.' : 'A little encouragement is waiting for you.'}</p>
      {!supabaseConfigured && <div className="notice"><strong>Supabase setup required</strong><p>Sign-in becomes available when the project URL and public key are configured. No demo account or simulated session is enabled.</p><Link to="/preview">Explore the read-only application preview <ArrowRight size={15} /></Link></div>}
      <form onSubmit={submit}>
        {register && <label>Full name<input name="name" autoComplete="name" required maxLength={100} placeholder="Your name" disabled={!supabaseConfigured} /></label>}
        <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" disabled={!supabaseConfigured} /></label>
        <label>Password<span className="password-input"><input name="password" type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 8 : undefined} placeholder={register ? 'At least 8 characters' : 'Your password'} disabled={!supabaseConfigured} /><button type="button" className="icon-button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
        {register && <label>Confirm password<input name="confirmPassword" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={8} placeholder="Enter your password again" disabled={!supabaseConfigured} /></label>}
        {(error || authError) && <p className="form-error" role="alert">{error || authError}</p>}
        <Button type="submit" disabled={!supabaseConfigured || busy || loading}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}<ArrowRight size={17} /></Button>
      </form>
      <p className="auth-switch">{register ? 'Already part of the community?' : 'New to Isotimos Faith?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p>
      {!register && <p className="auth-switch"><Link to="/auth/verify">Need another verification email?</Link></p>}
      <p className="auth-note">A thoughtful space for meaningful connection.</p>
    </div></section>
  </main>
}
