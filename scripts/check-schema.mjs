// Runs every migration in supabase/migrations on a fresh, in-memory Postgres (PGlite)
// and checks the most important rules. Usage: npm run check:schema
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "00000000-0000-0000-0000-00000000000a";
const STAFF = "00000000-0000-0000-0000-00000000000b";

const db = new PGlite();
let failures = 0;

async function check(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${label}\n      ${err.message}`);
  }
}

async function expectError(sql, pattern) {
  try {
    await db.exec(sql);
  } catch (err) {
    if (pattern.test(err.message)) return;
    throw new Error(`Failed with an unexpected message: ${err.message}`);
  }
  throw new Error("Expected this to be refused, but it worked");
}

async function as(personId, sql, params, role = "authenticated") {
  await db.exec(`reset role; select set_config('test.uid', '${personId ?? ""}', false); set role ${role};`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role;");
  }
}

// Minimal stand-ins for what Supabase provides.
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  grant usage on schema auth to anon, authenticated;
`);

console.log("Running migrations:");
const dir = "supabase/migrations";
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(dir, file), "utf8"));
  console.log(`  ✓ ${file}`);
}

// No blanket grants here: the app's permissions come only from the migrations
// (supabase/migrations/*_api_grants.sql), the same as on the real Supabase.
await db.exec(`
  insert into auth.users values ('${OWNER}', 'owner@test'), ('${STAFF}', 'staff@test');
  insert into public.people (id, name, role, login_email) values
    ('${OWNER}', 'Owner', 'owner', 'owner@test'),
    ('${STAFF}', 'Staff 1', 'staff', 'staff@test');
  insert into public.product_costs (product_id, purchase_price)
    select id, 100 from public.products limit 1;
`);

console.log("Checking rules:");

await check("starting data is there (settings, categories, brands, service items)", async () => {
  const s = await db.query("select shop_name, gst_scheme, scrap_rate_per_kg::text as scrap from public.shop_settings");
  if (s.rows[0].gst_scheme !== "composition" || s.rows[0].scrap !== "105.00") throw new Error(JSON.stringify(s.rows));
  const c = await db.query("select count(*)::int as n from public.categories");
  if (c.rows[0].n !== 10) throw new Error(`categories: ${c.rows[0].n}`);
  const b = await db.query("select string_agg(name, ',' order by name) as names from public.brands where warranty_registration_required");
  if (b.rows[0].names !== "Amaron,Exide") throw new Error(b.rows[0].names);
});

await check("login screen lists people without logging in", async () => {
  const r = await as(null, "select name from public.login_people()");
  if (r.rows.length !== 2 || r.rows[0].name !== "Owner") throw new Error(JSON.stringify(r.rows));
});

await check("someone not logged in sees no shop data", async () => {
  const r = await as(null, "select * from public.customers");
  const s = await as(null, "select * from public.shop_settings");
  if (r.rows.length !== 0 || s.rows.length !== 0) throw new Error("data leaked");
});

await check("staff can read settings but cannot change them", async () => {
  const r = await as(STAFF, "select shop_name from public.shop_settings");
  if (r.rows.length !== 1) throw new Error("staff cannot read settings");
  await as(STAFF, "update public.shop_settings set shop_name = 'Hacked'");
  const after = await db.query("select shop_name from public.shop_settings");
  if (after.rows[0].shop_name !== "Jay Electronics") throw new Error("staff changed settings");
});

await check("staff cannot see purchase prices; the owner can", async () => {
  const staff = await as(STAFF, "select * from public.product_costs");
  const owner = await as(OWNER, "select * from public.product_costs");
  if (staff.rows.length !== 0) throw new Error("staff saw purchase prices");
  if (owner.rows.length !== 1) throw new Error("owner cannot see purchase prices");
});

await check("owner can change settings, and the change is logged", async () => {
  await as(OWNER, "update public.shop_settings set scrap_rate_per_kg = 110");
  const s = await db.query("select scrap_rate_per_kg::text as v from public.shop_settings");
  if (s.rows[0].v !== "110.00") throw new Error(`scrap rate is ${s.rows[0].v}`);
  const log = await db.query(
    "select person_id from public.change_log where table_name = 'shop_settings' order by id desc limit 1",
  );
  if (log.rows[0]?.person_id !== OWNER) throw new Error("change not logged with the owner's id");
});

await check("nothing can be deleted from the app (not even by the owner)", async () => {
  await db.exec("insert into public.customers (name, phone) values ('Sunil Kumar', '9876543210')");
  for (const table of ["customers", "bills", "payments", "units", "stock_history"]) {
    try {
      await as(OWNER, `delete from public.${table}`);
    } catch (err) {
      if (!/permission denied/.test(err.message)) throw err;
    }
  }
  const r = await db.query("select count(*)::int as n from public.customers");
  if (r.rows[0].n !== 1) throw new Error("a customer was deleted");
});

await check("customer phone numbers must be 10-digit mobiles and unique", async () => {
  await expectError("insert into public.customers (name, phone) values ('X', '12345')", /check constraint/);
  await expectError("insert into public.customers (name, phone) values ('Y', '9876543210')", /duplicate key/);
});

await check("set_next_bill_number: owner only, never reuses a number", async () => {
  await as(OWNER, "select public.set_next_bill_number(2026, 1501)");
  const r = await db.query("select next_number from public.bill_counters where fy_start_year = 2026");
  if (r.rows[0].next_number !== 1501) throw new Error(JSON.stringify(r.rows));
  let refused = false;
  try {
    await as(STAFF, "select public.set_next_bill_number(2026, 1)");
  } catch (err) {
    refused = /Only the owner/.test(err.message);
  }
  if (!refused) throw new Error("staff was allowed to change bill numbers");

  await db.exec(`insert into public.bills (doc_type, title, fy_start_year, seq, number)
                 values ('bill', 'bill_of_supply', 2026, 1501, 'JE/26-27/1501')`);
  let blocked = false;
  try {
    await as(OWNER, "select public.set_next_bill_number(2026, 1500)");
  } catch (err) {
    blocked = /already used/.test(err.message);
  }
  if (!blocked) throw new Error("allowed going back to a used number");
});

await check("bill numbers are unique per year and at most 16 characters", async () => {
  await expectError(
    `insert into public.bills (doc_type, title, fy_start_year, seq, number)
     values ('bill', 'bill_of_supply', 2026, 1501, 'JE/26-27/1501')`,
    /duplicate key/,
  );
  await expectError(
    `insert into public.bills (doc_type, title, fy_start_year, seq, number)
     values ('bill', 'bill_of_supply', 2026, 9, 'TOOLONG/26-27/0009')`,
    /check constraint/,
  );
});

await check("a cancelled bill must have a reason", async () => {
  await expectError("update public.bills set status = 'cancelled'", /check constraint/);
});

await check("there is always at least one active owner", async () => {
  await expectError(`update public.people set active = false where id = '${OWNER}'`, /at least one active owner/);
});

await check("stock is the sum of stock history", async () => {
  await db.exec(`
    insert into public.products (category_id, brand_id, model, capacity, low_stock_level)
      select c.id, b.id, 'Tall Tubular', '150Ah', 2 from public.categories c, public.brands b
      where c.name = 'Inverter battery' and b.name = 'Amaron';
    insert into public.stock_history (product_id, change, reason)
      select id, 5, 'opening_stock' from public.products where model = 'Tall Tubular';
    insert into public.stock_history (product_id, change, reason)
      select id, -3, 'sold' from public.products where model = 'Tall Tubular';
  `);
  const r = await db.query(`select s.in_stock from public.v_product_stock s
                            join public.products p on p.id = s.product_id where p.model = 'Tall Tubular'`);
  if (r.rows[0].in_stock !== 2) throw new Error(`stock is ${r.rows[0].in_stock}`);
});

await check("home screen 'needs attention' counts work", async () => {
  await db.exec(`
    insert into public.units (product_id, serial_no, status, sold_on)
      select id, 'AB12345678', 'sold', public.today_ist() from public.products where model = 'Tall Tubular';
  `);
  const r = await as(STAFF, "select * from public.v_attention_counts");
  const row = r.rows[0];
  if (row.warranty_pending !== 1 || row.warranty_brands[0] !== "Amaron") throw new Error(JSON.stringify(row));
  if (row.low_stock !== 1) throw new Error(`low_stock = ${row.low_stock}`);
});

await check("battery serial numbers are unique (ignoring capital letters)", async () => {
  await expectError(
    `insert into public.units (product_id, serial_no)
       select id, 'ab12345678' from public.products where model = 'Tall Tubular'`,
    /duplicate key/,
  );
});

// ---------------------------------------------------------------- Billing

console.log("Checking billing:");

await db.exec(`
  update public.products
    set mrp = 17500, retail_price = 14500, min_price = 13000, has_serial = true,
        warranty_free_months = 48, warranty_prorata_months = 24, hsn = '8507'
    where model = 'Tall Tubular';
  insert into public.units (product_id, serial_no, arrived_on)
    select id, s, d::date from public.products,
      (values ('AMR-001', '2026-09-01'), ('AMR-002', '2026-10-01')) as v (s, d)
    where model = 'Tall Tubular';
  insert into public.products (category_id, model, retail_price, has_serial)
    select id, 'Battery trolley', 800, false from public.categories where name = 'Accessories';
  insert into public.stock_history (product_id, change, reason)
    select id, 5, 'opening_stock' from public.products where model = 'Battery trolley';
`);
const ids = (
  await db.query(`select
    (select id from public.products where model = 'Tall Tubular') as battery,
    (select id from public.products where model = 'Battery trolley') as trolley,
    (select id from public.products where model = 'Delivery & installation') as delivery,
    (select id from public.units where serial_no = 'AMR-001') as unit1,
    (select id from public.units where serial_no = 'AMR-002') as unit2`)
).rows[0];

const stockOf = async (productId) =>
  (await db.query("select in_stock from public.v_product_stock where product_id = $1", [productId])).rows[0].in_stock;
const saveBill = async (personId, bill) =>
  (await as(personId, "select public.save_bill($1::jsonb) as res", [JSON.stringify(bill)])).rows[0].res;
async function expectBillError(personId, run, code) {
  try {
    await run();
  } catch (err) {
    if (err.message === code) return err;
    throw new Error(`Expected "${code}" but got "${err.message}"`);
  }
  throw new Error(`Expected "${code}" but it worked`);
}
const counter = async () =>
  (await db.query("select coalesce(max(next_number), 0) as n from public.bill_counters where doc_type = 'bill'")).rows[0].n;

const now = new Date();
const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
const fyLabel = `${String(fyStart % 100).padStart(2, "0")}-${String((fyStart + 1) % 100).padStart(2, "0")}`;

let firstBill;
const trolleyBefore = await stockOf(ids.trolley);
const batteryBefore = await stockOf(ids.battery);

await check("save_bill: totals, number, customer, stock, payments", async () => {
  firstBill = await saveBill(STAFF, {
    customer: { phone: "98765 00001", name: "Sunil Kumar", area: "Chas" },
    items: [
      { product_id: ids.battery, unit_id: ids.unit1, qty: 1, rate: 14500 },
      { product_id: ids.trolley, qty: 1, rate: 800 },
      { product_id: ids.delivery, qty: 1, rate: 300 },
    ],
    scrap: [{ battery_type: "Inverter battery", weight_kg: 18, rate_per_kg: 105 }],
    payments: [
      { mode: "upi", amount: 10000, charges: 0 },
      { mode: "credit_card", amount: 2000, charges: 40 },
    ],
  });
  const expectedSeq = fyStart === 2026 ? "1502" : "0001"; // 1501 was used by an earlier check
  if (firstBill.number !== `JE/${fyLabel}/${expectedSeq}`) throw new Error(`number ${firstBill.number}`);
  const b = (
    await db.query(
      `select subtotal::text, scrap_credit::text, extra_charges::text, total::text, paid::text, balance::text,
              customer_name, billed_by, title from public.bills where id = $1`,
      [firstBill.id],
    )
  ).rows[0];
  const got = [b.subtotal, b.scrap_credit, b.extra_charges, b.total, b.paid, b.balance].join(" ");
  if (got !== "15600.00 1890.00 40.00 13750.00 12040.00 1710.00") throw new Error(got);
  if (b.customer_name !== "Sunil Kumar" || b.billed_by !== STAFF || b.title !== "bill_of_supply") {
    throw new Error(JSON.stringify(b));
  }
  const u = (await db.query("select status, customer_id, warranty_start from public.units where id = $1", [ids.unit1]))
    .rows[0];
  if (u.status !== "sold" || !u.customer_id || !u.warranty_start) throw new Error(JSON.stringify(u));
  if ((await stockOf(ids.trolley)) !== trolleyBefore - 1) throw new Error("trolley stock not reduced");
  if ((await stockOf(ids.battery)) !== batteryBefore - 1) throw new Error("battery stock not reduced");
  const items = (await db.query("select warranty_text from public.bill_items where bill_id = $1 order by line_no", [firstBill.id]))
    .rows;
  if (items[0].warranty_text !== "48 months free + 24 months pro-rata") throw new Error(items[0].warranty_text);
});

await check("save_bill refuses bad bills, with a friendly error code — and nothing is half-saved", async () => {
  const before = await counter();
  const trolleyNow = await stockOf(ids.trolley);
  const cash = (amount) => [{ mode: "cash", amount, charges: 0 }];
  const customer = { phone: "9876500001" };

  const sold = await expectBillError(
    STAFF,
    () => saveBill(STAFF, { customer, items: [{ product_id: ids.battery, unit_id: ids.unit1, qty: 1, rate: 14500 }], payments: cash(14500) }),
    "serial_sold",
  );
  if (!JSON.parse(sold.detail).bill?.includes(fyLabel)) throw new Error(`detail ${sold.detail}`);
  await expectBillError(
    STAFF,
    () => saveBill(STAFF, { customer, items: [{ product_id: ids.battery, serial_no: "amr-001", qty: 1, rate: 14500 }], payments: cash(14500) }),
    "serial_sold",
  );
  await expectBillError(
    STAFF,
    () => saveBill(STAFF, { customer, items: [{ product_id: ids.trolley, qty: 1, rate: 800 }], payments: cash(900) }),
    "overpaid",
  );
  await expectBillError(
    STAFF,
    () => saveBill(STAFF, { customer, items: [{ product_id: ids.battery, unit_id: ids.unit2, qty: 1, rate: 18000 }] }),
    "above_mrp",
  );
  await expectBillError(
    STAFF,
    () => saveBill(STAFF, { customer, items: [{ product_id: ids.battery, unit_id: ids.unit2, qty: 1, rate: 12000 }] }),
    "below_min_price",
  );
  await expectBillError(
    STAFF,
    () => saveBill(STAFF, { items: [{ product_id: ids.trolley, qty: 1, rate: 800 }] }),
    "customer_required",
  );
  await expectBillError(
    STAFF,
    () =>
      saveBill(STAFF, {
        customer,
        items: [
          { product_id: ids.battery, unit_id: ids.unit2, qty: 1, rate: 14500 },
          { product_id: ids.battery, unit_id: ids.unit2, qty: 1, rate: 14500 },
        ],
      }),
    "duplicate_serial",
  );
  await expectBillError(STAFF, () => saveBill(STAFF, { customer, items: [] }), "no_items");
  await expectBillError(STAFF, () => saveBill(null, { items: [{ product_id: ids.trolley, qty: 1, rate: 800 }] }), "not_logged_in");

  if ((await counter()) !== before) throw new Error("a refused bill used up a bill number");
  if ((await stockOf(ids.trolley)) !== trolleyNow) throw new Error("a refused bill changed stock");
  const u2 = (await db.query("select status from public.units where id = $1", [ids.unit2])).rows[0];
  if (u2.status !== "in_stock") throw new Error("a refused bill sold a battery");
});

await check("walk-in customer can pay cash for accessories without giving a phone number", async () => {
  const r = await saveBill(STAFF, { items: [{ product_id: ids.trolley, qty: 1, rate: 800 }], payments: [{ mode: "cash", amount: 800 }] });
  const b = (await db.query("select customer_id, balance::text from public.bills where id = $1", [r.id])).rows[0];
  if (b.customer_id !== null || b.balance !== "0.00") throw new Error(JSON.stringify(b));
});

await check("owner can bill below the minimum price; an unknown serial is added and flagged", async () => {
  const r = await saveBill(OWNER, {
    customer: { phone: "9876500001" },
    items: [{ product_id: ids.battery, serial_no: "amr-new-9", qty: 1, rate: 12000 }],
    payments: [{ mode: "cash", amount: 12000 }],
  });
  const u = (await db.query("select status, source, serial_no from public.units where upper(serial_no) = 'AMR-NEW-9'")).rows[0];
  if (u.status !== "sold" || u.source !== "added_at_billing") throw new Error(JSON.stringify(u));
  const c = (await db.query("select count(*)::int as n from public.customers where phone = '9876500001'")).rows[0];
  if (c.n !== 1) throw new Error("the existing customer was duplicated");
  if (!r.number) throw new Error("no number");
});

await check("Bajaj Finance: loan counts as paid and shows as pending from Bajaj", async () => {
  const r = await saveBill(STAFF, {
    customer: { phone: "9876500002", name: "Rakesh Mahato" },
    items: [{ product_id: ids.battery, unit_id: ids.unit2, qty: 1, rate: 14500 }],
    payments: [{ mode: "cash", amount: 5000 }],
    finance: { reference_no: "DO-123", loan_amount: 10000, customer_charges: 500 },
  });
  const b = (await db.query("select total::text, paid::text, balance::text from public.bills where id = $1", [r.id])).rows[0];
  if (`${b.total} ${b.paid} ${b.balance}` !== "15000.00 15000.00 0.00") throw new Error(JSON.stringify(b));
  const a = (await as(STAFF, "select bajaj_pending_count, bajaj_pending_amount::text as amt from public.v_attention_counts")).rows[0];
  if (a.bajaj_pending_count !== 1 || a.amt !== "10000.00") throw new Error(JSON.stringify(a));
});

await check("warranty registration can be ticked off", async () => {
  const before = (await as(STAFF, "select warranty_pending from public.v_attention_counts")).rows[0].warranty_pending;
  await as(STAFF, "select public.mark_warranty_registered($1, 'REG-1')", [ids.unit2]);
  const after = (await as(STAFF, "select warranty_pending from public.v_attention_counts")).rows[0].warranty_pending;
  if (after !== before - 1) throw new Error(`pending ${before} → ${after}`);
});

await check("the customer's WhatsApp link shows that bill to anyone with the link, and nothing else", async () => {
  const shared = (await as(null, "select public.get_shared_bill($1) as j", [firstBill.share_token], "anon")).rows[0].j;
  if (shared?.items?.length !== 3 || shared.shop.shop_name !== "Jay Electronics") throw new Error(JSON.stringify(shared));
  const wrong = (await as(null, "select public.get_shared_bill('nope') as j", [], "anon")).rows[0].j;
  if (wrong !== null) throw new Error("a wrong link showed a bill");
  let blocked = false;
  try {
    await as(null, "select public.bill_json($1)", [firstBill.id], "anon");
  } catch (err) {
    blocked = /permission denied/.test(err.message);
  }
  if (!blocked) throw new Error("bill_json is callable without logging in");
});

await check("serial lookup finds who a battery was sold to", async () => {
  const r = (await as(STAFF, "select public.lookup_serial('amr-001') as j")).rows[0].j;
  if (r.status !== "sold" || r.bill_number !== firstBill.number || r.customer_name !== "Sunil Kumar") {
    throw new Error(JSON.stringify(r));
  }
});

await check("cancel_bill: owner only, needs a reason, puts stock back", async () => {
  await expectBillError(STAFF, () => as(STAFF, "select public.cancel_bill($1, 'mistake')", [firstBill.id]), "owner_only");
  await expectBillError(OWNER, () => as(OWNER, "select public.cancel_bill($1, '  ')", [firstBill.id]), "reason_required");
  const trolley = await stockOf(ids.trolley);
  await as(OWNER, "select public.cancel_bill($1, 'Customer changed mind')", [firstBill.id]);
  const b = (await db.query("select status, cancel_reason, cancelled_by from public.bills where id = $1", [firstBill.id])).rows[0];
  if (b.status !== "cancelled" || b.cancelled_by !== OWNER) throw new Error(JSON.stringify(b));
  const u = (await db.query("select status, customer_id from public.units where id = $1", [ids.unit1])).rows[0];
  if (u.status !== "in_stock" || u.customer_id !== null) throw new Error(JSON.stringify(u));
  if ((await stockOf(ids.trolley)) !== trolley + 1) throw new Error("trolley not returned to stock");
  const p = (await db.query("select count(*)::int as n from public.payments where bill_id = $1 and status = 'saved'", [firstBill.id]))
    .rows[0];
  if (p.n !== 0) throw new Error("payments still counted");
  await expectBillError(OWNER, () => as(OWNER, "select public.cancel_bill($1, 'again')", [firstBill.id]), "already_cancelled");
  const log = (await db.query("select count(*)::int as n from public.change_log where table_name = 'bills'")).rows[0];
  if (log.n !== 1) throw new Error(`expected 1 bill change logged, got ${log.n}`);
});

await check("Regular GST bills are refused until that part is built", async () => {
  await db.exec("update public.shop_settings set gst_scheme = 'regular', scheme_from = '2000-01-01'");
  try {
    await expectBillError(
      STAFF,
      () => saveBill(STAFF, { items: [{ product_id: ids.trolley, qty: 1, rate: 800 }], payments: [{ mode: "cash", amount: 800 }] }),
      "regular_gst_not_ready",
    );
  } finally {
    await db.exec("update public.shop_settings set gst_scheme = 'composition'");
  }
});

// ------------------------------------------------------- Products and stock

console.log("Checking products and stock arrival:");

const call = async (personId, fn, payload, role = "authenticated") =>
  (await as(personId, `select public.${fn}($1::jsonb) as res`, [JSON.stringify(payload)], role)).rows[0].res;
const purchaseCount = async () => (await db.query("select count(*)::int as n from public.purchases")).rows[0].n;
let okayaId;

await check("save_product: owner adds a product (new brand created); staff can't; nobody logged out can", async () => {
  okayaId = await call(OWNER, "save_product", {
    category: "inverter battery", brand: "Okaya", model: "Jumbo Tubular", capacity: "150Ah",
    mrp: "16000", retail_price: "13500", dealer_price: "12800", warranty_free_months: 36, warranty_prorata_months: 24,
    low_stock_level: 2, purchase_price: "11000",
  });
  const p = (await db.query(
    `select p.has_serial, p.hsn, p.gst_rate_pct::text as gst, b.name as brand, c.purchase_price::text as cost
     from public.products p join public.brands b on b.id = p.brand_id join public.product_costs c on c.product_id = p.id
     where p.id = $1`, [okayaId])).rows[0];
  if (!p.has_serial || p.hsn !== "8507" || p.gst !== "18.00" || p.brand !== "Okaya" || p.cost !== "11000.00") {
    throw new Error(JSON.stringify(p));
  }
  await expectBillError(STAFF, () => call(STAFF, "save_product", { category: "Accessories", model: "X" }), "owner_only");
  let blocked = false;
  try {
    await call(null, "save_product", { category: "Accessories", model: "X" }, "anon");
  } catch (err) {
    blocked = /permission denied/.test(err.message);
  }
  if (!blocked) throw new Error("save_product is callable without logging in");
});

await check("save_product refuses duplicates, price above MRP, unknown categories", async () => {
  await expectBillError(OWNER, () => call(OWNER, "save_product", { category: "Inverter battery", brand: "okaya", model: "jumbo tubular", capacity: "150ah" }), "product_exists");
  await expectBillError(OWNER, () => call(OWNER, "save_product", { category: "Accessories", model: "Cable", mrp: "100", retail_price: "120" }), "above_mrp");
  await expectBillError(OWNER, () => call(OWNER, "save_product", { category: "Toys", model: "Y" }), "category_not_found");
});

await check("save_product: count-based product with opening stock; edit keeps stock", async () => {
  const id = await call(OWNER, "save_product", { category: "Accessories", model: "Battery Cable", capacity: "1m", retail_price: "150", opening_stock: 12 });
  if ((await stockOf(id)) !== 12) throw new Error(`stock ${await stockOf(id)}`);
  await call(OWNER, "save_product", { id, category: "Accessories", model: "Battery Cable", capacity: "1m", retail_price: "160" });
  const r = (await db.query("select retail_price::text as p from public.products where id = $1", [id])).rows[0];
  if (r.p !== "160.00" || (await stockOf(id)) !== 12) throw new Error("edit changed stock or didn't save");
});

await check("receive_stock: staff enter a distributor bill with serials; cost includes GST", async () => {
  const before = await stockOf(okayaId);
  const purchaseId = await call(STAFF, "receive_stock", {
    supplier_name: "Shiv Shakti Distributors", supplier_bill_no: "SS/1042",
    items: [{ product_id: okayaId, rate: "10000", gst_paid: "3600", serials: ["oky-001", " OKY-002 "] }],
  });
  if ((await stockOf(okayaId)) !== before + 2) throw new Error("stock not increased by 2");
  const u = (await db.query("select serial_no, status, source from public.units where product_id = $1 order by serial_no", [okayaId])).rows;
  if (u.map((x) => `${x.serial_no}/${x.status}/${x.source}`).join(",") !== "OKY-001/in_stock/purchase,OKY-002/in_stock/purchase") {
    throw new Error(JSON.stringify(u));
  }
  const cost = (await db.query("select purchase_price::text as c from public.product_costs where product_id = $1", [okayaId])).rows[0].c;
  if (cost !== "11800.00") throw new Error(`cost ${cost}`); // (2 × 10000 + 3600) / 2
  const staffSees = await as(STAFF, "select * from public.purchases where id = $1", [purchaseId]);
  const ownerSees = await as(OWNER, "select total::text as t from public.purchases where id = $1", [purchaseId]);
  if (staffSees.rows.length !== 0) throw new Error("staff can read purchase amounts");
  if (ownerSees.rows[0]?.t !== "23600.00") throw new Error(JSON.stringify(ownerSees.rows));
});

await check("receive_stock refuses serials already in the system or typed twice — nothing half-saved", async () => {
  const before = await purchaseCount();
  const stock = await stockOf(okayaId);
  const base = { supplier_name: "Shiv Shakti Distributors", items: [] };
  await expectBillError(STAFF, () => call(STAFF, "receive_stock", { ...base, items: [{ product_id: okayaId, rate: 1, serials: ["OKY-003", "oky-001"] }] }), "serial_exists");
  await expectBillError(STAFF, () => call(STAFF, "receive_stock", { ...base, items: [{ product_id: okayaId, rate: 1, serials: ["OKY-009", "oky-009"] }] }), "duplicate_serial");
  await expectBillError(STAFF, () => call(STAFF, "receive_stock", { items: [{ product_id: okayaId, rate: 1, serials: ["OKY-010"] }] }), "supplier_required");
  await expectBillError(STAFF, () => call(STAFF, "receive_stock", { ...base, items: [{ product_id: ids.trolley, qty: 0, rate: 1 }] }), "bad_qty");
  await expectBillError(STAFF, () => call(STAFF, "receive_stock", { ...base, items: [{ product_id: ids.delivery, qty: 1, rate: 1 }] }), "service_not_stock");
  if ((await purchaseCount()) !== before || (await stockOf(okayaId)) !== stock) throw new Error("a refused entry was half-saved");
});

await check("opening stock needs no supplier; serial on/off can't change once stock exists", async () => {
  const before = await stockOf(ids.trolley);
  await call(STAFF, "receive_stock", { kind: "opening_stock", items: [{ product_id: ids.trolley, qty: 3, rate: 0 }] });
  if ((await stockOf(ids.trolley)) !== before + 3) throw new Error("opening stock not added");
  await expectBillError(OWNER, () => call(OWNER, "save_product", { id: okayaId, category: "Inverter battery", brand: "Okaya", model: "Jumbo Tubular", capacity: "150Ah", has_serial: false }), "cannot_change_serial");
});

// ------------------------------------------------------- Udhaar and Bajaj

console.log("Checking udhaar payments and Bajaj Finance:");

await check("receive_payment applies money to the oldest unpaid bills first", async () => {
  const customer = (await db.query("select id from public.customers where phone = '9876500001'")).rows[0].id;
  // Two udhaar bills for this customer: trolley 800 (paid 300) then trolley 800 (paid 0)
  for (const paid of [300, 0]) {
    await saveBill(STAFF, {
      customer: { id: customer },
      items: [{ product_id: ids.trolley, qty: 1, rate: 800 }],
      payments: paid ? [{ mode: "cash", amount: paid }] : [],
    });
  }
  const dues = async () => (await as(STAFF, "select dues::text as d from public.v_customer_dues where id = $1", [customer])).rows[0].d;
  const before = Number(await dues());
  const r = await call(STAFF, "receive_payment", { customer_id: customer, amount: "600", mode: "upi" });
  if (r.applied.length !== 2 || Number(r.applied[0].amount) !== 500 || Number(r.applied[1].amount) !== 100) {
    throw new Error(JSON.stringify(r));
  }
  if (Number(await dues()) !== before - 600) throw new Error(`dues ${before} → ${await dues()}`);
  await expectBillError(STAFF, () => call(STAFF, "receive_payment", { customer_id: customer, amount: String(before), mode: "cash" }), "more_than_dues");
  await expectBillError(STAFF, () => call(STAFF, "receive_payment", { customer_id: customer, amount: "10", mode: "barter" }), "bad_payment");
  let blocked = false;
  try {
    await call(null, "receive_payment", { customer_id: customer, amount: "10", mode: "cash" }, "anon");
  } catch (err) {
    blocked = /permission denied/.test(err.message);
  }
  if (!blocked) throw new Error("receive_payment is callable without logging in");
});

await check("settle_finance marks Bajaj money received, once", async () => {
  const deal = (await db.query("select id from public.finance_deals where status = 'pending' limit 1")).rows[0].id;
  await call(STAFF, "settle_finance", { finance_id: deal, received_amount: "9800" });
  const d = (await db.query("select status, received_amount::text as amt, received_on from public.finance_deals where id = $1", [deal])).rows[0];
  if (d.status !== "received" || d.amt !== "9800.00" || !d.received_on) throw new Error(JSON.stringify(d));
  await expectBillError(STAFF, () => call(STAFF, "settle_finance", { finance_id: deal, received_amount: "1" }), "already_settled");
  const a = (await as(STAFF, "select bajaj_pending_count from public.v_attention_counts")).rows[0];
  if (a.bajaj_pending_count !== 0) throw new Error("still shown as pending");
});

await db.close();
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nSchema OK — all checks passed.");
