-- =====================================================================
-- GST Tax Invoices (the shop is a Regular GST dealer, GSTIN 20AEMPK3613H1ZW).
--
-- Prices are GST-inclusive (agreed with the owner): the customer pays the same total; each
-- line's GST is worked out inside its price at the product's rate, rounded to the paisa.
-- Card / Bajaj charges carry 18% GST inside them. The old-battery credit is taken off after
-- tax (it is a separate purchase from the customer, not a discount).
--
-- A bill can be made without GST on purpose ("gst": false, after a confirm popup in the app):
-- it is titled plain "BILL" and shows no tax. Composition scheme still gives a Bill of Supply.
-- A business customer's GSTIN (optional) is checked, remembered on the customer, and sets the
-- place of supply: another state means IGST instead of CGST + SGST (shown on the bill).
--
-- save_bill (the wrapper from *_bill_warranty_choice.sql) is unchanged; this replaces the
-- original logic in save_bill_core, copied from *_billing.sql with the GST parts added.
-- =====================================================================

alter table public.bills drop constraint if exists bills_title_check;
alter table public.bills add constraint bills_title_check
  check (title in ('bill_of_supply', 'tax_invoice', 'bill', 'quotation', 'return'));

create or replace function public.save_bill_core(p_bill jsonb) returns jsonb
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
  v_gst_bill boolean := false;
  v_title text := 'bill_of_supply';
  v_gstin text := nullif(upper(regexp_replace(coalesce(v_customer ->> 'gstin', ''), '\s', '', 'g')), '');
  v_place text;
  v_gst numeric;
  v_tax_total numeric := 0;
begin
  if not public.is_active_person() then
    perform public.bill_error('not_logged_in');
  end if;

  select * into v_settings from public.shop_settings where id = 1;
  -- Regular GST: a Tax Invoice (GST worked out inside the GST-inclusive prices), unless the
  -- bill was made without GST on purpose ("gst": false) -> a plain Bill. Composition: Bill of Supply.
  if v_settings.gst_scheme = 'regular' and v_today >= v_settings.scheme_from then
    begin
      v_gst_bill := coalesce((p_bill ->> 'gst')::boolean, true);
    exception when others then
      v_gst_bill := true;
    end;
    v_title := case when v_gst_bill then 'tax_invoice' else 'bill' end;
  end if;
  if v_gstin is not null and v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    perform public.bill_error('bad_gstin');
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
  -- A business customer's GSTIN: remembered when typed, picked up on their next bill.
  if v_gstin is not null and v_customer_id is not null then
    update public.customers set gstin = v_gstin where id = v_customer_id and coalesce(gstin, '') <> v_gstin;
  elsif v_customer_id is not null then
    select nullif(gstin, '') into v_gstin from public.customers where id = v_customer_id;
  end if;
  -- Place of supply: the customer's state (from their GSTIN), otherwise the shop's state.
  v_place := coalesce(left(v_gstin, 2), v_settings.state_code);

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
    customer_name, customer_phone, customer_address, customer_gstin, place_of_supply, notes
  ) values (
    'bill', v_title, v_fy, v_seq, v_number, v_today, v_customer_id,
    coalesce(v_customer_name, ''), coalesce(v_customer_phone, ''), coalesce(v_customer_area, ''),
    v_gstin, v_place, coalesce(p_bill ->> 'notes', '')
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
    -- Prices include GST: the GST part of this line (to the paisa); the rest is the taxable value.
    v_gst := case when v_gst_bill
                  then round(v_amount - v_amount * 100 / (100 + v_product.gst_rate_pct), 2)
                  else 0 end;
    v_tax_total := v_tax_total + v_gst;

    insert into public.bill_items (bill_id, line_no, product_id, unit_id, description, serial_no,
                                   warranty_text, hsn, qty, rate, amount, gst_rate_pct, gst_amount)
    values (v_bill_id, v_line, v_product.id, v_unit_id, v_label, v_serial,
            case when v_product.has_serial
                 then public.warranty_text(v_product.warranty_free_months, v_product.warranty_prorata_months)
                 else '' end,
            v_product.hsn, v_qty, v_rate, v_amount,
            case when v_gst_bill then v_product.gst_rate_pct else 0 end, v_gst)
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

  -- Card / Bajaj charges are part of the price of the sale: GST at 18% inside them too.
  if v_gst_bill and v_charges_total + v_finance_charges > 0 then
    v_tax_total := v_tax_total + round((v_charges_total + v_finance_charges) * 18 / 118, 2);
  end if;

  update public.bills
  set subtotal = v_subtotal, scrap_credit = v_scrap_total, extra_charges = v_charges_total + v_finance_charges,
      round_off = v_total - v_pre_round, total = v_total, paid = v_paid, balance = v_total - v_paid,
      tax_total = v_tax_total
  where id = v_bill_id;

  return jsonb_build_object('id', v_bill_id, 'number', v_number, 'share_token', v_share_token);
end;
$$;

create or replace function public.bill_json(p_bill_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bill', to_jsonb(b),
    'billed_by', (select name from public.people where id = b.billed_by),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'line_no', bi.line_no, 'description', bi.description, 'serial_no', bi.serial_no,
        'warranty_text', bi.warranty_text, 'hsn', bi.hsn, 'qty', bi.qty, 'rate', bi.rate, 'amount', bi.amount,
        'gst_rate_pct', bi.gst_rate_pct, 'gst_amount', bi.gst_amount,
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
        'upi_id', s.upi_id, 'bill_terms', s.bill_terms, 'state_code', s.state_code, 'state_name', s.state_name
      )
      from public.shop_settings s where s.id = 1
    )
  )
  from public.bills b
  where b.id = p_bill_id
$$;

revoke execute on function public.save_bill_core(jsonb) from public, anon, authenticated;
revoke execute on function public.bill_json(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
