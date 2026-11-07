// Creates / updates the tables in your Supabase database.
// Runs every file in supabase/migrations that hasn't been run yet, in order.
// Usage: npm run db:migrate   (needs SUPABASE_DB_URL in .env.local — see supabase/SETUP.md)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_DB_URL?.trim();
if (!url || url.includes("[YOUR-PASSWORD]")) {
  console.error(
    "SUPABASE_DB_URL is missing in .env.local.\n" +
      "Copy the 'Session pooler' connection string from Supabase (Connect button) and put your database password in it.",
  );
  process.exit(1);
}

// Supabase requires an encrypted connection (sslmode=disable is only for local test databases).
const client = new pg.Client({
  connectionString: url,
  ssl: /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false },
});
try {
  await client.connect();
} catch (err) {
  console.error(`Could not connect to the database: ${err.message}`);
  console.error("Check the password in SUPABASE_DB_URL, and that you copied the 'Session pooler' string.");
  process.exit(1);
}

// Same bookkeeping table the Supabase CLI uses, so the CLI can take over later if wanted.
await client.query(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key,
    statements text[],
    name text
  );
`);
const done = new Set(
  (await client.query("select version from supabase_migrations.schema_migrations")).rows.map((r) => r.version),
);

const dir = "supabase/migrations";
let applied = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  const [version, ...nameParts] = file.replace(/\.sql$/, "").split("_");
  if (done.has(version)) {
    console.log(`  · ${file} (already done)`);
    continue;
  }
  const sql = readFileSync(join(dir, file), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query(
      "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
      [version, nameParts.join("_"), [sql]],
    );
    await client.query("commit");
    console.log(`  ✓ ${file}`);
    applied++;
  } catch (err) {
    await client.query("rollback");
    console.error(`  ✗ ${file}\n    ${err.message}\n  Nothing from this file was saved.`);
    await client.end();
    process.exit(1);
  }
}

await client.query("notify pgrst, 'reload schema'");
await client.end();
console.log(applied > 0 ? `\nDone: ${applied} update(s) applied.` : "\nThe database is already up to date.");
