-- Apply using the Supabase SQL editor or CLI. This file does not run from the browser.
-- An absent role row means member. Only trusted server/database operators assign roles.
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'moderator', 'admin'))
);

alter table public.user_roles enable row level security;
revoke all on public.user_roles from public, anon, authenticated;
grant all on public.user_roles to service_role;

-- No client insert/update/delete policies or grants: no self-promotion.
-- Fixed search path and fully qualified names prevent search-path injection.
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then null
    else coalesce((select role from public.user_roles where user_id = auth.uid()), 'member')
  end;
$$;

revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

-- Future content policies must enforce ownership and/or current_app_role() in the
-- database. React route guards are UX controls, not a substitute for RLS.
