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

async function as(personId, sql, params) {
  await db.exec(`reset role; select set_config('test.uid', '${personId ?? ""}', false); set role authenticated;`);
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
  grant usage on schema auth to anon, authenticated;
`);

console.log("Running migrations:");
const dir = "supabase/migrations";
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(dir, file), "utf8"));
  console.log(`  ✓ ${file}`);
}

// Supabase grants these by default; RLS then decides what each person sees.
await db.exec(`
  grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
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

await check("nothing can be deleted from the app", async () => {
  await as(OWNER, "delete from public.customers");
  await db.exec("insert into public.customers (name, phone) values ('Sunil Kumar', '9876543210')");
  await as(OWNER, "delete from public.customers");
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

await db.close();
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nSchema OK — all checks passed.");
