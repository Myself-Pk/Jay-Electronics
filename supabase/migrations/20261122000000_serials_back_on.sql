-- =====================================================================
-- Serial numbers back on (owner's choice, 27 Nov 2026).
-- Stock arrives by scanning each piece's barcode / QR code, which is saved as
-- its serial number. A piece saved under the wrong product can be moved to
-- the right one later (move_unit) while it is still in the shop.
-- =====================================================================

-- A stock change made by moving a serial to another product.
alter table public.stock_history drop constraint stock_history_reason_check;
alter table public.stock_history add constraint stock_history_reason_check check (reason in (
  'stock_arrived', 'opening_stock', 'sold', 'bill_cancelled', 'returned_by_customer',
  'returned_to_supplier', 'changed_by_owner', 'damaged', 'replacement', 'added_at_billing',
  'product_changed'
));

-- save_product: serial numbers may now be switched on/off whenever the product has
-- no stock (before: never once it had any stock history at all).
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
    -- Serial numbers can be switched on/off only while the product has no stock
    -- (stock 0 and no serial-numbered piece in the shop); otherwise the count would break.
    if v_existing.has_serial <> v_has_serial
       and (coalesce((select sum(change) from public.stock_history where product_id = v_id), 0) <> 0
            or exists (select 1 from public.units where product_id = v_id and status = 'in_stock')) then
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

-- Products whose category is counted by serial number (batteries, inverters, solar,
-- stabilizers…) and that have no stock right now go back to serial numbers.
-- Accessories (trolleys, distilled water…) stay counted by quantity.
update public.products p
set has_serial = true
from public.categories c
where c.id = p.category_id
  and c.has_serial_by_default
  and not p.is_service
  and not p.has_serial
  and coalesce((select sum(h.change) from public.stock_history h where h.product_id = p.id), 0) = 0
  and not exists (select 1 from public.units u where u.product_id = p.id and u.status = 'in_stock');

-- ---------------------------------------------------------------------
-- move_unit({ unit_id, product_id }): a piece in the shop was saved under the
-- wrong product. Moves it (and one piece of stock) to the right product.
-- Sold pieces can't be moved: their bill is final.
-- ---------------------------------------------------------------------
create or replace function public.move_unit(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_unit public.units%rowtype;
  v_to public.products%rowtype;
  v_from_label text;
  v_to_label text;
begin
  if not public.is_active_person() then
    perform public.bill_error('not_logged_in');
  end if;
  select * into v_unit from public.units where id = nullif(p ->> 'unit_id', '')::uuid for update;
  if not found then
    perform public.bill_error('unit_not_found');
  end if;
  select * into v_to from public.products where id = nullif(p ->> 'product_id', '')::uuid for update;
  if not found or not v_to.active then
    perform public.bill_error('product_not_found');
  end if;
  select concat_ws(' ', b.name, v_to.model, nullif(v_to.capacity, '')) into v_to_label
  from (select 1) x left join public.brands b on b.id = v_to.brand_id;
  if v_to.is_service or not v_to.has_serial then
    perform public.bill_error('not_serial_product', jsonb_build_object('product', v_to_label));
  end if;
  if v_unit.status <> 'in_stock' then
    perform public.bill_error('unit_not_in_stock', jsonb_build_object('serial', v_unit.serial_no));
  end if;
  if v_unit.product_id = v_to.id then
    return v_unit.id;
  end if;
  select concat_ws(' ', b.name, pr.model, nullif(pr.capacity, '')) into v_from_label
  from public.products pr left join public.brands b on b.id = pr.brand_id where pr.id = v_unit.product_id;

  insert into public.stock_history (product_id, unit_id, change, reason, note) values
    (v_unit.product_id, v_unit.id, -1, 'product_changed', 'Serial ' || v_unit.serial_no || ' moved to ' || v_to_label),
    (v_to.id, v_unit.id, 1, 'product_changed', 'Serial ' || v_unit.serial_no || ' moved from ' || v_from_label);
  update public.units set product_id = v_to.id where id = v_unit.id;
  return v_unit.id;
end;
$$;

revoke execute on function public.move_unit(jsonb) from public, anon;
grant execute on function public.move_unit(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
