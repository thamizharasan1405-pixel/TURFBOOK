create table if not exists public.customer_turf_views (
  user_id uuid not null references public.profiles(id) on delete cascade,
  turf_id uuid not null references public.turfs(id) on delete cascade,
  last_viewed_at timestamptz not null default now(),
  primary key(user_id,turf_id)
);

create index if not exists customer_turf_views_recent_idx
on public.customer_turf_views(user_id,last_viewed_at desc);

alter table public.customer_turf_views enable row level security;
drop policy if exists "customers manage own turf history" on public.customer_turf_views;
create policy "customers manage own turf history" on public.customer_turf_views
for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
