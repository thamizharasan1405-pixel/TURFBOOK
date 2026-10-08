create extension if not exists pgcrypto;

create table if not exists public.favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  turf_id uuid not null references public.turfs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id,turf_id)
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  turf_id uuid not null references public.turfs(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  review_text text,
  status text not null default 'PUBLISHED' check (status in ('PUBLISHED','HIDDEN','PENDING')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  code text not null unique,
  description text,
  discount_type text not null check (discount_type in ('FLAT','PERCENTAGE')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  max_discount numeric(10,2),
  min_booking_amount numeric(10,2) not null default 0,
  start_at timestamptz not null default now(),
  expires_at timestamptz not null,
  usage_limit int,
  per_user_limit int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupon_usages (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  discount_amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(coupon_id,booking_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_checkins (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'NOT_CHECKED_IN' check (status in ('NOT_CHECKED_IN','CHECKED_IN','CHECKED_OUT')),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  checked_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_favourites_user on public.favourites(user_id);
create index if not exists idx_reviews_turf on public.reviews(turf_id);
create index if not exists idx_notifications_user_read on public.notifications(user_id,read_at);
create index if not exists idx_coupon_code on public.coupons(code);

alter table public.favourites enable row level security;
alter table public.reviews enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_usages enable row level security;
alter table public.notifications enable row level security;
alter table public.booking_checkins enable row level security;

create policy "favourites own" on public.favourites for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "reviews public read" on public.reviews for select using (status='PUBLISHED' or customer_id=auth.uid());
create policy "reviews customer create" on public.reviews for insert with check (customer_id=auth.uid());
create policy "reviews customer update" on public.reviews for update using (customer_id=auth.uid()) with check (customer_id=auth.uid());
create policy "notifications own" on public.notifications for select using (user_id=auth.uid());
create policy "notifications own update" on public.notifications for update using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "coupons active read" on public.coupons for select using (active=true and now() between start_at and expires_at);
create policy "coupon usages own" on public.coupon_usages for select using (user_id=auth.uid());
create policy "checkins staff or customer read" on public.booking_checkins for select using (exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=auth.uid()) or exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role in ('STAFF','ADMIN')));

create or replace function public.mark_notification_read(p_id uuid)
returns void language plpgsql security invoker as $$
begin update public.notifications set read_at=now() where id=p_id and user_id=auth.uid(); end; $$;

create or replace function public.toggle_favourite(p_turf_id uuid)
returns boolean language plpgsql security invoker as $$
declare exists_row boolean;
begin
 select exists(select 1 from public.favourites where user_id=auth.uid() and turf_id=p_turf_id) into exists_row;
 if exists_row then delete from public.favourites where user_id=auth.uid() and turf_id=p_turf_id; return false;
 else insert into public.favourites(user_id,turf_id) values(auth.uid(),p_turf_id); return true; end if;
end; $$;

create or replace function public.validate_coupon(p_code text,p_amount numeric)
returns jsonb language plpgsql security invoker as $$
declare c public.coupons; used_count int; discount numeric;
begin
 select * into c from public.coupons where upper(code)=upper(trim(p_code)) and active=true and now() between start_at and expires_at limit 1;
 if not found then return jsonb_build_object('valid',false,'message','Coupon is invalid or expired'); end if;
 if p_amount < c.min_booking_amount then return jsonb_build_object('valid',false,'message','Minimum booking amount is ₹'||c.min_booking_amount); end if;
 select count(*) into used_count from public.coupon_usages where coupon_id=c.id and user_id=auth.uid();
 if c.per_user_limit is not null and used_count >= c.per_user_limit then return jsonb_build_object('valid',false,'message','Coupon usage limit reached'); end if;
 if c.discount_type='PERCENTAGE' then discount:=round(p_amount*c.discount_value/100,2); else discount:=c.discount_value; end if;
 if c.max_discount is not null then discount:=least(discount,c.max_discount); end if;
 discount:=least(discount,p_amount);
 return jsonb_build_object('valid',true,'coupon_id',c.id,'code',c.code,'discount',discount,'message','Coupon applied');
end; $$;

create or replace function public.issue_booking_qr(p_booking_id uuid)
returns text language plpgsql security invoker as $$
declare raw_token text; h text;
begin
 if not exists(select 1 from public.bookings where id=p_booking_id and (customer_id=auth.uid() or exists(select 1 from public.user_roles where user_id=auth.uid() and role='ADMIN'))) then raise exception 'Not allowed'; end if;
 raw_token:=encode(gen_random_bytes(24),'hex'); h:=encode(digest(raw_token,'sha256'),'hex');
 insert into public.booking_checkins(booking_id,token_hash) values(p_booking_id,h) on conflict(booking_id) do update set token_hash=excluded.token_hash,status='NOT_CHECKED_IN',checked_in_at=null,checked_out_at=null;
 return raw_token;
end; $$;

create or replace function public.verify_booking_qr(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare h text; r record;
begin
 h:=encode(digest(p_token,'sha256'),'hex');
 select bc.status,b.id,b.booking_date,b.start_time,b.end_time,b.final_amount,b.booking_status,t.name as turf_name into r from booking_checkins bc join bookings b on b.id=bc.booking_id join turfs t on t.id=b.turf_id where bc.token_hash=h limit 1;
 if not found then return jsonb_build_object('valid',false,'message','Invalid QR code'); end if;
 return jsonb_build_object('valid',r.booking_status='CONFIRMED','booking_id',r.id,'status',r.status,'booking_date',r.booking_date,'start_time',r.start_time,'end_time',r.end_time,'amount',r.final_amount,'turf_name',r.turf_name);
end; $$;

create or replace function public.set_checkin_status(p_booking_id uuid,p_status text)
returns void language plpgsql security invoker as $$
begin
 if not exists(select 1 from public.user_roles where user_id=auth.uid() and role in ('STAFF','ADMIN')) then raise exception 'Staff access required'; end if;
 update public.booking_checkins set status=p_status,checked_by=auth.uid(),checked_in_at=case when p_status='CHECKED_IN' then now() else checked_in_at end,checked_out_at=case when p_status='CHECKED_OUT' then now() else checked_out_at end where booking_id=p_booking_id;
end; $$;
