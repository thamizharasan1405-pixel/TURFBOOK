-- TURFBOOK 003: date-aware availability + slot management
create or replace function public.get_available_slots(p_turf_id uuid, p_booking_date date)
returns table(id uuid, sport_id uuid, start_time time, end_time time, price numeric)
language sql security definer set search_path=public
as $$
  select s.id,s.sport_id,s.start_time,s.end_time,s.price
  from slot_templates s
  where s.turf_id=p_turf_id and s.active=true
    and not exists (
      select 1 from bookings b
      where b.turf_id=p_turf_id and b.booking_date=p_booking_date
        and b.booking_status in ('PENDING','CONFIRMED','RESCHEDULED')
        and b.start_time < s.end_time and b.end_time > s.start_time
    )
    and not exists (
      select 1 from blocked_slots x
      where x.turf_id=p_turf_id and x.booking_date=p_booking_date
        and x.start_time < s.end_time and x.end_time > s.start_time
    )
    and not exists (
      select 1 from maintenance_records m
      where m.turf_id=p_turf_id and m.status='ACTIVE'
        and m.start_at < (p_booking_date + s.end_time)
        and m.end_at > (p_booking_date + s.start_time)
    )
  order by s.start_time;
$$;

grant execute on function public.get_available_slots(uuid,date) to anon, authenticated;

create index if not exists idx_slot_templates_turf_active on slot_templates(turf_id,active,start_time);
create index if not exists idx_bookings_turf_date_time on bookings(turf_id,booking_date,start_time,end_time);
create index if not exists idx_blocked_slots_turf_date on blocked_slots(turf_id,booking_date,start_time,end_time);

alter table public.slot_templates enable row level security;
create policy "public active slot templates" on public.slot_templates for select using(active=true);
create policy "owner manages slot templates" on public.slot_templates for all
using(public.is_admin() or exists(select 1 from turfs t where t.id=slot_templates.turf_id and t.owner_id=auth.uid()))
with check(public.is_admin() or exists(select 1 from turfs t where t.id=slot_templates.turf_id and t.owner_id=auth.uid()));

alter table public.blocked_slots enable row level security;
create policy "owner manages blocked slots" on public.blocked_slots for all
using(public.is_admin() or exists(select 1 from turfs t where t.id=blocked_slots.turf_id and t.owner_id=auth.uid()))
with check(public.is_admin() or exists(select 1 from turfs t where t.id=blocked_slots.turf_id and t.owner_id=auth.uid()));
