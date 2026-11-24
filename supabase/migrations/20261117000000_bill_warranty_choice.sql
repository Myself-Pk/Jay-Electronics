-- =====================================================================
-- Warranty can be changed on each bill line while making the bill.
--
-- The app sends, per item, warranty_free_months / warranty_prorata_months (filled in from
-- the product, changed if the shop wants). Rather than rewriting the long save_bill, it is
-- wrapped: the new save_bill checks those numbers, keeps them for this transaction, then
-- calls the original (renamed save_bill_core). The bill-line trigger prints the chosen
-- warranty on each line, or the product's own warranty when the line has no choice
-- (e.g. a bill saved by an older copy of the app). Services never carry warranty.
-- =====================================================================

alter function public.save_bill(jsonb) rename to save_bill_core;
revoke execute on function public.save_bill_core(jsonb) from public, anon, authenticated;

create or replace function public.save_bill(p_bill jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_free integer;
  v_prorata integer;
  v_choices jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if jsonb_typeof(p_bill -> 'items') = 'array' then
    for v_item in select * from jsonb_array_elements(p_bill -> 'items') loop
      if v_item ? 'warranty_free_months' or v_item ? 'warranty_prorata_months' then
        begin
          v_free := coalesce(nullif(v_item ->> 'warranty_free_months', '')::integer, 0);
          v_prorata := coalesce(nullif(v_item ->> 'warranty_prorata_months', '')::integer, 0);
        exception when others then
          perform public.bill_error('bad_warranty');
        end;
        if v_free < 0 or v_prorata < 0 or v_free > 240 or v_prorata > 240 then
          perform public.bill_error('bad_warranty');
        end if;
        v_choices := v_choices || jsonb_build_array(jsonb_build_object('free', v_free, 'prorata', v_prorata));
      else
        v_choices := v_choices || jsonb_build_array('null'::jsonb);
      end if;
    end loop;
  end if;

  perform set_config('je.bill_warranty', v_choices::text, true);
  v_result := public.save_bill_core(p_bill);
  perform set_config('je.bill_warranty', '', true);
  return v_result;
end;
$$;

create or replace function public.bill_item_warranty_text() returns trigger
language plpgsql set search_path = public as $$
declare
  v_choices jsonb := nullif(current_setting('je.bill_warranty', true), '')::jsonb;
  v_choice jsonb;
  v_is_service boolean;
begin
  select is_service into v_is_service from public.products where id = new.product_id;
  if coalesce(v_is_service, true) then
    new.warranty_text := coalesce(new.warranty_text, '');
    return new;
  end if;
  if v_choices is not null then
    v_choice := v_choices -> (new.line_no - 1);
  end if;
  if jsonb_typeof(v_choice) = 'object' then
    -- The warranty chosen on the bill.
    new.warranty_text := public.warranty_text((v_choice ->> 'free')::integer, (v_choice ->> 'prorata')::integer);
  elsif coalesce(new.warranty_text, '') = '' then
    -- No choice sent: the product's own warranty.
    select public.warranty_text(p.warranty_free_months, p.warranty_prorata_months)
      into new.warranty_text
    from public.products p where p.id = new.product_id;
    new.warranty_text := coalesce(new.warranty_text, '');
  end if;
  return new;
end;
$$;

revoke execute on function public.save_bill(jsonb) from public, anon;
grant execute on function public.save_bill(jsonb) to authenticated, service_role;
grant execute on function public.save_bill_core(jsonb) to service_role;

notify pgrst, 'reload schema';
