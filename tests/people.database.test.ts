// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const db = new PGlite({ extensions: { pg_trgm } })
const a = '20000000-0000-4000-8000-000000000001'
const b = '20000000-0000-4000-8000-000000000002'
const c = '20000000-0000-4000-8000-000000000003'
const incomplete = '20000000-0000-4000-8000-000000000004'
const unverified = '20000000-0000-4000-8000-000000000005'
const objectName = '30000000-0000-4000-8000-000000000001.webp'
async function asUser<T = Record<string, unknown>>(id: string | null, sql: string, params: unknown[] = [], role = 'authenticated') {
  await db.exec(`set role ${role}`)
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ''])
  try { return await db.query<T>(sql, params) }
  finally { await db.exec('reset role') }
}
beforeAll(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema extensions;
    create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${a}', now()), ('${b}', now()), ('${c}', now()), ('${incomplete}', now()), ('${unverified}', null);
    alter table auth.users add column email text;
    -- Storage fixtures model SQL policy evaluation, not the hosted upload service.
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text references storage.buckets(id), name text,
      primary key (bucket_id, name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    -- Deliberately broad pre-existing policy: new restrictive guards must still work.
    create policy old_unrelated_policy on storage.objects for all to anon, authenticated
      using (true) with check (true);
    insert into storage.buckets values ('unrelated', 'unrelated', false, null, null);
  `)
  for (const file of ['202611130001_app_roles.sql', '202611130002_member_profiles.sql', '202611130003_profiles_recovery.sql', '202611130004_member_directory_and_follows.sql', '202611130005_member_image_storage.sql']) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  }
  await db.query(`update public.profiles set username = 'alice', display_name = 'Alice Faith', created_at = '2026-01-01' where id = $1`, [a])
  await db.query(`update public.profiles set username = 'bob', display_name = 'Robert Grace', created_at = '2026-02-01' where id = $1`, [b])
  await db.query(`update public.profiles set username = 'carol_faith', display_name = 'Carol 100%_ Hope', created_at = '2026-03-01' where id = $1`, [c])
}, 30_000)
afterAll(async () => { await db.close() })

describe.sequential('member directory, follows, and Storage authorization', () => {
  it('adds cover field without recreating profiles and preserves verified provisioning', async () => {
    expect((await asUser(a, 'select public.ensure_my_profile() as profile')).rows[0]).toBeDefined()
    await asUser(a, "update public.profiles set cover_url = 'https://example.com/cover.webp' where id = $1", [a])
    await expect(asUser(a, "update public.profiles set cover_url = 'javascript:alert(1)' where id = $1", [a])).rejects.toMatchObject({ code: '23514' })
    expect((await asUser(b, "update public.profiles set cover_url = 'https://example.com/hack.webp' where id = $1 returning id", [a])).rows).toEqual([])
  })
  it('exposes only completed public profiles and excludes the caller from recommendations', async () => {
    const publicRows = await asUser(null, 'select username from public.member_directory order by username', [], 'anon')
    expect(publicRows.rows).toEqual([{ username: 'alice' }, { username: 'bob' }, { username: 'carol_faith' }])
    const rows = await asUser(a, 'select username from public.discover_people()')
    expect(rows.rows).toEqual([{ username: 'carol_faith' }, { username: 'bob' }])
    await expect(asUser(null, 'select * from public.discover_people()', [], 'anon')).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(a, 'select email from auth.users')).rejects.toMatchObject({ code: '42501' })
  })
  it('searches display names and usernames case-insensitively and treats wildcards literally', async () => {
    expect((await asUser(a, "select username from public.discover_people('ROBERT', 'new')")).rows).toEqual([{ username: 'bob' }])
    expect((await asUser(a, "select username from public.discover_people('faith', 'new')")).rows).toEqual([{ username: 'carol_faith' }])
    expect((await asUser(a, "select username from public.discover_people('%_', 'new')")).rows).toEqual([{ username: 'carol_faith' }])
    expect((await asUser(a, "select username from public.discover_people('no such person', 'new')")).rows).toEqual([])
  })
  it('validates pagination/filter arguments and sorts New Members deterministically', async () => {
    expect((await asUser(a, "select username from public.discover_people('', 'new', 1, 1)")).rows).toEqual([{ username: 'bob' }])
    for (const sql of ["select * from public.discover_people('', 'bad')", "select * from public.discover_people('', 'new', 1000)", "select * from public.discover_people('', 'new', 24, -1)", "select * from public.discover_people(repeat('x',81))"]) {
      await expect(asUser(a, sql)).rejects.toMatchObject({ code: '22023' })
    }
  })
  it('allows following only as the verified owner and prevents self-follow and duplicates', async () => {
    await asUser(a, 'insert into public.follows(follower_id, following_id) values ($1, $2)', [a, b])
    await expect(asUser(a, 'insert into public.follows(follower_id, following_id) values ($1, $2)', [a, b])).rejects.toMatchObject({ code: '23505' })
    await expect(asUser(a, 'insert into public.follows(follower_id, following_id) values ($1, $2)', [a, a])).rejects.toMatchObject({ code: '23514' })
    await expect(asUser(a, 'insert into public.follows(follower_id, following_id) values ($1, $2)', [b, c])).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(incomplete, 'insert into public.follows(follower_id, following_id) values ($1, $2)', [incomplete, b])).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(a, 'insert into public.follows(follower_id, following_id) values ($1, $2)', [a, incomplete])).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(unverified, 'insert into public.follows(follower_id, following_id) values ($1, $2)', [unverified, b])).rejects.toMatchObject({ code: '42501' })
  })
  it('computes real counts and Following/Suggested/Popular filters from relationships', async () => {
    await asUser(c, 'insert into public.follows(follower_id, following_id) values ($1, $2)', [c, b])
    const counts = (await asUser(a, "select follower_count::int, following_count::int, is_following from public.member_directory where username = 'bob'")).rows
    expect(counts).toEqual([{ follower_count: 2, following_count: 0, is_following: true }])
    expect((await asUser(a, "select username from public.discover_people('', 'following')")).rows).toEqual([{ username: 'bob' }])
    expect((await asUser(a, "select username from public.discover_people('', 'suggested')")).rows).toEqual([{ username: 'carol_faith' }])
    expect((await asUser(a, "select username from public.discover_people('', 'popular', 1)")).rows).toEqual([{ username: 'bob' }])
  })
  it('allows only owner unfollow and prevents relationship/timestamp/counter rewrites', async () => {
    expect((await asUser(b, 'delete from public.follows where follower_id = $1 returning follower_id', [a])).rows).toEqual([])
    await expect(asUser(a, 'update public.follows set following_id = $1 where follower_id = $2', [c, a])).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(a, 'insert into public.follows(follower_id, following_id, created_at) values ($1,$2,now())', [a,c])).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(a, "update public.member_directory set follower_count = 9000 where username = 'alice'")).rejects.toBeDefined()
    await asUser(a, 'delete from public.follows where follower_id = $1 and following_id = $2', [a,b])
    expect((await asUser(a, "select follower_count::int, is_following from public.member_directory where username = 'bob'")).rows).toEqual([{ follower_count: 1, is_following: false }])
  })
  it('configures distinct public WebP buckets with server upload limits', async () => {
    expect((await db.query("select id, public, file_size_limit::int, allowed_mime_types from storage.buckets where id like 'member-%' order by id")).rows).toEqual([
      { id: 'member-avatars', public: true, file_size_limit: 2097152, allowed_mime_types: ['image/webp'] },
      { id: 'member-covers', public: true, file_size_limit: 5242880, allowed_mime_types: ['image/webp'] },
    ])
  })
  it('allows owner uploads and denies cross-user, unverified, anonymous, and invalid-path writes', async () => {
    await asUser(a, 'insert into storage.objects(bucket_id,name) values ($1,$2)', ['member-avatars', `${a}/${objectName}`])
    for (const [caller, path, role] of [[b, `${a}/30000000-0000-4000-8000-000000000002.webp`, 'authenticated'], [unverified, `${unverified}/${objectName}`, 'authenticated'], [null, `${a}/30000000-0000-4000-8000-000000000003.webp`, 'anon'], [a, `${a}/../${b}/bad.webp`, 'authenticated'], [a, `${a}/payload.svg`, 'authenticated']] as const) {
      await expect(asUser(caller, 'insert into storage.objects(bucket_id,name) values ($1,$2)', ['member-avatars', path], role)).rejects.toMatchObject({ code: '42501' })
    }
  })
  it('prevents overwriting/deleting images and limits listing even with broad pre-existing policies', async () => {
    expect((await asUser(b, 'select * from storage.objects where bucket_id = $1', ['member-avatars'])).rows).toEqual([])
    expect((await asUser(a, 'select * from storage.objects where bucket_id = $1', ['member-avatars'])).rows).toHaveLength(1)
    expect((await asUser(a, "update storage.objects set name = 'renamed.webp' where bucket_id = 'member-avatars' returning name")).rows).toEqual([])
    expect((await asUser(a, "delete from storage.objects where bucket_id = 'member-avatars' returning name")).rows).toEqual([])
    // Unrelated bucket access must remain unchanged, including for anonymous callers.
    await asUser(null, "insert into storage.objects(bucket_id,name) values ('unrelated','allowed-by-existing-policy')", [], 'anon')
    expect((await asUser(null, "select * from storage.objects where bucket_id = 'unrelated'", [], 'anon')).rows).toHaveLength(1)
  })
  it('keeps role records inaccessible and denies self-promotion', async () => {
    await expect(asUser(a, 'select * from public.user_roles')).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(a, 'insert into public.user_roles values ($1,$2)', [a, 'admin'])).rejects.toMatchObject({ code: '42501' })
    expect((await asUser(a, 'select public.current_app_role() as role')).rows).toEqual([{ role: 'member' }])
  })
})
