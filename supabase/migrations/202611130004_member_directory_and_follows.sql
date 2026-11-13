-- Review/apply manually after profile recovery (003). Never rerun 003 after this.
begin;

do $$ begin
  if to_regclass('public.profiles') is null or
     to_regprocedure('public.isotimos_profile_email_verified()') is null then
    raise exception 'Review and apply profile recovery migration 003 first';
  end if;
end $$;

alter table public.profiles add column cover_url text;
alter table public.profiles add constraint profiles_cover_url_format check (
  cover_url is null or (char_length(cover_url) <= 2048 and
    cover_url ~ '^https://[^[:space:]]+$'));
grant select (cover_url) on public.profiles to anon, authenticated;
grant update (cover_url) on public.profiles to authenticated;

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);
create index follows_following_idx on public.follows (following_id, follower_id);
create index profiles_joined_idx on public.profiles (created_at desc, id)
  where username is not null;
create extension if not exists pg_trgm with schema extensions;
create index profiles_name_search_idx on public.profiles
  using gin (lower(display_name) extensions.gin_trgm_ops) where username is not null;
create index profiles_username_search_idx on public.profiles
  using gin (username extensions.gin_trgm_ops) where username is not null;

alter table public.follows enable row level security;
revoke all on public.follows from public, anon, authenticated;
grant select on public.follows to anon, authenticated;
grant insert (follower_id, following_id) on public.follows to authenticated;
grant delete on public.follows to authenticated;
grant all on public.follows to service_role;
-- Follow relationships, like completed member profiles, are public.
create policy follows_read on public.follows for select to anon, authenticated
  using (true);
create policy follows_insert_own on public.follows for insert to authenticated
  with check (
    follower_id = (select auth.uid()) and
    (select public.isotimos_profile_email_verified()) and
    exists (select 1 from public.profiles p where p.id = follower_id and p.username is not null) and
    exists (select 1 from public.profiles p where p.id = following_id and p.username is not null)
  );
create policy follows_delete_own on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()) and
    (select public.isotimos_profile_email_verified()));
-- No UPDATE grant/policy: a member cannot rewrite relationships or timestamps.

-- Security-invoker view preserves underlying RLS and exposes explicit public fields.
-- Counts are derived, not writable counters; no joins to auth.users or role data.
create view public.member_directory with (security_invoker = true) as
select p.id, p.username, p.display_name, p.bio, p.avatar_url, p.cover_url, p.created_at,
  (select count(*) from public.follows f where f.following_id = p.id) as follower_count,
  (select count(*) from public.follows f where f.follower_id = p.id) as following_count,
  exists (select 1 from public.follows f where f.follower_id = (select auth.uid())
    and f.following_id = p.id) as is_following
from public.profiles p where p.username is not null;
revoke all on public.member_directory from public, anon, authenticated;
grant select on public.member_directory to anon, authenticated;

create function public.discover_people(
  p_query text default '', p_filter text default 'suggested',
  p_limit integer default 24, p_offset integer default 0
)
returns setof public.member_directory
language plpgsql stable security invoker set search_path = '' as $$
declare pattern text;
begin
  if p_query is null or char_length(p_query) > 80 or
     p_filter is null or p_filter not in ('suggested', 'popular', 'new', 'following') or
     p_limit is null or p_limit not between 1 and 48 or
     p_offset is null or p_offset not between 0 and 10000 then
    raise exception 'Invalid directory search or pagination' using errcode = '22023';
  end if;
  -- Treat %, _, and backslashes as literal search text, not LIKE operators.
  pattern := '%' || replace(replace(replace(lower(btrim(p_query)),
    chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
  return query select m.* from public.member_directory m
    where m.id <> (select auth.uid())
      and (lower(m.display_name) like pattern or m.username like pattern)
      and (p_filter <> 'following' or m.is_following)
      and (p_filter <> 'suggested' or not m.is_following)
    order by case when p_filter = 'popular' then m.follower_count end desc nulls last,
      m.created_at desc, m.id
    limit p_limit offset p_offset;
end;
$$;
revoke all on function public.discover_people(text, text, integer, integer) from public, anon;
grant execute on function public.discover_people(text, text, integer, integer) to authenticated;

-- Existing ensure_my_profile() returns the profiles composite, including cover_url.
-- No changes to its verified caller check, profile ownership, or role authorization.
notify pgrst, 'reload schema';
commit;
