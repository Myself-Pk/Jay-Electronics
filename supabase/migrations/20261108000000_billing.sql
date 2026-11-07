-- =====================================================================
-- Billing: save a bill (all or nothing), cancel it, look up serials,
-- share it by link, and tick off brand warranty registrations.
-- =====================================================================

-- A battery that is on the shelf but was never entered can be added while billing.
-- It is flagged (source = 'added_at_billing') so the owner can check it later.
alter table public.units drop constraint units_source_check;
alter table public.units add constraint units_source_check
  check (source in ('purchase', 'opening_stock', 'old_register', 'brand_replacement', 'added_at_billing'));

alter table public.stock_history drop constraint stock_history_reason_check;
alter table public.stock_history add constraint stock_history_reason_check check (reason in (
  'stock_arrived', 'opening_stock', 'sold', 'bill_cancelled', 'returned_by_customer',
  'returned_to_supplier', 'changed_by_owner', 'damaged', 'replacement', 'added_at_billing'
));

-- Only log a bill when its status changes (cancellation). Totals are filled in
-- by save_bill right after the bill row is created and shouldn't be logged.
drop trigger log_bills on public.bills;
create trigger log_bills after update on public.bills
  for each row when (old.status is distinct from new.status) execute function public.log_change();

-- The bill counter changes on every bill; only manual changes are logged (below).
drop trigger log_bill_counters on public.bill_counters;

create or replace function public.set_next_bill_number(p_fy_start_year integer, p_next_number integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  used integer;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can change bill numbers';
  end if;
  if p_next_number < 1 then
    raise exception 'Bill number must be 1 or more';
  end if;
  select coalesce(max(seq), 0) into used
  from public.bills
  where doc_type = 'bill' and fy_start_year = p_fy_start_year;
  if p_next_number <= used then
    raise exception 'Bill number % is already used. The next free number is %', p_next_number, used + 1;
  end if;
  insert into public.bill_counters (fy_start_year, doc_type, next_number)
  values (p_fy_start_year, 'bill', p_next_number)
  on conflict (fy_start_year, doc_type) do update set next_number = excluded.next_number;
  insert into public.change_log (table_name, record_id, action, after)
  values ('bill_counters', p_fy_start_year || '/bill', 'update', jsonb_build_object('next_number', p_next_number));
end;
$$;

-- ---------- Helpers ----------------------------------------------------

-- Raise an error the app turns into a friendly message (src/i18n: billErrors.<code>).
create or replace function public.bill_error(p_code text, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql as $$
begin
  raise exception '%', p_code using detail = p_detail::text, hint = 'bill_error';
end;
$$;

create or replace function public.warranty_text(p_free integer, p_prorata integer) returns text
language sql immutable as $$
  select case
    when p_free > 0 and p_prorata > 0 then p_free || ' months free + ' || p_prorata || ' months pro-rata'
    when p_free > 0 then p_free || ' months warranty'
    else ''
  end
$$;

-- Everything the New Bill screen needs to know about a product, with live stock.
create view public.v_catalog with (security_invoker = true) as
select
  p.id, p.model, p.capacity, p.type, p.mrp, p.retail_price, p.dealer_price, p.min_price,
  p.has_serial, p.is_service, p.warranty_free_months, p.warranty_prorata_months,
  p.hsn, p.gst_rate_pct, p.low_stock_level, p.active,
  p.brand_id, b.name as brand, coalesce(b.warranty_registration_required, false) as needs_registration,
  p.category_id, c.name as category, c.sort_order as category_order,
  coalesce(s.in_stock, 0) as in_stock
from public.products p
left join public.brands b on b.id = p.brand_id
join public.categories c on c.id = p.category_id
left join public.v_product_stock s on s.product_id = p.id;

-- Find a battery by serial number: in stock, or already sold (and to whom).
create or replace function public.lookup_serial(p_serial text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  if not public.is_active_person() then
    return null;
  end if;
  select jsonb_build_object(
    'unit_id', u.id, 'serial_no', u.serial_no, 'status', u.status, 'product_id', u.product_id,
    'sold_on', u.sold_on, 'bill_id', b.id, 'bill_number', b.number, 'customer_name', b.customer_name
  ) into result
  from public.units u
  left join public.bill_items bi on bi.id = u.bill_item_id
  left join public.bills b on b.id = bi.bill_id
  where upper(u.serial_no) = upper(trim(p_serial))
  limit 1;
  return result;
end;
$$;

-- ---------- Save a bill --------------------------------------------------
--
-- p_bill = {
--   customer: { id?, phone?, name?, area?, type? },
--   items:    [{ product_id, unit_id? | serial_no?, qty, rate }],
--   scrap:    [{ battery_type, weight_kg?, rate_per_kg?, fixed_amount? }],
--   payments: [{ mode, amount (towards the bill), charges, reference }],
--   finance:  { company, reference_no, loan_amount, customer_charges } | null,
--   notes
-- }
-- All money is recalculated here; totals sent by the app are never trusted.

create or replace function public.save_bill(p_bill jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_settings public.shop_settings;
  v_today date := public.today_ist();
  v_is_owner boolean := public.is_owner();
  v_fy integer;
  v_seq integer;
  v_number text;
  v_bill_id uuid;
  v_share_token text;
  v_customer jsonb := coalesce(p_bill -> 'customer', '{}'::jsonb);
  v_customer_id uuid;
  v_customer_name text;
  v_customer_phone text;
  v_customer_area text;
  v_customer_type text;
  v_found record;
  v_item jsonb;
  v_line integer := 0;
  v_product record;
  v_label text;
  v_unit public.units;
  v_unit_found boolean;
  v_unit_id uuid;
  v_serial text;
  v_seen uuid[] := '{}';
  v_qty numeric;
  v_rate numeric;
  v_amount numeric;
  v_item_id uuid;
  v_cost numeric;
  v_subtotal numeric := 0;
  v_scrap jsonb;
  v_scrap_value numeric;
  v_scrap_total numeric := 0;
  v_payment jsonb;
  v_towards numeric;
  v_charge numeric;
  v_charges_total numeric := 0;
  v_paid numeric := 0;
  v_finance jsonb := p_bill -> 'finance';
  v_loan numeric := 0;
  v_finance_charges numeric := 0;
  v_pre_round numeric;
  v_total numeric;
  v_needs_customer boolean := false;
begin
  if not public.is_active_person() then
    perform public.bill_error('not_logged_in');
  end if;

  select * into v_settings from public.shop_settings where id = 1;
  if v_settings.gst_scheme = 'regular' and v_today >= v_settings.scheme_from then
    perform public.bill_error('regular_gst_not_ready');
  end if;

  if jsonb_typeof(p_bill -> 'items') is distinct from 'array' or jsonb_array_length(p_bill -> 'items') = 0 then
    perform public.bill_error('no_items');
  end if;

  -- Customer: an existing one, found by phone, or a new one.
  v_customer_phone := nullif(regexp_replace(coalesce(v_customer ->> 'phone', ''), '\D', '', 'g'), '');
  v_customer_name := nullif(trim(coalesce(v_customer ->> 'name', '')), '');
  v_customer_area := trim(coalesce(v_customer ->> 'area', ''));
  v_customer_type := coalesce(nullif(v_customer ->> 'type', ''), 'retail');
  if v_customer ->> 'id' is not null then
    select id, name, phone, area into v_found from public.customers where id = (v_customer ->> 'id')::uuid;
    if not found then
      perform public.bill_error('customer_not_found');
    end if;
    v_customer_id := v_found.id;
    v_customer_name := coalesce(v_customer_name, v_found.name);
    v_customer_phone := coalesce(v_found.phone, v_customer_phone);
    v_customer_area := coalesce(nullif(v_customer_area, ''), v_found.area);
  elsif v_customer_phone is not null then
    if v_customer_phone !~ '^[6-9][0-9]{9}$' then
      perform public.bill_error('bad_phone');
    end if;
    select id, name, area into v_found from public.customers where phone = v_customer_phone;
    if found then
      v_customer_id := v_found.id;
      v_customer_name := coalesce(v_customer_name, v_found.name);
      v_customer_area := coalesce(nullif(v_customer_area, ''), v_found.area);
    else
      if v_customer_name is null then
        perform public.bill_error('customer_name_required');
      end if;
      insert into public.customers (name, phone, area, customer_type)
      values (v_customer_name, v_customer_phone, v_customer_area, v_customer_type)
      returning id into v_customer_id;
    end if;
  end if;

  -- Bill number: next in this financial year's series, never reused.
  v_fy := case when extract(month from v_today) >= 4
               then extract(year from v_today)::integer
               else extract(year from v_today)::integer - 1 end;
  insert into public.bill_counters (fy_start_year, doc_type, next_number)
  values (v_fy, 'bill', 1)
  on conflict (fy_start_year, doc_type) do nothing;
  select next_number into v_seq
  from public.bill_counters where fy_start_year = v_fy and doc_type = 'bill' for update;
  select greatest(v_seq, coalesce(max(seq), 0) + 1) into v_seq
  from public.bills where doc_type = 'bill' and fy_start_year = v_fy;
  update public.bill_counters set next_number = v_seq + 1 where fy_start_year = v_fy and doc_type = 'bill';
  v_number := v_settings.bill_prefix || '/'
    || lpad((v_fy % 100)::text, 2, '0') || '-' || lpad(((v_fy + 1) % 100)::text, 2, '0') || '/'
    || case when v_seq < 10000 then lpad(v_seq::text, 4, '0') else v_seq::text end;

  insert into public.bills (
    doc_type, title, fy_start_year, seq, number, bill_date, customer_id,
    customer_name, customer_phone, customer_address, notes
  ) values (
    'bill', 'bill_of_supply', v_fy, v_seq, v_number, v_today, v_customer_id,
    coalesce(v_customer_name, ''), coalesce(v_customer_phone, ''), coalesce(v_customer_area, ''),
    coalesce(p_bill ->> 'notes', '')
  ) returning id, share_token into v_bill_id, v_share_token;

  -- Items
  for v_item in select * from jsonb_array_elements(p_bill -> 'items') loop
    v_line := v_line + 1;
    select p.*, b.name as brand_name into v_product
    from public.products p left join public.brands b on b.id = p.brand_id
    where p.id = (v_item ->> 'product_id')::uuid and p.active;
    if not found then
      perform public.bill_error('product_not_found');
    end if;
    v_label := concat_ws(' ', v_product.brand_name, v_product.model, nullif(v_product.capacity, ''));
    v_qty := coalesce((v_item ->> 'qty')::numeric, 1);
    v_rate := (v_item ->> 'rate')::numeric;
    if v_qty <= 0 or (not v_product.is_service and v_qty <> trunc(v_qty)) then
      perform public.bill_error('bad_qty', jsonb_build_object('product', v_label));
    end if;
    if v_rate is null or v_rate < 0 then
      perform public.bill_error('bad_rate', jsonb_build_object('product', v_label));
    end if;
    if v_product.mrp is not null and v_rate > v_product.mrp then
      perform public.bill_error('above_mrp', jsonb_build_object('product', v_label, 'mrp', v_product.mrp));
    end if;
    if not v_is_owner and v_product.min_price is not null and v_rate < v_product.min_price then
      perform public.bill_error('below_min_price', jsonb_build_object('product', v_label));
    end if;

    v_unit_id := null;
    v_serial := null;
    if v_product.has_serial then
      v_needs_customer := true;
      if v_qty <> 1 then
        perform public.bill_error('bad_qty', jsonb_build_object('product', v_label));
      end if;
      if v_item ->> 'unit_id' is not null then
        select * into v_unit from public.units where id = (v_item ->> 'unit_id')::uuid for update;
        v_unit_found := found;
      else
        v_serial := upper(trim(coalesce(v_item ->> 'serial_no', '')));
        if v_serial = '' then
          perform public.bill_error('serial_required', jsonb_build_object('product', v_label));
        end if;
        select * into v_unit from public.units where upper(serial_no) = v_serial for update;
        v_unit_found := found;
      end if;

      if v_unit_found then
        if v_unit.id = any (v_seen) then
          perform public.bill_error('duplicate_serial', jsonb_build_object('serial', v_unit.serial_no));
        end if;
        if v_unit.status = 'sold' then
          select b.number, b.customer_name into v_found
          from public.bill_items bi join public.bills b on b.id = bi.bill_id
          where bi.id = v_unit.bill_item_id;
          perform public.bill_error('serial_sold', jsonb_build_object(
            'serial', v_unit.serial_no, 'bill', v_found.number, 'customer', v_found.customer_name));
        end if;
        if v_unit.status <> 'in_stock' then
          perform public.bill_error('serial_not_available', jsonb_build_object('serial', v_unit.serial_no));
        end if;
        if v_unit.product_id <> v_product.id then
          perform public.bill_error('serial_other_product', jsonb_build_object('serial', v_unit.serial_no));
        end if;
        v_unit_id := v_unit.id;
        v_serial := v_unit.serial_no;
      elsif v_item ->> 'unit_id' is not null then
        perform public.bill_error('serial_not_available', jsonb_build_object('serial', ''));
      else
        insert into public.units (product_id, serial_no, status, source, arrived_on)
        values (v_product.id, v_serial, 'in_stock', 'added_at_billing', v_today)
        returning id into v_unit_id;
        insert into public.stock_history (product_id, unit_id, change, reason, note, ref_type, ref_id)
        values (v_product.id, v_unit_id, 1, 'added_at_billing', 'Serial was not in stock; added while billing',
                'bill', v_bill_id);
      end if;
    end if;

    v_amount := round(v_qty * v_rate, 2);
    v_subtotal := v_subtotal + v_amount;

    insert into public.bill_items (bill_id, line_no, product_id, unit_id, description, serial_no,
                                   warranty_text, hsn, qty, rate, amount)
    values (v_bill_id, v_line, v_product.id, v_unit_id, v_label, v_serial,
            case when v_product.has_serial
                 then public.warranty_text(v_product.warranty_free_months, v_product.warranty_prorata_months)
                 else '' end,
            v_product.hsn, v_qty, v_rate, v_amount)
    returning id into v_item_id;

    -- What the shop paid for it (owner-only table, used for profit).
    v_cost := null;
    if v_unit_id is not null then
      select pi.unit_cost into v_cost
      from public.units u join public.purchase_items pi on pi.id = u.purchase_item_id
      where u.id = v_unit_id;
    end if;
    if v_cost is null then
      select purchase_price into v_cost from public.product_costs where product_id = v_product.id;
    end if;
    insert into public.bill_item_costs (bill_item_id, unit_cost) values (v_item_id, coalesce(v_cost, 0));

    if v_unit_id is not null then
      update public.units
      set status = 'sold', sold_on = v_today, customer_id = v_customer_id,
          bill_item_id = v_item_id, warranty_start = v_today
      where id = v_unit_id;
      v_seen := v_seen || v_unit_id;
    end if;
    if not v_product.is_service then
      insert into public.stock_history (product_id, unit_id, change, reason, ref_type, ref_id)
      values (v_product.id, v_unit_id, -v_qty::integer, 'sold', 'bill', v_bill_id);
    end if;
  end loop;

  -- Old batteries taken in exchange
  for v_scrap in select * from jsonb_array_elements(coalesce(p_bill -> 'scrap', '[]'::jsonb)) loop
    if v_scrap ->> 'fixed_amount' is not null then
      v_scrap_value := (v_scrap ->> 'fixed_amount')::numeric;
    else
      v_scrap_value := round((v_scrap ->> 'weight_kg')::numeric * (v_scrap ->> 'rate_per_kg')::numeric, 2);
    end if;
    if v_scrap_value is null or v_scrap_value <= 0 then
      perform public.bill_error('bad_scrap');
    end if;
    insert into public.scrap_entries (direction, bill_id, battery_type, weight_kg, rate_per_kg, fixed_amount, value)
    values ('in', v_bill_id, coalesce(v_scrap ->> 'battery_type', ''),
            case when v_scrap ->> 'fixed_amount' is null then (v_scrap ->> 'weight_kg')::numeric end,
            case when v_scrap ->> 'fixed_amount' is null then (v_scrap ->> 'rate_per_kg')::numeric end,
            (v_scrap ->> 'fixed_amount')::numeric, v_scrap_value);
    v_scrap_total := v_scrap_total + v_scrap_value;
  end loop;

  -- Payments (cash, UPI, cards). Card charges are added to the bill.
  for v_payment in select * from jsonb_array_elements(coalesce(p_bill -> 'payments', '[]'::jsonb)) loop
    v_towards := (v_payment ->> 'amount')::numeric;
    v_charge := coalesce((v_payment ->> 'charges')::numeric, 0);
    if coalesce(v_payment ->> 'mode', '') not in ('cash', 'upi', 'debit_card', 'credit_card', 'bank')
       or v_towards is null or v_towards <= 0 or v_charge < 0 then
      perform public.bill_error('bad_payment');
    end if;
    insert into public.payments (direction, customer_id, bill_id, mode, amount, charges, reference, paid_on)
    values ('in', v_customer_id, v_bill_id, v_payment ->> 'mode', v_towards + v_charge, v_charge,
            coalesce(v_payment ->> 'reference', ''), v_today);
    v_paid := v_paid + v_towards + v_charge;
    v_charges_total := v_charges_total + v_charge;
  end loop;

  -- Bajaj Finance: the loan counts as paid; Bajaj owes the shop until it settles.
  if jsonb_typeof(v_finance) = 'object' then
    v_loan := (v_finance ->> 'loan_amount')::numeric;
    v_finance_charges := coalesce((v_finance ->> 'customer_charges')::numeric, 0);
    if v_loan is null or v_loan <= 0 or v_finance_charges < 0 then
      perform public.bill_error('bad_finance');
    end if;
    v_needs_customer := true;
    insert into public.payments (direction, customer_id, bill_id, mode, amount, charges, reference, paid_on)
    values ('in', v_customer_id, v_bill_id, 'bajaj', v_loan, 0, coalesce(v_finance ->> 'reference_no', ''), v_today);
    insert into public.finance_deals (bill_id, company, reference_no, down_payment, loan_amount,
                                      customer_charges, expected_amount)
    values (v_bill_id, coalesce(nullif(v_finance ->> 'company', ''), 'Bajaj Finance'),
            coalesce(v_finance ->> 'reference_no', ''), v_paid, v_loan, v_finance_charges, v_loan);
    v_paid := v_paid + v_loan;
  end if;

  -- Totals
  v_pre_round := v_subtotal - v_scrap_total + v_charges_total + v_finance_charges;
  v_total := round(v_pre_round, 0);
  if v_total < 0 then
    perform public.bill_error('negative_total');
  end if;
  if v_paid > v_total then
    perform public.bill_error('overpaid', jsonb_build_object('paid', v_paid, 'total', v_total));
  end if;
  if v_total - v_paid > 0 then
    v_needs_customer := true;
  end if;
  if v_needs_customer and v_customer_id is null then
    perform public.bill_error('customer_required');
  end if;

  update public.bills
  set subtotal = v_subtotal, scrap_credit = v_scrap_total, extra_charges = v_charges_total + v_finance_charges,
      round_off = v_total - v_pre_round, total = v_total, paid = v_paid, balance = v_total - v_paid
  where id = v_bill_id;

  return jsonb_build_object('id', v_bill_id, 'number', v_number, 'share_token', v_share_token);
end;
$$;

-- ---------- Cancel a bill (owner only) ---------------------------------

create or replace function public.cancel_bill(p_bill_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_bill public.bills;
  v_item record;
begin
  if not public.is_owner() then
    perform public.bill_error('owner_only');
  end if;
  if coalesce(trim(p_reason), '') = '' then
    perform public.bill_error('reason_required');
  end if;
  select * into v_bill from public.bills where id = p_bill_id for update;
  if not found or v_bill.doc_type <> 'bill' then
    perform public.bill_error('bill_not_found');
  end if;
  if v_bill.status = 'cancelled' then
    perform public.bill_error('already_cancelled');
  end if;

  update public.bills
  set status = 'cancelled', cancel_reason = trim(p_reason), cancelled_by = auth.uid(), cancelled_at = now()
  where id = p_bill_id;

  -- Put everything back in stock.
  for v_item in
    select bi.product_id, bi.unit_id, bi.qty, p.is_service
    from public.bill_items bi join public.products p on p.id = bi.product_id
    where bi.bill_id = p_bill_id
  loop
    if v_item.unit_id is not null then
      update public.units
      set status = 'in_stock', sold_on = null, customer_id = null, bill_item_id = null,
          warranty_start = null, warranty_registered_at = null, warranty_reg_ref = ''
      where id = v_item.unit_id;
    end if;
    if not v_item.is_service then
      insert into public.stock_history (product_id, unit_id, change, reason, ref_type, ref_id)
      values (v_item.product_id, v_item.unit_id, v_item.qty::integer, 'bill_cancelled', 'bill', p_bill_id);
    end if;
  end loop;

  update public.payments set status = 'cancelled' where bill_id = p_bill_id;
  update public.finance_deals set status = 'cancelled' where bill_id = p_bill_id;
end;
$$;

-- ---------- Read a whole bill -------------------------------------------

create or replace function public.bill_json(p_bill_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bill', to_jsonb(b),
    'billed_by', (select name from public.people where id = b.billed_by),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'line_no', bi.line_no, 'description', bi.description, 'serial_no', bi.serial_no,
        'warranty_text', bi.warranty_text, 'hsn', bi.hsn, 'qty', bi.qty, 'rate', bi.rate, 'amount', bi.amount,
        'unit_id', bi.unit_id, 'brand', br.name,
        'needs_registration', coalesce(br.warranty_registration_required, false),
        'registered_at', u.warranty_registered_at
      ) order by bi.line_no)
      from public.bill_items bi
      left join public.products p on p.id = bi.product_id
      left join public.brands br on br.id = p.brand_id
      left join public.units u on u.id = bi.unit_id and u.bill_item_id = bi.id
      where bi.bill_id = b.id
    ), '[]'::jsonb),
    'scrap', coalesce((
      select jsonb_agg(jsonb_build_object(
        'battery_type', s.battery_type, 'weight_kg', s.weight_kg, 'rate_per_kg', s.rate_per_kg,
        'fixed_amount', s.fixed_amount, 'value', s.value
      ) order by s.created_at)
      from public.scrap_entries s where s.bill_id = b.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mode', pm.mode, 'amount', pm.amount, 'charges', pm.charges, 'reference', pm.reference, 'status', pm.status
      ) order by pm.created_at)
      from public.payments pm where pm.bill_id = b.id
    ), '[]'::jsonb),
    'finance', (
      select jsonb_build_object(
        'company', f.company, 'reference_no', f.reference_no, 'loan_amount', f.loan_amount,
        'customer_charges', f.customer_charges, 'status', f.status
      )
      from public.finance_deals f where f.bill_id = b.id limit 1
    ),
    'shop', (
      select jsonb_build_object(
        'shop_name', s.shop_name, 'address', s.address, 'phone', s.phone, 'gstin', s.gstin,
        'upi_id', s.upi_id, 'bill_terms', s.bill_terms
      )
      from public.shop_settings s where s.id = 1
    )
  )
  from public.bills b
  where b.id = p_bill_id
$$;
revoke execute on function public.bill_json(uuid) from public, anon, authenticated;

create or replace function public.get_bill(p_bill_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_person() then
    return null;
  end if;
  return public.bill_json(p_bill_id);
end;
$$;

-- Anyone with the link (sent to the customer on WhatsApp) can see that one bill.
create or replace function public.get_shared_bill(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.bill_json(b.id)
  from public.bills b
  where b.share_token = p_token and b.doc_type = 'bill'
$$;
grant execute on function public.get_shared_bill(text) to anon, authenticated;

-- ---------- Brand warranty registration ---------------------------------

create or replace function public.mark_warranty_registered(p_unit_id uuid, p_reference text default '')
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_person() then
    perform public.bill_error('not_logged_in');
  end if;
  update public.units
  set warranty_registered_at = now(), warranty_reg_ref = coalesce(trim(p_reference), '')
  where id = p_unit_id and status = 'sold';
  if not found then
    perform public.bill_error('serial_not_available', jsonb_build_object('serial', ''));
  end if;
end;
$$;
