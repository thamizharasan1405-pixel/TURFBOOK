create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.profiles(id,email,full_name)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''));
  insert into public.user_roles(user_id,role)
  values(new.id,'CUSTOMER');
  insert into public.customer_profiles(user_id)
  values(new.id);
  if new.raw_user_meta_data->>'requested_role'='OWNER' then
    insert into public.owner_profiles(user_id)
    values(new.id);
  end if;
  return new;
end;
$$;
