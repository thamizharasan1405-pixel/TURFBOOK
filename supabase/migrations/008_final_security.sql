-- TURFBOOK final security hardening
-- Apply after 007_ops_hardening.sql

-- Explicit staff-to-turf assignment table. This keeps staff access scoped to assigned turfs.
create table if not exists public.staff_turfs (
  staff_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  turf_id uuid not null references public.turfs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id,turf_id)
);

alter table public.staff_turfs enable row level security;
drop policy if exists "staff turf visibility" on public.staff_turfs;
create policy "staff turf visibility" on public.staff_turfs for select using (
  staff_id=auth.uid() or public.is_admin() or exists (select 1 from public.staff_profiles sp where sp.user_id=staff_id and sp.owner_id=auth.uid())
);
drop policy if exists "owner/admin staff turf management" on public.staff_turfs;
create policy "owner/admin staff turf management" on public.staff_turfs for all using (
  public.is_admin() or exists (select 1 from public.staff_profiles sp join public.turfs t on t.owner_id=sp.owner_id where sp.user_id=staff_id and t.id=turf_id and sp.owner_id=auth.uid())
) with check (
  public.is_admin() or exists (select 1 from public.staff_profiles sp join public.turfs t on t.owner_id=sp.owner_id where sp.user_id=staff_id and t.id=turf_id and sp.owner_id=auth.uid())
);

create index if not exists staff_turfs_turf_idx on public.staff_turfs(turf_id);

-- Staff must be assigned to the turf before they can verify/change a booking QR.
create or replace function public.staff_can_access_booking(p_booking_id uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select public.is_admin() or exists (
    select 1
    from public.bookings b
    join public.staff_profiles sp on sp.user_id = auth.uid()
    where b.id = p_booking_id
      and sp.status = 'ACTIVE'
      and exists (select 1 from public.staff_turfs st where st.staff_id = sp.user_id and st.turf_id = b.turf_id)
  );
$$;

-- Replace QR status mutation with an explicit booking-access check.
create or replace function public.set_checkin_status(p_booking_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if p_status not in ('NOT_CHECKED_IN','CHECKED_IN','CHECKED_OUT') then
    raise exception 'INVALID_CHECKIN_STATUS';
  end if;
  if not public.staff_can_access_booking(p_booking_id) then
    raise exception 'STAFF_ACCESS_DENIED';
  end if;
  update public.booking_checkins
  set status=p_status,
      checked_by=auth.uid(),
      checked_in_at=case when p_status='CHECKED_IN' then coalesce(checked_in_at,now()) else checked_in_at end,
      checked_out_at=case when p_status='CHECKED_OUT' then coalesce(checked_out_at,now()) else checked_out_at end
  where booking_id=p_booking_id;
  if not found then raise exception 'CHECKIN_NOT_FOUND'; end if;
end;
$$;

grant execute on function public.set_checkin_status(uuid,text) to authenticated;
revoke execute on function public.set_checkin_status(uuid,text) from anon;

-- QR records are never directly writable by the browser.
alter table public.booking_checkins enable row level security;
drop policy if exists "booking checkin select" on public.booking_checkins;
drop policy if exists "booking checkin update" on public.booking_checkins;
create policy "booking checkin select" on public.booking_checkins
for select using (
  exists (select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid() or public.is_admin() or public.staff_can_access_booking(b.id)))
);

-- Only the controlled RPC creates/rotates tokens.
revoke insert, update, delete on public.booking_checkins from authenticated, anon;

-- Prevent duplicate gateway references / transaction IDs where supplied.
create unique index if not exists payments_gateway_reference_unique
on public.payments(gateway_reference) where gateway_reference is not null and gateway_reference <> '';
create unique index if not exists payments_transaction_id_unique
on public.payments(transaction_id) where transaction_id is not null and transaction_id <> '';

-- Common operational indexes.
create index if not exists bookings_customer_status_idx on public.bookings(customer_id,booking_status,booking_date desc);
create index if not exists bookings_turf_status_date_idx on public.bookings(turf_id,booking_status,booking_date,start_time);
create index if not exists reviews_turf_created_idx on public.reviews(turf_id,created_at desc);
create index if not exists favourites_customer_idx on public.favourites(user_id,created_at desc);

-- Make the audit trail append-only from the client side.
revoke update, delete on public.audit_logs from authenticated, anon;
