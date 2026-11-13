import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { AuthProvider } from '../src/features/auth/AuthProvider'
import { AuthPage } from '../src/features/auth/AuthPage'
import { VerificationPage } from '../src/features/auth/VerificationPage'
import { ProtectedRoute } from '../src/features/auth/ProtectedRoute'
import { ProfileProvider, useProfile } from '../src/features/profiles/ProfileProvider'
import type { Profile } from '../src/features/profiles/profileService'
import { ProfileGate } from '../src/features/profiles/ProfileGate'
import { AppLayout } from '../src/components/layout/AppLayout'

const mock = vi.hoisted(() => ({
  session: null as Session | null,
  callback: null as ((event: string, session: Session | null) => void) | null,
  emitInitial: true,
  signInWithPassword: vi.fn(), signUp: vi.fn(), resend: vi.fn(), signOut: vi.fn(),
  getSession: vi.fn(), rpc: vi.fn(), unsubscribe: vi.fn(),
}))
vi.mock('../src/lib/supabase', () => ({
  supabaseConfigured: true, authRedirectError: false,
  supabase: {
    auth: {
      signInWithPassword: mock.signInWithPassword, signUp: mock.signUp, resend: mock.resend,
      signOut: mock.signOut, getSession: mock.getSession,
      onAuthStateChange: (callback: typeof mock.callback) => {
        mock.callback = callback
        if (mock.emitInitial) queueMicrotask(() => callback?.('INITIAL_SESSION', mock.session))
        return { data: { subscription: { unsubscribe: mock.unsubscribe } } }
      },
    }, rpc: mock.rpc,
  },
}))

const memberSession = {
  access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600,
  user: { id: 'member-id', aud: 'authenticated', role: 'authenticated', email: 'member@example.com',
    email_confirmed_at: '2026-11-13T00:00:00Z', app_metadata: {}, user_metadata: { display_name: 'Grace' }, created_at: '2026-11-13T00:00:00Z' },
} as Session
const profile = { id: 'member-id', username: 'grace', display_name: 'Grace', bio: '', avatar_url: null, created_at: '', updated_at: '' }

function open(path = '/login') {
  return render(<AuthProvider><ProfileProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<AuthPage />} /><Route path="/register" element={<AuthPage register />} />
    <Route path="/auth/verify" element={<VerificationPage />} /><Route path="/auth/callback" element={<VerificationPage callback />} />
    <Route element={<ProtectedRoute />}><Route element={<ProfileGate />}>
      <Route path="/app" element={<AppLayout />}><Route index element={<h1>Member feed</h1>} /><Route path="onboarding" element={<h1>Profile onboarding</h1>} /></Route>
    </Route></Route>
    <Route element={<ProtectedRoute roles={['admin']} />}><Route path="/admin" element={<h1>Admin workspace</h1>} /></Route>
  </Routes></MemoryRouter></ProfileProvider></AuthProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mock.session = null; mock.callback = null; mock.emitInitial = true
  mock.getSession.mockResolvedValue({ data: { session: null }, error: null })
  mock.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { code: 'invalid_credentials' } })
  mock.signUp.mockResolvedValue({ data: { session: null }, error: null })
  mock.resend.mockResolvedValue({ error: null })
  mock.signOut.mockImplementation(async () => { mock.session = null; mock.callback?.('SIGNED_OUT', null); return { error: null } })
  mock.rpc.mockImplementation(async (name: string) => ({ data: name === 'current_app_role' ? 'member' : profile, error: null }))
})

describe('real auth UI and provider with mocked Supabase transport', () => {
  it('submits email/password and maps invalid credentials without leaking server details', async () => {
    open()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Email address'), 'grace@example.com')
    await user.type(screen.getByLabelText('Password'), 'incorrect-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect')
    expect(mock.signInWithPassword).toHaveBeenCalledWith({ email: 'grace@example.com', password: 'incorrect-password' })
  })

  it('registers without assigning roles and waits for email confirmation before profile creation', async () => {
    open('/register')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Full name'), 'Grace Williams')
    await user.type(screen.getByLabelText('Email address'), 'grace@example.com')
    await user.type(screen.getByLabelText('Password'), 'strong-password-123')
    await user.type(screen.getByLabelText('Confirm password'), 'strong-password-123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'Check your inbox.' })).toBeVisible()
    expect(mock.signUp).toHaveBeenCalledWith({ email: 'grace@example.com', password: 'strong-password-123', options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`, data: { display_name: 'Grace Williams' },
    } })
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it('does not submit mismatched registration passwords', async () => {
    open('/register')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Full name'), 'Grace')
    await user.type(screen.getByLabelText('Email address'), 'grace@example.com')
    await user.type(screen.getByLabelText('Password'), 'strong-password-123')
    await user.type(screen.getByLabelText('Confirm password'), 'different-password')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match')
    expect(mock.signUp).not.toHaveBeenCalled()
  })

  it('keeps a signed-out member out of protected routes', async () => {
    open('/app')
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Member feed' })).not.toBeInTheDocument()
  })

  it('waits for session initialization instead of flashing sign-in or member content', async () => {
    mock.emitInitial = false
    open('/app')
    expect(await screen.findByText('Checking your session…')).toBeVisible()
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument()
    await act(async () => { mock.callback?.('INITIAL_SESSION', null) })
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  })

  it('reports session initialization failures without leaving an endless loading screen', async () => {
    mock.getSession.mockRejectedValue(new Error('unavailable storage'))
    open('/login')
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to restore your session')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('restores a confirmed session and loads the database profile', async () => {
    mock.session = memberSession
    open('/app')
    expect(await screen.findByRole('heading', { name: 'Member feed' })).toBeVisible()
    expect(mock.rpc).toHaveBeenCalledWith('ensure_my_profile')
    expect(screen.getByText('Grace')).toBeVisible()
  })

  it('opens the member area after successful password login emits a session', async () => {
    mock.signInWithPassword.mockImplementation(async () => {
      mock.session = memberSession
      mock.callback?.('SIGNED_IN', memberSession)
      return { data: { session: memberSession }, error: null }
    })
    open()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Email address'), 'grace@example.com')
    await user.type(screen.getByLabelText('Password'), 'strong-password-123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Member feed' })).toBeVisible()
  })

  it('shows a recoverable message when an email callback has no session', async () => {
    open('/auth/callback')
    expect(await screen.findByText(/No verified session was found/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Resend confirmation email' })).toBeEnabled()
  })

  it('routes unconfirmed sessions to verification without creating profiles', async () => {
    mock.session = { ...memberSession, user: { ...memberSession.user, email_confirmed_at: undefined } }
    open('/app')
    expect(await screen.findByRole('heading', { name: 'Check your inbox.' })).toBeVisible()
    expect(mock.rpc).not.toHaveBeenCalledWith('ensure_my_profile')
  })

  it('routes verified members with incomplete profiles to onboarding', async () => {
    mock.session = memberSession
    mock.rpc.mockImplementation(async (name: string) => ({ data: name === 'current_app_role' ? 'member' : { ...profile, username: null }, error: null }))
    open('/app')
    expect(await screen.findByRole('heading', { name: 'Profile onboarding' })).toBeVisible()
  })

  it('fails closed on a missing profile migration and offers retry and sign out', async () => {
    mock.session = memberSession
    mock.rpc.mockImplementation(async (name: string) => name === 'current_app_role' ? { data: 'member', error: null } : { data: null, error: { code: 'PGRST202' } })
    open('/app')
    expect(await screen.findByRole('alert')).toHaveTextContent('migration may not have been applied')
    expect(screen.queryByRole('heading', { name: 'Member feed' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  })

  it('resends confirmation with a safe callback and prevents immediate duplicate sends', async () => {
    open('/auth/verify')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Email address'), 'grace@example.com')
    await user.click(screen.getByRole('button', { name: 'Resend confirmation email' }))
    expect(await screen.findByRole('status')).toHaveTextContent('If this email has an account awaiting confirmation')
    expect(mock.resend).toHaveBeenCalledWith({ type: 'signup', email: 'grace@example.com', options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
    await user.click(screen.getByRole('button', { name: 'Resend confirmation email' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('wait one minute')
    expect(mock.resend).toHaveBeenCalledTimes(1)
  })

  it('handles unconfirmed login and network failures with actionable errors', async () => {
    mock.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { code: 'email_not_confirmed' } }).mockRejectedValueOnce(new Error('private internal details'))
    open()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Email address'), 'grace@example.com')
    await user.type(screen.getByLabelText('Password'), 'strong-password-123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('verify your email')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Check your connection'))
    expect(screen.queryByText('private internal details')).not.toBeInTheDocument()
  })

  it('denies admin access for members even with forged user metadata', async () => {
    mock.session = { ...memberSession, user: { ...memberSession.user, user_metadata: { role: 'admin' } } }
    open('/admin')
    expect(await screen.findByRole('heading', { name: 'Access restricted' })).toBeVisible()
    expect(screen.queryByText('Admin workspace')).not.toBeInTheDocument()
  })

  it('denies admin access when the server role check fails', async () => {
    mock.session = memberSession
    mock.rpc.mockResolvedValue({ data: null, error: { code: '42501' } })
    open('/admin')
    expect(await screen.findByRole('heading', { name: 'Access restricted' })).toBeVisible()
  })

  it('logs out through Supabase and removes protected content', async () => {
    mock.session = memberSession
    open('/app')
    await screen.findByRole('heading', { name: 'Member feed' })
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(mock.signOut).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Member feed' })).not.toBeInTheDocument()
  })

  it('keeps the session visible and reports a failed sign-out', async () => {
    mock.session = memberSession
    mock.signOut.mockResolvedValue({ error: { message: 'network failed' } })
    open('/app')
    await screen.findByRole('heading', { name: 'Member feed' })
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-out failed')
    expect(screen.getByRole('heading', { name: 'Member feed' })).toBeVisible()
  })

  it('isolates profiles across account changes and ignores late saves from the previous member', async () => {
    let update: ((profile: Profile) => void) | undefined
    function Probe() {
      const state = useProfile()
      update = state.updateProfile
      return <p>{state.profile?.display_name || 'No current profile'}</p>
    }
    mock.session = memberSession
    mock.rpc.mockImplementation(async (name: string) => ({ data: name === 'current_app_role' ? 'member'
      : { ...profile, id: mock.session?.user.id, display_name: mock.session?.user.id === 'bob-id' ? 'Bob' : 'Grace' }, error: null }))
    render(<AuthProvider><ProfileProvider><Probe /></ProfileProvider></AuthProvider>)
    await screen.findByText('Grace')
    const previousMemberUpdate = update!
    await act(async () => {
      mock.session = { ...memberSession, access_token: 'bob-token', user: { ...memberSession.user, id: 'bob-id' } }
      mock.callback?.('SIGNED_IN', mock.session)
    })
    expect(await screen.findByText('Bob')).toBeVisible()
    await act(async () => { previousMemberUpdate({ ...profile, display_name: 'Late Grace edit' }) })
    expect(screen.getByText('Bob')).toBeVisible()
    expect(screen.queryByText('Late Grace edit')).not.toBeInTheDocument()
  })
})
