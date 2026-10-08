-- TURFBOOK V7: teams, split payments, memberships, tournaments, support, reporting
create table if not exists public.tournament_teams(
 id uuid primary key default gen_random_uuid(), tournament_id uuid not null references public.tournaments(id) on delete cascade,
 team_id uuid not null references public.teams(id) on delete cascade, captain_id uuid references public.profiles(id) on delete set null,
 payment_status public.payment_status not null default 'PENDING', registered_at timestamptz not null default now(),
 unique(tournament_id,team_id)
);
create table if not exists public.tournament_players(
 id uuid primary key default gen_random_uuid(), tournament_team_id uuid not null references public.tournament_teams(id) on delete cascade,
 player_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(),
 unique(tournament_team_id,player_id)
);
create table if not exists public.tournament_matches(
 id uuid primary key default gen_random_uuid(), tournament_id uuid not null references public.tournaments(id) on delete cascade,
 round_name text not null, match_number int not null, team_a_id uuid references public.teams(id) on delete set null,
 team_b_id uuid references public.teams(id) on delete set null, scheduled_at timestamptz, score_a int default 0, score_b int default 0,
 winner_team_id uuid references public.teams(id) on delete set null, status text not null default 'SCHEDULED', created_at timestamptz not null default now()
);
create index if not exists tournament_teams_tournament_idx on public.tournament_teams(tournament_id);
create index if not exists tournament_matches_tournament_idx on public.tournament_matches(tournament_id,scheduled_at);
create index if not exists split_payments_booking_idx on public.split_payments(booking_id);
create index if not exists user_memberships_user_idx on public.user_memberships(user_id,status);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_bookings enable row level security;
alter table public.split_payments enable row level security;
alter table public.membership_plans enable row level security;
alter table public.user_memberships enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_players enable row level security;
alter table public.tournament_matches enable row level security;
alter table public.invoices enable row level security;

create policy "teams members read" on public.teams for select using(captain_id=auth.uid() or exists(select 1 from public.team_members tm where tm.team_id=teams.id and tm.user_id=auth.uid()) or public.is_admin());
create policy "teams captain create" on public.teams for insert with check(captain_id=auth.uid());
create policy "teams captain update" on public.teams for update using(captain_id=auth.uid() or public.is_admin()) with check(captain_id=auth.uid() or public.is_admin());
create policy "teams captain delete" on public.teams for delete using(captain_id=auth.uid() or public.is_admin());
create policy "team members access" on public.team_members for all using(user_id=auth.uid() or exists(select 1 from public.teams t where t.id=team_id and t.captain_id=auth.uid()) or public.is_admin()) with check(user_id=auth.uid() or exists(select 1 from public.teams t where t.id=team_id and t.captain_id=auth.uid()) or public.is_admin());
create policy "team bookings members" on public.team_bookings for select using(exists(select 1 from public.teams t where t.id=team_id and (t.captain_id=auth.uid() or exists(select 1 from public.team_members tm where tm.team_id=t.id and tm.user_id=auth.uid()))) or public.is_admin());
create policy "split payment own" on public.split_payments for select using(member_id=auth.uid() or exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=auth.uid()) or public.is_admin());
create policy "split payment member update" on public.split_payments for update using(member_id=auth.uid() or public.is_admin()) with check(member_id=auth.uid() or public.is_admin());
create policy "membership plans active read" on public.membership_plans for select using(active=true or public.is_admin());
create policy "own membership" on public.user_memberships for select using(user_id=auth.uid() or public.is_admin());
create policy "tournaments public read" on public.tournaments for select using(status <> 'DRAFT' or owner_id=auth.uid() or public.is_admin());
create policy "tournament owner write" on public.tournaments for all using(owner_id=auth.uid() or public.is_admin()) with check(owner_id=auth.uid() or public.is_admin());
create policy "tournament teams access" on public.tournament_teams for all using(captain_id=auth.uid() or exists(select 1 from public.tournaments t where t.id=tournament_id and (t.owner_id=auth.uid() or public.is_admin())) or public.is_admin()) with check(captain_id=auth.uid() or exists(select 1 from public.tournaments t where t.id=tournament_id and (t.owner_id=auth.uid() or public.is_admin())) or public.is_admin());
create policy "tournament players access" on public.tournament_players for all using(player_id=auth.uid() or exists(select 1 from public.tournament_teams tt where tt.id=tournament_team_id and tt.captain_id=auth.uid()) or public.is_admin()) with check(player_id=auth.uid() or exists(select 1 from public.tournament_teams tt where tt.id=tournament_team_id and tt.captain_id=auth.uid()) or public.is_admin());
create policy "tournament matches read" on public.tournament_matches for select using(true);
create policy "tournament matches owner write" on public.tournament_matches for all using(exists(select 1 from public.tournaments t where t.id=tournament_id and (t.owner_id=auth.uid() or public.is_admin())) or public.is_admin()) with check(exists(select 1 from public.tournaments t where t.id=tournament_id and (t.owner_id=auth.uid() or public.is_admin())) or public.is_admin());
create policy "invoice own read" on public.invoices for select using(exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid() or public.is_admin() or exists(select 1 from public.turfs t where t.id=b.turf_id and t.owner_id=auth.uid()))));

create or replace function public.mark_split_payment_paid(p_split_id uuid)
returns void language plpgsql security invoker as $$
begin
 update public.split_payments set amount_paid=amount_assigned,status='SUCCESS',paid_at=now()
 where id=p_split_id and member_id=auth.uid();
end; $$;

create or replace function public.team_booking_split(p_booking_id uuid,p_team_id uuid)
returns jsonb language plpgsql security invoker as $$
declare total numeric; members_count int;
begin
 if not exists(select 1 from public.teams where id=p_team_id and (captain_id=auth.uid() or exists(select 1 from public.team_members tm where tm.team_id=p_team_id and tm.user_id=auth.uid()))) then raise exception 'Team access denied'; end if;
 select final_amount into total from public.bookings where id=p_booking_id;
 select count(*) into members_count from public.team_members where team_id=p_team_id and status='ACTIVE';
 if members_count < 1 then raise exception 'No active team members'; end if;
 delete from public.team_bookings where team_id=p_team_id and booking_id=p_booking_id;
 insert into public.team_bookings(team_id,booking_id) values(p_team_id,p_booking_id);
 insert into public.split_payments(booking_id,member_id,amount_assigned)
 select p_booking_id,user_id,round(total/members_count,2) from public.team_members where team_id=p_team_id and status='ACTIVE'
 on conflict do nothing;
 return jsonb_build_object('total',total,'members',members_count,'share',round(total/members_count,2));
end; $$;

insert into public.membership_plans(name,price,duration_days,discount_percentage,booking_benefits,cancellation_benefits)
select * from (values
 ('BASIC',499,30,5,'5% booking discount','Standard cancellation policy'),
 ('PREMIUM',999,90,10,'10% booking discount + priority support','Enhanced cancellation benefits'),
 ('PRO',1999,180,15,'15% booking discount + priority support','Best available cancellation benefits')
) v(name,price,duration_days,discount_percentage,booking_benefits,cancellation_benefits)
where not exists(select 1 from public.membership_plans mp where mp.name=v.name);
