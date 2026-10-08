create or replace function public.reschedule_customer_booking(
  p_booking_id uuid,p_lock_id uuid,p_coupon_code text default null
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_booking public.bookings%rowtype;
  v_slot public.slot_templates%rowtype;
  v_coupon_result jsonb;
  v_coupon_id uuid;
  v_discount numeric:=0;
  v_target_date date;
begin
  if auth.uid() is null or not public.has_role('CUSTOMER') then
    raise exception 'CUSTOMER_ROLE_REQUIRED';
  end if;

  select * into v_booking from public.bookings
  where id=p_booking_id and customer_id=auth.uid() for update;
  if not found then raise exception 'BOOKING_NOT_FOUND_OR_FORBIDDEN'; end if;
  if v_booking.booking_status not in ('PENDING','CONFIRMED','RESCHEDULED') then
    raise exception 'BOOKING_NOT_RESCHEDULABLE';
  end if;
  if (v_booking.booking_date+v_booking.start_time)<=now() then
    raise exception 'BOOKING_ALREADY_STARTED';
  end if;
  if v_booking.payment_status in ('SUCCESS','PARTIALLY_REFUNDED') then
    raise exception 'PAYMENT_ALREADY_SETTLED_CONTACT_SUPPORT';
  end if;

  select booking_date into v_target_date from public.booking_slot_locks
  where id=p_lock_id and locked_by=auth.uid() and turf_id=v_booking.turf_id
    and expires_at>now();
  if not found then raise exception 'SLOT_LOCK_EXPIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_booking.turf_id::text||v_target_date::text,0));

  select s.* into v_slot from public.booking_slot_locks l
  join public.slot_templates s on s.turf_id=l.turf_id
    and s.start_time=l.start_time and s.end_time=l.end_time and s.active=true
  where l.id=p_lock_id and l.locked_by=auth.uid() and l.turf_id=v_booking.turf_id
    and l.booking_date=v_target_date and l.expires_at>now()
  for update of l;
  if not found then raise exception 'SLOT_LOCK_EXPIRED'; end if;

  if exists(select 1 from public.bookings b
    where b.id<>v_booking.id and b.turf_id=v_booking.turf_id
      and b.booking_date=v_target_date
      and b.booking_status in ('PENDING','CONFIRMED','RESCHEDULED')
      and b.start_time<v_slot.end_time and b.end_time>v_slot.start_time
  ) then raise exception 'SLOT_UNAVAILABLE'; end if;
  if exists(select 1 from public.blocked_slots b
      where b.turf_id=v_booking.turf_id and b.booking_date=v_target_date
        and b.start_time<v_slot.end_time and b.end_time>v_slot.start_time
    ) or exists(select 1 from public.maintenance_records m
      where m.turf_id=v_booking.turf_id and m.status='ACTIVE'
        and m.start_at<(v_target_date+v_slot.end_time)
        and m.end_at>(v_target_date+v_slot.start_time)
  ) then raise exception 'SLOT_BLOCKED'; end if;

  delete from public.coupon_usages where booking_id=v_booking.id;
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

  update public.bookings set sport_id=v_slot.sport_id,
    booking_date=v_target_date,start_time=v_slot.start_time,end_time=v_slot.end_time,
    duration_minutes=extract(epoch from (v_slot.end_time-v_slot.start_time))/60,
    base_price=v_slot.price,discount=v_discount,tax=0,
    final_amount=greatest(0,v_slot.price-v_discount),coupon_id=v_coupon_id,
    booking_status='RESCHEDULED',updated_at=now()
  where id=v_booking.id;
  if v_coupon_id is not null then
    insert into public.coupon_usages(coupon_id,user_id,booking_id,discount_amount)
    values(v_coupon_id,auth.uid(),v_booking.id,v_discount);
  end if;
  update public.payments set amount=greatest(0,v_slot.price-v_discount)
  where booking_id=v_booking.id and status='PENDING';
  delete from public.booking_checkins where booking_id=v_booking.id;
  delete from public.booking_slot_locks where id=p_lock_id;
  insert into public.notifications(user_id,type,title,message)
  values(auth.uid(),'BOOKING_RESCHEDULED','Booking rescheduled',
    'Your turf booking was moved to the newly selected date and time.');
end;
$$;

revoke all on function public.reschedule_customer_booking(uuid,uuid,text) from public;
grant execute on function public.reschedule_customer_booking(uuid,uuid,text) to authenticated;

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
  if v_status not in ('CONFIRMED','COMPLETED','RESCHEDULED') then
    raise exception 'BOOKING_NOT_CONFIRMED';
  end if;
  if v_status='RESCHEDULED' and not exists(
    select 1 from public.payments where booking_id=p_booking_id and method='PAY_AT_TURF'
  ) then raise exception 'BOOKING_NOT_CONFIRMED'; end if;

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

create or replace function public.verify_booking_qr(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_hash text;
  v_booking record;
  v_valid boolean;
begin
  v_hash:=encode(digest(p_token,'sha256'),'hex');
  select bc.status,b.id,b.booking_date,b.start_time,b.end_time,b.final_amount,
    b.booking_status,t.name as turf_name
  into v_booking
  from public.booking_checkins bc
  join public.bookings b on b.id=bc.booking_id
  join public.turfs t on t.id=b.turf_id
  where bc.token_hash=v_hash
  limit 1;
  if not found then return jsonb_build_object('valid',false,'message','Invalid QR code'); end if;

  v_valid:=v_booking.booking_status in ('CONFIRMED','COMPLETED')
    or (v_booking.booking_status='RESCHEDULED' and exists(
      select 1 from public.payments p where p.booking_id=v_booking.id and p.method='PAY_AT_TURF'
    ));
  return jsonb_build_object('valid',v_valid,'booking_id',v_booking.id,'status',v_booking.status,
    'booking_date',v_booking.booking_date,'start_time',v_booking.start_time,
    'end_time',v_booking.end_time,'amount',v_booking.final_amount,'turf_name',v_booking.turf_name);
end;
$$;

revoke all on function public.verify_booking_qr(text) from public;
grant execute on function public.verify_booking_qr(text) to anon,authenticated;
