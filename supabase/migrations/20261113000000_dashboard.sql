-- =====================================================================
-- Home screen sales overview in one call.
-- Runs as the person asking (security invoker), so row-level security still applies:
-- profit (which needs purchase costs) is only filled in for the owner.
-- Weeks start on Monday. "prev_*" are the same days of the previous week / month,
-- so the comparison is fair partway through a week or month.
-- =====================================================================

create or replace function public.dashboard_summary() returns jsonb
language sql stable security invoker set search_path = public as $$
  with d as (
    select public.today_ist() as today,
           date_trunc('week', public.today_ist())::date as week_start,
           date_trunc('month', public.today_ist())::date as month_start
  ),
  b as (
    select * from public.bills where doc_type = 'bill' and status = 'saved'
  )
  select jsonb_build_object(
    'week', (select coalesce(sum(total), 0) from b where bill_date between d.week_start and d.today),
    'week_bills', (select count(*) from b where bill_date between d.week_start and d.today),
    'prev_week', (select coalesce(sum(total), 0) from b where bill_date between d.week_start - 7 and d.today - 7),
    'month', (select coalesce(sum(total), 0) from b where bill_date between d.month_start and d.today),
    'month_bills', (select count(*) from b where bill_date between d.month_start and d.today),
    'prev_month', (select coalesce(sum(total), 0) from b
                   where bill_date between (d.month_start - interval '1 month')::date and (d.today - interval '1 month')::date),
    'udhaar', (select coalesce(sum(balance), 0) from b),
    'udhaar_customers', (select count(distinct coalesce(customer_id::text, customer_phone)) from b where balance > 0),
    'days', (
      select jsonb_agg(jsonb_build_object(
               'date', g::date,
               'total', (select coalesce(sum(total), 0) from b where bill_date = g::date),
               'bills', (select count(*) from b where bill_date = g::date)
             ) order by g)
      from generate_series(d.today - 6, d.today, interval '1 day') g
    ),
    'top', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select bi.description as product, sum(bi.qty) as qty, sum(bi.amount) as amount
        from public.bill_items bi
        join b on b.id = bi.bill_id
        join public.products p on p.id = bi.product_id
        where b.bill_date between d.month_start and d.today and not p.is_service
        group by bi.description
        order by sum(bi.qty) desc, sum(bi.amount) desc
        limit 5
      ) t
    ),
    'profit', case when public.is_owner() then (
      select coalesce(sum(bi.amount - bi.qty * c.unit_cost), 0)
      from public.bill_items bi
      join b on b.id = bi.bill_id
      join public.bill_item_costs c on c.bill_item_id = bi.id
      where b.bill_date between d.month_start and d.today
    ) end
  )
  from d
$$;

revoke execute on function public.dashboard_summary() from public, anon;
grant execute on function public.dashboard_summary() to authenticated, service_role;

notify pgrst, 'reload schema';
