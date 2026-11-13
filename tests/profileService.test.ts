import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureMyProfile, saveMyProfile } from '../src/features/profiles/profileService'

const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: mock.rpc, from: mock.from } }))
const profile = { id: 'alice', username: 'alice', display_name: 'Alice', bio: '', avatar_url: null, created_at: '', updated_at: '' }
beforeEach(() => {
  vi.clearAllMocks()
  mock.from.mockReturnValue({ update: mock.update })
  mock.update.mockReturnValue({ eq: mock.eq })
  mock.eq.mockReturnValue({ select: mock.select })
  mock.select.mockReturnValue({ single: mock.single })
  mock.single.mockResolvedValue({ data: profile, error: null })
})

describe('profile data API contract', () => {
  it('accepts exactly one composite RPC profile, whether represented as an object or row array', async () => {
    mock.rpc.mockResolvedValueOnce({ data: [profile], error: null }).mockResolvedValueOnce({ data: profile, error: null })
    expect(await ensureMyProfile()).toEqual(profile)
    expect(await ensureMyProfile()).toEqual(profile)
    expect(mock.rpc).toHaveBeenCalledWith('ensure_my_profile')
  })
  it('rejects empty or multiple-profile RPC results', async () => {
    for (const data of [null, [], [profile, profile]]) {
      mock.rpc.mockResolvedValueOnce({ data, error: null })
      await expect(ensureMyProfile()).rejects.toThrow('No profile returned')
    }
  })
  it('allowlists editable columns and never forwards role, id, or timestamp fields', async () => {
    const input = { username: ' Alice_New ', display_name: ' Alice ', bio: ' Hello ', avatar_url: '',
      id: 'bob', role: 'admin', created_at: 'forged', updated_at: 'forged' }
    await saveMyProfile('alice', input)
    expect(mock.update).toHaveBeenCalledWith({ username: 'alice_new', display_name: 'Alice', bio: 'Hello', avatar_url: null })
    expect(mock.eq).toHaveBeenCalledWith('id', 'alice')
  })
  it('propagates database conflicts without retrying an overwrite', async () => {
    mock.single.mockResolvedValue({ data: null, error: { code: '23505' } })
    await expect(saveMyProfile('alice', profile)).rejects.toMatchObject({ code: '23505' })
    expect(mock.update).toHaveBeenCalledTimes(1)
  })
})
