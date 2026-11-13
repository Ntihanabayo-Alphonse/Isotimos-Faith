-- Manual recovery for a confirmed missing public.profiles table.
-- Also supports the normal 001 -> 002 -> 003 migration sequence without recreating it.
-- Does not alter auth.users, user_roles, or current_app_role().
begin;

do $$
begin
  if to_regclass('public.profiles') is null then
    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      username text unique,
      display_name text not null default '',
      bio text not null default '',
      avatar_url text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint profiles_username_format check (
        username is null or username ~ '^[a-z][a-z0-9_]{2,29}$'),
      constraint profiles_display_name_length check (
        char_length(display_name) <= 100 and
        (username is null or char_length(btrim(display_name)) >= 1)),
      constraint profiles_bio_length check (char_length(bio) <= 500),
      constraint profiles_avatar_url_format check (
        avatar_url is null or (char_length(avatar_url) <= 2048 and
          avatar_url ~ '^https://[^[:space:]]+$'))
    );
  end if;

  -- Refuse schema/policy drift rather than overwrite an unknown existing table.
  if (select array_agg(column_name::text || ':' || udt_name || ':' || is_nullable
                       order by ordinal_position)
      from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles')
     is distinct from array['id:uuid:NO', 'username:text:YES', 'display_name:text:NO',
       'bio:text:NO', 'avatar_url:text:YES', 'created_at:timestamptz:NO',
       'updated_at:timestamptz:NO']::text[]
     or (select count(*) from pg_constraint
         where conrelid = 'public.profiles'::regclass and convalidated and conname in
           ('profiles_pkey', 'profiles_id_fkey', 'profiles_username_key',
            'profiles_username_format', 'profiles_display_name_length',
            'profiles_bio_length', 'profiles_avatar_url_format')) <> 7
     or exists (select 1 from pg_policies where schemaname = 'public'
       and tablename = 'profiles' and policyname not in
         ('profiles_read', 'profiles_update_own', 'profiles_insert_own')) then
    raise exception 'Unexpected profiles schema or policies; audit and reconcile manually';
  end if;
end;
$$;

alter table public.profiles enable row level security;
-- Revoke both table AND column grants; table revocation alone leaves column grants.
revoke all on public.profiles from public, anon, authenticated;
revoke all (id, username, display_name, bio, avatar_url, created_at, updated_at)
  on public.profiles from public, anon, authenticated;
grant select (id, username, display_name, bio, avatar_url, created_at, updated_at)
  on public.profiles to anon, authenticated;
grant insert (id) on public.profiles to authenticated;
grant update (username, display_name, bio, avatar_url)
  on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Reads trusted Auth state, not editable user metadata. Returns only caller status.
create or replace function public.isotimos_profile_email_verified()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users
    where id = auth.uid() and email_confirmed_at is not null);
$$;
revoke all on function public.isotimos_profile_email_verified() from public, anon;
grant execute on function public.isotimos_profile_email_verified() to authenticated;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to anon, authenticated
  using (username is not null or (select auth.uid()) = id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id and
    (select public.isotimos_profile_email_verified()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id and
    (select public.isotimos_profile_email_verified()))
  with check ((select auth.uid()) = id and
    (select public.isotimos_profile_email_verified()));
-- INSERT can supply only the caller's ID. No client DELETE or timestamp/ID updates.

create or replace function public.set_profile_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.set_profile_updated_at() from public, anon, authenticated;
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_profile_updated_at();

-- No target ID, role, username, or metadata parameters; safe on retries/concurrency.
create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := auth.uid();
  result public.profiles;
begin
  if not public.isotimos_profile_email_verified() then
    raise exception 'A verified email session is required' using errcode = '42501';
  end if;
  insert into public.profiles (id) values (caller_id) on conflict (id) do nothing;
  select * into strict result from public.profiles where id = caller_id;
  return result;
end;
$$;
revoke all on function public.ensure_my_profile() from public, anon;
grant execute on function public.ensure_my_profile() to authenticated;

-- Operator-run backfill: blank names and NULL usernames cannot collide. Preserve
-- existing edits. Unconfirmed accounts are provisioned after verification/sign-in.
insert into public.profiles (id)
select id from auth.users where email_confirmed_at is not null
on conflict (id) do nothing;

notify pgrst, 'reload schema';
commit;
