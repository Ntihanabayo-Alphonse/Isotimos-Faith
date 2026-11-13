-- Review and apply manually AFTER 202611130001_app_roles.sql.
-- Intentionally fail if a profiles table already exists: audit/reconcile its schema
-- and policies instead of silently accepting or overwriting an unknown live table.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text not null default '',
  bio text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username is null or username ~ '^[a-z][a-z0-9_]{2,29}$'
  ),
  constraint profiles_display_name_length check (
    char_length(display_name) <= 100 and
    (username is null or char_length(btrim(display_name)) >= 1)
  ),
  constraint profiles_bio_length check (char_length(bio) <= 500),
  constraint profiles_avatar_url_format check (
    avatar_url is null or (char_length(avatar_url) <= 2048 and
      avatar_url ~ '^https://[^[:space:]]+$')
  )
);

-- PK and UNIQUE create indexes for owner lookup and username lookup/uniqueness.
-- NULL username is an unpublished profile awaiting onboarding; multiple NULLs are allowed.
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select (id, username, display_name, bio, avatar_url, created_at, updated_at)
  on public.profiles to anon, authenticated;
grant update (username, display_name, bio, avatar_url)
  on public.profiles to authenticated;
grant all on public.profiles to service_role;

create policy profiles_read on public.profiles for select to anon, authenticated
  using (username is not null or (select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
-- No client INSERT or DELETE grants/policies. Identity and timestamps are not editable.

create function public.set_profile_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.set_profile_updated_at() from public, anon, authenticated;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_profile_updated_at();

-- Caller-only, idempotent provisioning works for existing users and email-confirmed
-- new users. Does not depend on unauthenticated signup returning a session, accepts
-- no target ID or metadata, never modifies auth.users, and never touches roles.
create function public.ensure_my_profile()
returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := auth.uid();
  result public.profiles;
begin
  if caller_id is null or not exists (
    select 1 from auth.users where id = caller_id and email_confirmed_at is not null
  ) then
    raise exception 'A verified email session is required' using errcode = '42501';
  end if;

  insert into public.profiles (id) values (caller_id) on conflict (id) do nothing;
  select * into strict result from public.profiles where id = caller_id;
  return result;
end;
$$;
revoke all on function public.ensure_my_profile() from public, anon;
grant execute on function public.ensure_my_profile() to authenticated;

-- Preserve the existing rule: profile edits and user metadata never assign roles.
-- This migration does not change user_roles, its grants, or current_app_role().
commit;
