-- =====================================================================
-- Owner / admin add logins and change anyone's PIN from Settings → People.
-- The login is made here, inside the database, in the same form Supabase's
-- own admin tool makes it (bcrypt PIN, confirmed email, "email" identity),
-- so the app never needs the secret key. The email is made up and only
-- used behind the scenes (name-xxxxxx@jay-electronics.invalid).
-- =====================================================================

create or replace function public.add_person(p jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_name text := trim(coalesce(p ->> 'name', ''));
  v_role text := coalesce(p ->> 'role', '');
  v_pin text := coalesce(p ->> 'pin', '');
  v_id uuid := gen_random_uuid();
  v_slug text;
  v_email text;
begin
  if not public.is_owner() then
    perform public.bill_error('owner_only');
  end if;
  if v_name = '' then
    perform public.bill_error('person_name_required');
  end if;
  if v_role not in ('owner', 'staff', 'admin') then
    perform public.bill_error('person_bad_role');
  end if;
  if v_pin !~ '^[0-9]{6}$' then
    perform public.bill_error('person_bad_pin');
  end if;
  if exists (select 1 from public.people where lower(name) = lower(v_name) and active) then
    perform public.bill_error('person_exists', jsonb_build_object('name', v_name));
  end if;

  v_slug := coalesce(nullif(trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), ''), 'person');
  v_email := v_slug || '-' || substr(md5(v_id::text), 1, 6) || '@jay-electronics.invalid';

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(v_pin, gen_salt('bf', 10)), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('name', v_name), now(), now(),
    '', '', '', '', '', '', '', '',
    false, false
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now()
  );
  insert into public.people (id, name, role, login_email) values (v_id, v_name, v_role, v_email);
  return v_id;
end;
$$;

-- Owner / admin: set someone's PIN (someone who forgot it, or a new person's first PIN).
create or replace function public.set_person_pin(p jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid := nullif(p ->> 'person_id', '')::uuid;
  v_pin text := coalesce(p ->> 'pin', '');
begin
  if not public.is_owner() then
    perform public.bill_error('owner_only');
  end if;
  if v_pin !~ '^[0-9]{6}$' then
    perform public.bill_error('person_bad_pin');
  end if;
  if not exists (select 1 from public.people where id = v_id) then
    perform public.bill_error('person_not_found');
  end if;
  update auth.users set encrypted_password = crypt(v_pin, gen_salt('bf', 10)), updated_at = now() where id = v_id;
end;
$$;

revoke execute on function public.add_person(jsonb) from public, anon;
revoke execute on function public.set_person_pin(jsonb) from public, anon;
grant execute on function public.add_person(jsonb) to authenticated, service_role;
grant execute on function public.set_person_pin(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
