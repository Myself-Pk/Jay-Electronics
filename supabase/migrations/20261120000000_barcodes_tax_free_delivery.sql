-- =====================================================================
-- 1. Delivery & installation is tax free (owner's decision): 0% GST and no HSN, so the
--    Tax Invoice shows no tax for it (it is reported as nil / exempt in the GST return).
-- 2. Barcodes / QR codes: any code printed on a product's box can be linked to that product
--    once ("Which product is this?"), then scanning it adds the product to a bill or to
--    "New stock arrived". One product can have several codes; a code belongs to one product.
-- =====================================================================

update public.products
set gst_rate_pct = 0, hsn = ''
where is_service and lower(model) = 'delivery & installation';

create table public.product_barcodes (
  code text primary key check (length(code) between 3 and 200),
  product_id uuid not null references public.products (id),
  person_id uuid references public.people (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index product_barcodes_product_idx on public.product_barcodes (product_id);

alter table public.product_barcodes enable row level security;
create policy product_barcodes_read on public.product_barcodes
  for select to authenticated using (public.is_active_person());
-- Written only by link_barcode(); nobody deletes from the app.
grant select on public.product_barcodes to authenticated;
grant all on public.product_barcodes to service_role;

create trigger log_product_barcodes after insert or update on public.product_barcodes
  for each row execute function public.log_change();

-- Link a scanned code to a product (anyone logged in; the shop scans while billing or receiving
-- stock). A code already linked to another product is only moved with p_replace = true.
create or replace function public.link_barcode(p_code text, p_product_id uuid, p_replace boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_code text := trim(coalesce(p_code, ''));
  v_product record;
  v_existing record;
begin
  if not public.is_active_person() then
    perform public.bill_error('not_logged_in');
  end if;
  if length(v_code) < 3 or length(v_code) > 200 then
    perform public.bill_error('bad_barcode');
  end if;
  select p.id, concat_ws(' ', b.name, p.model, nullif(p.capacity, '')) as label
    into v_product
  from public.products p left join public.brands b on b.id = p.brand_id
  where p.id = p_product_id and p.active and not p.is_service;
  if v_product.id is null then
    perform public.bill_error('product_not_found');
  end if;

  select pb.product_id, concat_ws(' ', b.name, p.model, nullif(p.capacity, '')) as label
    into v_existing
  from public.product_barcodes pb
  join public.products p on p.id = pb.product_id
  left join public.brands b on b.id = p.brand_id
  where pb.code = v_code;

  if v_existing.product_id is null then
    insert into public.product_barcodes (code, product_id) values (v_code, p_product_id);
  elsif v_existing.product_id <> p_product_id then
    if not coalesce(p_replace, false) then
      perform public.bill_error('barcode_taken', jsonb_build_object('product', v_existing.label));
    end if;
    update public.product_barcodes set product_id = p_product_id, person_id = auth.uid(), created_at = now()
    where code = v_code;
  end if;
end;
$$;

revoke execute on function public.link_barcode(text, uuid, boolean) from public, anon;
grant execute on function public.link_barcode(text, uuid, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
