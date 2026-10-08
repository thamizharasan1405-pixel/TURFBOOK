alter table public.payments
  drop constraint if exists payments_booking_id_key;

create index if not exists payments_booking_created_idx
on public.payments(booking_id,created_at desc);

create or replace function public.record_razorpay_order(
  p_booking_id uuid,p_method public.payment_method,p_order_id text,p_amount_paise bigint
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_booking public.bookings%rowtype;
  v_payment_id uuid;
begin
  if p_method not in ('UPI','CARD','NET_BANKING') then raise exception 'ONLINE_METHOD_INVALID'; end if;
  if p_order_id is null or length(p_order_id)>100 then raise exception 'RAZORPAY_ORDER_INVALID'; end if;
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.booking_status not in ('PENDING','RESCHEDULED') then raise exception 'BOOKING_NOT_PAYABLE'; end if;
  if v_booking.payment_status not in ('PENDING','PROCESSING') then raise exception 'BOOKING_NOT_PAYABLE'; end if;
  if round(v_booking.final_amount*100)::bigint<>p_amount_paise then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
  if exists(select 1 from public.payments where booking_id=p_booking_id and status='SUCCESS') then
    raise exception 'BOOKING_ALREADY_PAID';
  end if;
  if exists(select 1 from public.payments where booking_id=p_booking_id and status='PROCESSING') then
    raise exception 'PAYMENT_ATTEMPT_IN_PROGRESS';
  end if;

  insert into public.payments(booking_id,amount,method,status,gateway_reference)
  values(p_booking_id,v_booking.final_amount,p_method,'PROCESSING',p_order_id)
  returning id into v_payment_id;
  update public.bookings set payment_status='PROCESSING',updated_at=now()
  where id=p_booking_id;
  return v_payment_id;
end;
$$;

revoke all on function public.record_razorpay_order(uuid,public.payment_method,text,bigint) from public;
grant execute on function public.record_razorpay_order(uuid,public.payment_method,text,bigint) to service_role;

create or replace function public.settle_razorpay_payment(
  p_order_id text,p_payment_id text,p_amount_paise bigint,p_method public.payment_method
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_booking_id uuid;
begin
  if p_method not in ('UPI','CARD','NET_BANKING') then raise exception 'ONLINE_METHOD_INVALID'; end if;
  select booking_id into v_booking_id
  from public.payments where gateway_reference=p_order_id;
  if not found then raise exception 'PAYMENT_ORDER_NOT_FOUND'; end if;
  select * into v_booking from public.bookings where id=v_booking_id for update;
  select * into v_payment from public.payments
  where gateway_reference=p_order_id for update;
  if v_payment.status='SUCCESS' then
    if v_payment.transaction_id=p_payment_id then return; end if;
    raise exception 'PAYMENT_ALREADY_SETTLED';
  end if;
  if v_payment.status<>'PROCESSING' then raise exception 'PAYMENT_ATTEMPT_NOT_ACTIVE'; end if;
  if round(v_payment.amount*100)::bigint<>p_amount_paise
    or round(v_booking.final_amount*100)::bigint<>p_amount_paise then
    raise exception 'PAYMENT_AMOUNT_MISMATCH';
  end if;
  if v_booking.booking_status not in ('PENDING','RESCHEDULED') then raise exception 'BOOKING_NOT_PAYABLE'; end if;
  update public.payments set status='SUCCESS',transaction_id=p_payment_id,paid_at=now(),method=p_method
  where id=v_payment.id;
  update public.bookings set payment_status='SUCCESS',
    booking_status=case when v_booking.booking_status='RESCHEDULED'
      then 'RESCHEDULED'::public.booking_status else 'CONFIRMED'::public.booking_status end,
    updated_at=now()
  where id=v_booking.id;
  insert into public.notifications(user_id,type,title,message)
  values(v_booking.customer_id,'PAYMENT_SUCCESS','Payment confirmed',
    'Your online payment was verified and your booking is confirmed.');
end;
$$;

revoke all on function public.settle_razorpay_payment(text,text,bigint,public.payment_method) from public;
grant execute on function public.settle_razorpay_payment(text,text,bigint,public.payment_method) to service_role;

create or replace function public.fail_razorpay_payment(p_order_id text,p_payment_id text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_booking_id uuid;
begin
  select booking_id into v_booking_id
  from public.payments where gateway_reference=p_order_id;
  if not found then raise exception 'PAYMENT_ORDER_NOT_FOUND'; end if;
  select * into v_booking from public.bookings where id=v_booking_id for update;
  select * into v_payment from public.payments
  where gateway_reference=p_order_id for update;
  if v_payment.status='SUCCESS' then return; end if;
  if v_payment.status='FAILED' then return; end if;
  if v_payment.status<>'PROCESSING' then raise exception 'PAYMENT_ATTEMPT_NOT_ACTIVE'; end if;
  update public.payments set status='FAILED',transaction_id=p_payment_id
  where id=v_payment.id;
  if not exists(select 1 from public.payments where booking_id=v_booking.id and status in ('PROCESSING','SUCCESS')) then
    update public.bookings set payment_status='PENDING',updated_at=now()
    where id=v_booking.id and payment_status='PROCESSING';
  end if;
end;
$$;

revoke all on function public.fail_razorpay_payment(text,text) from public;
grant execute on function public.fail_razorpay_payment(text,text) to service_role;

create or replace function public.block_booking_change_during_payment()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if old.payment_status='PROCESSING' and (
    new.booking_date is distinct from old.booking_date
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time
    or new.base_price is distinct from old.base_price
    or new.final_amount is distinct from old.final_amount
  ) then
    raise exception 'PAYMENT_IN_PROGRESS: Booking cannot be changed while payment is being processed.';
  end if;
  return new;
end;
$$;

drop trigger if exists block_booking_change_during_payment on public.bookings;
create trigger block_booking_change_during_payment
before update on public.bookings
for each row execute function public.block_booking_change_during_payment();

create or replace function public.create_payment_for_booking(
  p_booking_id uuid,p_method public.payment_method
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_booking public.bookings%rowtype;
  v_payment_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_method<>'PAY_AT_TURF' then
    raise exception 'Use the configured payment provider for online payments.';
  end if;
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.customer_id<>auth.uid() and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_booking.booking_status not in ('PENDING','RESCHEDULED') then raise exception 'BOOKING_NOT_PAYABLE'; end if;
  if exists(select 1 from public.payments where booking_id=p_booking_id and status='SUCCESS') then
    raise exception 'BOOKING_ALREADY_PAID';
  end if;
  if exists(select 1 from public.payments where booking_id=p_booking_id and status='PROCESSING') then
    raise exception 'PAYMENT_ATTEMPT_IN_PROGRESS';
  end if;

  select id into v_payment_id from public.payments
  where booking_id=p_booking_id and method='PAY_AT_TURF' and status='PENDING'
  order by created_at desc limit 1;
  if found then return v_payment_id; end if;
  insert into public.payments(booking_id,amount,method,status)
  values(p_booking_id,v_booking.final_amount,'PAY_AT_TURF','PENDING')
  returning id into v_payment_id;
  update public.bookings set payment_status='PENDING',
    booking_status=case when v_booking.booking_status='RESCHEDULED'
      then 'RESCHEDULED'::public.booking_status else 'CONFIRMED'::public.booking_status end,
    updated_at=now()
  where id=p_booking_id;
  insert into public.notifications(user_id,type,title,message)
  values(v_booking.customer_id,'BOOKING_CONFIRMED','Booking confirmed',
    'Your booking is confirmed. Payment is due at the turf.');
  return v_payment_id;
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
  v_booking public.bookings%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_booking from public.bookings
  where id=p_booking_id and customer_id=auth.uid();
  if not found then raise exception 'BOOKING_NOT_FOUND_OR_FORBIDDEN'; end if;
  if v_booking.booking_status not in ('CONFIRMED','COMPLETED','RESCHEDULED') then
    raise exception 'BOOKING_NOT_CONFIRMED';
  end if;
  if v_booking.booking_status='RESCHEDULED' and v_booking.payment_status<>'SUCCESS'
    and not exists(select 1 from public.payments where booking_id=p_booking_id and method='PAY_AT_TURF') then
    raise exception 'BOOKING_NOT_CONFIRMED';
  end if;
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
  v_booking record;
  v_hash text;
  v_valid boolean;
begin
  v_hash:=encode(digest(p_token,'sha256'),'hex');
  select bc.status,b.id,b.booking_date,b.start_time,b.end_time,b.final_amount,
    b.booking_status,b.payment_status,t.name as turf_name
  into v_booking
  from public.booking_checkins bc
  join public.bookings b on b.id=bc.booking_id
  join public.turfs t on t.id=b.turf_id
  where bc.token_hash=v_hash
  limit 1;
  if not found then return jsonb_build_object('valid',false,'message','Invalid QR code'); end if;
  v_valid:=v_booking.booking_status in ('CONFIRMED','COMPLETED')
    or (v_booking.booking_status='RESCHEDULED' and (
      v_booking.payment_status='SUCCESS' or exists(select 1 from public.payments p
        where p.booking_id=v_booking.id and p.method='PAY_AT_TURF')
    ));
  return jsonb_build_object('valid',v_valid,'booking_id',v_booking.id,'status',v_booking.status,
    'booking_date',v_booking.booking_date,'start_time',v_booking.start_time,
    'end_time',v_booking.end_time,'amount',v_booking.final_amount,'turf_name',v_booking.turf_name);
end;
$$;

revoke all on function public.verify_booking_qr(text) from public;
grant execute on function public.verify_booking_qr(text) to anon,authenticated;
