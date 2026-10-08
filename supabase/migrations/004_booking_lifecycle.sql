-- TURFBOOK 004: booking lifecycle, payment records, cancellation/refund rules, notifications
alter table public.bookings add column if not exists cancellation_status text;
create or replace function public.create_payment_for_booking(
  p_booking_id uuid,
  p_method public.payment_method
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_id uuid; v_customer uuid; v_amount numeric; v_status public.payment_status;
begin
  select customer_id, final_amount into v_customer, v_amount from public.bookings where id=p_booking_id for update;
  if v_customer is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_customer <> auth.uid() and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if exists(select 1 from public.payments where booking_id=p_booking_id) then
    select id into v_id from public.payments where booking_id=p_booking_id;
    return v_id;
  end if;
  v_status := case when p_method='PAY_AT_TURF' then 'SUCCESS'::public.payment_status else 'PENDING'::public.payment_status end;
  insert into public.payments(booking_id,amount,method,status,paid_at)
  values(p_booking_id,v_amount,p_method,v_status,case when v_status='SUCCESS' then now() else null end)
  returning id into v_id;
  update public.bookings
    set payment_status=v_status,
        booking_status=case when v_status='SUCCESS' then 'CONFIRMED' else 'PENDING' end,
        updated_at=now()
  where id=p_booking_id;
  insert into public.notifications(user_id,type,title,message)
  values(v_customer,
    case when v_status='SUCCESS' then 'PAYMENT_SUCCESS' else 'SYSTEM' end,
    case when v_status='SUCCESS' then 'Booking confirmed' else 'Payment pending' end,
    case when v_status='SUCCESS' then 'Your turf booking is confirmed.' else 'Your booking is reserved pending payment verification.' end);
  return v_id;
end;
$$;

grant execute on function public.create_payment_for_booking(uuid,public.payment_method) to authenticated;

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare b record; v_refund numeric:=0; v_hours numeric;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if b.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if b.customer_id <> auth.uid() and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if b.booking_status in ('CANCELLED','COMPLETED','NO_SHOW') then raise exception 'BOOKING_NOT_CANCELLABLE'; end if;
  v_hours := extract(epoch from ((b.booking_date + b.start_time) - now()))/3600;
  if v_hours >= 24 then v_refund := b.final_amount;
  elsif v_hours >= 12 then v_refund := round(b.final_amount * .75,2);
  elsif v_hours >= 6 then v_refund := round(b.final_amount * .50,2);
  else v_refund := 0; end if;
  update public.bookings set booking_status='CANCELLED', cancellation_status='CANCELLED', updated_at=now() where id=p_booking_id;
  if v_refund > 0 and b.payment_status in ('SUCCESS','PARTIALLY_REFUNDED') then
    insert into public.refunds(booking_id,amount,reason) values(p_booking_id,v_refund,coalesce(p_reason,'Customer cancellation'));
    update public.bookings set payment_status='PARTIALLY_REFUNDED' where id=p_booking_id;
  end if;
  insert into public.notifications(user_id,type,title,message) values(b.customer_id,'BOOKING_CANCELLED','Booking cancelled','Your booking was cancelled. Refund, if applicable, is recorded for processing.');
  return jsonb_build_object('booking_id',p_booking_id,'refund_amount',v_refund,'refund_policy',case when v_hours>=24 then '100%' when v_hours>=12 then '75%' when v_hours>=6 then '50%' else '0%' end);
end;
$$;

grant execute on function public.cancel_booking(uuid,text) to authenticated;

create or replace function public.mark_payment_verified(p_payment_id uuid, p_transaction_id text, p_gateway_reference text)
returns void language plpgsql security definer set search_path=public
as $$
declare v_booking uuid; v_customer uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select booking_id into v_booking from public.payments where id=p_payment_id for update;
  if v_booking is null then raise exception 'PAYMENT_NOT_FOUND'; end if;
  update public.payments set status='SUCCESS',transaction_id=p_transaction_id,gateway_reference=p_gateway_reference,paid_at=now() where id=p_payment_id;
  update public.bookings set payment_status='SUCCESS',booking_status='CONFIRMED',updated_at=now() where id=v_booking returning customer_id into v_customer;
  insert into public.notifications(user_id,type,title,message) values(v_customer,'PAYMENT_SUCCESS','Payment verified','Your payment was verified and the booking is confirmed.');
end;
$$;

grant execute on function public.mark_payment_verified(uuid,text,text) to authenticated;

create index if not exists idx_payments_status on public.payments(status,created_at desc);
create index if not exists idx_refunds_booking on public.refunds(booking_id,created_at desc);
create index if not exists idx_notifications_user_created on public.notifications(user_id,created_at desc);
