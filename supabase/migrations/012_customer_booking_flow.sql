create or replace function public.get_slot_states(p_turf_id uuid,p_booking_date date)
returns table(id uuid,sport_id uuid,start_time time,end_time time,price numeric,status text)
language sql
security definer
set search_path=public
as $$
  select s.id,s.sport_id,s.start_time,s.end_time,s.price,
    case
      when exists (
        select 1 from public.bookings b
        where b.turf_id=p_turf_id and b.booking_date=p_booking_date
          and b.booking_status in ('PENDING','CONFIRMED','RESCHEDULED')
          and b.start_time<s.end_time and b.end_time>s.start_time
      ) then 'BOOKED'
      when exists (
        select 1 from public.blocked_slots b
        where b.turf_id=p_turf_id and b.booking_date=p_booking_date
          and b.start_time<s.end_time and b.end_time>s.start_time
      ) or exists (
        select 1 from public.maintenance_records m
        where m.turf_id=p_turf_id and m.status='ACTIVE'
          and m.start_at<(p_booking_date+s.end_time)
          and m.end_at>(p_booking_date+s.start_time)
      ) then 'BLOCKED'
      when exists (
        select 1 from public.booking_slot_locks l
        where l.turf_id=p_turf_id and l.booking_date=p_booking_date
          and l.expires_at>now()
          and l.start_time<s.end_time and l.end_time>s.start_time
      ) then 'TEMPORARILY_LOCKED'
      else 'AVAILABLE'
    end
  from public.slot_templates s
  where s.turf_id=p_turf_id and s.active=true
  order by s.start_time;
$$;

revoke all on function public.get_slot_states(uuid,date) from public;
grant execute on function public.get_slot_states(uuid,date) to anon,authenticated;

create or replace function public.lock_booking_slot(
  p_turf_id uuid,p_booking_date date,p_slot_id uuid
) returns table(lock_id uuid,expires_at timestamptz)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_slot public.slot_templates%rowtype;
  v_lock_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.has_role('CUSTOMER') then raise exception 'CUSTOMER_ROLE_REQUIRED'; end if;
  if p_booking_date<current_date then raise exception 'DATE_IN_PAST'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_turf_id::text||p_booking_date::text,0));
  delete from public.booking_slot_locks where expires_at<=now();

  select * into v_slot from public.slot_templates
  where id=p_slot_id and turf_id=p_turf_id and active=true
  for share;
  if not found then raise exception 'SLOT_NOT_FOUND'; end if;

  if exists(select 1 from public.bookings b
    where b.turf_id=p_turf_id and b.booking_date=p_booking_date
      and b.booking_status in ('PENDING','CONFIRMED','RESCHEDULED')
      and b.start_time<v_slot.end_time and b.end_time>v_slot.start_time
  ) then raise exception 'SLOT_UNAVAILABLE'; end if;

  if exists(select 1 from public.blocked_slots b
      where b.turf_id=p_turf_id and b.booking_date=p_booking_date
        and b.start_time<v_slot.end_time and b.end_time>v_slot.start_time
    ) or exists(select 1 from public.maintenance_records m
      where m.turf_id=p_turf_id and m.status='ACTIVE'
        and m.start_at<(p_booking_date+v_slot.end_time)
        and m.end_at>(p_booking_date+v_slot.start_time)
  ) then raise exception 'SLOT_BLOCKED'; end if;

  if exists(select 1 from public.booking_slot_locks l
    where l.turf_id=p_turf_id and l.booking_date=p_booking_date
      and l.locked_by<>auth.uid()
      and l.start_time<v_slot.end_time and l.end_time>v_slot.start_time
  ) then raise exception 'SLOT_TEMPORARILY_LOCKED'; end if;

  delete from public.booking_slot_locks l
  where l.turf_id=p_turf_id and l.booking_date=p_booking_date
    and l.locked_by=auth.uid()
    and l.start_time<v_slot.end_time and l.end_time>v_slot.start_time;

  v_expires_at:=now()+interval '10 minutes';
  insert into public.booking_slot_locks(turf_id,booking_date,start_time,end_time,locked_by,expires_at)
  values(p_turf_id,p_booking_date,v_slot.start_time,v_slot.end_time,auth.uid(),v_expires_at)
  returning id into v_lock_id;
  return query select v_lock_id,v_expires_at;
end;
$$;

revoke all on function public.lock_booking_slot(uuid,date,uuid) from public;
grant execute on function public.lock_booking_slot(uuid,date,uuid) to authenticated;

create or replace function public.release_booking_slot(p_lock_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  delete from public.booking_slot_locks where id=p_lock_id and locked_by=auth.uid();
end;
$$;

revoke all on function public.release_booking_slot(uuid) from public;
grant execute on function public.release_booking_slot(uuid) to authenticated;

alter table public.booking_slot_locks enable row level security;
revoke all on public.booking_slot_locks from anon,authenticated;

drop function if exists public.create_booking_atomic(uuid,uuid,date,time,time,integer,numeric);
create function public.create_booking_atomic(
  p_turf_id uuid,p_sport_id uuid,p_booking_date date,p_start time,p_end time,
  p_duration integer,p_amount numeric,p_lock_id uuid,p_coupon_code text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_slot public.slot_templates%rowtype;
  v_coupon_result jsonb;
  v_coupon_id uuid;
  v_discount numeric:=0;
  v_booking_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.has_role('CUSTOMER') then raise exception 'CUSTOMER_ROLE_REQUIRED'; end if;
  if not public.has_role('CUSTOMER') then raise exception 'CUSTOMER_ROLE_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_turf_id::text||p_booking_date::text,0));

  select s.* into v_slot from public.booking_slot_locks l
  join public.slot_templates s on s.turf_id=l.turf_id
    and s.start_time=l.start_time and s.end_time=l.end_time and s.active=true
  where l.id=p_lock_id and l.locked_by=auth.uid() and l.turf_id=p_turf_id
    and l.booking_date=p_booking_date and l.start_time=p_start and l.end_time=p_end
    and l.expires_at>now()
  for update of l;
  if not found then raise exception 'SLOT_LOCK_EXPIRED'; end if;
  if v_slot.sport_id is distinct from p_sport_id then raise exception 'SPORT_MISMATCH'; end if;
  if p_duration<>extract(epoch from (p_end-p_start))/60 then raise exception 'INVALID_DURATION'; end if;
  if exists(select 1 from public.bookings b
    where b.turf_id=p_turf_id and b.booking_date=p_booking_date
      and b.booking_status in ('PENDING','CONFIRMED','RESCHEDULED')
      and b.start_time<p_end and b.end_time>p_start
  ) then raise exception 'SLOT_UNAVAILABLE'; end if;
  if exists(select 1 from public.blocked_slots b
      where b.turf_id=p_turf_id and b.booking_date=p_booking_date
        and b.start_time<p_end and b.end_time>p_start
    ) or exists(select 1 from public.maintenance_records m
      where m.turf_id=p_turf_id and m.status='ACTIVE'
        and m.start_at<(p_booking_date+p_end) and m.end_at>(p_booking_date+p_start)
  ) then raise exception 'SLOT_BLOCKED'; end if;

  if p_coupon_code is not null and btrim(p_coupon_code)<>'' then
    v_coupon_result:=public.validate_coupon(p_coupon_code,v_slot.price);
    if coalesce((v_coupon_result->>'valid')::boolean,false)=false then
      raise exception '%',coalesce(v_coupon_result->>'message','COUPON_INVALID');
    end if;
    v_coupon_id:=(v_coupon_result->>'coupon_id')::uuid;
    v_discount:=coalesce((v_coupon_result->>'discount')::numeric,0);
    perform 1 from public.coupons where id=v_coupon_id for update;
    if exists(select 1 from public.coupons c where c.id=v_coupon_id and c.usage_limit is not null
      and (select count(*) from public.coupon_usages u where u.coupon_id=c.id)>=c.usage_limit
    ) then raise exception 'COUPON_USAGE_LIMIT_REACHED'; end if;
  end if;

  insert into public.bookings(customer_id,turf_id,sport_id,booking_date,start_time,end_time,
    duration_minutes,base_price,discount,tax,final_amount,coupon_id,booking_status,payment_status)
  values(auth.uid(),p_turf_id,v_slot.sport_id,p_booking_date,v_slot.start_time,v_slot.end_time,
    p_duration,v_slot.price,v_discount,0,greatest(0,v_slot.price-v_discount),v_coupon_id,'PENDING','PENDING')
  returning id into v_booking_id;

  if v_coupon_id is not null then
    insert into public.coupon_usages(coupon_id,user_id,booking_id,discount_amount)
    values(v_coupon_id,auth.uid(),v_booking_id,v_discount);
  end if;
  delete from public.booking_slot_locks where id=p_lock_id;
  return v_booking_id;
end;
$$;

revoke all on function public.create_booking_atomic(uuid,uuid,date,time,time,integer,numeric,uuid,text) from public;
grant execute on function public.create_booking_atomic(uuid,uuid,date,time,time,integer,numeric,uuid,text) to authenticated;

create or replace function public.create_payment_for_booking(
  p_booking_id uuid,p_method public.payment_method
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_customer uuid;
  v_amount numeric;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_method<>'PAY_AT_TURF' then
    raise exception 'PAYMENT_GATEWAY_NOT_CONFIGURED: Online card, UPI and net-banking payments are unavailable until a payment gateway is configured.';
  end if;

  select customer_id,final_amount into v_customer,v_amount
  from public.bookings where id=p_booking_id for update;
  if v_customer is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_customer<>auth.uid() and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if exists(select 1 from public.payments where booking_id=p_booking_id) then
    select id into v_id from public.payments where booking_id=p_booking_id;
    return v_id;
  end if;

  insert into public.payments(booking_id,amount,method,status)
  values(p_booking_id,v_amount,p_method,'PENDING')
  returning id into v_id;
  update public.bookings set payment_status='PENDING',booking_status='CONFIRMED',updated_at=now()
  where id=p_booking_id;
  insert into public.notifications(user_id,type,title,message)
  values(v_customer,'BOOKING_CONFIRMED','Booking confirmed','Your booking is confirmed. Payment is due at the turf.');
  return v_id;
end;
$$;

revoke all on function public.create_payment_for_booking(uuid,public.payment_method) from public;
grant execute on function public.create_payment_for_booking(uuid,public.payment_method) to authenticated;

create or replace function public.issue_booking_qr(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_token text;
  v_hash text;
  v_status public.booking_status;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select booking_status into v_status from public.bookings
  where id=p_booking_id and customer_id=auth.uid();
  if not found then raise exception 'BOOKING_NOT_FOUND_OR_FORBIDDEN'; end if;
  if v_status not in ('CONFIRMED','COMPLETED') then raise exception 'BOOKING_NOT_CONFIRMED'; end if;
  v_token:=encode(gen_random_bytes(24),'hex');
  v_hash:=encode(digest(v_token,'sha256'),'hex');
  insert into public.booking_checkins(booking_id,token_hash)
  values(p_booking_id,v_hash)
  on conflict(booking_id) do update set token_hash=excluded.token_hash,
    status='NOT_CHECKED_IN',checked_in_at=null,checked_out_at=null;
  return v_token;
end;
$$;

revoke all on function public.issue_booking_qr(uuid) from public;
grant execute on function public.issue_booking_qr(uuid) to authenticated;

drop policy if exists "reviews customer create" on public.reviews;
drop policy if exists "reviews customer update" on public.reviews;
drop policy if exists "customer reviews" on public.reviews;
create policy "reviews completed booking create" on public.reviews
for insert with check (
  customer_id=auth.uid() and exists (
    select 1 from public.bookings b where b.id=booking_id and b.turf_id=reviews.turf_id
      and b.customer_id=auth.uid() and b.booking_status='COMPLETED'
  )
);
create policy "reviews completed booking update" on public.reviews
for update using (
  customer_id=auth.uid() and exists (
    select 1 from public.bookings b where b.id=booking_id and b.customer_id=auth.uid()
      and b.booking_status='COMPLETED'
  )
) with check (
  customer_id=auth.uid() and exists (
    select 1 from public.bookings b where b.id=booking_id and b.turf_id=reviews.turf_id
      and b.customer_id=auth.uid() and b.booking_status='COMPLETED'
  )
);

drop index if exists public.favourites_customer_idx;
create index if not exists favourites_user_created_idx
on public.favourites(user_id,created_at desc);
