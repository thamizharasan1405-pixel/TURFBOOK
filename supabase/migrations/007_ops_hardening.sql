-- TURFBOOK V8: operations, walk-ins, refunds, audit hardening
create or replace function public.create_walkin_booking(p_customer_id uuid,p_turf_id uuid,p_booking_date date,p_start time,p_end time,p_amount numeric)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_owner uuid;
begin
 if not (public.is_admin() or public.has_role('STAFF') or public.has_role('OWNER')) then raise exception 'Role not allowed'; end if;
 select owner_id into v_owner from public.turfs where id=p_turf_id;
 if not (public.is_admin() or public.has_role('STAFF') or v_owner=auth.uid()) then raise exception 'Turf access denied'; end if;
 if exists(select 1 from public.bookings where turf_id=p_turf_id and booking_date=p_booking_date and start_time < p_end and end_time > p_start and booking_status in ('PENDING','CONFIRMED','RESCHEDULED')) then raise exception 'SLOT_UNAVAILABLE'; end if;
 if exists(select 1 from public.blocked_slots where turf_id=p_turf_id and booking_date=p_booking_date and start_time < p_end and end_time > p_start) then raise exception 'SLOT_BLOCKED'; end if;
 if exists(select 1 from public.maintenance_records where turf_id=p_turf_id and start_at < (p_booking_date+p_end) and end_at > (p_booking_date+p_start) and status='ACTIVE') then raise exception 'SLOT_MAINTENANCE'; end if;
 insert into public.bookings(customer_id,turf_id,booking_date,start_time,end_time,duration_minutes,base_price,final_amount,booking_status,payment_status) values(p_customer_id,p_turf_id,p_booking_date,p_start,p_end,extract(epoch from (p_end-p_start))/60,p_amount,p_amount,'CONFIRMED','SUCCESS') returning id into v_id;
 insert into public.payments(booking_id,amount,method,status,paid_at) values(v_id,p_amount,'PAY_AT_TURF','SUCCESS',now());
 insert into public.audit_logs(actor_id,action,entity,entity_id,new_value) values(auth.uid(),'WALK_IN_BOOKING','booking',v_id,jsonb_build_object('customer_id',p_customer_id,'turf_id',p_turf_id));
 return v_id;
end; $$;
revoke all on function public.create_walkin_booking(uuid,uuid,date,time,time,numeric) from public;
grant execute on function public.create_walkin_booking(uuid,uuid,date,time,time,numeric) to authenticated;

create index if not exists refunds_status_idx on public.refunds(status,requested_at);
create index if not exists maintenance_turf_time_idx on public.maintenance_records(turf_id,start_at,end_at,status);
create index if not exists audit_entity_idx on public.audit_logs(entity,entity_id,created_at);

alter table public.refunds enable row level security;
create policy "refund visibility" on public.refunds for select using(public.is_admin() or exists(select 1 from public.bookings b where b.id=refunds.booking_id and (b.customer_id=auth.uid() or exists(select 1 from public.turfs t where t.id=b.turf_id and t.owner_id=auth.uid()))));
create policy "customer refund request" on public.refunds for insert with check(exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=auth.uid()));
create policy "admin refund update" on public.refunds for update using(public.is_admin()) with check(public.is_admin());

alter table public.maintenance_records enable row level security;
create policy "maintenance owner/admin" on public.maintenance_records for all using(public.is_admin() or exists(select 1 from public.turfs t where t.id=turf_id and t.owner_id=auth.uid())) with check(public.is_admin() or exists(select 1 from public.turfs t where t.id=turf_id and t.owner_id=auth.uid()));

alter table public.blocked_slots enable row level security;
create policy "blocked owner/admin" on public.blocked_slots for all using(public.is_admin() or exists(select 1 from public.turfs t where t.id=turf_id and t.owner_id=auth.uid())) with check(public.is_admin() or exists(select 1 from public.turfs t where t.id=turf_id and t.owner_id=auth.uid()));

alter table public.audit_logs enable row level security;
create policy "audit insert authenticated" on public.audit_logs for insert with check(actor_id=auth.uid() or public.is_admin());
