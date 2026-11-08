-- =====================================================================
-- Close Day: the evening summary and cash check.
--
-- The cash the drawer should hold is worked out here, not trusted from the app:
--   cash at the start of the day
--   + cash taken in that day (bills and udhaar paid)
--   - cash given back (refunds)
--   - expenses paid in cash
-- A day can be closed again (e.g. after a late sale); the latest count replaces
-- the earlier one and the change is written to change_log.
-- Expenses are added straight into the expenses table (row-level security
-- already lets anyone logged in add one, and only the owner cancel one).
-- =====================================================================

create or replace function public.day_expected_cash(p_day date, p_opening numeric)
returns numeric
language sql stable security invoker set search_path = public as $$
  select p_opening
    + coalesce((select sum(amount) from public.payments
                where direction = 'in' and mode = 'cash' and status = 'saved' and paid_on = p_day), 0)
    - coalesce((select sum(amount) from public.payments
                where direction = 'out' and mode = 'cash' and status = 'saved' and paid_on = p_day), 0)
    - coalesce((select sum(amount) from public.expenses
                where mode = 'cash' and status = 'saved' and spent_on = p_day), 0)
$$;

create or replace function public.close_day(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_day date;
  v_opening numeric(12,2);
  v_counted numeric(12,2);
  v_expected numeric(12,2);
  v_difference numeric(12,2);
begin
  if not public.is_active_person() then
    perform public.bill_error('not_logged_in');
  end if;
  begin
    v_day := coalesce(nullif(p ->> 'day', '')::date, public.today_ist());
    v_opening := coalesce(nullif(p ->> 'opening_cash', '')::numeric, 0);
    v_counted := nullif(p ->> 'counted_cash', '')::numeric;
  exception when others then
    perform public.bill_error('bad_amount');
  end;
  if v_day > public.today_ist() then
    perform public.bill_error('future_day');
  end if;
  if v_opening < 0 or v_counted < 0 then
    perform public.bill_error('bad_amount');
  end if;

  v_expected := public.day_expected_cash(v_day, v_opening);
  v_difference := case when v_counted is null then null else v_counted - v_expected end;

  insert into public.day_closes (day, summary, expected_cash, counted_cash, difference, note, person_id, closed_at)
  values (
    v_day,
    coalesce(p -> 'summary', '{}'::jsonb) || jsonb_build_object('opening_cash', v_opening),
    v_expected, v_counted, v_difference,
    left(coalesce(p ->> 'note', ''), 500),
    auth.uid(), now()
  )
  on conflict (day) do update set
    summary = excluded.summary,
    expected_cash = excluded.expected_cash,
    counted_cash = excluded.counted_cash,
    difference = excluded.difference,
    note = excluded.note,
    person_id = excluded.person_id,
    closed_at = excluded.closed_at;

  return jsonb_build_object('day', v_day, 'expected_cash', v_expected, 'counted_cash', v_counted, 'difference', v_difference);
end;
$$;

create trigger log_day_closes after insert or update on public.day_closes
  for each row execute function public.log_change();

revoke execute on function public.day_expected_cash(date, numeric) from public, anon;
revoke execute on function public.close_day(jsonb) from public, anon;
grant execute on function public.day_expected_cash(date, numeric) to authenticated, service_role;
grant execute on function public.close_day(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
