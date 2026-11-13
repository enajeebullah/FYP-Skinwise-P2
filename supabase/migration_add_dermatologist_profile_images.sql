-- Public dermatologist profile images with admin-only Storage mutations.
-- Run after migration_add_consultations.sql, which defines public.is_admin().

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'dermatologist-profile-images',
  'dermatologist-profile-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can upload dermatologist profile images"
  on storage.objects;
create policy "Admins can upload dermatologist profile images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dermatologist-profile-images'
    and public.is_admin()
  );

drop policy if exists "Admins can update dermatologist profile images"
  on storage.objects;
create policy "Admins can update dermatologist profile images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'dermatologist-profile-images'
    and public.is_admin()
  )
  with check (
    bucket_id = 'dermatologist-profile-images'
    and public.is_admin()
  );

drop policy if exists "Admins can delete dermatologist profile images"
  on storage.objects;
create policy "Admins can delete dermatologist profile images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'dermatologist-profile-images'
    and public.is_admin()
  );
