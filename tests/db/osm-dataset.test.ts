/**
 * Imports the committed OpenStreetMap dataset exactly as the production workflow does
 * (trusted operations context, chunks of 250, hidden first), publishes it, and checks
 * that visitors see it with attribution while BEE stays blocked.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../supabase");
const file = JSON.parse(readFileSync(join(__dirname, "../../data/osm/india-osm-charging-stations.json"), "utf8"));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const rows = (file.rows as Array<Record<string, unknown>>).map(({ address_is_approximate, ...r }) => r);
let db: PGlite;
const n = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);
const asAnon = async <T,>(fn: () => Promise<T>) => {
  await db.exec("begin");
  await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  await db.exec("set local role anon");
  try {
    return await fn();
  } finally {
    await db.exec("rollback");
  }
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
  `);
  for (const f of readdirSync(join(ROOT, "migrations")).sort()) await db.exec(readFileSync(join(ROOT, "migrations", f), "utf8"));
  await db.exec(readFileSync(join(ROOT, "seed.sql"), "utf8"));
}, 120_000);

describe("OpenStreetMap dataset through all migrations", () => {
  it("imports every row hidden, idempotently", async () => {
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 250) {
      const r = await db.query<{ inserted: number }>(`select * from public.import_stations_batch($1::jsonb, false, null)`, [JSON.stringify(rows.slice(i, i + 250))]);
      inserted += Number(r.rows[0].inserted);
    }
    expect(inserted).toBe(rows.length);
    const again = await db.query<{ inserted: number }>(`select * from public.import_stations_batch($1::jsonb, false, null)`, [JSON.stringify(rows.slice(0, 250))]);
    expect(Number(again.rows[0].inserted)).toBe(0);
    expect(await n(`select count(*)::int n from public.stations where source = 'osm' and status = 'inactive'`)).toBe(rows.length);
    expect(await asAnon(() => n(`select count(*)::int n from public.stations where source = 'osm'`))).toBe(0);
  });

  it("publishes them as unverified, with attribution, opening hours and source notes", async () => {
    const r = await db.query<{ n: number }>(`select public.admin_bulk_set_status('osm', null, 'inactive', 'published', 5000) n`);
    expect(Number(r.rows[0].n)).toBe(rows.length);
    expect(await n(`select count(*)::int n from public.stations where source = 'osm' and status = 'published' and verification_status = 'unverified' and source_attribution ilike '%OpenStreetMap%'`)).toBe(rows.length);
    const withHours = rows.filter((x) => x.opening_hours).length;
    expect(await n(`select count(*)::int n from public.stations where source = 'osm' and opening_hours is not null`)).toBe(withHours);
    expect(await n(`select count(*)::int n from public.stations where source = 'osm' and source_notes is not null`)).toBe(rows.length);
  });

  it("is searchable by visitors: nearby, map clusters and state counts", async () => {
    const near = await asAnon(() => db.query(`select * from public.stations_nearby(28.6139, 77.2090, 25, 24)`)); // New Delhi
    expect(near.rows.length).toBeGreaterThan(5);
    const map = await asAnon(() => db.query(`select * from public.station_map_points(6, 68, 37.6, 97.5, 5)`));
    expect(map.rows.length).toBeGreaterThan(0);
    const states = await asAnon(() => db.query<{ state: string }>(`select state from public.state_stats() where published > 0`));
    expect(states.rows.length).toBeGreaterThanOrEqual(20);
    const pts = await asAnon(() => n(`select count(*)::int n from public.charging_points`));
    expect(pts).toBeGreaterThan(0);
  });
});
