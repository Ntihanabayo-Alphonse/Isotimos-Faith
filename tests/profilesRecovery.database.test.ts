// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migration = (file: string) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')
const recovery = migration('202611130003_profiles_recovery.sql')
const alice = '10000000-0000-4000-8000-000000000001'
const bob = '10000000-0000-4000-8000-000000000002'
const waiting = '10000000-0000-4000-8000-000000000003'
const later = '10000000-0000-4000-8000-000000000004'
const other = '10000000-0000-4000-8000-000000000005'

// Exercise both the reported hosted state and a normal migration-history sequence.
describe.each([false, true])('profile recovery with prior profiles migration = %s', priorProfiles => {
  const db = new PGlite()
  let originalRoles: unknown[]
  async function asUser(id: string | null, sql: string, params: unknown[] = [], role = 'authenticated') {
    await db.exec(`set role ${role}`)
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ''])
    try { return await db.query(sql, params) }
    finally { await db.exec('reset role') }
  }
  async function roleSecurity() {
    return (await db.query(`select c.relacl::text as acl, c.relrowsecurity as rls,
      pg_get_functiondef('public.current_app_role()'::regprocedure) as definition,
      (select proacl::text from pg_proc where oid = 'public.current_app_role()'::regprocedure) as function_acl
      from pg_class c where c.oid = 'public.user_roles'::regclass`)).rows
  }
  beforeAll(async () => {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ('${alice}', now()), ('${bob}', now()), ('${waiting}', null);
    `)
    await db.exec(migration('202611130001_app_roles.sql'))
    await db.query("insert into public.user_roles values ($1, 'member'), ($2, 'moderator')", [alice, bob])
    originalRoles = await roleSecurity()
    if (priorProfiles) {
      await db.exec(migration('202611130002_member_profiles.sql'))
      await db.query("insert into public.profiles(id, username, display_name, bio) values ($1, 'alice_original', 'Alice', 'Keep my story')", [alice])
    }
    await db.exec(recovery)
  }, 30_000)
  afterAll(async () => { await db.close() })

  it('creates the required schema and backfills only confirmed accounts without colliding names', async () => {
    const rows = (await db.query('select id, username, display_name, bio from public.profiles order by id')).rows
    expect(rows).toEqual([
      { id: alice, username: priorProfiles ? 'alice_original' : null, display_name: priorProfiles ? 'Alice' : '', bio: priorProfiles ? 'Keep my story' : '' },
      { id: bob, username: null, display_name: '', bio: '' },
    ])
    expect((await db.query("select relrowsecurity from pg_class where oid = 'public.profiles'::regclass")).rows).toEqual([{ relrowsecurity: true }])
    expect((await db.query('select count(*)::int as count from auth.users')).rows).toEqual([{ count: 3 }])
  })

  it('keeps unfinished profiles private and denies anonymous or unverified provisioning', async () => {
    expect((await asUser(null, 'select id from public.profiles where username is null', [], 'anon')).rows).toEqual([])
    expect((await asUser(alice, 'select id from public.profiles where id = $1', [bob])).rows).toEqual([])
    await expect(asUser(null, 'select public.ensure_my_profile()', [], 'anon')).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(waiting, 'select public.ensure_my_profile()')).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(waiting, 'insert into public.profiles(id) values ($1)', [waiting])).rejects.toMatchObject({ code: '42501' })
  })

  it('creates newly confirmed profiles idempotently after verification without requiring signup metadata', async () => {
    // Only the disposable fixture simulates Auth confirming a user.
    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [waiting])
    await asUser(waiting, 'select public.ensure_my_profile()')
    await asUser(waiting, 'select public.ensure_my_profile()')
    expect((await db.query('select id, username, display_name from public.profiles where id = $1', [waiting])).rows)
      .toEqual([{ id: waiting, username: null, display_name: '' }])
  })

  it('allows verified owner-only INSERT recovery but rejects cross-user and duplicate INSERTs', async () => {
    await db.query('insert into auth.users values ($1, now()), ($2, now())', [later, other])
    await expect(asUser(alice, 'insert into public.profiles(id) values ($1)', [other])).rejects.toMatchObject({ code: '42501' })
    await asUser(later, 'insert into public.profiles(id) values ($1)', [later])
    await expect(asUser(later, 'insert into public.profiles(id) values ($1)', [later])).rejects.toMatchObject({ code: '23505' })
    await expect(asUser(other, "insert into public.profiles(id, created_at) values ($1, now())", [other])).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(null, 'insert into public.profiles(id) values ($1)', [other], 'anon')).rejects.toMatchObject({ code: '42501' })
  })

  it('enforces owner UPDATE, public SELECT, uniqueness, and field constraints', async () => {
    await asUser(alice, "update public.profiles set username = 'alice', display_name = 'Alice', bio = 'Saved story' where id = $1", [alice])
    expect((await asUser(null, 'select username, bio from public.profiles where id = $1', [alice], 'anon')).rows).toEqual([{ username: 'alice', bio: 'Saved story' }])
    expect((await asUser(bob, "update public.profiles set bio = 'Hacked' where id = $1 returning id", [alice])).rows).toEqual([])
    await expect(asUser(bob, "update public.profiles set username = 'alice', display_name = 'Bob' where id = $1", [bob])).rejects.toMatchObject({ code: '23505' })
    for (const patch of ["username = 'BAD'", "display_name = ' '", "bio = repeat('x', 501)", "avatar_url = 'javascript:alert(1)'"]) {
      await expect(asUser(alice, `update public.profiles set ${patch} where id = $1`, [alice])).rejects.toMatchObject({ code: '23514' })
    }
  })

  it('denies identity/timestamp modifications, deletes, and edits after verification is revoked', async () => {
    for (const column of ['created_at', 'updated_at']) {
      await expect(asUser(alice, `update public.profiles set ${column} = now() where id = $1`, [alice])).rejects.toMatchObject({ code: '42501' })
    }
    await expect(asUser(alice, 'update public.profiles set id = $1 where id = $2', [other, alice])).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(alice, 'delete from public.profiles where id = $1', [alice])).rejects.toMatchObject({ code: '42501' })
    await db.query('update auth.users set email_confirmed_at = null where id = $1', [waiting])
    expect((await asUser(waiting, "update public.profiles set bio = 'Unverified edit' where id = $1 returning id", [waiting])).rows).toEqual([])
  })

  it('preserves existing role rows, grants, RLS, and the role function exactly', async () => {
    expect(await roleSecurity()).toEqual(originalRoles)
    for (const id of [alice, bob]) {
      await expect(asUser(alice, "update public.user_roles set role = 'admin' where user_id = $1", [id])).rejects.toMatchObject({ code: '42501' })
    }
    await expect(asUser(alice, 'insert into public.user_roles values ($1, $2)', [waiting, 'admin'])).rejects.toMatchObject({ code: '42501' })
    expect((await db.query('select user_id, role from public.user_roles order by user_id')).rows).toEqual([{ user_id: alice, role: 'member' }, { user_id: bob, role: 'moderator' }])
  })

  it('safely repeats recovery without replacing the table, erasing edits, or retaining excess column grants', async () => {
    const before = (await db.query("select 'public.profiles'::regclass::oid as oid")).rows
    await db.exec('grant update(created_at) on public.profiles to authenticated')
    await db.exec(recovery)
    expect((await db.query("select 'public.profiles'::regclass::oid as oid")).rows).toEqual(before)
    expect((await db.query('select username, bio from public.profiles where id = $1', [alice])).rows).toEqual([{ username: 'alice', bio: 'Saved story' }])
    await expect(asUser(alice, 'update public.profiles set created_at = now() where id = $1', [alice])).rejects.toMatchObject({ code: '42501' })
    expect(await roleSecurity()).toEqual(originalRoles)
  })

  it('refuses unexpected policies without changing existing data', async () => {
    await db.exec('create policy unexpected_test_policy on public.profiles for select to anon using (true)')
    await expect(db.exec(recovery)).rejects.toThrow('Unexpected profiles schema or policies')
    await db.exec('rollback')
    await db.exec('drop policy unexpected_test_policy on public.profiles')
    expect((await db.query('select bio from public.profiles where id = $1', [alice])).rows).toEqual([{ bio: 'Saved story' }])
  })
})
