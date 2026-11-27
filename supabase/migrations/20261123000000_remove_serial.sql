-- =====================================================================
-- Remove a serial number entered by mistake (owner / admin only).
-- For a piece that is in the shop and was never sold: one piece of stock
-- comes off, and the serial is freed so the right code can be scanned later.
-- The stock history keeps every line, with the serial written in its note.
-- (The one place a row is deleted: an unsold unit has no bill or GST record.)
-- =====================================================================

create or replace function public.remove_unit(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_unit public.units%rowtype;
  v_reason text := nullif(trim(coalesce(p ->> 'reason', '')), '');
begin
  if not public.is_owner() then
    perform public.bill_error('owner_only');
  end if;
  select * into v_unit from public.units where id = nullif(p ->> 'unit_id', '')::uuid for update;
  if not found then
    perform public.bill_error('unit_not_found');
  end if;
  if v_unit.status <> 'in_stock' or v_unit.bill_item_id is not null then
    perform public.bill_error('unit_not_in_stock', jsonb_build_object('serial', v_unit.serial_no));
  end if;
  if exists (select 1 from public.complaints where unit_id = v_unit.id or new_unit_id = v_unit.id) then
    perform public.bill_error('unit_has_complaint', jsonb_build_object('serial', v_unit.serial_no));
  end if;

  -- Keep the history readable after the unit row is gone.
  update public.stock_history
  set note = trim(note || ' [serial ' || v_unit.serial_no || ']'), unit_id = null
  where unit_id = v_unit.id;
  insert into public.stock_history (product_id, change, reason, note)
  values (v_unit.product_id, -1, 'changed_by_owner',
          'Serial ' || v_unit.serial_no || ' removed — entered by mistake' || coalesce(': ' || v_reason, ''));
  delete from public.units where id = v_unit.id;
  return v_unit.serial_no;
end;
$$;

revoke execute on function public.remove_unit(jsonb) from public, anon;
grant execute on function public.remove_unit(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
