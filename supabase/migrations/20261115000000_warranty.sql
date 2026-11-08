-- =====================================================================
-- Warranty Check: find any battery by serial, mobile or bill number;
-- the brand-registration to-do list; and old sales from the paper register.
-- =====================================================================

-- Every serial-numbered unit with what the warranty screen needs. Runs as the
-- person asking (security_invoker), so row-level security still applies.
create view public.v_warranty_units with (security_invoker = true) as
select
  u.id as unit_id,
  u.serial_no,
  u.status,
  u.source,
  u.sold_on,
  coalesce(u.warranty_start, u.sold_on) as warranty_start,
  u.warranty_registered_at,
  u.warranty_reg_ref,
  concat_ws(' ', br.name, p.model, nullif(p.capacity, '')) as product,
  br.name as brand,
  p.warranty_free_months,
  p.warranty_prorata_months,
  coalesce(br.warranty_registration_required, false) as needs_registration,
  u.customer_id,
  coalesce(c.name, b.customer_name) as customer_name,
  coalesce(c.phone, nullif(b.customer_phone, '')) as customer_phone,
  b.id as bill_id,
  b.number as bill_number
from public.units u
join public.products p on p.id = u.product_id
left join public.brands br on br.id = p.brand_id
left join public.customers c on c.id = u.customer_id
left join public.bill_items bi on bi.id = u.bill_item_id
left join public.bills b on b.id = bi.bill_id;

-- One search box: part of a serial (3+ characters), a 10-digit mobile number
-- (+91 allowed), or a bill number ("JE/26-27/0001", or just "1" / "0001").
create or replace function public.warranty_search(p_query text) returns jsonb
language sql stable security invoker set search_path = public as $$
  with q as (
    select trim(coalesce(p_query, '')) as raw,
           upper(regexp_replace(coalesce(p_query, ''), '\s', '', 'g')) as serial,
           regexp_replace(coalesce(p_query, ''), '\D', '', 'g') as digits
  ),
  hits as (
    select w.unit_id from public.v_warranty_units w, q
    where length(q.serial) >= 3 and upper(w.serial_no) like '%' || q.serial || '%'
    union
    select w.unit_id from public.v_warranty_units w, q
    where length(q.digits) >= 10 and w.customer_phone = right(q.digits, 10) and w.status <> 'in_stock'
    union
    select w.unit_id
    from public.v_warranty_units w
    join public.bills b on b.id = w.bill_id, q
    where w.status <> 'in_stock'
      and (upper(b.number) = upper(q.raw) or (q.raw ~ '^[0-9]{1,6}$' and b.seq = q.raw::integer))
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.sold_on desc nulls last, r.serial_no), '[]'::jsonb)
  from (
    select w.* from public.v_warranty_units w
    where w.unit_id in (select unit_id from hits)
    order by w.sold_on desc nulls last
    limit 30
  ) r
$$;

-- A battery sold before the app (from the paper register), so its warranty can be checked.
-- It was never part of today's stock, so stock is not touched.
create or replace function public.add_old_sale(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_product public.products;
  v_serial text := trim(coalesce(p ->> 'serial_no', ''));
  v_sold date;
  v_phone text := nullif(regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g'), '');
  v_name text := nullif(trim(coalesce(p ->> 'name', '')), '');
  v_customer uuid;
  v_existing record;
  v_unit uuid;
begin
  if not public.is_active_person() then
    perform public.bill_error('not_logged_in');
  end if;
  begin
    select * into v_product from public.products where id = nullif(p ->> 'product_id', '')::uuid;
  exception when others then
    perform public.bill_error('product_not_found');
  end;
  if v_product.id is null then
    perform public.bill_error('product_not_found');
  end if;
  if v_product.is_service or not v_product.has_serial then
    perform public.bill_error('no_serial_product', jsonb_build_object('product', v_product.model));
  end if;
  if v_serial = '' then
    perform public.bill_error('serial_required', jsonb_build_object('product', v_product.model));
  end if;
  select serial_no into v_existing from public.units where upper(serial_no) = upper(v_serial);
  if found then
    perform public.bill_error('serial_exists', jsonb_build_object('serial', v_existing.serial_no));
  end if;
  begin
    v_sold := (p ->> 'sold_on')::date;
  exception when others then
    perform public.bill_error('bad_sale_date');
  end;
  if v_sold is null or v_sold > public.today_ist() or v_sold < date '2000-01-01' then
    perform public.bill_error('bad_sale_date');
  end if;

  -- The customer is needed: warranty is looked up by their mobile number.
  if v_phone is null then
    perform public.bill_error('customer_required');
  end if;
  v_phone := right(v_phone, 10);
  if v_phone !~ '^[6-9][0-9]{9}$' then
    perform public.bill_error('bad_phone');
  end if;
  select id into v_customer from public.customers where phone = v_phone;
  if v_customer is null then
    if v_name is null then
      perform public.bill_error('customer_name_required');
    end if;
    insert into public.customers (name, phone) values (v_name, v_phone) returning id into v_customer;
  end if;

  insert into public.units (product_id, serial_no, status, source, sold_on, warranty_start, customer_id)
  values (v_product.id, v_serial, 'sold', 'old_register', v_sold, v_sold, v_customer)
  returning id into v_unit;
  return jsonb_build_object('unit_id', v_unit, 'customer_id', v_customer);
end;
$$;

-- Home's "warranty registrations pending" leaves out old paper-register sales: those were
-- sold (and usually registered) long ago, so they would only clutter the to-do list.
-- They still show "Not registered" on their own card and can be ticked off there.
create or replace view public.v_attention_counts with (security_invoker = true) as
with pending_registrations as (
  select b.name as brand
  from public.units u
  join public.products p on p.id = u.product_id
  join public.brands b on b.id = p.brand_id
  where u.status = 'sold' and b.warranty_registration_required and u.warranty_registered_at is null
    and u.source <> 'old_register'
)
select
  (select count(*) from pending_registrations)::integer as warranty_pending,
  (select array_agg(distinct brand order by brand) from pending_registrations) as warranty_brands,
  (select count(*)
     from public.products p
     join public.v_product_stock s on s.product_id = p.id
     where p.active and not p.is_service and p.low_stock_level > 0 and s.in_stock <= p.low_stock_level
  )::integer as low_stock,
  (select count(*) from public.complaints where status <> 'resolved')::integer as open_complaints,
  (select count(*) from public.finance_deals where status = 'pending')::integer as bajaj_pending_count,
  (select coalesce(sum(expected_amount), 0) from public.finance_deals where status = 'pending') as bajaj_pending_amount,
  (select count(*)
     from public.units
     where status = 'in_stock' and arrived_on < public.today_ist() - interval '6 months'
  )::integer as old_stock;

-- New view and functions need their own permissions (nothing is exposed by default).
grant select on public.v_warranty_units to authenticated, service_role;
revoke execute on function public.warranty_search(text) from public, anon;
revoke execute on function public.add_old_sale(jsonb) from public, anon;
grant execute on function public.warranty_search(text) to authenticated, service_role;
grant execute on function public.add_old_sale(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
