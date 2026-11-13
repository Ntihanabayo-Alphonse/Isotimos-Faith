import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfilePage } from '../src/features/profiles/ProfilePage'

const mock = vi.hoisted(() => ({
  profile: { id: 'alice', username: 'alice' as string | null, display_name: 'Alice', bio: '', avatar_url: null, created_at: '', updated_at: '' },
  updateProfile: vi.fn(), save: vi.fn(), available: vi.fn(),
}))
vi.mock('../src/features/auth/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'alice', user_metadata: { display_name: 'Alice' } } } }) }))
vi.mock('../src/features/profiles/ProfileProvider', () => ({ useProfile: () => ({ profile: mock.profile, updateProfile: mock.updateProfile }) }))
vi.mock('../src/features/profiles/profileService', async importOriginal => ({
  ...await importOriginal<object>(), saveMyProfile: mock.save, usernameAvailable: mock.available,
}))

function open(onboarding = false) {
  render(<MemoryRouter initialEntries={['/app/profile']}><Routes><Route path="/app/profile" element={<ProfilePage onboarding={onboarding} />} /><Route path="/app" element={<h1>Feed after onboarding</h1>} /></Routes></MemoryRouter>)
}
beforeEach(() => {
  vi.clearAllMocks()
  mock.profile = { id: 'alice', username: 'alice', display_name: 'Alice', bio: '', avatar_url: null, created_at: '', updated_at: '' }
  mock.available.mockResolvedValue(true)
  mock.save.mockResolvedValue({ ...mock.profile, bio: 'My faith journey' })
})

describe('secure profile editing UI', () => {
  it('saves the authenticated profile and updates the shared profile state', async () => {
    open()
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: /^Bio/ }), 'My faith journey')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText('Your profile has been saved.')).toBeVisible()
    expect(mock.save).toHaveBeenCalledWith('alice', { username: 'alice', display_name: 'Alice', bio: 'My faith journey', avatar_url: '', cover_url: '' })
    expect(mock.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 'alice', bio: 'My faith journey' }))
  })
  it('handles a username race reported by the database without claiming a successful save', async () => {
    mock.save.mockRejectedValue({ code: '23505' })
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('username has just been taken')
    expect(mock.updateProfile).not.toHaveBeenCalled()
    expect(screen.queryByText('Your profile has been saved.')).not.toBeInTheDocument()
  })
  it('shows unavailable usernames and prevents a known duplicate submission', async () => {
    mock.available.mockResolvedValue(false)
    open()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('already taken'))
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled()
  })
  it('completes onboarding only after the database save succeeds', async () => {
    mock.profile.username = null
    mock.save.mockResolvedValue({ ...mock.profile, username: 'alice_new' })
    open(true)
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: /^Username/ }), 'alice_new')
    await user.click(screen.getByRole('button', { name: 'Complete profile & continue' }))
    expect(await screen.findByRole('heading', { name: 'Feed after onboarding' })).toBeVisible()
    expect(mock.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ username: 'alice_new' }))
  })
  it('allows a save attempt after an availability-network failure, leaving final validation to the database', async () => {
    mock.available.mockRejectedValue(new Error('offline'))
    open()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('verify it when you save'))
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled()
  })
})
