-- =====================================================================
-- Jay Electronics — initial database schema
--
-- Rules (see CLAUDE.md):
--   * Money is numeric(12,2) (exact decimals). Percentages are numeric(5,2).
--   * Dates are Indian time (Asia/Kolkata).
--   * Nothing is hard-deleted. Bills are cancelled, never edited or deleted.
--   * Stock is the sum of stock_history, never a typed-in number.
--   * Owner-only data (purchase prices, profit, change log) is protected by
--     row-level security, not just hidden in the app.
--   * Bills, stock, units and payments are written only through database
--     functions (added in later migrations), so they always save together.
-- =====================================================================

-- ---------- Helpers ----------------------------------------------------

create or replace function public.today_ist() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- People (logins) -------------------------------------------
-- Each person is a Supabase auth user. Their 6-digit PIN is their password.

create table public.people (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  role text not null check (role in ('owner', 'staff', 'admin')),
  active boolean not null default true,
  login_email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger people_touch before update on public.people
  for each row execute function public.touch_updated_at();

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.people where id = auth.uid() and active
$$;

create or replace function public.is_active_person() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.people where id = auth.uid() and active)
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('owner', 'admin'), false)
$$;

-- Names for the "Who is using the app?" screen (shown before anyone logs in).
create or replace function public.login_people()
returns table (id uuid, name text, role text, login_email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.role, p.login_email
  from public.people p
  where p.active
  order by case p.role when 'owner' then 0 when 'staff' then 1 else 2 end, p.name
$$;
grant execute on function public.login_people() to anon, authenticated;

-- There must always be at least one owner who can log in.
create or replace function public.keep_one_owner() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.people where active and role in ('owner', 'admin')) then
    raise exception 'There must always be at least one active owner';
  end if;
  return null;
end;
$$;
create trigger people_keep_one_owner after update or delete on public.people
  for each statement execute function public.keep_one_owner();

-- ---------- Shop settings (exactly one row) ---------------------------

create table public.shop_settings (
  id smallint primary key default 1 check (id = 1),
  shop_name text not null default 'Jay Electronics',
  address text not null default 'Bokaro, Jharkhand',
  phone text not null default '',
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  state_code text not null default '20',
  state_name text not null default 'Jharkhand',
  upi_id text,
  bill_terms text not null default E'1. Warranty is given by the manufacturer as per their terms and conditions.\n2. Please keep this bill safely. It is needed for any warranty claim.\n3. Subject to Bokaro jurisdiction.',
  gst_scheme text not null default 'composition' check (gst_scheme in ('composition', 'regular')),
  scheme_from date not null default '2026-04-01',
  composition_rate_pct numeric(5,2) not null default 1.00 check (composition_rate_pct between 0 and 100),
  bill_prefix text not null default 'JE' check (bill_prefix ~ '^[A-Z0-9]{1,4}$'),
  scrap_rate_per_kg numeric(12,2) not null default 105.00 check (scrap_rate_per_kg >= 0),
  debit_card_pct numeric(5,2) not null default 1.00 check (debit_card_pct between 0 and 100),
  credit_card_pct numeric(5,2) not null default 2.00 check (credit_card_pct between 0 and 100),
  delivery_presets numeric(12,2)[] not null default '{200,300,500}',
  updated_at timestamptz not null default now()
);
create trigger shop_settings_touch before update on public.shop_settings
  for each row execute function public.touch_updated_at();
insert into public.shop_settings (id) values (1);

-- ---------- Bill number counters (one series per financial year) ------

create table public.bill_counters (
  fy_start_year integer not null,
  doc_type text not null check (doc_type in ('bill', 'quotation', 'return')),
  next_number integer not null default 1 check (next_number >= 1),
  primary key (fy_start_year, doc_type)
);

-- ---------- Catalog ----------------------------------------------------

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  warranty_registration_required boolean not null default false,
  how_to_register text not null default '',
  complaint_phone text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order smallint not null default 0,
  default_hsn text not null default '',
  default_gst_rate_pct numeric(5,2) not null default 18.00 check (default_gst_rate_pct between 0 and 100),
  has_serial_by_default boolean not null default true,
  is_service boolean not null default false,
  active boolean not null default true
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands (id),
  category_id uuid not null references public.categories (id),
  model text not null check (length(trim(model)) > 0),
  capacity text not null default '',           -- e.g. 150Ah, 900VA, 335W
  type text not null default '',               -- e.g. Tall tubular, SMF, Sine wave
  mrp numeric(12,2) check (mrp >= 0),
  retail_price numeric(12,2) not null default 0 check (retail_price >= 0),
  dealer_price numeric(12,2) check (dealer_price >= 0),
  min_price numeric(12,2) check (min_price >= 0),  -- staff can't bill below this
  has_serial boolean not null default true,
  is_service boolean not null default false,
  warranty_free_months smallint not null default 0 check (warranty_free_months >= 0),
  warranty_prorata_months smallint not null default 0 check (warranty_prorata_months >= 0),
  low_stock_level integer not null default 0 check (low_stock_level >= 0),
  hsn text not null default '',
  gst_rate_pct numeric(5,2) not null default 18.00 check (gst_rate_pct between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_brand_model_key on public.products (
  coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(model), lower(capacity)
);
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- Owner only: what the shop pays for each product (including GST under composition).
create table public.product_costs (
  product_id uuid primary key references public.products (id) on delete cascade,
  purchase_price numeric(12,2) not null default 0 check (purchase_price >= 0),
  updated_at timestamptz not null default now()
);

-- ---------- Customers and suppliers -----------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone text check (phone is null or phone ~ '^[6-9][0-9]{9}$'),
  area text not null default '',
  address text not null default '',
  gstin text,
  customer_type text not null default 'retail' check (customer_type in ('retail', 'dealer')),
  opening_dues numeric(12,2) not null default 0,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customers_phone_key on public.customers (phone) where phone is not null;
create index customers_name_idx on public.customers (lower(name));
create trigger customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  phone text not null default '',
  gstin text,
  address text not null default '',
  opening_balance numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Purchases (new stock arrived) — owner can see prices ------

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'purchase' check (kind in ('purchase', 'opening_stock', 'return_to_supplier')),
  supplier_id uuid references public.suppliers (id),
  supplier_bill_no text not null default '',
  bill_date date not null default public.today_ist(),
  total numeric(12,2) not null default 0,
  notes text not null default '',
  created_by uuid references public.people (id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (kind = 'opening_stock' or supplier_id is not null)
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id),
  product_id uuid not null references public.products (id),
  qty integer not null check (qty > 0),
  rate numeric(12,2) not null check (rate >= 0),         -- per unit, as on the supplier's bill
  gst_paid numeric(12,2) not null default 0 check (gst_paid >= 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0), -- per unit including GST
  amount numeric(12,2) not null check (amount >= 0)
);

-- ---------- Serial-numbered items (one row per battery / inverter) ----

create table public.units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  serial_no text not null check (length(trim(serial_no)) > 0),
  status text not null default 'in_stock'
    check (status in ('in_stock', 'sold', 'replaced', 'returned_to_supplier', 'damaged', 'loaned')),
  source text not null default 'purchase'
    check (source in ('purchase', 'opening_stock', 'old_register', 'brand_replacement')),
  arrived_on date,
  purchase_item_id uuid references public.purchase_items (id),
  sold_on date,
  customer_id uuid references public.customers (id),
  bill_item_id uuid,                -- foreign key added after bill_items
  warranty_start date,              -- usually the sale date
  warranty_registered_at timestamptz,
  warranty_reg_ref text not null default '',
  created_at timestamptz not null default now()
);
create unique index units_serial_key on public.units (upper(serial_no));
create index units_product_status_idx on public.units (product_id, status);
create index units_customer_idx on public.units (customer_id);

-- ---------- Stock history (every change to stock) ---------------------

create table public.stock_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id),
  unit_id uuid references public.units (id),
  change integer not null check (change <> 0),
  reason text not null check (reason in (
    'stock_arrived', 'opening_stock', 'sold', 'bill_cancelled', 'returned_by_customer',
    'returned_to_supplier', 'changed_by_owner', 'damaged', 'replacement'
  )),
  note text not null default '',
  ref_type text check (ref_type in ('bill', 'purchase')),
  ref_id uuid,
  person_id uuid references public.people (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index stock_history_product_idx on public.stock_history (product_id);

create view public.v_product_stock with (security_invoker = true) as
select p.id as product_id, coalesce(sum(h.change), 0)::integer as in_stock
from public.products p
left join public.stock_history h on h.product_id = p.id
group by p.id;

-- ---------- Bills, quotations and returns -----------------------------

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('bill', 'quotation', 'return')),
  -- What is printed at the top: Bill of Supply (composition) or Tax Invoice (regular GST).
  title text not null check (title in ('bill_of_supply', 'tax_invoice', 'quotation', 'return')),
  fy_start_year integer not null,
  seq integer not null check (seq >= 1),
  number text not null check (length(number) <= 16),
  bill_date date not null default public.today_ist(),
  customer_id uuid references public.customers (id),
  -- Customer details as printed on the bill (kept even if the customer is edited later).
  customer_name text not null default '',
  customer_phone text not null default '',
  customer_address text not null default '',
  customer_gstin text,
  place_of_supply text not null default '20',
  delivery_address text not null default '',
  billed_by uuid references public.people (id) default auth.uid(),
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  scrap_credit numeric(12,2) not null default 0,
  extra_charges numeric(12,2) not null default 0,  -- card / finance charges
  tax_total numeric(12,2) not null default 0,      -- always 0 under composition
  round_off numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,        -- udhaar on this bill
  status text not null default 'saved' check (status in ('saved', 'cancelled')),
  cancel_reason text,
  cancelled_by uuid references public.people (id),
  cancelled_at timestamptz,
  converted_from uuid references public.bills (id),   -- quotation that became this bill
  original_bill_id uuid references public.bills (id), -- for returns
  share_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (doc_type, fy_start_year, seq),
  check (status <> 'cancelled' or cancel_reason is not null)
);
create index bills_date_idx on public.bills (bill_date);
create index bills_customer_idx on public.bills (customer_id);

create table public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills (id),
  line_no smallint not null,
  product_id uuid references public.products (id),
  unit_id uuid references public.units (id),
  description text not null,
  serial_no text,
  warranty_text text not null default '',
  hsn text not null default '',
  qty numeric(10,2) not null default 1 check (qty > 0),
  rate numeric(12,2) not null check (rate >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  amount numeric(12,2) not null,
  gst_rate_pct numeric(5,2) not null default 0,
  gst_amount numeric(12,2) not null default 0,
  unique (bill_id, line_no)
);
alter table public.units
  add constraint units_bill_item_fk foreign key (bill_item_id) references public.bill_items (id);

-- Owner only: cost of each line at the time of sale (for the profit report).
create table public.bill_item_costs (
  bill_item_id uuid primary key references public.bill_items (id),
  unit_cost numeric(12,2) not null default 0
);

-- ---------- Payments, Bajaj Finance, scrap ----------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in', 'out')),
  customer_id uuid references public.customers (id),
  supplier_id uuid references public.suppliers (id),
  bill_id uuid references public.bills (id),
  purchase_id uuid references public.purchases (id),
  mode text not null check (mode in ('cash', 'upi', 'debit_card', 'credit_card', 'bajaj', 'bank')),
  amount numeric(12,2) not null check (amount > 0),
  charges numeric(12,2) not null default 0 check (charges >= 0),
  reference text not null default '',
  paid_on date not null default public.today_ist(),
  person_id uuid references public.people (id) default auth.uid(),
  status text not null default 'saved' check (status in ('saved', 'cancelled')),
  created_at timestamptz not null default now(),
  check (customer_id is null or supplier_id is null)
);
create index payments_date_idx on public.payments (paid_on);

create table public.finance_deals (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills (id),
  company text not null default 'Bajaj Finance',
  reference_no text not null default '',
  down_payment numeric(12,2) not null default 0 check (down_payment >= 0),
  loan_amount numeric(12,2) not null check (loan_amount > 0),
  customer_charges numeric(12,2) not null default 0 check (customer_charges >= 0),
  expected_amount numeric(12,2) not null check (expected_amount >= 0),
  received_amount numeric(12,2),
  received_on date,
  status text not null default 'pending' check (status in ('pending', 'received', 'cancelled')),
  created_at timestamptz not null default now()
);

create table public.scrap_entries (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in', 'out')), -- in: from a customer, out: sold to a recycler
  bill_id uuid references public.bills (id),
  battery_type text not null default '',
  weight_kg numeric(8,2) check (weight_kg > 0),
  rate_per_kg numeric(12,2) check (rate_per_kg >= 0),
  fixed_amount numeric(12,2) check (fixed_amount >= 0),
  value numeric(12,2) not null check (value >= 0),
  buyer text not null default '',
  entry_date date not null default public.today_ist(),
  person_id uuid references public.people (id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (weight_kg is not null or fixed_amount is not null)
);

-- ---------- Warranty complaints and repair job cards (Phase 2) --------

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.units (id),
  customer_id uuid references public.customers (id),
  serial_no text not null default '',
  problem text not null,
  brand_complaint_no text not null default '',
  status text not null default 'open' check (status in ('open', 'registered', 'technician_visited', 'resolved')),
  result text check (result in ('repaired', 'replaced', 'rejected')),
  new_unit_id uuid references public.units (id),
  opened_on date not null default public.today_ist(),
  resolved_on date,
  person_id uuid references public.people (id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (status <> 'resolved' or result is not null)
);

create table public.complaint_updates (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id),
  status text not null,
  note text not null default '',
  person_id uuid references public.people (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.job_cards (
  id uuid primary key default gen_random_uuid(),
  job_no integer generated always as identity unique,
  customer_id uuid references public.customers (id),
  item_description text not null,
  serial_no text not null default '',
  problem text not null default '',
  estimate numeric(12,2) check (estimate >= 0),
  status text not null default 'received' check (status in ('received', 'in_progress', 'ready', 'delivered', 'cancelled')),
  ready_on date,
  delivered_on date,
  bill_id uuid references public.bills (id),
  person_id uuid references public.people (id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Expenses and day close -------------------------------------

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  mode text not null default 'cash' check (mode in ('cash', 'upi', 'bank', 'debit_card', 'credit_card')),
  spent_on date not null default public.today_ist(),
  note text not null default '',
  status text not null default 'saved' check (status in ('saved', 'cancelled')),
  person_id uuid references public.people (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.day_closes (
  day date primary key,
  summary jsonb not null default '{}',
  expected_cash numeric(12,2),
  counted_cash numeric(12,2),
  difference numeric(12,2),
  note text not null default '',
  person_id uuid references public.people (id) default auth.uid(),
  closed_at timestamptz not null default now()
);

-- ---------- Change log (who changed what) -----------------------------

create table public.change_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  before jsonb,
  after jsonb,
  person_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.change_log (table_name, record_id, action, before, after)
  values (
    tg_table_name,
    coalesce(row_data ->> 'id', row_data ->> 'product_id', ''),
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger log_shop_settings after update on public.shop_settings for each row execute function public.log_change();
create trigger log_people after insert or update on public.people for each row execute function public.log_change();
create trigger log_products after update on public.products for each row execute function public.log_change();
create trigger log_product_costs after insert or update on public.product_costs for each row execute function public.log_change();
create trigger log_customers after update on public.customers for each row execute function public.log_change();
create trigger log_bills after update on public.bills for each row execute function public.log_change();
create trigger log_payments after update on public.payments for each row execute function public.log_change();
create trigger log_expenses after update on public.expenses for each row execute function public.log_change();
create trigger log_bill_counters after insert or update on public.bill_counters for each row execute function public.log_change();

-- ---------- Functions used by Settings --------------------------------

-- Set the next bill number for a financial year (e.g. to continue from the paper bill book).
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
end;
$$;

-- ---------- Home screen "Needs attention" counts ----------------------

create view public.v_attention_counts with (security_invoker = true) as
with pending_registrations as (
  select b.name as brand
  from public.units u
  join public.products p on p.id = u.product_id
  join public.brands b on b.id = p.brand_id
  where u.status = 'sold' and b.warranty_registration_required and u.warranty_registered_at is null
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

-- ---------- Row-level security -----------------------------------------

do $$
declare
  t text;
begin
  -- Everyone who can log in may read everyday shop data.
  foreach t in array array[
    'shop_settings', 'people', 'bill_counters', 'brands', 'categories', 'products', 'customers',
    'suppliers', 'units', 'stock_history', 'bills', 'bill_items', 'payments', 'finance_deals',
    'scrap_entries', 'complaints', 'complaint_updates', 'job_cards', 'expenses', 'day_closes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_active_person())',
      t || '_read', t
    );
  end loop;

  -- Only the owner may read prices paid, profit data and the change log.
  foreach t in array array['product_costs', 'purchases', 'purchase_items', 'bill_item_costs', 'change_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_owner())',
      t || '_owner_read', t
    );
  end loop;
end;
$$;

-- Owner-only changes
create policy shop_settings_owner_update on public.shop_settings
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy people_owner_update on public.people
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy brands_owner_insert on public.brands for insert to authenticated with check (public.is_owner());
create policy brands_owner_update on public.brands for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy categories_owner_insert on public.categories for insert to authenticated with check (public.is_owner());
create policy categories_owner_update on public.categories for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy products_owner_insert on public.products for insert to authenticated with check (public.is_owner());
create policy products_owner_update on public.products for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy product_costs_owner_insert on public.product_costs for insert to authenticated with check (public.is_owner());
create policy product_costs_owner_update on public.product_costs for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy suppliers_owner_insert on public.suppliers for insert to authenticated with check (public.is_owner());
create policy suppliers_owner_update on public.suppliers for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Everyday changes anyone logged in can make
create policy customers_insert on public.customers for insert to authenticated with check (public.is_active_person());
create policy customers_update on public.customers for update to authenticated
  using (public.is_active_person()) with check (public.is_active_person());
create policy complaints_insert on public.complaints for insert to authenticated with check (public.is_active_person());
create policy complaints_update on public.complaints for update to authenticated
  using (public.is_active_person()) with check (public.is_active_person());
create policy complaint_updates_insert on public.complaint_updates
  for insert to authenticated with check (public.is_active_person());
create policy job_cards_insert on public.job_cards for insert to authenticated with check (public.is_active_person());
create policy job_cards_update on public.job_cards for update to authenticated
  using (public.is_active_person()) with check (public.is_active_person());
create policy expenses_insert on public.expenses for insert to authenticated with check (public.is_active_person());
create policy expenses_owner_update on public.expenses for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy day_closes_insert on public.day_closes for insert to authenticated with check (public.is_active_person());

-- No delete policies anywhere: nothing can be deleted from the app.
-- Bills, bill items, units, stock history, payments, purchases, scrap and
-- Bajaj deals have no insert/update policies: they are written only by
-- database functions (save_bill, receive_stock, ...) added in later migrations.

-- ---------- Starting data ----------------------------------------------

insert into public.categories (name, sort_order, default_hsn, default_gst_rate_pct, has_serial_by_default, is_service) values
  ('Inverter battery',        1, '8507', 18, true,  false),
  ('Automotive battery',      2, '8507', 18, true,  false),
  ('Inverter / UPS',          3, '8504', 18, true,  false),
  ('Lithium battery',         4, '8507', 18, true,  false),
  ('Solar panel',             5, '8541',  5, true,  false),
  ('Solar inverter / PCU',    6, '8504', 18, true,  false),
  ('Charge controller',       7, '8504', 18, true,  false),
  ('Stabilizer',              8, '8504', 18, true,  false),
  ('Accessories',             9, '',     18, false, false),
  ('Services',               10, '9987', 18, false, true);

insert into public.brands (name, warranty_registration_required) values
  ('Amaron', true),
  ('Exide', true),
  ('Microtek', false),
  ('Luminous', false),
  ('Livguard', false);

insert into public.products (category_id, model, retail_price, has_serial, is_service, hsn, gst_rate_pct)
select c.id, s.model, s.price, false, true, '9987', 18
from public.categories c
cross join (values
  ('Delivery & installation', 300.00),
  ('Battery charging', 0.00),
  ('Repair', 0.00)
) as s (model, price)
where c.name = 'Services';
