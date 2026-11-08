#!/usr/bin/env node
/**
 * ChargeSetu production database operations (run by the "Production database" workflow).
 *
 *   check        read-only: connection, schema state, counts
 *   backup       in-database backup (supabase/ops/01_backup.sql)
 *   migrate      backup → every migration in MIGRATIONS (one transaction) → verification
 *   verify       read-only post-migration checks (supabase/ops/02_verify.sql)
 *   import-osm   backup → import data/osm/india-osm-charging-stations.json HIDDEN (idempotent) → counts
 *   publish-osm  backup → publish imported OSM stations (ODbL) and hide demo stations (one transaction) → verification
 *   hide-demo    backup → hide (not delete) fictional demo stations, only if ≥ 300 real stations are public
 *   rollback-osm backup → hide every OSM station again and re-publish the demo stations
 *
 * Writing modes need CONFIRM="<MODE IN CAPITALS>" (e.g. CONFIRM="PUBLISH OSM"); migrate needs "APPLY MIGRATIONS".
 * The connection string is read ONLY from DATABASE_URL and is never printed.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
// Every migration listed here is idempotent (safe to re-apply).
const MIGRATIONS = [
  "supabase/migrations/20261108000000_nationwide_expansion.sql",
  "supabase/migrations/20261109000000_publication_permissions.sql",
];
const OSM_FILE = "data/osm/india-osm-charging-stations.json";
const MIN_REAL_PUBLISHED_FOR_DEMO_HIDE = 300;
const CONFIRM = {
  migrate: "APPLY MIGRATIONS",
  "import-osm": "IMPORT OSM",
  "publish-osm": "PUBLISH OSM",
  "hide-demo": "HIDE DEMO",
  "rollback-osm": "ROLLBACK OSM",
};
const mode = process.argv[2];
if (!["check", "backup", "verify", ...Object.keys(CONFIRM)].includes(mode)) {
  console.error(`Usage: deploy.mjs ${["check", "backup", "verify", ...Object.keys(CONFIRM)].join("|")}`);
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. In GitHub, add the SUPABASE_DB_URL repository secret (see docs/DEPLOY_DATABASE.md).");
  process.exit(2);
}
if (CONFIRM[mode] && process.env.CONFIRM !== CONFIRM[mode]) {
  console.error(`Refusing to run "${mode}": set the confirm text to exactly "${CONFIRM[mode]}".`);
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
const q = async (sql, params) => (await client.query(sql, params)).rows;
const hasFn = async (name) =>
  (await q(`select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1) ok`, [name]))[0].ok;

async function state() {
  const [info] = await q(`select current_database() db, current_user usr, split_part(version(), ' ', 2) pg`);
  const nationwide = await hasFn("state_stats");
  const permissions = (await q(`select to_regclass('public.source_publication_permissions') is not null ok`))[0].ok;
  const stations = await q(`select source::text, status::text, count(*)::int n from public.stations group by 1, 2 order by 1, 2`);
  const [other] = await q(`select (select count(*)::int from public.station_leads) leads,
    (select count(*)::int from public.reports) reports,
    (select count(*)::int from public.profiles where role = 'admin') admins`);
  const backups = await q(`select nspname from pg_namespace where nspname like 'backup\\_%' order by 1 desc limit 5`);
  console.log(`Connected: database=${info.db} user=${info.usr} postgres=${info.pg}`);
  console.log(`Nationwide migration applied: ${nationwide ? "YES" : "NO"} · Publication-permissions migration applied: ${permissions ? "YES" : "NO"}`);
  if (permissions) for (const p of await q(`select source, publish_allowed from public.source_publication_permissions order by source`)) console.log(`  publish ${p.source}: ${p.publish_allowed ? "allowed" : "BLOCKED"}`);
  console.log("Stations by source/status:");
  for (const r of stations) console.log(`  ${r.source.padEnd(9)} ${r.status.padEnd(15)} ${r.n}`);
  console.log(`Leads: ${other.leads}  Reports: ${other.reports}  Admin accounts: ${other.admins}`);
  console.log(`Backups present (newest 5): ${backups.map((b) => b.nspname).join(", ") || "none"}`);
  return { ...info, nationwide, permissions };
}

async function backup() {
  const res = await client.query(read("supabase/ops/01_backup.sql"));
  const rows = (Array.isArray(res) ? res.at(-1) : res).rows;
  const bad = rows.filter((r) => Number(r.source_rows) !== Number(r.backup_rows));
  console.log(`Backup schema: ${rows[0]?.backup_schema} (${rows.length} tables)`);
  for (const r of rows) console.log(`  ${r.table_name.padEnd(30)} ${r.source_rows} → ${r.backup_rows}`);
  if (bad.length) throw new Error(`Backup verification failed for: ${bad.map((r) => r.table_name).join(", ")}`);
  console.log("Backup verified: every table copied with identical row counts.");
}

async function verify() {
  const rows = await q(read("supabase/ops/02_verify.sql"));
  for (const r of rows) console.log(`  ${r.ok ? "ok  " : "FAIL"} ${r.check}${r.detail ? ` — ${r.detail}` : ""}`);
  const failed = rows.filter((r) => !r.ok);
  if (failed.length) throw new Error(`${failed.length} verification check(s) failed.`);
  console.log(`All ${rows.length} post-migration checks passed.`);
}

async function inTransaction(label, fn) {
  await client.query("begin");
  try {
    const out = await fn();
    await client.query("commit");
    console.log(`${label}: committed.`);
    return out;
  } catch (e) {
    await client.query("rollback");
    throw new Error(`${label} rolled back, database unchanged: ${e.message}`);
  }
}

async function importOsm() {
  const file = JSON.parse(read(OSM_FILE));
  console.log(`OSM file: ${file.count} stations (${file.licence}, OSM base ${file.osmBase})`);
  const [batch] = await q(
    `insert into public.import_batches (source, label, status, total, publish_as, notes) values ('osm', $1, 'running', $2, 'inactive', $3) returning id`,
    [`OpenStreetMap India — ${file.osmBase ?? file.retrievedAt}`, file.count, "Imported hidden by the Production database workflow"],
  );
  let inserted = 0;
  let skipped = 0;
  await inTransaction("OSM import", async () => {
    for (let i = 0; i < file.rows.length; i += 250) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const chunk = file.rows.slice(i, i + 250).map(({ address_is_approximate, ...r }) => r);
      const [r] = await q(`select * from public.import_stations_batch($1::jsonb, false, $2)`, [JSON.stringify(chunk), batch.id]);
      inserted += Number(r.inserted);
      skipped += Number(r.skipped);
    }
    await q(`update public.import_batches set status = 'completed', inserted = $2, skipped = $3, finished_at = now() where id = $1`, [batch.id, inserted, skipped]);
  });
  console.log(`OSM import: ${inserted} added (hidden), ${skipped} already present.`);
}

async function bulk(source, from, to) {
  let total = 0;
  for (;;) {
    const [r] = await q(`select public.admin_bulk_set_status($1, null, $2, $3, 2000) n`, [source, from, to]);
    if (Number(r.n) === 0) break;
    total += Number(r.n);
  }
  return total;
}

try {
  await client.connect();
  const info = await state();
  if (mode === "backup") await backup();
  if (mode === "verify") await verify();
  if (mode === "migrate") {
    await backup();
    await inTransaction("Migrations", async () => {
      for (const m of MIGRATIONS) {
        console.log(`Applying ${m}`);
        await client.query(read(m));
      }
    });
    await verify();
    await state();
  }
  if (mode === "import-osm" || mode === "publish-osm" || mode === "rollback-osm" || mode === "hide-demo") {
    if (!info.permissions) throw new Error("Apply the migrations first (mode: migrate).");
    await backup();
  }
  if (mode === "import-osm") {
    await importOsm();
    await state();
  }
  if (mode === "publish-osm") {
    // Publish OSM and, in the same transaction, hide the fictional demo stations so they are
    // never mixed with real results — but only when enough real stations are public.
    const { n, demo } = await inTransaction("OSM publish", async () => {
      const n = await bulk("osm", "inactive", "published");
      const [r] = await q(`select count(*)::int n from public.stations where status = 'published' and source::text <> 'demo'`);
      const demo = r.n >= MIN_REAL_PUBLISHED_FOR_DEMO_HIDE ? await bulk("demo", "published", "inactive") : 0;
      return { n, demo };
    });
    console.log(`Published ${n} OSM stations (labelled source-listed, unverified). Hid ${demo} fictional demo stations (not deleted).`);
    await verify();
    await state();
  }
  if (mode === "rollback-osm") {
    // Undo publish-osm: hide OSM again and bring the demo stations back so the site is never empty.
    const { n, demo } = await inTransaction("OSM rollback", async () => ({ n: await bulk("osm", "published", "inactive"), demo: await bulk("demo", "inactive", "published") }));
    console.log(`Hid ${n} OSM stations; re-published ${demo} demo stations.`);
    await state();
  }
  if (mode === "hide-demo") {
    const [r] = await q(`select count(*)::int n from public.stations where status = 'published' and source::text <> 'demo'`);
    if (r.n < MIN_REAL_PUBLISHED_FOR_DEMO_HIDE) throw new Error(`Refusing: only ${r.n} real stations are public (need ${MIN_REAL_PUBLISHED_FOR_DEMO_HIDE}).`);
    const n = await inTransaction("Demo hide", () => bulk("demo", "published", "inactive"));
    console.log(`Hid ${n} fictional demo stations (not deleted; restore with the backup or admin screen).`);
    await verify();
    await state();
  }
} catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
