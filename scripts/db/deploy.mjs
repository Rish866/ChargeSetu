#!/usr/bin/env node
/**
 * ChargeSetu production database operations.
 *
 *   node scripts/db/deploy.mjs check     read-only: connection, schema state, counts
 *   node scripts/db/deploy.mjs backup    in-database backup (supabase/ops/01_backup.sql)
 *   node scripts/db/deploy.mjs migrate   backup → nationwide migration (one transaction) → verification
 *   node scripts/db/deploy.mjs verify    read-only post-migration checks (supabase/ops/02_verify.sql)
 *
 * The connection string is read ONLY from the DATABASE_URL environment variable
 * (in CI: the SUPABASE_DB_URL repository secret). It is never printed or logged.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATION = "supabase/migrations/20261108000000_nationwide_expansion.sql";
const mode = process.argv[2];
if (!["check", "backup", "migrate", "verify"].includes(mode)) {
  console.error("Usage: deploy.mjs check|backup|migrate|verify");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. In GitHub, add the SUPABASE_DB_URL repository secret (see docs/DEPLOY_DATABASE.md).");
  process.exit(2);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  // Supabase requires TLS. The pooler certificate is not in Node's default CA store.
  ssl: process.env.DATABASE_URL.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
  statement_timeout: 120_000,
  connectionTimeoutMillis: 20_000,
});
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const q = async (sql) => (await client.query(sql)).rows;

async function state() {
  const [info] = await q(`select current_database() db, current_user usr, split_part(version(), ' ', 2) pg,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'state_stats') nationwide_applied`);
  const stations = await q(`select source::text, status::text, count(*)::int n from public.stations group by 1, 2 order by 1, 2`);
  const [other] = await q(`select (select count(*)::int from public.station_leads) leads,
    (select count(*)::int from public.reports) reports,
    (select count(*)::int from public.profiles where role = 'admin') admins`);
  const backups = await q(`select nspname from pg_namespace where nspname like 'backup\\_%' order by 1 desc limit 5`);
  console.log(`Connected: database=${info.db} user=${info.usr} postgres=${info.pg}`);
  console.log(`Nationwide migration applied: ${info.nationwide_applied ? "YES" : "NO"}`);
  console.log("Stations by source/status:");
  for (const r of stations) console.log(`  ${r.source.padEnd(9)} ${r.status.padEnd(15)} ${r.n}`);
  console.log(`Leads: ${other.leads}  Reports: ${other.reports}  Admin accounts: ${other.admins}`);
  console.log(`Backups present: ${backups.map((b) => b.nspname).join(", ") || "none"}`);
  return info;
}

async function backup() {
  const res = await client.query(read("supabase/ops/01_backup.sql"));
  const rows = (Array.isArray(res) ? res.at(-1) : res).rows;
  const bad = rows.filter((r) => Number(r.source_rows) !== Number(r.backup_rows));
  console.log(`Backup schema: ${rows[0]?.backup_schema} (${rows.length} tables)`);
  for (const r of rows) console.log(`  ${r.table_name.padEnd(22)} ${r.source_rows} → ${r.backup_rows}`);
  if (bad.length) throw new Error(`Backup verification failed for: ${bad.map((r) => r.table_name).join(", ")}`);
  console.log("Backup verified: every table copied with identical row counts.");
}

async function verify() {
  const rows = await q(read("supabase/ops/02_verify.sql"));
  for (const r of rows) console.log(`  ${r.ok ? "ok  " : "FAIL"} ${r.check}${r.detail ? ` — ${r.detail}` : ""}`);
  const failed = rows.filter((r) => !r.ok);
  if (failed.length) throw new Error(`${failed.length} verification check(s) failed.`);
  console.log("All post-migration checks passed.");
}

try {
  await client.connect();
  const info = await state();
  if (mode === "backup") await backup();
  if (mode === "verify") await verify();
  if (mode === "migrate") {
    if (process.env.CONFIRM !== "APPLY NATIONWIDE MIGRATION") throw new Error('Refusing to migrate: set CONFIRM="APPLY NATIONWIDE MIGRATION".');
    await backup();
    console.log(info.nationwide_applied ? "Migration already applied — re-applying (it is idempotent)." : "Applying nationwide migration…");
    await client.query("begin");
    try {
      await client.query(read(MIGRATION));
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw new Error(`Migration rolled back, database unchanged: ${e.message}`);
    }
    console.log("Migration committed.");
    await verify();
    await state();
  }
} catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
