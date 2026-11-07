// Saves a complete copy of the shop's data to a folder on this computer.
//
//   npm run backup              take a backup now
//   npm run backup -- --if-due  one backup a day (used by the hourly task): taken after 7 PM, or straight away
//                               if the last one is more than a day old (the computer was off in the evening)
//
// Each backup is a dated folder with:
//   jay-backup.json   everything, for `npm run restore`
//   stock.csv, dues.csv, bills-this-month.csv   open in Excel without the app
// Folder: BACKUP_DIR in .env.local (point it at a Google Drive folder for an off-site copy),
// otherwise "backups" in the project. Keeps the last 60 backups plus the first of every month.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// Keep dates (bill dates, arrival dates) exactly as stored, e.g. "2026-11-07". Without this the
// database driver turns them into midnight-in-India timestamps, which shift to the previous day in UTC.
pg.types.setTypeParser(1082, (value) => value);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root); // the hourly task may start us from anywhere
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/** Every app table, in an order that restores cleanly (things referred to come first). */
export const BACKUP_TABLES = [
  "shop_settings", "people", "bill_counters", "brands", "categories", "products", "product_costs",
  "customers", "suppliers", "purchases", "purchase_items", "units", "stock_history", "bills", "bill_items",
  "bill_item_costs", "payments", "finance_deals", "scrap_entries", "complaints", "complaint_updates",
  "job_cards", "expenses", "day_closes", "change_log", "backup_log",
];

const KEEP = 60;
/** The daily backup is taken from this hour (7 PM), after the day's billing. */
const EVENING_HOUR = 19;

/** Is a backup due? One per day: in the evening, or right away if the last is over a day old. */
export function backupDue(lastName, now = new Date()) {
  if (!lastName) return { due: true, why: "first backup" };
  const today = stamp(now).slice(0, 10);
  if (lastName.slice(0, 10) === today) return { due: false, why: `already backed up today (${lastName})` };
  const [y, m, d] = lastName.slice(0, 10).split("-").map(Number);
  const last = new Date(y, m - 1, d, Number(lastName.slice(11, 13)), Number(lastName.slice(13, 15)));
  if ((now.getTime() - last.getTime()) / 3_600_000 >= 24) return { due: true, why: "last backup is over a day old" };
  if (now.getHours() >= EVENING_HOUR) return { due: true, why: "evening backup" };
  return { due: false, why: `waiting for the evening (last: ${lastName})` };
}

function csv(rows, columns) {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [columns.map(([h]) => cell(h)).join(","), ...rows.map((r) => columns.map(([, k]) => cell(r[k])).join(","))].join("\r\n");
}

/** 2026-11-07_2105 (local time) */
function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function listBackups(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(n) && existsSync(join(dir, n, "jay-backup.json")))
    .sort();
}

/** Keep the newest KEEP backups, plus the first backup of every month forever. */
function prune(dir) {
  const all = listBackups(dir);
  const firstOfMonth = new Set();
  const seenMonths = new Set();
  for (const name of all) {
    const month = name.slice(0, 7);
    if (!seenMonths.has(month)) {
      seenMonths.add(month);
      firstOfMonth.add(name);
    }
  }
  const keep = new Set([...all.slice(-KEEP), ...firstOfMonth]);
  for (const name of all) if (!keep.has(name)) rmSync(join(dir, name), { recursive: true, force: true });
}

export async function takeBackup({ url, dir, ifDue = false, log = console.log }) {
  dir = resolve(dir);
  mkdirSync(dir, { recursive: true });
  if (ifDue) {
    const { due, why } = backupDue(listBackups(dir).at(-1));
    if (!due) {
      log(`No backup needed: ${why}.`);
      return null;
    }
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000, // give up instead of hanging on a bad connection
    query_timeout: 60_000,
  });
  client.on("error", () => undefined); // a dropped connection shows up as a failed query below, not a crash
  await client.connect();
  try {
    // One consistent snapshot of every table.
    await client.query("begin isolation level repeatable read read only");
    const tables = {};
    let rows = 0;
    for (const table of BACKUP_TABLES) {
      const r = await client.query(`select * from public.${table}`);
      tables[table] = r.rows;
      rows += r.rows.length;
    }
    const migrations = (
      await client.query("select version from supabase_migrations.schema_migrations order by version").catch(() => ({ rows: [] }))
    ).rows.map((r) => r.version);
    const stock = (
      await client.query(`select concat_ws(' ', brand, model, nullif(capacity, '')) as product, category, in_stock, retail_price
                          from public.v_catalog where active and not is_service order by category_order, brand, model`)
    ).rows;
    const dues = (
      await client.query(`select coalesce(c.name, b.customer_name) as customer, coalesce(c.phone, b.customer_phone) as phone,
                                 sum(b.balance) as dues, min(b.bill_date) as oldest_bill
                          from public.bills b left join public.customers c on c.id = b.customer_id
                          where b.doc_type = 'bill' and b.status = 'saved' and b.balance > 0
                          group by 1, 2 order by dues desc`)
    ).rows;
    const monthBills = (
      await client.query(`select number, bill_date, customer_name, customer_phone, total, paid, balance, status
                          from public.bills where doc_type = 'bill' and bill_date >= date_trunc('month', public.today_ist())
                          order by bill_date, number`)
    ).rows;
    await client.query("commit");

    const name = stamp();
    const folder = join(dir, name);
    mkdirSync(folder, { recursive: true });
    const json = JSON.stringify({ app: "jay-electronics", format: 1, taken_at: new Date().toISOString(), migrations, tables });
    writeFileSync(join(folder, "jay-backup.json"), json);
    writeFileSync(join(folder, "stock.csv"), csv(stock, [["Product", "product"], ["Category", "category"], ["In stock", "in_stock"], ["Price", "retail_price"]]));
    writeFileSync(join(folder, "dues.csv"), csv(dues, [["Customer", "customer"], ["Phone", "phone"], ["Udhaar", "dues"], ["Oldest bill", "oldest_bill"]]));
    writeFileSync(
      join(folder, "bills-this-month.csv"),
      csv(monthBills, [["Bill no.", "number"], ["Date", "bill_date"], ["Customer", "customer_name"], ["Phone", "customer_phone"],
        ["Total", "total"], ["Paid", "paid"], ["Balance", "balance"], ["Status", "status"]]),
    );

    await client.query(
      "insert into public.backup_log (folder, tables, rows, bytes, computer) values ($1, $2, $3, $4, $5)",
      [name, BACKUP_TABLES.length, rows, Buffer.byteLength(json), hostname()],
    );
    prune(dir);
    log(`✓ Backup saved: ${folder}  (${rows} rows, ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB)`);
    return folder;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

// Run from the command line
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) {
    console.error("SUPABASE_DB_URL is missing in .env.local, so there is nothing to back up.");
    process.exit(1);
  }
  const dir = process.env.BACKUP_DIR?.trim() || join(root, "backups");
  // Shop internet can blip: try up to 3 times, a few seconds apart.
  for (let attempt = 1; ; attempt++) {
    try {
      await takeBackup({ url, dir, ifDue: process.argv.includes("--if-due") });
      break;
    } catch (err) {
      if (attempt >= 3) {
        console.error(`✗ Backup failed: ${err.message}`);
        process.exit(1);
      }
      console.error(`Backup attempt ${attempt} failed (${err.message}). Trying again…`);
      await new Promise((r) => setTimeout(r, attempt * 5000));
    }
  }
}
