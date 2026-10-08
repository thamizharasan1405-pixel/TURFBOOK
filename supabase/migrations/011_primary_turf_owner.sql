do $$
declare
  owner_user_id uuid;
begin
  select id into owner_user_id
  from auth.users
  where lower(email) = lower('madhan@gmail.com')
    and email_confirmed_at is not null;

  if owner_user_id is null then
    raise notice 'Primary owner account is missing or its email is not verified; no role was changed.';
    return;
  end if;

  insert into public.owner_profiles(user_id, verification_status)
  values (owner_user_id, 'APPROVED')
  on conflict (user_id) do update
    set verification_status = 'APPROVED';

  insert into public.user_roles(user_id, role)
  values (owner_user_id, 'OWNER')
  on conflict (user_id) do update
    set role = 'OWNER';
end;
$$;
