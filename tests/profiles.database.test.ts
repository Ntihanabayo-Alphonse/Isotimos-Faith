// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Real PostgreSQL evaluation of SQL grants/RLS in disposable memory, not mocks.
// No network, external database, Supabase credentials, or persistent migration state.
const db = new PGlite()
const alice = '00000000-0000-4000-8000-000000000001'
const bob = '00000000-0000-4000-8000-000000000002'
const unverified = '00000000-0000-4000-8000-000000000003'

async function asUser<T>(id: string | null, query: string, params: unknown[] = [], role = 'authenticated') {
  await db.exec(`set role ${role}`)
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ''])
  try { return await db.query<T>(query, params) }
  finally { await db.exec('reset role') }
}

beforeAll(async () => {
  // Minimal Supabase auth contract for SQL tests. Fixture users are NOT real accounts.
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
    insert into auth.users values
      ('${alice}', now()), ('${bob}', now()), ('${unverified}', null);
  `)
  for (const file of ['202611130001_app_roles.sql', '202611130002_member_profiles.sql']) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  }
}, 30_000)
afterAll(async () => { await db.close() })

describe.sequential('PostgreSQL profile provisioning and authorization', () => {
  it('denies anonymous RPC calls and unverified provisioning', async () => {
    await expect(asUser(null, 'select public.ensure_my_profile()', [], 'anon')).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(unverified, 'select public.ensure_my_profile()')).rejects.toMatchObject({ code: '42501' })
    expect((await db.query('select * from public.profiles')).rows).toHaveLength(0)
  })

  it('provisions only the confirmed caller, idempotently, without reserving usernames', async () => {
    await asUser(alice, 'select public.ensure_my_profile()')
    await asUser(alice, 'select public.ensure_my_profile()')
    await asUser(bob, 'select public.ensure_my_profile()')
    const { rows } = await db.query('select id, username from public.profiles order by id')
    expect(rows).toEqual([{ id: alice, username: null }, { id: bob, username: null }])
  })

  it('keeps uncompleted profiles hidden from other members and anonymous readers', async () => {
    expect((await asUser(alice, 'select id from public.profiles')).rows).toEqual([{ id: alice }])
    expect((await asUser(null, 'select id from public.profiles', [], 'anon')).rows).toHaveLength(0)
  })

  it('allows owner onboarding, sets timestamps, and exposes public fields', async () => {
    const result = await asUser<{ updated_at: Date }>(alice, `update public.profiles
      set username = 'alice', display_name = 'Alice', bio = 'Faith and fellowship'
      where id = $1 returning updated_at`, [alice])
    expect(result.rows).toHaveLength(1)
    const read = await asUser(null, 'select username, display_name, bio from public.profiles', [], 'anon')
    expect(read.rows).toEqual([{ username: 'alice', display_name: 'Alice', bio: 'Faith and fellowship' }])
    expect((await asUser(bob, 'select username from public.profiles where id = $1', [alice])).rows).toEqual([{ username: 'alice' }])
  })

  it('rejects duplicate usernames atomically while preserving both profiles', async () => {
    await expect(asUser(bob, "update public.profiles set username = 'alice', display_name = 'Bob' where id = $1", [bob])).rejects.toMatchObject({ code: '23505' })
    expect((await db.query('select username from public.profiles where id = $1', [bob])).rows).toEqual([{ username: null }])
    await asUser(bob, "update public.profiles set username = 'bob', display_name = 'Bob' where id = $1", [bob])
  })

  it('prevents cross-user and bulk updates with RLS, even when other profiles are readable', async () => {
    expect((await asUser(alice, "update public.profiles set bio = 'Hacked' where id = $1 returning id", [bob])).rows).toHaveLength(0)
    expect((await asUser(alice, "update public.profiles set bio = 'Owner edit' returning id")).rows).toEqual([{ id: alice }])
    expect((await db.query('select display_name, bio from public.profiles where id = $1', [bob])).rows).toEqual([{ display_name: 'Bob', bio: '' }])
  })

  it('denies changing identity or timestamps, direct inserts, deletes, and anonymous edits', async () => {
    for (const query of [
      `update public.profiles set id = '${bob}' where id = '${alice}'`,
      `update public.profiles set created_at = now() where id = '${alice}'`,
      `update public.profiles set updated_at = now() where id = '${alice}'`,
      `insert into public.profiles(id) values ('${unverified}')`,
      `delete from public.profiles where id = '${alice}'`,
    ]) await expect(asUser(alice, query)).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(null, "update public.profiles set bio = 'Hacked'", [], 'anon')).rejects.toMatchObject({ code: '42501' })
  })

  it('enforces username, display-name, bio, and avatar constraints in the database', async () => {
    for (const patch of ["username = 'ALICE'", "username = 'a'", "username = '1alice'", "display_name = ' '", "bio = repeat('x', 501)", "avatar_url = 'javascript:alert(1)'", "avatar_url = 'http://example.com/a.png'"]) {
      await expect(asUser(alice, `update public.profiles set ${patch} where id = $1`, [alice])).rejects.toMatchObject({ code: '23514' })
    }
  })

  it('preserves role security: no member can read, insert, update, or delete role records', async () => {
    // Trusted fixture setup, analogous to an operator assigning a role in SQL.
    await db.query("insert into public.user_roles (user_id, role) values ($1, 'member'), ($2, 'moderator')", [alice, bob])
    for (const query of [
      'select * from public.user_roles',
      `insert into public.user_roles values ('${unverified}', 'admin')`,
      `update public.user_roles set role = 'admin' where user_id = '${alice}'`,
      `update public.user_roles set role = 'admin' where user_id = '${bob}'`,
      `delete from public.user_roles where user_id = '${bob}'`,
    ]) await expect(asUser(alice, query)).rejects.toMatchObject({ code: '42501' })
    expect((await asUser<{ role: string }>(alice, 'select public.current_app_role() as role')).rows[0].role).toBe('member')
    expect((await asUser<{ role: string }>(bob, 'select public.current_app_role() as role')).rows[0].role).toBe('moderator')
    await expect(asUser(null, 'select public.current_app_role()', [], 'anon')).rejects.toMatchObject({ code: '42501' })
  })

  it('does not reset edits or roles when provisioning runs again', async () => {
    await asUser(alice, 'select public.ensure_my_profile()')
    expect((await db.query('select username, bio from public.profiles where id = $1', [alice])).rows).toEqual([{ username: 'alice', bio: 'Owner edit' }])
    expect((await db.query('select role from public.user_roles where user_id = $1', [alice])).rows).toEqual([{ role: 'member' }])
  })

  it('creates a waiting user’s profile after email confirmation, without an auth trigger', async () => {
    // Simulate the Auth service confirming an isolated fixture, not an application write.
    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [unverified])
    await asUser(unverified, 'select public.ensure_my_profile()')
    expect((await db.query('select id, username from public.profiles where id = $1', [unverified])).rows).toEqual([{ id: unverified, username: null }])
    expect((await asUser<{ role: string }>(unverified, 'select public.current_app_role() as role')).rows[0].role).toBe('member')
  })
})
