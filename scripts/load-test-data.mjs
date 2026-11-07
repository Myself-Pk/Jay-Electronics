// Loads a TEST catalogue (products, prices, serial-numbered stock) into the real database,
// so billing can be tried before the shop's own stock list is entered.
// Every test battery's serial starts with "TEST-". Wipe all test data before go-live.
// Usage: npm run load-test-data   (needs SUPABASE_DB_URL in .env.local)
import { existsSync } from "node:fs";
import pg from "pg";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_DB_URL?.trim();
if (!url) {
  console.error("SUPABASE_DB_URL is missing in .env.local.");
  process.exit(1);
}

// [brand, category, model, capacity, type, mrp, retail, dealer, min, freeMonths, prorataMonths, lowStock, hsn, serialCode, unitsInStock]
const serialised = [
  ["Amaron", "Inverter battery", "Tall Tubular", "150Ah", "Tall tubular", 17500, 14500, 13600, 13000, 48, 24, 2, "8507", "AMR150", 4],
  ["Exide", "Inverter battery", "Tall Tubular", "150Ah", "Tall tubular", 17000, 14200, 13300, 12800, 36, 24, 2, "8507", "EXD150", 3],
  ["Livguard", "Inverter battery", "Tall Tubular", "200Ah", "Tall tubular", 21000, 17800, 16900, null, 36, 24, 1, "8507", "LVG200", 2],
  ["Microtek", "Inverter / UPS", "Sine Wave Inverter", "900VA", "Sine wave", 7500, 6200, 5800, null, 24, 0, 2, "8504", "MTK900", 3],
  ["Luminous", "Inverter / UPS", "Sine Wave Inverter", "1100VA", "Sine wave", 8900, 7400, 7000, null, 24, 0, 2, "8504", "LUM1100", 2],
  ["Amaron", "Automotive battery", "Car Battery", "35Ah", "SMF", 5600, 4900, 4600, null, 36, 0, 2, "8507", "AMRC35", 3],
  ["Exide", "Automotive battery", "Bike Battery", "5Ah", "SMF", 1600, 1350, 1250, null, 24, 0, 3, "8507", "EXDB5", 5],
];

// [category, model, capacity, mrp, retail, dealer, lowStock, inStock]
const counted = [
  ["Accessories", "Battery Trolley", "", null, 800, 700, 3, 6],
  ["Accessories", "Distilled Water", "5 L", 90, 60, 50, 5, 10],
];

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const already = await client.query("select count(*)::int as n from public.units where serial_no like 'TEST-%'");
if (already.rows[0].n > 0) {
  console.log(`Test data is already loaded (${already.rows[0].n} TEST- batteries). Nothing changed.`);
  await client.end();
  process.exit(0);
}

const id = async (sql, params) => (await client.query(sql, params)).rows[0]?.id;
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

try {
  await client.query("begin");
  let units = 0;
  for (const [brand, category, model, capacity, type, mrp, retail, dealer, min, free, prorata, low, hsn, code, count] of serialised) {
    const productId = await id(
      `insert into public.products (brand_id, category_id, model, capacity, type, mrp, retail_price, dealer_price,
         min_price, has_serial, warranty_free_months, warranty_prorata_months, low_stock_level, hsn, gst_rate_pct)
       select b.id, c.id, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $12, $13, c.default_gst_rate_pct
       from public.brands b, public.categories c where b.name = $1 and c.name = $2
       returning id`,
      [brand, category, model, capacity, type, mrp, retail, dealer, min, free, prorata, low, hsn],
    );
    await client.query("insert into public.product_costs (product_id, purchase_price) values ($1, $2)", [
      productId,
      Math.round(retail * 0.85),
    ]);
    for (let i = 1; i <= count; i++) {
      const unitId = await id(
        `insert into public.units (product_id, serial_no, status, source, arrived_on)
         values ($1, $2, 'in_stock', 'opening_stock', $3) returning id`,
        [productId, `TEST-${code}-${String(i).padStart(4, "0")}`, daysAgo(10 + i * 25)],
      );
      await client.query(
        `insert into public.stock_history (product_id, unit_id, change, reason, note)
         values ($1, $2, 1, 'opening_stock', 'TEST data')`,
        [productId, unitId],
      );
      units++;
    }
  }
  for (const [category, model, capacity, mrp, retail, dealer, low, stock] of counted) {
    const productId = await id(
      `insert into public.products (category_id, model, capacity, mrp, retail_price, dealer_price, has_serial,
         low_stock_level, gst_rate_pct)
       select c.id, $2, $3, $4, $5, $6, false, $7, c.default_gst_rate_pct
       from public.categories c where c.name = $1
       returning id`,
      [category, model, capacity, mrp, retail, dealer, low],
    );
    await client.query("insert into public.product_costs (product_id, purchase_price) values ($1, $2)", [
      productId,
      Math.round(retail * 0.7),
    ]);
    await client.query(
      `insert into public.stock_history (product_id, change, reason, note) values ($1, $2, 'opening_stock', 'TEST data')`,
      [productId, stock],
    );
  }
  await client.query("commit");
  console.log(`✓ Loaded ${serialised.length + counted.length} test products and ${units} TEST- batteries/inverters.`);
} catch (err) {
  await client.query("rollback");
  console.error(`Nothing was loaded: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
