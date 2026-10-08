drop policy if exists "team members access" on public.team_members;
create policy "team members read" on public.team_members
for select using (
  user_id=auth.uid()
  or exists(select 1 from public.teams t where t.id=team_id and t.captain_id=auth.uid())
  or public.is_admin()
);

create or replace function public.create_customer_team(p_name text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_team_id uuid;
begin
  if auth.uid() is null or not public.has_role('CUSTOMER') then raise exception 'CUSTOMER_ROLE_REQUIRED'; end if;
  if length(trim(p_name))<2 or length(trim(p_name))>60 then raise exception 'TEAM_NAME_INVALID'; end if;
  insert into public.teams(captain_id,name) values(auth.uid(),trim(p_name)) returning id into v_team_id;
  insert into public.team_members(team_id,user_id,status) values(v_team_id,auth.uid(),'ACTIVE');
  return v_team_id;
end;
$$;

revoke all on function public.create_customer_team(text) from public;
grant execute on function public.create_customer_team(text) to authenticated;

create or replace function public.add_team_member_by_email(p_team_id uuid,p_email text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.has_role('CUSTOMER') then raise exception 'CUSTOMER_ROLE_REQUIRED'; end if;
  if not exists(select 1 from public.teams where id=p_team_id and captain_id=auth.uid()) then
    raise exception 'TEAM_CAPTAIN_REQUIRED';
  end if;
  select u.id into v_user_id
  from auth.users u
  join public.user_roles r on r.user_id=u.id and r.role='CUSTOMER'
  where lower(u.email)=lower(trim(p_email));
  if v_user_id is null then raise exception 'CUSTOMER_ACCOUNT_NOT_FOUND'; end if;
  insert into public.team_members(team_id,user_id,status)
  values(p_team_id,v_user_id,'ACTIVE')
  on conflict(team_id,user_id) do update set status='ACTIVE';
end;
$$;

revoke all on function public.add_team_member_by_email(uuid,text) from public;
grant execute on function public.add_team_member_by_email(uuid,text) to authenticated;

drop policy if exists "tournament teams access" on public.tournament_teams;
create policy "tournament registrations read" on public.tournament_teams
for select using (
  captain_id=auth.uid()
  or exists(select 1 from public.teams tm where tm.id=team_id and (
    tm.captain_id=auth.uid() or exists(select 1 from public.team_members m where m.team_id=tm.id and m.user_id=auth.uid())
  ))
  or exists(select 1 from public.tournaments t where t.id=tournament_id and t.owner_id=auth.uid())
  or public.is_admin()
);
create policy "team captain registers tournament" on public.tournament_teams
for insert with check (
  captain_id=auth.uid()
  and exists(select 1 from public.teams tm where tm.id=team_id and tm.captain_id=auth.uid())
  and exists(select 1 from public.tournaments t where t.id=tournament_id
    and t.status in ('OPEN','PUBLISHED','ACTIVE')
    and (t.registration_deadline is null or t.registration_deadline>=current_date)
    and (t.max_teams is null or (select count(*) from public.tournament_teams x where x.tournament_id=t.id)<t.max_teams)
  )
);
create policy "captain withdraws tournament registration" on public.tournament_teams
for delete using (
  captain_id=auth.uid()
  or exists(select 1 from public.teams tm where tm.id=team_id and tm.captain_id=auth.uid())
);

drop policy if exists "customer sends support message" on public.support_messages;
create policy "customer sends support message" on public.support_messages
for insert with check (
  sender_id=auth.uid()
  and exists(select 1 from public.support_tickets t where t.id=ticket_id and t.user_id=auth.uid())
);
