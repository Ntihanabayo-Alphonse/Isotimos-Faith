import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscoverPeople } from '../src/features/people/DiscoverPeople'
import { MemberProfile } from '../src/features/people/MemberProfile'
import type { Member } from '../src/features/people/peopleService'

const mock = vi.hoisted(() => ({
  discover: vi.fn(), getMember: vi.fn(), follow: vi.fn(),
  session: { user: { id: 'alice', email_confirmed_at: '2026-01-01' }, access_token: 'test-token' } as { user: { id: string; email_confirmed_at?: string }; access_token: string } | null,
}))
vi.mock('../src/features/auth/AuthProvider', () => ({ useAuth: () => ({ session: mock.session }) }))
vi.mock('../src/features/profiles/ProfileProvider', () => ({ useProfile: () => ({ profile: { id: 'alice', username: 'alice' } }) }))
vi.mock('../src/features/people/peopleService', async original => ({
  ...await original<object>(), discoverPeople: mock.discover, getMember: mock.getMember, setFollowing: mock.follow,
}))
const bob: Member = { id: 'bob', username: 'bob', display_name: 'Robert Grace', bio: 'A shared journey of faith.', avatar_url: null, cover_url: null,
  created_at: '2026-02-01T00:00:00Z', follower_count: 2, following_count: 1, is_following: false }
function directory() { render(<MemoryRouter><DiscoverPeople /></MemoryRouter>) }
function profile() { render(<MemoryRouter initialEntries={['/members/bob']}><Routes><Route path="/members/:username" element={<MemberProfile />} /></Routes></MemoryRouter>) }
beforeEach(() => {
  vi.resetAllMocks()
  mock.session = { user: { id: 'alice', email_confirmed_at: '2026-01-01' }, access_token: 'test-token' }
  mock.discover.mockResolvedValue([bob]); mock.getMember.mockResolvedValue(bob); mock.follow.mockResolvedValue(undefined)
})

describe('real member directory UI using mocked data transport', () => {
  it('renders backend records, counts, and username-based View Profile links', async () => {
    directory()
    expect(await screen.findByRole('heading', { name: 'Robert Grace' })).toBeVisible()
    expect(screen.getByText('@bob')).toBeVisible()
    expect(screen.getByText('A shared journey of faith.')).toBeVisible()
    expect(screen.getByRole('link', { name: /View profile/ })).toHaveAttribute('href', '/members/bob')
    expect(mock.discover).toHaveBeenCalledWith('', 'suggested')
  })
  it('debounces member search and requests every supported filter', async () => {
    directory()
    const user = userEvent.setup()
    await screen.findByText('@bob')
    await user.type(screen.getByRole('searchbox', { name: 'Search members' }), 'grace')
    await waitFor(() => expect(mock.discover).toHaveBeenCalledWith('grace', 'suggested'))
    for (const [name, filter] of [['Popular', 'popular'], ['New Members', 'new'], ['Following', 'following']] as const) {
      await user.click(screen.getByRole('button', { name, exact: true }))
      await waitFor(() => expect(mock.discover).toHaveBeenCalledWith('grace', filter))
    }
  })
  it('refreshes counts from the server after follow and unfollow', async () => {
    mock.discover.mockResolvedValueOnce([bob]).mockResolvedValueOnce([{ ...bob, follower_count: 3, is_following: true }]).mockResolvedValueOnce([bob])
    directory()
    await userEvent.click(await screen.findByRole('button', { name: 'Follow', exact: true }))
    expect(mock.follow).toHaveBeenCalledWith('alice', 'bob', true)
    expect(await screen.findByRole('button', { name: 'Unfollow' })).toBeVisible()
    expect(screen.getByText('3', { exact: false, selector: '.member-card-counts strong' })).toHaveTextContent('3 followers')
    await userEvent.click(screen.getByRole('button', { name: 'Unfollow' }))
    expect(mock.follow).toHaveBeenCalledWith('alice', 'bob', false)
    expect(await screen.findByRole('button', { name: 'Follow', exact: true })).toBeVisible()
  })
  it('reports follow failures without inventing counts or connection state', async () => {
    mock.follow.mockRejectedValue({ code: '42501' })
    directory()
    await userEvent.click(await screen.findByRole('button', { name: 'Follow', exact: true }))
    expect(await screen.findByRole('alert')).toHaveTextContent('verified account')
    expect(screen.getByRole('button', { name: 'Follow', exact: true })).toBeEnabled()
  })
  it('shows a truthful Following empty state', async () => {
    mock.discover.mockResolvedValue([])
    directory()
    await userEvent.click(screen.getByRole('button', { name: 'Following', exact: true }))
    expect(await screen.findByText('Your fellowship starts here.')).toBeVisible()
    expect(screen.queryByText('Robert Grace')).not.toBeInTheDocument()
  })
  it('offers retry for missing backend schema rather than hardcoded member cards', async () => {
    mock.discover.mockRejectedValueOnce({ code: 'PGRST202' }).mockResolvedValueOnce([bob])
    directory()
    expect(await screen.findByRole('alert')).toHaveTextContent('202611130004')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('@bob')).toBeVisible()
  })
  it('ignores late results from an obsolete member search', async () => {
    let resolveOld!: (rows: Member[]) => void
    mock.discover.mockImplementationOnce(() => new Promise<Member[]>(resolve => { resolveOld = resolve })).mockResolvedValue([{ ...bob, id: 'carol', username: 'carol', display_name: 'Carol' }])
    directory()
    await userEvent.type(screen.getByRole('searchbox'), 'carol')
    await screen.findByRole('heading', { name: 'Carol' })
    await act(async () => resolveOld([bob]))
    expect(screen.queryByText('Robert Grace')).not.toBeInTheDocument()
  })
  it('loads additional pages using the existing row count as offset', async () => {
    const rows = Array.from({ length: 24 }, (_, index) => ({ ...bob, id: `member-${index}`, username: `member_${index}`, display_name: `Member ${index}` }))
    mock.discover.mockResolvedValueOnce(rows).mockResolvedValueOnce([bob])
    directory()
    await userEvent.click(await screen.findByRole('button', { name: 'Load more members' }))
    expect(mock.discover).toHaveBeenCalledWith('', 'suggested', 24)
    expect(await screen.findByText('@bob')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Load more members' })).not.toBeInTheDocument()
  })
})

describe('username member profiles', () => {
  it('shows public profile fields, joined date, real counts, and a sign-in follow action', async () => {
    mock.session = null
    profile()
    expect(await screen.findByRole('heading', { name: 'Robert Grace' })).toBeVisible()
    expect(screen.getByText(/Joined February 2026/)).toBeVisible()
    expect(screen.getByText('Followers')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Sign in to follow' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
  })
  it('offers editing only when the displayed profile belongs to the signed-in member', async () => {
    mock.getMember.mockResolvedValue({ ...bob, id: 'alice', username: 'alice', display_name: 'Alice' })
    profile()
    expect(await screen.findByRole('link', { name: 'Edit profile' })).toHaveAttribute('href', '/app/profile/edit')
    expect(screen.queryByRole('button', { name: 'Follow', exact: true })).not.toBeInTheDocument()
  })
  it('handles missing members and backend errors with distinct states', async () => {
    mock.getMember.mockResolvedValueOnce(null)
    profile()
    expect(await screen.findByRole('heading', { name: 'Member not found' })).toBeVisible()
  })
  it('handles profile loading failures with retry', async () => {
    mock.getMember.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(bob)
    profile()
    expect(await screen.findByRole('alert')).toHaveTextContent('could not reach')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Robert Grace' })).toBeVisible()
  })
})
