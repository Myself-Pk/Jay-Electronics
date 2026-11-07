-- =====================================================================
-- Explicit permissions for the app (Supabase Data API).
--
-- Since 30 Oct 2026 Supabase no longer exposes new tables to the app
-- automatically, so every permission the app needs is listed here.
-- Row-level security (initial migration) still decides which ROWS each
-- person may see or change; these grants only open the doors at all.
-- Nobody using the app gets DELETE: nothing can be deleted from the app.
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Setup scripts on the shop computer use the secret key (service_role). It never goes in the app.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Logged-in people: read and write tables (row-level security narrows this down).
grant select, insert, update on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Functions are closed by default (Postgres lets everyone run a new function),
-- then opened one by one below. New functions in later migrations need their own grant.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Helpers used inside security rules and column defaults.
grant execute on function public.is_active_person() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.today_ist() to authenticated;

-- What the app calls once logged in.
grant execute on function public.set_next_bill_number(integer, integer) to authenticated;
grant execute on function public.save_bill(jsonb) to authenticated;
grant execute on function public.cancel_bill(uuid, text) to authenticated;
grant execute on function public.get_bill(uuid) to authenticated;
grant execute on function public.lookup_serial(text) to authenticated;
grant execute on function public.mark_warranty_registered(uuid, text) to authenticated;

-- Before logging in: the "Who is using the app?" list, and a customer opening their bill link.
grant execute on function public.login_people() to anon, authenticated;
grant execute on function public.get_shared_bill(text) to anon, authenticated;

-- Tell the Data API to pick up the changes.
notify pgrst, 'reload schema';
