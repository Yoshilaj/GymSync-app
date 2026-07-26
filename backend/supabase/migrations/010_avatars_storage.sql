-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 010_avatars_storage.sql — profile-photo Storage bucket + policies.       ║
-- ║ Public bucket (avatar URLs viewable directly); each user may write only  ║
-- ║ inside their own {user_id}/ folder. Applied via the Management API;      ║
-- ║ kept here as the source of truth (idempotent).                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select to public using (bucket_id = 'avatars');

drop policy if exists avatars_write_own on storage.objects;
create policy avatars_write_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
