-- Someone who isn't logged in must not reach any table at all — not even to get an empty answer.
-- (Some Supabase projects still give "anon" table access by default; row-level security already
-- returned nothing, this closes the door completely.) Before login the app only uses the
-- login_people() and get_shared_bill() functions.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

notify pgrst, 'reload schema';
