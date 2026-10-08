-- TURFBOOK: public discovery access for sports/facilities used by the customer Explore flow.
-- Safe to run after 008_final_security.sql.

alter table public.sports enable row level security;
alter table public.facilities enable row level security;
alter table public.turf_sports enable row level security;
alter table public.turf_facilities enable row level security;

drop policy if exists "public active sports" on public.sports;
create policy "public active sports" on public.sports
for select using (active = true);

drop policy if exists "public facilities" on public.facilities;
create policy "public facilities" on public.facilities
for select using (true);

drop policy if exists "public turf sports" on public.turf_sports;
create policy "public turf sports" on public.turf_sports
for select using (
  exists (
    select 1 from public.turfs t
    where t.id = turf_sports.turf_id
      and t.status = 'ACTIVE'
      and t.approval_status = 'APPROVED'
  )
);

drop policy if exists "public turf facilities" on public.turf_facilities;
create policy "public turf facilities" on public.turf_facilities
for select using (
  exists (
    select 1 from public.turfs t
    where t.id = turf_facilities.turf_id
      and t.status = 'ACTIVE'
      and t.approval_status = 'APPROVED'
  )
);
