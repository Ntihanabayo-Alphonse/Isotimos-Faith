import { beforeEach, describe, expect, it, vi } from 'vitest'
import { discoverPeople, getMember, setFollowing } from '../src/features/people/peopleService'

const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), insert: vi.fn(), delete: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: mock.rpc, from: mock.from } }))
beforeEach(() => {
  vi.clearAllMocks()
  mock.rpc.mockResolvedValue({ data: [], error: null })
  mock.from.mockReturnValue({ insert: mock.insert, delete: mock.delete, select: mock.select })
  mock.insert.mockResolvedValue({ error: null })
  mock.delete.mockReturnValue({ eq: mock.eq })
  mock.eq.mockReturnValue({ eq: mock.eq, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve), maybeSingle: mock.maybeSingle })
  mock.select.mockReturnValue({ eq: mock.eq })
  mock.maybeSingle.mockResolvedValue({ data: null, error: null })
})
describe('member data API contracts', () => {
  it('sends bounded search and pagination as RPC parameters', async () => {
    await discoverPeople(' Robert ', 'popular', 24)
    expect(mock.rpc).toHaveBeenCalledWith('discover_people', { p_query: 'Robert', p_filter: 'popular', p_limit: 24, p_offset: 24 })
  })
  it('returns missing public members without accessing private auth data', async () => {
    expect(await getMember('ALICE')).toBeNull()
    expect(mock.from).toHaveBeenCalledWith('member_directory')
    expect(mock.eq).toHaveBeenCalledWith('username', 'alice')
    expect(mock.select.mock.calls[0][0]).not.toContain('email')
  })
  it('inserts only the relationship IDs, never counters or roles', async () => {
    await setFollowing('alice', 'bob', true)
    expect(mock.insert).toHaveBeenCalledWith({ follower_id: 'alice', following_id: 'bob' })
  })
  it('treats duplicate follows as idempotent and propagates permission failures', async () => {
    mock.insert.mockResolvedValueOnce({ error: { code: '23505' } }).mockResolvedValueOnce({ error: { code: '42501' } })
    await expect(setFollowing('alice', 'bob', true)).resolves.toBeUndefined()
    await expect(setFollowing('alice', 'bob', true)).rejects.toMatchObject({ code: '42501' })
  })
  it('prevents self-follow and scopes unfollow to both relationship IDs', async () => {
    await expect(setFollowing('alice', 'alice', true)).rejects.toThrow('cannot follow yourself')
    expect(mock.insert).not.toHaveBeenCalled()
    await setFollowing('alice', 'bob', false)
    expect(mock.eq).toHaveBeenCalledWith('follower_id', 'alice')
    expect(mock.eq).toHaveBeenCalledWith('following_id', 'bob')
  })
})
