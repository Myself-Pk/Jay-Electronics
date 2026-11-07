-- A record of every backup taken on the shop computer (scripts/backup.mjs),
-- so the app can show "✓ Backup saved today 10:02 AM" on the Home screen.
create table public.backup_log (
  id bigint generated always as identity primary key,
  taken_at timestamptz not null default now(),
  folder text not null,
  tables integer not null,
  rows integer not null,
  bytes bigint not null,
  computer text not null default ''
);

alter table public.backup_log enable row level security;
create policy backup_log_read on public.backup_log for select to authenticated using (public.is_active_person());

-- Logged-in people can only read it; only the backup script (secret key / database login) writes.
grant select on public.backup_log to authenticated;
grant all on public.backup_log to service_role;
grant usage, select on sequence public.backup_log_id_seq to service_role;

notify pgrst, 'reload schema';
