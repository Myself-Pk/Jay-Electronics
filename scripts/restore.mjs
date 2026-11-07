// Puts a backup back into a database. For emergencies — e.g. the Supabase project was lost.
//
//   1. Create a new Supabase project and fill .env.local for it (see supabase/SETUP.md)
//   2. npm run db:migrate
//   3. npm run restore -- "<backup folder>"            (refuses if the database already has bills)
//      npm run restore -- "<backup folder>" --force    (wipes the database first — careful!)
//
// Logins: each person gets their login back with a TEMPORARY PIN, printed here. Change it in Settings.
import { randomInt } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { BACKUP_TABLES } from "./backup.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/** Tables with "generated always" ids that must keep their values. */
const IDENTITY = { stock_history: "id", change_log: "id", job_cards: "job_no", backup_log: "id" };

export async function restoreBackup({ url, file, force = false, skipLogins = false, admin = null, log = console.log }) {
  const backup = JSON.parse(readFileSync(file, "utf8"));
  if (backup.app !== "jay-electronics" || !backup.tables) throw new Error("This doesn't look like a Jay Electronics backup.");

  const client = new pg.Client({ connectionString: url, ssl: /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    const bills = (await client.query("select count(*)::int as n from public.bills")).rows[0].n;
    if (bills > 0 && !force) {
      throw new Error(`This database already has ${bills} bills. Restore into an empty project, or add --force to wipe it first.`);
    }

    // Logins must exist (with the same ids) before people are put back.
    const people = backup.tables.people ?? [];
    if (!skipLogins) {
      if (!admin) throw new Error("VITE_SUPABASE_URL and SUPABASE_SECRET_KEY are needed to put logins back.");
      for (const p of people) {
        const existing = await admin.auth.admin.getUserById(p.id);
        if (existing.data?.user) continue;
        const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
        const created = await admin.auth.admin.createUser({ id: p.id, email: p.login_email, password: pin, email_confirm: true });
        if (created.error) throw new Error(`Could not recreate the login for ${p.name}: ${created.error.message}`);
        log(`  Login for ${p.name}: temporary PIN ${pin}  (change it in Settings → People)`);
      }
    }

    await client.query("begin");
    await client.query(`truncate ${BACKUP_TABLES.map((t) => `public.${t}`).join(", ")} restart identity cascade`);
    for (const table of BACKUP_TABLES) {
      let rows = backup.tables[table] ?? [];
      if (table === "units") rows = rows.map((u) => ({ ...u, bill_item_id: null })); // linked again after bill_items
      await client.query(`alter table public.${table} disable trigger user`);
      if (rows.length > 0) {
        await client.query(
          `insert into public.${table} ${IDENTITY[table] ? "overriding system value" : ""}
           select * from json_populate_recordset(null::public.${table}, $1::json)`,
          [JSON.stringify(rows)],
        );
      }
      await client.query(`alter table public.${table} enable trigger user`);
    }
    for (const u of backup.tables.units ?? []) {
      if (u.bill_item_id) await client.query("update public.units set bill_item_id = $1 where id = $2", [u.bill_item_id, u.id]);
    }
    for (const [table, column] of Object.entries(IDENTITY)) {
      await client.query(
        `select setval(pg_get_serial_sequence('public.${table}', '${column}'), coalesce((select max(${column}) from public.${table}), 0) + 1, false)`,
      );
    }
    await client.query("commit");
    await client.query("notify pgrst, 'reload schema'");

    const count = Object.values(backup.tables).reduce((n, rows) => n + rows.length, 0);
    log(`✓ Restored ${count} rows from the backup taken ${backup.taken_at}.`);
    return count;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!target) {
    console.error('Which backup? Usage: npm run restore -- "<backup folder>"');
    process.exit(1);
  }
  const file = statSync(target).isDirectory() ? join(target, "jay-backup.json") : target;
  const url = process.env.SUPABASE_DB_URL?.trim();
  const apiUrl = process.env.VITE_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  const skipLogins = process.argv.includes("--skip-logins");
  const admin = apiUrl && secret ? createClient(apiUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  restoreBackup({ url, file, force: process.argv.includes("--force"), skipLogins, admin }).catch((err) => {
    console.error(`✗ Restore failed: ${err.message}`);
    process.exit(1);
  });
}
