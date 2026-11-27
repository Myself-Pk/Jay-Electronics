-- =====================================================================
-- A bill can't sell more than the shop has. Every sale is written to stock_history
-- (reason 'sold'); this stops any sale that would take a product's stock below zero,
-- with a friendly bill_error ("only 2 in stock"). The product row is locked first, so two
-- people billing the last piece at the same moment can't both sell it.
-- =====================================================================

create or replace function public.stock_never_negative() returns trigger
language plpgsql set search_path = public as $$
declare
  v_stock integer;
  v_label text;
begin
  if new.reason = 'sold' and new.change < 0 then
    perform 1 from public.products where id = new.product_id for update;
    select coalesce(sum(change), 0) into v_stock from public.stock_history where product_id = new.product_id;
    if v_stock + new.change < 0 then
      select concat_ws(' ', b.name, p.model, nullif(p.capacity, '')) into v_label
      from public.products p left join public.brands b on b.id = p.brand_id
      where p.id = new.product_id;
      perform public.bill_error('not_enough_stock', jsonb_build_object('product', v_label, 'count', greatest(v_stock, 0)));
    end if;
  end if;
  return new;
end;
$$;

create trigger stock_history_never_negative before insert on public.stock_history
  for each row execute function public.stock_never_negative();

revoke execute on function public.stock_never_negative() from public, anon, authenticated;
