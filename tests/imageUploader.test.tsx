import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfilePage } from '../src/features/profiles/ProfilePage'

const mock = vi.hoisted(() => ({ upload: vi.fn(), save: vi.fn(), available: vi.fn(), updateProfile: vi.fn() }))
vi.mock('../src/features/auth/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'alice', user_metadata: {} } } }) }))
vi.mock('../src/features/profiles/ProfileProvider', () => ({ useProfile: () => ({ profile: { id: 'alice', username: 'alice', display_name: 'Alice', bio: '', avatar_url: null, cover_url: null }, updateProfile: mock.updateProfile }) }))
vi.mock('../src/features/profiles/profileService', async original => ({ ...await original<object>(), saveMyProfile: mock.save, usernameAvailable: mock.available }))
vi.mock('../src/features/profiles/imageUpload', () => ({ uploadProfileImage: mock.upload }))
beforeEach(() => {
  vi.resetAllMocks()
  mock.available.mockResolvedValue(true)
  mock.upload.mockResolvedValue('https://project.example/photo.webp')
  mock.save.mockResolvedValue({ id: 'alice', username: 'alice', display_name: 'Alice', bio: '', avatar_url: 'https://project.example/photo.webp', cover_url: null })
})
describe('profile upload and save UI', () => {
  it('uploads an avatar but only changes the profile record when Save is submitted', async () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>)
    const user = userEvent.setup()
    await user.upload(screen.getByLabelText('Upload avatar image'), new File(['test'], 'photo.png', { type: 'image/png' }))
    expect(await screen.findByText('Image uploaded. Save your profile to use it.')).toBeVisible()
    expect(mock.upload).toHaveBeenCalledWith('alice', expect.any(File), 'avatar')
    expect(mock.save).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(mock.save).toHaveBeenCalledWith('alice', expect.objectContaining({ avatar_url: 'https://project.example/photo.webp' }))
    expect(await screen.findByText('Your profile has been saved.')).toBeVisible()
  })
  it('uploads a cover separately and keeps saving disabled while upload is pending', async () => {
    let resolve!: (url: string) => void
    mock.upload.mockReturnValue(new Promise<string>(done => { resolve = done }))
    render(<MemoryRouter><ProfilePage /></MemoryRouter>)
    await userEvent.upload(screen.getByLabelText('Upload cover image'), new File(['test'], 'cover.png', { type: 'image/png' }))
    expect(screen.getByRole('button', { name: 'Uploading image…' })).toBeDisabled()
    resolve('https://project.example/cover.webp')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(mock.save).toHaveBeenCalledWith('alice', expect.objectContaining({ cover_url: 'https://project.example/cover.webp' }))
  })
  it('reports rejected uploads and leaves the saved profile unchanged', async () => {
    mock.upload.mockRejectedValue(new Error('Choose a smaller image.'))
    render(<MemoryRouter><ProfilePage /></MemoryRouter>)
    await userEvent.upload(screen.getByLabelText('Upload avatar image'), new File(['test'], 'photo.png', { type: 'image/png' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a smaller image')
    expect(mock.save).not.toHaveBeenCalled()
    expect(mock.updateProfile).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled()
  })
})
