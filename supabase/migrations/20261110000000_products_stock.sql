-- =====================================================================
-- Products and stock arrival:
--   save_product(jsonb)   add or edit a product (owner only)
--   receive_stock(jsonb)  "New stock arrived" / opening stock, with serial numbers
-- Errors use bill_error('<code>') like billing, shown via billErrors.<code>.
-- =====================================================================

-- Indexes on columns used to join tables (keeps lookups fast as data grows).
create index if not exists purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index if not exists purchase_items_product_idx on public.purchase_items (product_id);
create index if not exists units_purchase_item_idx on public.units (purchase_item_id);
create index if not exists payments_bill_idx on public.payments (bill_id);
create index if not exists scrap_entries_bill_idx on public.scrap_entries (bill_id);
create index if not exists finance_deals_bill_idx on public.finance_deals (bill_id);
create index if not exists stock_history_ref_idx on public.stock_history (ref_id);
create index if not exists purchases_date_idx on public.purchases (bill_date);

-- ---------- Add or edit a product ---------------------------------------
--
-- p = { id?, category_id | category (name), brand (name, created if new), model, capacity, type,
--       mrp, retail_price, dealer_price, min_price, has_serial, warranty_free_months,
--       warranty_prorata_months, low_stock_level, hsn, gst_rate_pct, active,
--       purchase_price, opening_stock (new count-based products only) }

create or replace function public.save_product(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_category public.categories;
  v_brand_name text := nullif(trim(coalesce(p ->> 'brand', '')), '');
  v_brand_id uuid;
  v_model text := trim(coalesce(p ->> 'model', ''));
  v_capacity text := trim(coalesce(p ->> 'capacity', ''));
  v_has_serial boolean;
  v_existing public.products;
  v_label text;
  v_opening integer := nullif(p ->> 'opening_stock', '')::integer;
  v_cost numeric := nullif(p ->> 'purchase_price', '')::numeric;
begin
  if not public.is_owner() then
    perform public.bill_error('owner_only');
  end if;
  if v_model = '' then
    perform public.bill_error('model_required');
  end if;

  select * into v_category from public.categories
  where id = nullif(p ->> 'category_id', '')::uuid
     or (p ->> 'category_id' is null and lower(name) = lower(trim(coalesce(p ->> 'category', ''))));
  if v_category.id is null then
    perform public.bill_error('category_not_found', jsonb_build_object('category', coalesce(p ->> 'category', '')));
  end if;

  if v_brand_name is not null then
    select id into v_brand_id from public.brands where lower(name) = lower(v_brand_name);
    if v_brand_id is null then
      insert into public.brands (name) values (v_brand_name) returning id into v_brand_id;
    end if;
  end if;

  v_label := concat_ws(' ', v_brand_name, v_model, nullif(v_capacity, ''));
  if exists (
    select 1 from public.products
    where coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = coalesce(v_brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and lower(model) = lower(v_model) and lower(capacity) = lower(v_capacity)
      and id is distinct from v_id
  ) then
    perform public.bill_error('product_exists', jsonb_build_object('product', v_label));
  end if;

  v_has_serial := case when v_category.is_service then false
                       else coalesce((p ->> 'has_serial')::boolean, v_category.has_serial_by_default) end;

  if coalesce(nullif(p ->> 'retail_price', '')::numeric, 0) < 0
     or coalesce(nullif(p ->> 'mrp', '')::numeric, 0) < 0
     or coalesce(v_cost, 0) < 0 then
    perform public.bill_error('bad_rate', jsonb_build_object('product', v_label));
  end if;
  if nullif(p ->> 'mrp', '') is not null
     and coalesce(nullif(p ->> 'retail_price', '')::numeric, 0) > nullif(p ->> 'mrp', '')::numeric then
    perform public.bill_error('above_mrp', jsonb_build_object('product', v_label, 'mrp', p ->> 'mrp'));
  end if;

  if v_id is null then
    insert into public.products (
      brand_id, category_id, model, capacity, type, mrp, retail_price, dealer_price, min_price,
      has_serial, is_service, warranty_free_months, warranty_prorata_months, low_stock_level, hsn, gst_rate_pct
    ) values (
      v_brand_id, v_category.id, v_model, v_capacity, trim(coalesce(p ->> 'type', '')),
      nullif(p ->> 'mrp', '')::numeric, coalesce(nullif(p ->> 'retail_price', '')::numeric, 0),
      nullif(p ->> 'dealer_price', '')::numeric, nullif(p ->> 'min_price', '')::numeric,
      v_has_serial, v_category.is_service,
      coalesce(nullif(p ->> 'warranty_free_months', '')::integer, 0),
      coalesce(nullif(p ->> 'warranty_prorata_months', '')::integer, 0),
      coalesce(nullif(p ->> 'low_stock_level', '')::integer, 0),
      coalesce(nullif(trim(p ->> 'hsn'), ''), v_category.default_hsn),
      coalesce(nullif(p ->> 'gst_rate_pct', '')::numeric, v_category.default_gst_rate_pct)
    ) returning id into v_id;

    -- Opening stock for count-based items (batteries get theirs by scanning serials).
    if coalesce(v_opening, 0) > 0 and not v_has_serial and not v_category.is_service then
      insert into public.stock_history (product_id, change, reason, note)
      values (v_id, v_opening, 'opening_stock', 'Entered with the product');
    end if;
  else
    select * into v_existing from public.products where id = v_id for update;
    if not found then
      perform public.bill_error('product_not_found');
    end if;
    -- Switching serial numbers on/off would break the stock count once stock exists.
    if v_existing.has_serial <> v_has_serial
       and exists (select 1 from public.stock_history where product_id = v_id) then
      perform public.bill_error('cannot_change_serial', jsonb_build_object('product', v_label));
    end if;
    update public.products set
      brand_id = v_brand_id, category_id = v_category.id, model = v_model, capacity = v_capacity,
      type = trim(coalesce(p ->> 'type', '')),
      mrp = nullif(p ->> 'mrp', '')::numeric,
      retail_price = coalesce(nullif(p ->> 'retail_price', '')::numeric, 0),
      dealer_price = nullif(p ->> 'dealer_price', '')::numeric,
      min_price = nullif(p ->> 'min_price', '')::numeric,
      has_serial = v_has_serial, is_service = v_category.is_service,
      warranty_free_months = coalesce(nullif(p ->> 'warranty_free_months', '')::integer, 0),
      warranty_prorata_months = coalesce(nullif(p ->> 'warranty_prorata_months', '')::integer, 0),
      low_stock_level = coalesce(nullif(p ->> 'low_stock_level', '')::integer, 0),
      hsn = coalesce(nullif(trim(p ->> 'hsn'), ''), v_category.default_hsn),
      gst_rate_pct = coalesce(nullif(p ->> 'gst_rate_pct', '')::numeric, v_existing.gst_rate_pct),
      active = coalesce((p ->> 'active')::boolean, v_existing.active)
    where id = v_id;
  end if;

  if v_cost is not null then
    insert into public.product_costs (product_id, purchase_price) values (v_id, v_cost)
    on conflict (product_id) do update set purchase_price = excluded.purchase_price, updated_at = now();
  end if;

  return v_id;
end;
$$;

-- ---------- New stock arrived / opening stock ----------------------------
--
-- p = { kind: 'purchase' | 'opening_stock', supplier_id? | supplier_name?, supplier_bill_no, bill_date,
--       items: [{ product_id, qty, rate (per unit, before GST), gst_paid (whole line), serials: [] }], notes }

create or replace function public.receive_stock(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_kind text := coalesce(nullif(p ->> 'kind', ''), 'purchase');
  v_supplier_id uuid := nullif(p ->> 'supplier_id', '')::uuid;
  v_supplier_name text := nullif(trim(coalesce(p ->> 'supplier_name', '')), '');
  v_date date := coalesce(nullif(p ->> 'bill_date', '')::date, public.today_ist());
  v_purchase_id uuid;
  v_item jsonb;
  v_product record;
  v_label text;
  v_qty numeric;
  v_rate numeric;
  v_gst numeric;
  v_amount numeric;
  v_unit_cost numeric;
  v_item_id uuid;
  v_unit_id uuid;
  v_serial text;
  v_serials text[];
  v_seen text[] := '{}';
  v_total numeric := 0;
  v_reason text;
begin
  if not public.is_active_person() then
    perform public.bill_error('not_logged_in');
  end if;
  if v_kind not in ('purchase', 'opening_stock') then
    perform public.bill_error('bad_kind');
  end if;
  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(p -> 'items') = 0 then
    perform public.bill_error('no_items');
  end if;
  if v_date > public.today_ist() then
    perform public.bill_error('future_date');
  end if;

  if v_kind = 'purchase' then
    if v_supplier_id is null and v_supplier_name is not null then
      select id into v_supplier_id from public.suppliers where lower(name) = lower(v_supplier_name);
      if v_supplier_id is null then
        insert into public.suppliers (name) values (v_supplier_name) returning id into v_supplier_id;
      end if;
    end if;
    if v_supplier_id is null or not exists (select 1 from public.suppliers where id = v_supplier_id) then
      perform public.bill_error('supplier_required');
    end if;
  else
    v_supplier_id := null;
  end if;
  v_reason := case when v_kind = 'opening_stock' then 'opening_stock' else 'stock_arrived' end;

  insert into public.purchases (kind, supplier_id, supplier_bill_no, bill_date, notes)
  values (v_kind, v_supplier_id, trim(coalesce(p ->> 'supplier_bill_no', '')), v_date, coalesce(p ->> 'notes', ''))
  returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    select pr.*, b.name as brand_name into v_product
    from public.products pr left join public.brands b on b.id = pr.brand_id
    where pr.id = (v_item ->> 'product_id')::uuid and pr.active;
    if not found then
      perform public.bill_error('product_not_found');
    end if;
    v_label := concat_ws(' ', v_product.brand_name, v_product.model, nullif(v_product.capacity, ''));
    if v_product.is_service then
      perform public.bill_error('service_not_stock', jsonb_build_object('product', v_label));
    end if;

    v_rate := coalesce(nullif(v_item ->> 'rate', '')::numeric, 0);
    v_gst := coalesce(nullif(v_item ->> 'gst_paid', '')::numeric, 0);
    if v_rate < 0 or v_gst < 0 then
      perform public.bill_error('bad_rate', jsonb_build_object('product', v_label));
    end if;

    if v_product.has_serial then
      select coalesce(array_agg(upper(trim(s))), '{}') into v_serials
      from jsonb_array_elements_text(coalesce(v_item -> 'serials', '[]'::jsonb)) as s
      where trim(s) <> '';
      v_qty := coalesce(array_length(v_serials, 1), 0);
      if v_qty = 0 then
        perform public.bill_error('serial_required', jsonb_build_object('product', v_label));
      end if;
    else
      v_qty := (v_item ->> 'qty')::numeric;
      if v_qty is null or v_qty <= 0 or v_qty <> trunc(v_qty) then
        perform public.bill_error('bad_qty', jsonb_build_object('product', v_label));
      end if;
    end if;

    v_amount := round(v_qty * v_rate + v_gst, 2);
    -- Composition scheme: GST paid can't be claimed back, so it is part of the cost.
    v_unit_cost := round(v_amount / v_qty, 2);
    insert into public.purchase_items (purchase_id, product_id, qty, rate, gst_paid, unit_cost, amount)
    values (v_purchase_id, v_product.id, v_qty, v_rate, v_gst, v_unit_cost, v_amount)
    returning id into v_item_id;
    v_total := v_total + v_amount;

    if v_product.has_serial then
      foreach v_serial in array v_serials loop
        if v_serial = any (v_seen) then
          perform public.bill_error('duplicate_serial', jsonb_build_object('serial', v_serial));
        end if;
        if exists (select 1 from public.units where upper(serial_no) = v_serial) then
          perform public.bill_error('serial_exists', jsonb_build_object('serial', v_serial));
        end if;
        v_seen := v_seen || v_serial;
        insert into public.units (product_id, serial_no, status, source, arrived_on, purchase_item_id)
        values (v_product.id, v_serial, 'in_stock', case when v_kind = 'opening_stock' then 'opening_stock' else 'purchase' end,
                v_date, v_item_id)
        returning id into v_unit_id;
        insert into public.stock_history (product_id, unit_id, change, reason, ref_type, ref_id)
        values (v_product.id, v_unit_id, 1, v_reason, 'purchase', v_purchase_id);
      end loop;
    else
      insert into public.stock_history (product_id, change, reason, ref_type, ref_id)
      values (v_product.id, v_qty::integer, v_reason, 'purchase', v_purchase_id);
    end if;

    -- Keep the product's purchase price up to date with the latest bill.
    if v_unit_cost > 0 then
      insert into public.product_costs (product_id, purchase_price) values (v_product.id, v_unit_cost)
      on conflict (product_id) do update set purchase_price = excluded.purchase_price, updated_at = now();
    end if;
  end loop;

  update public.purchases set total = v_total where id = v_purchase_id;
  return v_purchase_id;
end;
$$;

-- New functions are closed by default (see *_api_grants.sql); open these two to logged-in people.
revoke execute on function public.save_product(jsonb) from public, anon;
revoke execute on function public.receive_stock(jsonb) from public, anon;
grant execute on function public.save_product(jsonb) to authenticated, service_role;
grant execute on function public.receive_stock(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
