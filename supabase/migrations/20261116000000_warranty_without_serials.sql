-- =====================================================================
-- Serial numbers are switched off for now (owner's choice, Nov 2026): products are
-- counted by quantity. Warranty still belongs to the product, so:
--   1. every bill line prints the product's warranty ("48 months free + 24 months
--      pro-rata"), not only lines with a serial number;
--   2. an old sale from the paper register can be added for any product that isn't
--      a service (the serial typed in is kept, so Warranty Check still finds it).
-- =====================================================================

-- 1. Fill in the warranty text on new bill lines that don't have one yet.
create or replace function public.bill_item_warranty_text() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(new.warranty_text, '') = '' and new.product_id is not null then
    select public.warranty_text(p.warranty_free_months, p.warranty_prorata_months)
      into new.warranty_text
    from public.products p
    where p.id = new.product_id and not p.is_service;
    new.warranty_text := coalesce(new.warranty_text, '');
  end if;
  return new;
end;
$$;

create trigger bill_items_warranty_text before insert on public.bill_items
  for each row execute function public.bill_item_warranty_text();

-- 2. Old sales: only services are refused now (they have no warranty).
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
  if v_product.is_service then
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

  -- A sold unit never counts as stock (stock comes from stock_history), so this is safe
  -- for counted products too.
  insert into public.units (product_id, serial_no, status, source, sold_on, warranty_start, customer_id)
  values (v_product.id, v_serial, 'sold', 'old_register', v_sold, v_sold, v_customer)
  returning id into v_unit;
  return jsonb_build_object('unit_id', v_unit, 'customer_id', v_customer);
end;
$$;

revoke execute on function public.add_old_sale(jsonb) from public, anon;
grant execute on function public.add_old_sale(jsonb) to authenticated, service_role;
revoke execute on function public.bill_item_warranty_text() from public, anon, authenticated;

notify pgrst, 'reload schema';
