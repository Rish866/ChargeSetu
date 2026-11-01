/**
 * Imports candidate stations ("leads") from a CSV into `public.station_leads`.
 *
 *   DATABASE_URL=postgresql://... npm run leads:import -- data/imports/file.csv           # dry run
 *   DATABASE_URL=postgresql://... npm run leads:import -- data/imports/file.csv --apply   # write
 *
 * - Dry run by default: nothing is written unless --apply is passed.
 * - Idempotent: rows are keyed on normalised name + address; reruns skip them.
 * - Never touches `stations`. Leads are always pending_review + unverified.
 * - DATABASE_URL is the Supabase "Session pooler" connection string. Keep it in
 *   your shell or .env.local only — never commit it or put it in Vercel.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import pg from "pg";
import { parseCsvRecords } from "../src/lib/leads/csv.ts";
import { LEAD_CSV_COLUMNS, planLeadImport, type LeadRow } from "../src/lib/leads/normalize.ts";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const batchArg = args.find((a) => a.startsWith("--batch="))?.slice("--batch=".length);
const reportArg = args.find((a) => a.startsWith("--report="))?.slice("--report=".length);

if (!file) {
  console.error("Usage: npm run leads:import -- <file.csv> [--apply] [--batch=name] [--report=out.json]");
  process.exit(2);
}
const importBatch = batchArg ?? basename(file).replace(/\.csv$/i, "");

const { header, records } = parseCsvRecords(readFileSync(file, "utf8"));
const missingCols = LEAD_CSV_COLUMNS.filter((c) => !header.includes(c));
if (missingCols.length) {
  console.error(`CSV is missing columns: ${missingCols.join(", ")}`);
  process.exit(2);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. See README → Importing station leads.");
  process.exit(2);
}
const client = new pg.Client({
  connectionString: url,
  // Supabase requires TLS. Set DATABASE_SSL_CA to the project's CA file
  // (Project Settings → Database → SSL) for full certificate checking.
  ssl: process.env.DATABASE_SSL_CA
    ? { ca: readFileSync(process.env.DATABASE_SSL_CA, "utf8") }
    : { rejectUnauthorized: false },
});
await client.connect();

const exists = await client.query(`select to_regclass('public.station_leads') as t`);
if (!exists.rows[0].t) {
  console.error("Table public.station_leads does not exist. Run supabase/migrations/20261102000000_station_leads.sql first.");
  await client.end();
  process.exit(1);
}

const stations = await client.query<{ id: string; name: string; address: string }>(`select id, name, address from public.stations`);
const plan = planLeadImport(records, importBatch, stations.rows);
const stationsBefore = await client.query(`select count(*)::int n, md5(coalesce(string_agg(t::text, '|' order by id), '')) h from public.stations t`);

const insertSql = `
  insert into public.station_leads (
    dedupe_key, import_batch, source_row, station_name, operator_name, address, city, state, pincode,
    connector_types, connector_types_raw, power_kw_max, power_kw_raw, tariff_inr_per_kwh,
    access_notes, source_url, notes, missing_fields, quality_flags, status, verification_status
  ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'pending_review','unverified')
  on conflict (dedupe_key) do nothing
  returning id`;
const params = (r: LeadRow) => [
  r.dedupeKey, r.importBatch, r.sourceRow, r.stationName, r.operatorName, r.address, r.city, r.state, r.pincode,
  r.connectorTypes, r.connectorTypesRaw, r.powerKwMax, r.powerKwRaw, r.tariffInrPerKwh,
  r.accessNotes, r.sourceUrl, r.notes, r.missingFields, r.qualityFlags,
];

const inserted: { sourceRow: number; id: string }[] = [];
const alreadyImported: number[] = [];
await client.query("begin");
try {
  for (const row of plan.valid) {
    const res = await client.query<{ id: string }>(insertSql, params(row));
    if (res.rows[0]) inserted.push({ sourceRow: row.sourceRow, id: res.rows[0].id });
    else alreadyImported.push(row.sourceRow);
  }
  const stationsAfter = await client.query(`select count(*)::int n, md5(coalesce(string_agg(t::text, '|' order by id), '')) h from public.stations t`);
  if (stationsAfter.rows[0].h !== stationsBefore.rows[0].h) throw new Error("Safety check failed: stations table changed");
  await client.query(apply ? "commit" : "rollback");
} catch (e) {
  await client.query("rollback");
  console.error("Import failed and was rolled back:", (e as Error).message);
  await client.end();
  process.exit(1);
}

const summary = {
  mode: apply ? "APPLIED" : "DRY RUN (nothing written — add --apply)",
  file,
  importBatch,
  csvRecords: records.length,
  validLeads: plan.valid.length,
  [apply ? "inserted" : "wouldInsert"]: inserted.length,
  [apply ? "skippedAlreadyImported" : "wouldSkipAlreadyImported"]: alreadyImported.length,
  skippedDuplicateInFile: plan.duplicatesInFile.length,
  skippedDuplicateOfExistingStation: plan.duplicatesOfStations.length,
  rejected: plan.rejected.length,
  readyToPublish: plan.valid.filter((r) => r.missingFields.length === 0).length,
  withConnectorsAndPower: plan.valid.filter((r) => r.connectorTypes.length && r.powerKwMax !== null).length,
  missingConnectors: plan.valid.filter((r) => !r.connectorTypes.length).length,
  missingPower: plan.valid.filter((r) => r.powerKwMax === null).length,
  missingTariff: plan.valid.filter((r) => r.tariffInrPerKwh === null).length,
  stationsTableUnchanged: true,
};
console.log(JSON.stringify(summary, null, 2));
if (plan.rejected.length) console.log("\nRejected rows:", JSON.stringify(plan.rejected, null, 2));
if (plan.duplicatesInFile.length) console.log("\nDuplicates within the file:", JSON.stringify(plan.duplicatesInFile, null, 2));
if (plan.duplicatesOfStations.length) console.log("\nAlready listed as stations:", JSON.stringify(plan.duplicatesOfStations, null, 2));
if (plan.sameSiteGroups.length) console.log("\nSame site, different listings (check manually):", JSON.stringify(plan.sameSiteGroups, null, 2));

if (reportArg) {
  writeFileSync(
    reportArg,
    JSON.stringify(
      {
        summary,
        rejected: plan.rejected,
        duplicatesInFile: plan.duplicatesInFile,
        duplicatesOfStations: plan.duplicatesOfStations,
        sameSiteGroups: plan.sameSiteGroups,
        rows: plan.valid.map((r) => ({
          sourceRow: r.sourceRow,
          stationName: r.stationName,
          connectorTypes: r.connectorTypes,
          powerKwMax: r.powerKwMax,
          pincode: r.pincode,
          missingFields: r.missingFields,
          qualityFlags: r.qualityFlags,
        })),
      },
      null,
      2,
    ),
  );
}
await client.end();
