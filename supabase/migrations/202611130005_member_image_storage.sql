-- Review/apply manually after 004. Requires the existing Supabase Storage schema.
-- Buckets are public because avatars/covers are public member profile images.
begin;

do $$ begin
  if not coalesce((select relrowsecurity from pg_class
    where oid = to_regclass('storage.objects')), false) then
    raise exception 'Supabase Storage objects must already have RLS enabled';
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('member-avatars', 'member-avatars', true, 2097152, array['image/webp']),
  ('member-covers', 'member-covers', true, 5242880, array['image/webp'])
on conflict (id) do nothing;
-- Refuse to silently change an existing bucket's visibility/limits/content types.
do $$ begin
  if (select count(*) from storage.buckets where
    public and allowed_mime_types = array['image/webp']::text[] and
    ((id = 'member-avatars' and file_size_limit = 2097152) or
     (id = 'member-covers' and file_size_limit = 5242880))) <> 2 then
    raise exception 'Existing member image buckets have unexpected settings; audit manually';
  end if;
end $$;

-- Policy helper is safe for anon too: it reveals only the caller's eligibility.
-- This avoids breaking unrelated anonymous Storage operations during policy checks.
create function public.can_upload_member_image()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u join public.profiles p on p.id = u.id
    where u.id = auth.uid() and u.email_confirmed_at is not null);
$$;
revoke all on function public.can_upload_member_image() from public;
grant execute on function public.can_upload_member_image() to anon, authenticated;

-- Public downloads use bucket visibility; object listing remains owner-only.
create policy member_media_select on storage.objects for select to authenticated
  using (bucket_id in ('member-avatars', 'member-covers') and
    split_part(name, '/', 1) = (select auth.uid())::text);
create policy member_media_select_guard on storage.objects as restrictive for select to public
  using (bucket_id not in ('member-avatars', 'member-covers') or
    split_part(name, '/', 1) = (select auth.uid())::text);

create policy member_media_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('member-avatars', 'member-covers') and
    split_part(name, '/', 1) = (select auth.uid())::text and
    name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$' and
    (select public.can_upload_member_image()));
-- Restrictive guards prevent unrelated permissive policies granting broader writes.
create policy member_media_insert_guard on storage.objects as restrictive for insert to public
  with check (bucket_id not in ('member-avatars', 'member-covers') or (
    split_part(name, '/', 1) = (select auth.uid())::text and
    name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$' and
    (select public.can_upload_member_image())));
create policy member_media_update_guard on storage.objects as restrictive for update to public
  using (bucket_id not in ('member-avatars', 'member-covers'))
  with check (bucket_id not in ('member-avatars', 'member-covers'));
create policy member_media_delete_guard on storage.objects as restrictive for delete to public
  using (bucket_id not in ('member-avatars', 'member-covers'));
-- Upload unique object names with upsert:false. Replacing a photo changes its URL;
-- old files are retained. No user data is deleted and no global Storage grants change.
commit;
