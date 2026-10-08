alter table public.reviews
  add column if not exists status text not null default 'PUBLISHED'
  check (status in ('PUBLISHED','HIDDEN','PENDING'));

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reviews' and column_name='approved'
  ) then
    execute $query$
      update public.reviews
      set status=case when approved then 'PUBLISHED' else 'PENDING' end
      where status='PUBLISHED'
    $query$;
  end if;
end;
$$;

drop index if exists public.favourites_customer_idx;
drop index if exists public.favourites_user_created_idx;
create index if not exists favourites_user_created_idx
on public.favourites(user_id,created_at desc);

drop policy if exists "customer creates booking" on public.bookings;
drop policy if exists "customer updates booking" on public.bookings;
revoke insert,update,delete on public.bookings from anon,authenticated;

drop policy if exists "customer reviews" on public.reviews;
drop policy if exists "reviews customer create" on public.reviews;
drop policy if exists "reviews customer update" on public.reviews;

create or replace function public.owner_complete_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_admin() and not public.has_role('OWNER') then
    raise exception 'OWNER_ROLE_REQUIRED';
  end if;
  select b.* into v_booking
  from public.bookings b
  where b.id=p_booking_id
    and (public.is_admin() or exists(
      select 1 from public.turfs t where t.id=b.turf_id and t.owner_id=auth.uid()
    ))
  for update;
  if not found then raise exception 'BOOKING_NOT_FOUND_OR_FORBIDDEN'; end if;
  if v_booking.booking_status not in ('CONFIRMED','RESCHEDULED') then
    raise exception 'BOOKING_NOT_COMPLETABLE';
  end if;
  if (v_booking.booking_date+v_booking.end_time)>now() then
    raise exception 'BOOKING_SLOT_NOT_FINISHED';
  end if;
  update public.bookings set booking_status='COMPLETED',updated_at=now()
  where id=p_booking_id;
  insert into public.notifications(user_id,type,title,message)
  values(v_booking.customer_id,'BOOKING_COMPLETED','Booking completed',
    'Your booking has been marked complete. You can now leave a verified review.');
end;
$$;

revoke all on function public.owner_complete_booking(uuid) from public;
grant execute on function public.owner_complete_booking(uuid) to authenticated;

drop policy if exists "split payment member update" on public.split_payments;
drop policy if exists "split payment admin update" on public.split_payments;
create policy "split payment admin update" on public.split_payments
for update using (public.is_admin()) with check (public.is_admin());

create or replace function public.mark_split_payment_paid(p_split_id uuid)
returns void
language plpgsql
security invoker
set search_path=public
as $$
begin
  raise exception 'PAYMENT_GATEWAY_NOT_CONFIGURED: Split payments cannot be marked as paid until a payment provider confirms the transaction.';
end;
$$;

revoke all on function public.mark_split_payment_paid(uuid) from public;
grant execute on function public.mark_split_payment_paid(uuid) to authenticated;

create or replace function public.team_booking_split(p_booking_id uuid,p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_total numeric;
  v_member_count integer;
  v_owner uuid;
begin
  if auth.uid() is null or not public.has_role('CUSTOMER') then
    raise exception 'CUSTOMER_ROLE_REQUIRED';
  end if;

  select customer_id,final_amount into v_owner,v_total
  from public.bookings
  where id=p_booking_id and booking_status in ('PENDING','CONFIRMED','RESCHEDULED')
  for update;
  if not found or v_owner<>auth.uid() then
    raise exception 'BOOKING_NOT_FOUND_OR_FORBIDDEN';
  end if;
  if not exists(select 1 from public.teams where id=p_team_id and captain_id=auth.uid()) then
    raise exception 'TEAM_CAPTAIN_REQUIRED';
  end if;

  select count(*) into v_member_count
  from public.team_members
  where team_id=p_team_id and status='ACTIVE';
  if v_member_count<1 then raise exception 'NO_ACTIVE_TEAM_MEMBERS'; end if;
  if exists(select 1 from public.split_payments where booking_id=p_booking_id and status<>'PENDING') then
    raise exception 'SPLIT_HAS_SETTLED_PAYMENTS_CONTACT_SUPPORT';
  end if;

  delete from public.split_payments where booking_id=p_booking_id;
  delete from public.team_bookings where booking_id=p_booking_id;
  insert into public.team_bookings(team_id,booking_id) values(p_team_id,p_booking_id);

  with shares as (
    select user_id,row_number() over(order by user_id) as member_number,
      round(v_total/v_member_count,2) as regular_share
    from public.team_members
    where team_id=p_team_id and status='ACTIVE'
  )
  insert into public.split_payments(booking_id,member_id,amount_assigned)
  select p_booking_id,user_id,
    case when member_number=v_member_count
      then v_total-(regular_share*(v_member_count-1))
      else regular_share
    end
  from shares;

  return jsonb_build_object('total',v_total,'members',v_member_count,
    'share',round(v_total/v_member_count,2));
end;
$$;

revoke all on function public.team_booking_split(uuid,uuid) from public;
grant execute on function public.team_booking_split(uuid,uuid) to authenticated;

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
  v_status public.booking_status;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_method<>'PAY_AT_TURF' then
    raise exception 'PAYMENT_GATEWAY_NOT_CONFIGURED: Online payments are unavailable until a payment gateway is configured.';
  end if;

  select customer_id,final_amount,booking_status
  into v_customer,v_amount,v_status
  from public.bookings
  where id=p_booking_id
  for update;
  if v_customer is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_customer<>auth.uid() and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_status not in ('PENDING','RESCHEDULED') then raise exception 'BOOKING_NOT_PAYABLE'; end if;

  select id into v_id from public.payments where booking_id=p_booking_id;
  if found then
    if not exists(select 1 from public.payments where id=v_id and method='PAY_AT_TURF' and status='PENDING') then
      raise exception 'PAYMENT_ALREADY_EXISTS';
    end if;
    return v_id;
  end if;

  insert into public.payments(booking_id,amount,method,status)
  values(p_booking_id,v_amount,p_method,'PENDING')
  returning id into v_id;
  update public.bookings set payment_status='PENDING',
    booking_status=case when v_status='RESCHEDULED' then 'RESCHEDULED'::public.booking_status
      else 'CONFIRMED'::public.booking_status end,
    updated_at=now()
  where id=p_booking_id;
  insert into public.notifications(user_id,type,title,message)
  values(v_customer,'BOOKING_CONFIRMED','Booking confirmed',
    'Your booking is confirmed. Payment is due at the turf.');
  return v_id;
end;
$$;

revoke all on function public.create_payment_for_booking(uuid,public.payment_method) from public;
grant execute on function public.create_payment_for_booking(uuid,public.payment_method) to authenticated;
