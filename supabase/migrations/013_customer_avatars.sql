insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('customer-avatars','customer-avatars',false,5242880,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update
set public=false,file_size_limit=5242880,
    allowed_mime_types=array['image/jpeg','image/png','image/webp','image/avif'];

drop policy if exists "customers read own avatar" on storage.objects;
create policy "customers read own avatar" on storage.objects
for select to authenticated using (
  bucket_id='customer-avatars' and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "customers upload own avatar" on storage.objects;
create policy "customers upload own avatar" on storage.objects
for insert to authenticated with check (
  bucket_id='customer-avatars' and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "customers update own avatar" on storage.objects;
create policy "customers update own avatar" on storage.objects
for update to authenticated using (
  bucket_id='customer-avatars' and (storage.foldername(name))[1]=auth.uid()::text
) with check (
  bucket_id='customer-avatars' and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "customers delete own avatar" on storage.objects;
create policy "customers delete own avatar" on storage.objects
for delete to authenticated using (
  bucket_id='customer-avatars' and (storage.foldername(name))[1]=auth.uid()::text
);
