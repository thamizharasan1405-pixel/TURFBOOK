-- Owner registration is an application, not an automatic privilege escalation.
-- A newly registered owner starts as CUSTOMER and gets an owner profile marked PENDING.
-- Admin can promote the account to OWNER after verification.
create policy "user creates own owner application" on public.owner_profiles
for insert with check (user_id = auth.uid());
create policy "user views own owner application" on public.owner_profiles
for select using (user_id = auth.uid() or public.is_admin());
create policy "admin manages owner applications" on public.owner_profiles
for update using (public.is_admin()) with check (public.is_admin());
