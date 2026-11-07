/**
 * Database tests for the nationwide expansion migration. Runs ALL migrations in
 * order (plus the demo seed) in an in-memory Postgres and checks security,
 * idempotent import, honest unknowns and search functions.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../supabase");
const ADMIN = "11111111-1111-4111-8111-111111111111";
const OP_A = "22222222-2222-4222-8222-222222222222";
const CUST = "44444444-4444-4444-8444-444444444444";
const DEMO_PUBLISHED = "00000000-0000-4000-8000-d00000000001";

let db: PGlite;
let opA: string;

async function as<T>(who: string | null, fn: () => Promise<T>, commit = false): Promise<T> {
  const role = who ? "authenticated" : "anon";
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(who ? { sub: who, role } : { role })]);
    await db.exec(`set local role ${role}`);
    const out = await fn();
    await db.exec(commit ? "commit" : "rollback");
    return out;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
const rows = async <R = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows;
const count = async (sql: string) => Number((await rows<{ n: number }>(sql))[0].n);

interface Row {
  source: string; external_id: string; name: string; slug: string; network: string; address: string; city: string; district: string; state: string;
  latitude: number; longitude: number; connector_types: string[]; connector_count: number | null; power_kw: number | null; vehicle_classes: string[];
  source_url: string; source_attribution: string; source_data_as_of: string; last_evidence_check: string; location_quality: string;
  name_is_derived: boolean; data_quality_score: number; merged_source_ids: string[]; eligibility: string;
  points: Array<{ standard: string; current: string; power_kw: number | null; connector_count: number; vehicle_classes: string[] }>;
}
const importRow = (i: number, over: Partial<Row> = {}): Row => ({
  source: "bee", external_id: `evs_test${i}`, name: `TestNet – Town ${i}`, slug: `testnet-town-${i}-evs-test${i}`, network: "TestNet", address: `Road ${i}, Town`,
  city: "Town", district: "District", state: "Maharashtra", latitude: 19 + i / 1000, longitude: 73 + i / 1000, connector_types: ["ccs2"], connector_count: 2,
  power_kw: 60, vehicle_classes: ["car"], source_url: "http://beeindia.gov.in/", source_attribution: "BEE", source_data_as_of: "2025-10-26",
  last_evidence_check: "2026-11-07T00:00:00Z", location_quality: "ok", name_is_derived: true, data_quality_score: 70, merged_source_ids: [], eligibility: "B",
  points: [{ standard: "ccs2", current: "DC", power_kw: 60, connector_count: 2, vehicle_classes: ["car"] }], ...over,
});
const doImport = (who: string | null, data: Row[], publish: boolean) =>
  as(who, async () => rows<{ inserted: number; skipped: number }>(`select * from public.import_stations_batch($1::jsonb, $2, null)`, [JSON.stringify(data), publish]), true);

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
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ADMIN}', 'admin@example.com', '{}'),
      ('${OP_A}', 'a@example.com', '{"account_type":"operator","company_name":"A Co"}'),
      ('${CUST}', 'c@example.com', '{}');
    update public.profiles set role = 'admin' where id = '${ADMIN}';
  `);
  opA = (await rows<{ id: string }>(`select id from public.operators where profile_id = '${OP_A}'`))[0].id;
}, 120_000);

describe("migration on an existing database", () => {
  it("keeps every existing station and its data", async () => {
    expect(await count(`select count(*)::int n from public.stations where source = 'demo'`)).toBe(17);
    const [s] = await rows<{ power_kw: string; vehicle_classes: string[]; location_quality: string }>(`select power_kw, vehicle_classes, location_quality from public.stations where id = '${DEMO_PUBLISHED}'`);
    expect(Number(s.power_kw)).toBe(60);
    expect(s.vehicle_classes).toEqual([]);
    expect(s.location_quality).toBe("ok");
  });
  it("lets an admin store honest unknowns (no power, count, hours or connectors)", async () => {
    const r = await as(ADMIN, () => rows<{ id: string }>(`
      insert into public.stations (name, slug, network, address, city, state, latitude, longitude, connector_types)
      values ('Unknowns Test', 'unknowns-test', 'Net', 'x1', 'City', 'Goa', 15.5, 73.9, '{}') returning id`), true);
    expect(r).toHaveLength(1);
    const [s] = await rows<{ power_kw: unknown; opening_hours: unknown; connector_count: unknown }>(`select power_kw, opening_hours, connector_count from public.stations where slug = 'unknowns-test'`);
    expect(s).toEqual({ power_kw: null, opening_hours: null, connector_count: null });
  });
  it("still forces operator submissions into pending review", async () => {
    const [r] = await as(OP_A, () => rows<{ status: string }>(`
      insert into public.stations (operator_id, name, slug, network, address, area, city, state, latitude, longitude, connector_types, connector_count, power_kw, opening_hours, status, verification_status)
      values ('${opA}', 'Op Station', 'op-station-x', 'Net', 'Some address', 'Area', 'Pune', 'Maharashtra', 18.5, 73.8, '{ccs2}', 1, 50, '24h', 'published', 'verified') returning status`), true);
    expect(r.status).toBe("pending_review");
  });
  it("never allows a suspect-coordinate station to be published", async () => {
    await expect(db.query(`update public.stations set location_quality = 'suspect' where id = '${DEMO_PUBLISHED}'`)).rejects.toThrow();
  });
});

describe("bulk import", () => {
  it("is admin-only", async () => {
    for (const who of [null, CUST, OP_A]) await expect(doImport(who, [importRow(900)], false)).rejects.toThrow();
  });
  it("imports atomically as hidden by default, with connector detail and provenance", async () => {
    const data = [importRow(1), importRow(2, { merged_source_ids: ["evs_old1", "evs_old2"] })];
    const [r] = await doImport(ADMIN, data, false);
    expect(r).toEqual({ inserted: 2, skipped: 0 });
    expect(await count(`select count(*)::int n from public.stations where source = 'bee' and status = 'inactive'`)).toBe(2);
    expect(await count(`select count(*)::int n from public.charging_points`)).toBe(2);
    expect(await count(`select count(*)::int n from public.station_sources where is_merged_record`)).toBe(2);
    expect(await count(`select count(*)::int n from public.stations where source = 'bee' and verification_status = 'unverified' and operator_id is null`)).toBe(2);
  });
  it("is idempotent: a re-run inserts nothing and creates no duplicates", async () => {
    const [r] = await doImport(ADMIN, [importRow(1), importRow(2), importRow(3)], false);
    expect(r).toEqual({ inserted: 1, skipped: 2 });
    expect(await count(`select count(*)::int n from public.stations where source = 'bee'`)).toBe(3);
    expect(await count(`select count(*)::int n from public.charging_points`)).toBe(3);
    const [r2] = await doImport(ADMIN, [importRow(1), importRow(2), importRow(3)], false);
    expect(r2).toEqual({ inserted: 0, skipped: 3 });
  });
  it("never overwrites an admin's edits to an imported station", async () => {
    await as(ADMIN, () => db.query(`update public.stations set name = 'Admin Edited', verification_status = 'verified', last_verified_at = now() where external_id = 'evs_test1'`), true);
    await doImport(ADMIN, [importRow(1, { name: "Changed By Re-import" })], true);
    const [s] = await rows<{ name: string; verification_status: string }>(`select name, verification_status from public.stations where external_id = 'evs_test1'`);
    expect(s).toEqual({ name: "Admin Edited", verification_status: "verified" });
  });
  it("publishes only eligible (B) records with good coordinates when asked", async () => {
    const data = [importRow(10), importRow(11, { eligibility: "C" }), importRow(12, { location_quality: "suspect", eligibility: "C" }), importRow(13, { location_quality: "suspect" })];
    await doImport(ADMIN, data, true);
    const status = async (id: string) => (await rows<{ status: string }>(`select status from public.stations where external_id = $1`, [id]))[0].status;
    expect(await status("evs_test10")).toBe("published");
    expect(await status("evs_test11")).toBe("inactive");
    expect(await status("evs_test12")).toBe("inactive");
    expect(await status("evs_test13")).toBe("inactive"); // suspect location never public even if labelled B
  });
  it("rejects oversized batches", async () => {
    const big = Array.from({ length: 1001 }, (_, i) => importRow(5000 + i));
    await expect(doImport(ADMIN, big, false)).rejects.toThrow(/too large/i);
  });
});

describe("bulk publish and hide", () => {
  const bulk = (who: string | null, args: string) => as(who, () => rows<{ n: number }>(`select public.admin_bulk_set_status(${args}) as n`), true);
  beforeAll(async () => {
    await doImport(ADMIN, [importRow(300, { state: "Goa" }), importRow(301, { state: "Goa" }), importRow(302, { state: "Goa", location_quality: "suspect", eligibility: "C" }), importRow(303, { state: "Kerala" })], false);
  });
  it("is admin-only", async () => {
    for (const who of [null, CUST, OP_A]) await expect(bulk(who, `'bee', 'Goa', 'inactive', 'published'`)).rejects.toThrow();
  });
  it("publishes only hidden stations with good coordinates, one state, in chunks", async () => {
    expect((await bulk(ADMIN, `'bee', 'Goa', 'inactive', 'published', 1`))[0].n).toBe(1);
    expect((await bulk(ADMIN, `'bee', 'Goa', 'inactive', 'published', 1`))[0].n).toBe(1);
    expect((await bulk(ADMIN, `'bee', 'Goa', 'inactive', 'published', 1`))[0].n).toBe(0); // the suspect one stays hidden
    expect(await count(`select count(*)::int n from public.stations where external_id in ('evs_test300','evs_test301') and status = 'published'`)).toBe(2);
    expect(await count(`select count(*)::int n from public.stations where external_id = 'evs_test302' and status = 'inactive'`)).toBe(1);
    expect(await count(`select count(*)::int n from public.stations where external_id = 'evs_test303' and status = 'inactive'`)).toBe(1); // other state untouched
  });
  it("refuses unsafe transitions and can hide stations again", async () => {
    await expect(bulk(ADMIN, `'bee', null, 'pending_review', 'published'`)).rejects.toThrow();
    await expect(bulk(ADMIN, `'bee', null, 'published', 'rejected'`)).rejects.toThrow();
    expect((await bulk(ADMIN, `'bee', 'Goa', 'published', 'inactive'`))[0].n).toBe(2);
  });
  it("can hide the fictional demo stations without touching real ones", async () => {
    const before = await count(`select count(*)::int n from public.stations where source <> 'demo' and status = 'published'`);
    expect((await bulk(ADMIN, `'demo', null, 'published', 'inactive'`))[0].n).toBe(14);
    expect(await count(`select count(*)::int n from public.stations where source <> 'demo' and status = 'published'`)).toBe(before);
    expect(await count(`select count(*)::int n from public.stations where source = 'demo'`)).toBe(17); // nothing deleted
  });
});

describe("what the public can see", () => {
  it("shows anonymous visitors only published stations and their connectors", async () => {
    const stations = await as(null, () => rows<{ source: string; status: string }>(`select source::text, status::text from public.stations`));
    expect(stations.every((s) => s.status === "published")).toBe(true);
    expect(stations.some((s) => s.source === "bee")).toBe(true);
    const pts = await as(null, () => count(`select count(*)::int n from public.charging_points`));
    expect(pts).toBe(1); // only the one published imported station
  });
  it("hides provenance, import batches and claims from the public and from operators", async () => {
    for (const who of [null, OP_A, CUST]) {
      for (const t of ["station_sources", "import_batches"]) {
        const n = await as(who, async () => {
          try { return await count(`select count(*)::int n from public.${t}`); } catch { return 0; }
        });
        expect(n).toBe(0);
      }
    }
    expect(await as(ADMIN, () => count(`select count(*)::int n from public.station_sources`))).toBeGreaterThan(0);
  });
});

describe("claim your station", () => {
  const claim = (who: string, stationId: string, extra = "") => as(who, () => db.query(`
    insert into public.station_claims (station_id, claimant_id, company_name, contact_email, evidence${extra ? ", status" : ""})
    values ('${stationId}', '${who}', 'A Co', 'a@example.com', 'We operate this charger; invoice available'${extra})`), true);
  let published: string;
  let hidden: string;
  beforeAll(async () => {
    published = (await rows<{ id: string }>(`select id from public.stations where external_id = 'evs_test10'`))[0].id;
    hidden = (await rows<{ id: string }>(`select id from public.stations where external_id = 'evs_test11'`))[0].id;
  });
  it("lets an operator claim a published station, always as pending", async () => {
    await claim(OP_A, published, ", 'approved'");
    const [c] = await rows<{ status: string }>(`select status from public.station_claims where claimant_id = '${OP_A}'`);
    expect(c.status).toBe("pending");
  });
  it("blocks customers, anonymous visitors, duplicate pending claims and hidden stations", async () => {
    await expect(claim(CUST, published)).rejects.toThrow();
    await expect(claim(OP_A, published)).rejects.toThrow(); // already pending
    await expect(claim(OP_A, hidden)).rejects.toThrow(); // not public
    await expect(as(null, () => db.query(`insert into public.station_claims (station_id, claimant_id, company_name, contact_email, evidence) values ('${published}', '${OP_A}', 'x co', 'a@b.co', 'long enough evidence')`))).rejects.toThrow();
  });
  it("lets only the claimant and admins read claims, and only admins decide", async () => {
    expect(await as(OP_A, () => count(`select count(*)::int n from public.station_claims`))).toBe(1);
    expect(await as(CUST, () => count(`select count(*)::int n from public.station_claims`))).toBe(0);
    const own = await as(OP_A, () => rows(`update public.station_claims set status = 'approved' returning id`));
    expect(own).toHaveLength(0);
    const adm = await as(ADMIN, () => rows(`update public.station_claims set status = 'approved', reviewed_at = now() returning id`));
    expect(adm).toHaveLength(1);
  });
});

describe("search functions", () => {
  beforeAll(async () => {
    const data = [
      importRow(100, { name: "Mumbai One", city: "Mumbai", latitude: 19.076, longitude: 72.8777, vehicle_classes: ["car"], connector_types: ["ccs2"], power_kw: 120, network: "AlphaNet" }),
      importRow(101, { name: "Mumbai Two", city: "Mumbai", latitude: 19.09, longitude: 72.89, vehicle_classes: ["two_three_wheeler"], connector_types: ["lev_ac"], power_kw: 3.3, network: "BetaNet" }),
      importRow(102, { name: "Delhi One", city: "New Delhi", state: "Delhi", latitude: 28.6139, longitude: 77.209, vehicle_classes: ["car", "two_three_wheeler"], connector_types: ["type2"], power_kw: 22, network: "AlphaNet" }),
    ];
    await doImport(ADMIN, data, true);
  });
  const nearby = (args: string) => as(null, () => rows<{ id: string; distance_km: number; total_count: string }>(`select * from public.stations_nearby(${args})`));
  const names = async (ids: string[]) => (await rows<{ name: string }>(`select name from public.stations where id = any($1::uuid[])`, [ids])).map((r) => r.name).sort();

  it("finds stations near a point, nearest first, within the radius", async () => {
    const r = await nearby(`19.07, 72.87, 20`);
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r[0].distance_km).toBeLessThan(r[1].distance_km);
    expect((await names(r.map((x) => x.id))).every((n) => !n.startsWith("Delhi"))).toBe(true);
  });
  it("filters by vehicle, current, connector, power, operator and text", async () => {
    expect(await names((await nearby(`19.07, 72.87, 20, 24, 0, null, 'two_three_wheeler'`)).map((x) => x.id))).toEqual(["Mumbai Two"]);
    expect(await names((await nearby(`19.07, 72.87, 20, 24, 0, null, null, 'DC'`)).map((x) => x.id))).toContain("Mumbai One");
    expect(await names((await nearby(`19.07, 72.87, 20, 24, 0, null, null, 'AC'`)).map((x) => x.id))).not.toContain("Mumbai One");
    const fast = await names((await nearby(`19.07, 72.87, 20, 24, 0, null, null, null, 'ccs2', 100`)).map((x) => x.id));
    expect(fast).toContain("Mumbai One");
    expect(fast).not.toContain("Mumbai Two");
    expect(await names((await nearby(`28.6, 77.2, 30, 24, 0, null, null, null, null, null, 'alphanet'`)).map((x) => x.id))).toEqual(["Delhi One"]);
    expect(await names((await nearby(`19.07, 72.87, 20, 24, 0, null, null, null, null, null, null, false, 'two'`)).map((x) => x.id))).toEqual(["Mumbai Two"]);
  });
  it("clusters far out and returns individual stations when zoomed in", async () => {
    const far = await as(null, () => rows<{ kind: string; n: string }>(`select kind, n from public.station_map_points(6, 68, 37, 98, 5)`));
    expect(far.some((p) => p.kind === "cluster")).toBe(true);
    const near = await as(null, () => rows<{ kind: string; name: string }>(`select kind, name from public.station_map_points(19.0, 72.8, 19.2, 73.0, 15)`));
    expect(near.filter((p) => p.kind === "station").map((p) => p.name)).toEqual(expect.arrayContaining(["Mumbai One", "Mumbai Two"]));
  });
  it("reports state-wise and operator counts", async () => {
    const st = await as(ADMIN, () => rows<{ state: string; total: string }>(`select state, total from public.state_stats()`));
    expect(st.find((s) => s.state === "Delhi")).toBeTruthy();
    const ops = await as(null, () => rows<{ network: string }>(`select network from public.operator_counts()`));
    expect(ops.map((o) => o.network)).toContain("AlphaNet");
  });
});

describe("performance at national scale", () => {
  it("searches 30,000 published stations quickly", async () => {
    await db.exec(`
      insert into public.stations (name, slug, network, address, city, state, latitude, longitude, connector_types, vehicle_classes, status, verification_status, source, external_id, power_kw, connector_count)
      select 'Load Test ' || g, 'load-test-' || g, 'LoadNet' || (g % 40), 'Address ' || g, 'City' || (g % 500), 'Karnataka',
             8 + (g % 2900) / 100.0, 69 + (g % 2800) / 100.0, '{ccs2}', '{car}', 'published', 'unverified', 'bee', 'load_' || g, 30, 2
      from generate_series(1, 30000) g;
    `);
    expect(await count(`select count(*)::int n from public.stations where status = 'published'`)).toBeGreaterThan(30000);
    const t0 = Date.now();
    const r = await as(null, () => rows(`select * from public.stations_nearby(18.0, 79.0, 25, 24)`));
    const t1 = Date.now();
    const m = await as(null, () => rows(`select * from public.station_map_points(10, 70, 20, 90, 7)`));
    const t2 = Date.now();
    expect(r.length).toBeGreaterThan(0);
    expect(m.length).toBeGreaterThan(0);
    expect(m.length).toBeLessThanOrEqual(800);
    expect(t1 - t0).toBeLessThan(3000);
    expect(t2 - t1).toBeLessThan(3000);
  }, 120_000);
});
