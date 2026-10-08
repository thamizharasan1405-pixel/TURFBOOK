do $$
declare
  v_table text;
  v_tables text[]:=array[
    'profiles','user_roles','owner_profiles','staff_profiles','staff_turfs',
    'customer_profiles','turfs','turf_images','sports','facilities','turf_sports',
    'turf_facilities','slot_templates','blocked_slots','maintenance_records',
    'bookings','payments','refunds','favourites','reviews','notifications',
    'coupons','coupon_usages','booking_checkins','teams','team_members',
    'team_bookings','split_payments','membership_plans','user_memberships',
    'tournaments','tournament_teams','tournament_players','tournament_matches',
    'support_tickets','support_messages','invoices','audit_logs','system_settings'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('drop policy if exists %I on public.%I','admin read access',v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
      'admin read access',v_table
    );
  end loop;
end;
$$;

do $$
declare
  v_table text;
  v_tables text[]:=array[
    'profiles','user_roles','owner_profiles','staff_profiles','staff_turfs',
    'customer_profiles','turfs','turf_images','sports','facilities','turf_sports',
    'turf_facilities','slot_templates','blocked_slots','maintenance_records',
    'refunds','favourites','reviews','notifications','coupons','coupon_usages',
    'teams','team_members','team_bookings','split_payments','membership_plans',
    'user_memberships','tournaments','tournament_teams','tournament_players',
    'tournament_matches','support_tickets','support_messages','invoices','system_settings'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('drop policy if exists %I on public.%I','admin manage access',v_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      'admin manage access',v_table
    );
  end loop;
end;
$$;

create policy "admin sends notifications" on public.notifications
for insert to authenticated with check (public.is_admin());

create or replace function public.admin_set_owner_application(
  p_user_id uuid,p_status public.approval_status
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_old_status public.approval_status;
  v_old_role public.app_role;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select verification_status into v_old_status from public.owner_profiles
  where user_id=p_user_id for update;
  if not found then raise exception 'OWNER_APPLICATION_NOT_FOUND'; end if;
  select role into v_old_role from public.user_roles where user_id=p_user_id for update;

  update public.owner_profiles set verification_status=p_status where user_id=p_user_id;
  if p_status='APPROVED' then
    update public.user_roles set role='OWNER' where user_id=p_user_id;
    if not found then insert into public.user_roles(user_id,role) values(p_user_id,'OWNER'); end if;
  elsif v_old_role='OWNER' then
    update public.user_roles set role='CUSTOMER' where user_id=p_user_id;
  end if;

  insert into public.audit_logs(actor_id,action,entity,entity_id,old_value,new_value)
  values(auth.uid(),'OWNER_APPLICATION_STATUS_CHANGED','owner_application',p_user_id,
    jsonb_build_object('status',v_old_status,'role',v_old_role),
    jsonb_build_object('status',p_status,'role',case when p_status='APPROVED' then 'OWNER' else 'CUSTOMER' end));
end;
$$;

revoke all on function public.admin_set_owner_application(uuid,public.approval_status) from public;
grant execute on function public.admin_set_owner_application(uuid,public.approval_status) to authenticated;

create or replace function public.admin_set_booking_status(
  p_booking_id uuid,p_status public.booking_status
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.payment_status='PROCESSING' then raise exception 'PAYMENT_IN_PROGRESS'; end if;
  if p_status not in ('CANCELLED','NO_SHOW','COMPLETED','CONFIRMED') then
    raise exception 'BOOKING_STATUS_NOT_ALLOWED';
  end if;
  if v_booking.booking_status in ('CANCELLED','COMPLETED','NO_SHOW')
     and p_status<>v_booking.booking_status then raise exception 'BOOKING_ALREADY_FINAL'; end if;
  if p_status='COMPLETED' and (v_booking.booking_date+v_booking.end_time)>now() then
    raise exception 'BOOKING_SLOT_NOT_FINISHED';
  end if;
  if p_status='CANCELLED' then
    update public.bookings set booking_status=p_status,cancellation_status='CANCELLED',updated_at=now()
    where id=p_booking_id;
    delete from public.booking_checkins where booking_id=p_booking_id;
  else
    update public.bookings set booking_status=p_status,updated_at=now() where id=p_booking_id;
  end if;
  insert into public.notifications(user_id,type,title,message)
  values(v_booking.customer_id,'BOOKING_STATUS_CHANGED','Booking status updated',
    'Your booking status is now '||replace(lower(p_status::text),'_',' ')||'.');
  insert into public.audit_logs(actor_id,action,entity,entity_id,old_value,new_value)
  values(auth.uid(),'BOOKING_STATUS_CHANGED','booking',p_booking_id,
    jsonb_build_object('status',v_booking.booking_status),jsonb_build_object('status',p_status));
end;
$$;

revoke all on function public.admin_set_booking_status(uuid,public.booking_status) from public;
grant execute on function public.admin_set_booking_status(uuid,public.booking_status) to authenticated;

create or replace function public.admin_resolve_refund(
  p_refund_id uuid,p_status text,p_transaction_reference text default null
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_refund public.refunds%rowtype;
  v_payment_status public.payment_status;
  v_refunded numeric;
  v_paid numeric;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status not in ('PROCESSING','COMPLETED','REJECTED') then raise exception 'REFUND_STATUS_INVALID'; end if;
  if p_status='COMPLETED' and coalesce(btrim(p_transaction_reference),'')='' then
    raise exception 'REFUND_REFERENCE_REQUIRED: Process the refund with your payment provider and enter its refund reference.';
  end if;
  select * into v_refund from public.refunds where id=p_refund_id for update;
  if not found then raise exception 'REFUND_NOT_FOUND'; end if;
  if v_refund.status in ('COMPLETED','REJECTED') and p_status<>v_refund.status then
    raise exception 'REFUND_ALREADY_FINAL';
  end if;

  update public.refunds set status=p_status,
    refund_transaction_id=case when p_status='COMPLETED' then p_transaction_reference else refund_transaction_id end,
    completed_at=case when p_status='COMPLETED' then now() else null end
  where id=p_refund_id;

  if p_status='COMPLETED' then
    select b.payment_status,p.amount into v_payment_status,v_paid
    from public.bookings b join public.payments p on p.booking_id=b.id
    where b.id=v_refund.booking_id and p.status='SUCCESS'
    order by p.created_at desc limit 1 for update of b,p;
    if not found then raise exception 'SUCCESSFUL_PAYMENT_NOT_FOUND'; end if;
    select coalesce(sum(amount),0) into v_refunded
    from public.refunds where booking_id=v_refund.booking_id and status='COMPLETED';
    update public.bookings set payment_status=case
      when v_refunded>=v_paid then 'REFUNDED'::public.payment_status
      else 'PARTIALLY_REFUNDED'::public.payment_status end,
      updated_at=now()
    where id=v_refund.booking_id;
  end if;
  insert into public.audit_logs(actor_id,action,entity,entity_id,old_value,new_value)
  values(auth.uid(),'REFUND_STATUS_CHANGED','refund',p_refund_id,
    jsonb_build_object('status',v_refund.status),
    jsonb_build_object('status',p_status,'refund_reference',p_transaction_reference));
end;
$$;

revoke all on function public.admin_resolve_refund(uuid,text,text) from public;
grant execute on function public.admin_resolve_refund(uuid,text,text) to authenticated;

create or replace function public.admin_create_blocked_slot(
  p_turf_id uuid,p_booking_date date,p_start_time time,p_end_time time,p_reason text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_booking_date<current_date or p_end_time<=p_start_time then raise exception 'BLOCKED_SLOT_TIME_INVALID'; end if;
  if exists(select 1 from public.bookings b where b.turf_id=p_turf_id
    and b.booking_date=p_booking_date and b.booking_status in ('PENDING','CONFIRMED','RESCHEDULED')
    and b.start_time<p_end_time and b.end_time>p_start_time
  ) then raise exception 'SLOT_CONFLICTS_WITH_BOOKING'; end if;
  insert into public.blocked_slots(turf_id,booking_date,start_time,end_time,reason,created_by)
  values(p_turf_id,p_booking_date,p_start_time,p_end_time,nullif(trim(p_reason),''),auth.uid())
  returning id into v_id;
  insert into public.audit_logs(actor_id,action,entity,entity_id,new_value)
  values(auth.uid(),'TURF_SLOT_BLOCKED','blocked_slot',v_id,
    jsonb_build_object('turf_id',p_turf_id,'date',p_booking_date,'start',p_start_time,'end',p_end_time));
  return v_id;
end;
$$;

revoke all on function public.admin_create_blocked_slot(uuid,date,time,time,text) from public;
grant execute on function public.admin_create_blocked_slot(uuid,date,time,time,text) to authenticated;

create or replace function public.admin_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return jsonb_build_object(
    'users',(select count(*) from public.profiles),
    'customers',(select count(*) from public.user_roles where role='CUSTOMER'),
    'owners',(select count(*) from public.user_roles where role='OWNER'),
    'staff',(select count(*) from public.user_roles where role='STAFF'),
    'turfs',(select count(*) from public.turfs),
    'bookings',(select count(*) from public.bookings),
    'revenue',(select coalesce(sum(amount),0) from public.payments where status='SUCCESS'),
    'payments',(select count(*) from public.payments),
    'refunds_pending',(select count(*) from public.refunds where status in ('PENDING','PROCESSING')),
    'complaints_open',(select count(*) from public.support_tickets where status in ('OPEN','IN_REVIEW'))
  );
end;
$$;

revoke all on function public.admin_dashboard_metrics() from public;
grant execute on function public.admin_dashboard_metrics() to authenticated;

create or replace function public.admin_add_staff(
  p_user_id uuid,p_phone text default null,p_turf_ids uuid[] default '{}'
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'USER_NOT_FOUND'; end if;
  if exists(select 1 from public.user_roles where user_id=p_user_id and role in ('OWNER','ADMIN')) then
    raise exception 'OWNER_OR_ADMIN_CANNOT_BE_STAFF';
  end if;
  insert into public.user_roles(user_id,role) values(p_user_id,'STAFF')
  on conflict(user_id) do update set role='STAFF';
  insert into public.staff_profiles(user_id,phone,status)
  values(p_user_id,nullif(trim(p_phone),''),'ACTIVE')
  on conflict(user_id) do update set phone=excluded.phone,status='ACTIVE';
  delete from public.staff_turfs where staff_id=p_user_id;
  insert into public.staff_turfs(staff_id,turf_id)
  select p_user_id,turf_id from unnest(coalesce(p_turf_ids,'{}'::uuid[])) as turf_id
  on conflict do nothing;
  insert into public.audit_logs(actor_id,action,entity,entity_id,new_value)
  values(auth.uid(),'STAFF_ADDED','staff',p_user_id,
    jsonb_build_object('phone',p_phone,'turf_ids',to_jsonb(coalesce(p_turf_ids,'{}'::uuid[]))));
end;
$$;

revoke all on function public.admin_add_staff(uuid,text,uuid[]) from public;
grant execute on function public.admin_add_staff(uuid,text,uuid[]) to authenticated;

create or replace function public.admin_staff_candidates()
returns table(user_id uuid,full_name text,email text,role public.app_role)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return query
  select p.id,p.full_name,p.email,r.role
  from public.profiles p
  join public.user_roles r on r.user_id=p.id
  where r.role in ('CUSTOMER','STAFF')
  order by p.full_name nulls last,p.email;
end;
$$;

revoke all on function public.admin_staff_candidates() from public;
grant execute on function public.admin_staff_candidates() to authenticated;
