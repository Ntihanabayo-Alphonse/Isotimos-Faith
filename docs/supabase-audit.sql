-- READ ONLY. Run manually in Supabase SQL editor; no credentials or user data selected.
select to_regclass('public.profiles') as profiles,
       to_regclass('public.user_roles') as user_roles,
       to_regclass('public.follows') as follows,
       to_regclass('public.member_directory') as member_directory;

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in ('profiles', 'user_roles', 'follows', 'member_directory')
order by table_name, ordinal_position;

select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls, c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('profiles', 'user_roles', 'follows', 'member_directory');

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where (schemaname = 'public' and tablename in ('profiles', 'user_roles', 'follows'))
  or (schemaname = 'storage' and tablename = 'objects');

select table_name, grantee, privilege_type from information_schema.table_privileges
where table_schema = 'public' and table_name in ('profiles', 'user_roles', 'follows', 'member_directory');
select table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name in ('profiles', 'user_roles', 'follows', 'member_directory');

select p.oid::regprocedure as function_name, pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer, p.proconfig, p.proacl,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('current_app_role', 'ensure_my_profile', 'set_profile_updated_at', 'isotimos_profile_email_verified',
   'can_upload_member_image', 'discover_people');

select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename in ('profiles', 'user_roles', 'follows');
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid in (to_regclass('public.profiles'), to_regclass('public.user_roles'), to_regclass('public.follows'));

select id, name, public, file_size_limit, allowed_mime_types from storage.buckets
where id in ('member-avatars', 'member-covers');
select relrowsecurity as storage_rls_enabled from pg_class
where oid = to_regclass('storage.objects');

-- Check migration history separately if the schema exists:
select to_regclass('supabase_migrations.schema_migrations') as migration_history;
-- Then, if present: select version, name from supabase_migrations.schema_migrations order by version;
