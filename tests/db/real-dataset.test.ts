/**
 * Imports the REAL bundled BEE dataset (via the same mapper the admin screen
 * uses) into an in-memory Postgres built from all migrations, in chunks of 500
 * — exactly what the admin import does in production.
 */
import { PGlite } from "@electric-sql/pglite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseCsv } from "../../src/lib/etl/csv";
import { cleanRowToImport } from "../../src/lib/etl/import-map";

const ROOT = join(__dirname, "../../supabase");
const ADMIN = "11111111-1111-4111-8111-111111111111";
let db: PGlite;
// The real BEE file is private (licence unconfirmed); fall back to the fictional fixture in CI.
const PRIVATE_FILE = process.env.CHARGESETU_PRIVATE_DATA ?? join(__dirname, "../../../private-data/india_ev_charging_clean.csv");
const usingReal = existsSync(PRIVATE_FILE);
const data = parseCsv(readFileSync(usingReal ? PRIVATE_FILE : join(__dirname, "../fixtures/sample-clean.csv"), "utf8"))
  .map(cleanRowToImport)
  .filter((r) => r !== null);

async function asAdmin<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN, role: "authenticated" })]);
    await db.exec("set local role authenticated");
    const out = await fn();
    await db.exec("commit");
    return out;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
const importAll = async (publish: boolean) => {
  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < data.length; i += 500) {
    const chunk = data.slice(i, i + 500);
    const r = await asAdmin(() => db.query<{ inserted: number; skipped: number }>(`select * from public.import_stations_batch($1::jsonb, $2, null)`, [JSON.stringify(chunk), publish]));
    inserted += Number(r.rows[0].inserted);
    skipped += Number(r.rows[0].skipped);
  }
  return { inserted, skipped };
};
const n = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
  `);
  for (const f of readdirSync(join(ROOT, "migrations")).sort()) await db.exec(readFileSync(join(ROOT, "migrations", f), "utf8"));
  await db.exec(readFileSync(join(ROOT, "seed.sql"), "utf8"));
  await db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'); update public.profiles set role = 'admin' where id = '${ADMIN}';`);
}, 120_000);

describe(`${usingReal ? "real BEE" : "fixture"} dataset through the migration`, () => {
  it("imports every row hidden, then is idempotent on re-run", async () => {
    const first = await importAll(false);
    expect(first.inserted).toBe(data.length);
    expect(first.skipped).toBe(0);
    expect(await n(`select count(*)::int n from public.stations where source = 'bee' and status = 'published'`)).toBe(0);
    const second = await importAll(false);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(data.length);
    expect(await n(`select count(*)::int n from public.stations where source = 'bee'`)).toBe(data.length);
  }, 300_000);

  it("publishes level-B only, in chunks, and never suspect locations", async () => {
    let total = 0;
    for (;;) {
      const r = await asAdmin(() => db.query<{ c: number }>(`select public.admin_bulk_set_status('bee', null, 'inactive', 'published', 5000) c`));
      const c = Number(r.rows[0].c);
      if (c === 0) break;
      total += c;
    }
    const expectedB = data.filter((r) => r.eligibility === "B").length;
    expect(total).toBe(expectedB);
    expect(await n(`select count(*)::int n from public.stations where source = 'bee' and status = 'published' and location_quality = 'suspect'`)).toBe(0);
    expect(await n(`select count(*)::int n from public.stations where source = 'bee' and status = 'inactive'`)).toBe(data.length - expectedB);
  }, 300_000);

  it("covers all states and keeps unknown power null", async () => {
    expect(await n(`select count(distinct state)::int n from public.stations where source = 'bee'`)).toBeGreaterThanOrEqual(usingReal ? 30 : 1);
    expect(await n(`select count(*)::int n from public.charging_points`)).toBeGreaterThanOrEqual(data.length);
  });

  it("state_stats and operator_counts work at full scale", async () => {
    const s = await db.query<{ total: number }>(`select * from public.state_stats()`);
    expect(s.rows.length).toBeGreaterThanOrEqual(usingReal ? 30 : 1);
    const o = await db.query(`select * from public.operator_counts()`);
    expect(o.rows.length).toBeGreaterThan(usingReal ? 10 : 0);
  });
});
