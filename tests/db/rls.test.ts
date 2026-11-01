/**
 * Database security tests. Runs the real migrations + seed in an in-memory
 * Postgres (PGlite) with a minimal stand-in for Supabase's `auth` schema and
 * API roles, then acts as anon / customer / operator / admin exactly as
 * PostgREST does (role + request.jwt.claims).
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../supabase");
const ADMIN = "11111111-1111-4111-8111-111111111111";
const OP_A = "22222222-2222-4222-8222-222222222222";
const OP_B = "33333333-3333-4333-8333-333333333333";
const CUST = "44444444-4444-4444-8444-444444444444";
const SNEAKY = "55555555-5555-4555-8555-555555555555";
const PUBLISHED = "00000000-0000-4000-8000-d00000000001";
const PENDING = "00000000-0000-4000-8000-d00000000015";

let db: PGlite;
let opA: string;
let opB: string;

type Who = string | null;

async function as<T>(who: Who, fn: () => Promise<T>, commit = false): Promise<T> {
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

const stationInsert = (operatorId: string, extra = "", slug = `t-${Math.random().toString(36).slice(2, 9)}`) => `
  insert into public.stations (operator_id, name, slug, network, address, area, city, state, latitude, longitude,
    connector_types, connector_count, power_kw, price, price_unit, opening_hours${extra ? ", status, verification_status, created_at" : ""})
  values ('${operatorId}', 'Test Station', '${slug}', 'Net', 'Some address 123', 'Area', 'Pune', 'Maharashtra', 18.5, 73.8,
    '{ccs2}', 2, 60, 20, 'per_kwh', '24 hours'${extra})
  returning id, status, verification_status, operator_id, created_at`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    -- Supabase's default API grants:
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
  `);
  for (const f of readdirSync(join(ROOT, "migrations")).sort()) {
    await db.exec(readFileSync(join(ROOT, "migrations", f), "utf8"));
  }
  await db.exec(readFileSync(join(ROOT, "seed.sql"), "utf8"));
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ADMIN}', 'admin@example.com', '{"full_name":"Admin"}'),
      ('${OP_A}', 'a@example.com', '{"full_name":"Op A","account_type":"operator","company_name":"A Co","company_phone":"+91 98765 43210","terms_accepted_at":"x"}'),
      ('${OP_B}', 'b@example.com', '{"full_name":"Op B","account_type":"operator","company_name":"B Co"}'),
      ('${CUST}', 'c@example.com', '{"full_name":"Cust"}'),
      ('${SNEAKY}', 's@example.com', '{"full_name":"Sneaky","account_type":"admin"}');
    update public.profiles set role = 'admin' where id = '${ADMIN}';
  `);
  opA = (await rows<{ id: string }>(`select id from public.operators where profile_id = '${OP_A}'`))[0].id;
  opB = (await rows<{ id: string }>(`select id from public.operators where profile_id = '${OP_B}'`))[0].id;
}, 60_000);

describe("sign-up trigger", () => {
  it("never creates admins, even when sign-up metadata asks for it", async () => {
    const [p] = await rows<{ role: string }>(`select role from public.profiles where id = '${SNEAKY}'`);
    expect(p.role).toBe("customer");
  });
  it("creates an operator record with the business phone and records consent", async () => {
    const [o] = await rows<{ company_name: string; contact_phone: string }>(`select company_name, contact_phone from public.operators where id = '${opA}'`);
    expect(o).toEqual({ company_name: "A Co", contact_phone: "+91 98765 43210" });
    const [p] = await rows<{ terms_accepted_at: string | null }>(`select terms_accepted_at from public.profiles where id = '${OP_A}'`);
    expect(p.terms_accepted_at).not.toBeNull();
  });
});

describe("anonymous visitors", () => {
  it("see only published stations", async () => {
    const r = await as(null, () => rows<{ status: string }>(`select distinct status from public.stations`));
    expect(r.map((x) => x.status)).toEqual(["published"]);
  });
  it("can't read reports, profiles or operators", async () => {
    await as(null, async () => {
      expect(await count(`select count(*)::int n from public.reports`)).toBe(0);
      expect(await count(`select count(*)::int n from public.profiles`)).toBe(0);
      expect(await count(`select count(*)::int n from public.operators`)).toBe(0);
    });
  });
  it("can't create, change or delete stations", async () => {
    await expect(as(null, () => db.query(stationInsert(opA)))).rejects.toThrow();
    const upd = await as(null, () => rows(`update public.stations set name = 'Hacked' where id = '${PUBLISHED}' returning id`));
    expect(upd).toHaveLength(0);
    const del = await as(null, () => rows(`delete from public.stations where id = '${PUBLISHED}' returning id`));
    expect(del).toHaveLength(0);
  });
  it("can report a published station but not a pending one, and can't pre-resolve", async () => {
    await as(null, () => db.query(`insert into public.reports (station_id, issue_type, description) values ('${PUBLISHED}', 'other', 'Something is wrong here')`));
    await expect(as(null, () => db.query(`insert into public.reports (station_id, issue_type, description) values ('${PENDING}', 'other', 'Something is wrong here')`))).rejects.toThrow();
  });
  it("can't file a report as already resolved (forced to open)", async () => {
    const id = "99999999-9999-4999-8999-999999999999";
    await as(null, () => db.query(`insert into public.reports (id, station_id, issue_type, description, status) values ('${id}', '${PUBLISHED}', 'other', 'Something is wrong here', 'resolved')`), true);
    const [r] = await rows<{ status: string }>(`select status from public.reports where id = '${id}'`);
    expect(r.status).toBe("open");
  });
  it("rejects malformed reporter emails", async () => {
    await expect(as(null, () => db.query(`insert into public.reports (station_id, issue_type, description, reporter_email) values ('${PUBLISHED}', 'other', 'Something is wrong here', 'not-an-email')`))).rejects.toThrow();
  });
  it("is rate limited to 5 reports per station per hour", async () => {
    const station = "00000000-0000-4000-8000-d00000000002";
    for (let i = 0; i < 5; i++) {
      await as(null, () => db.query(`insert into public.reports (station_id, issue_type, description) values ('${station}', 'other', 'Report number ${i} here')`), true);
    }
    await expect(as(null, () => db.query(`insert into public.reports (station_id, issue_type, description) values ('${station}', 'other', 'One report too many')`))).rejects.toThrow(/Too many reports/);
  });
});

describe("operators", () => {
  it("submissions always land in pending_review/unverified, even if they ask to publish", async () => {
    const [r] = await as(OP_A, () =>
      rows<{ status: string; verification_status: string; created_at: string }>(stationInsert(opA, ", 'published', 'verified', '2020-01-01'")),
    );
    expect(r.status).toBe("pending_review");
    expect(r.verification_status).toBe("unverified");
    expect(new Date(r.created_at).getFullYear()).toBeGreaterThan(2020); // can't backdate
  });
  it("can't create stations for another operator", async () => {
    const [r] = await as(OP_A, () => rows<{ operator_id: string }>(stationInsert(opB)));
    expect(r.operator_id).toBe(opA);
  });
  it("can edit their own station but never publish, verify or reassign it", async () => {
    const [{ id }] = await as(OP_A, () => rows<{ id: string }>(stationInsert(opA)), true);
    const [r] = await as(OP_A, () =>
      rows<{ status: string; verification_status: string; operator_id: string; name: string }>(
        `update public.stations set name = 'Renamed', status = 'published', verification_status = 'verified', operator_id = '${opB}'
         where id = '${id}' returning status, verification_status, operator_id, name`,
      ),
    );
    expect(r).toEqual({ status: "pending_review", verification_status: "unverified", operator_id: opA, name: "Renamed" });
  });
  it("can't see or edit other operators' unpublished stations, or unowned stations", async () => {
    const [{ id }] = await as(OP_A, () => rows<{ id: string }>(stationInsert(opA)), true);
    await as(OP_B, async () => {
      expect(await count(`select count(*)::int n from public.stations where id = '${id}'`)).toBe(0);
      expect(await rows(`update public.stations set name = 'Hijack' where id = '${id}' returning id`)).toHaveLength(0);
      expect(await rows(`update public.stations set name = 'Hijack' where id = '${PUBLISHED}' returning id`)).toHaveLength(0);
    });
  });
  it("can't read reports or other operators' records", async () => {
    await as(OP_A, async () => {
      expect(await count(`select count(*)::int n from public.reports`)).toBe(0);
      expect(await count(`select count(*)::int n from public.operators`)).toBe(1);
      expect(await count(`select count(*)::int n from public.profiles`)).toBe(1);
    });
  });
  it("can't give themselves admin, but can change their own name", async () => {
    await expect(as(OP_A, () => db.query(`update public.profiles set role = 'admin' where id = '${OP_A}'`))).rejects.toThrow();
    const r = await as(OP_A, () => rows(`update public.profiles set full_name = 'New Name' where id = '${OP_A}' returning id`));
    expect(r).toHaveLength(1);
    const [p] = await rows<{ role: string }>(`select role from public.profiles where id = '${OP_A}'`);
    expect(p.role).toBe("operator");
  });
  it("can't create operator records for themselves", async () => {
    await expect(as(CUST, () => db.query(`insert into public.operators (profile_id, company_name, contact_email) values ('${CUST}', 'Fake Co', 'c@example.com')`))).rejects.toThrow();
  });
  it("must use https photo links", async () => {
    const sql = (url: string) => `
      insert into public.stations (operator_id, name, slug, network, address, area, city, state, latitude, longitude,
        connector_types, connector_count, power_kw, price, price_unit, opening_hours, photo_urls)
      values ('${opA}', 'Photo Test', 'photo-${Math.random().toString(36).slice(2, 8)}', 'Net', 'Some address 123', 'Area',
        'Pune', 'Maharashtra', 18.5, 73.8, '{ccs2}', 2, 60, 20, 'per_kwh', '24 hours', array['${url}'])`;
    await expect(as(OP_A, () => db.query(sql("http://insecure.example/a.jpg")))).rejects.toThrow();
    await expect(as(OP_A, () => db.query(sql("javascript:alert(1)")))).rejects.toThrow();
    await as(OP_A, () => db.query(sql("https://example.com/a.jpg")));
  });
});

describe("customers", () => {
  it("can't create stations", async () => {
    await expect(as(CUST, () => db.query(stationInsert(opA)))).rejects.toThrow();
  });
});

describe("admins", () => {
  it("can read everything and publish/verify", async () => {
    const [{ id }] = await as(OP_A, () => rows<{ id: string }>(stationInsert(opA)), true);
    await as(ADMIN, async () => {
      expect(await count(`select count(*)::int n from public.stations where status <> 'published'`)).toBeGreaterThan(2);
      expect(await count(`select count(*)::int n from public.reports`)).toBeGreaterThan(0);
      expect(await count(`select count(*)::int n from public.operators`)).toBe(2);
      const [r] = await rows<{ status: string; verification_status: string }>(
        `update public.stations set status = 'published', verification_status = 'verified', last_verified_at = now() where id = '${id}' returning status, verification_status`,
      );
      expect(r).toEqual({ status: "published", verification_status: "verified" });
    }, true);
    // An operator edit afterwards sends it back to review.
    const [back] = await as(OP_A, () => rows<{ status: string; last_verified_at: string | null }>(`update public.stations set opening_hours = '6 AM–10 PM' where id = '${id}' returning status, last_verified_at`));
    expect(back).toEqual({ status: "pending_review", last_verified_at: null });
  });
  it("aren't rate limited when filing reports", async () => {
    const station = "00000000-0000-4000-8000-d00000000002"; // already at the anon limit
    await as(ADMIN, () => db.query(`insert into public.reports (station_id, issue_type, description) values ('${station}', 'other', 'Admin note about this')`));
  });
});

describe("station leads", () => {
  const leadInsert = (key: string, extra = "", extraVals = "") => `
    insert into public.station_leads (dedupe_key, import_batch, station_name, address, city, state, source_url${extra})
    values ('${key}', 'test', 'Lead Station', 'Plot 1, Sector 2', 'Navi Mumbai', 'Maharashtra', 'https://example.com/x'${extraVals})`;

  beforeAll(async () => {
    await db.exec(leadInsert("seed-lead"));
  });

  it("are invisible to anonymous visitors, customers and operators", async () => {
    await expect(as(null, () => db.query(`select * from public.station_leads`))).rejects.toThrow();
    for (const who of [CUST, OP_A]) {
      expect(await as(who, () => count(`select count(*)::int n from public.station_leads`))).toBe(0);
    }
  });
  it("can't be created or changed by non-admins", async () => {
    await expect(as(null, () => db.query(leadInsert("anon-lead")))).rejects.toThrow();
    await expect(as(OP_A, () => db.query(leadInsert("op-lead")))).rejects.toThrow();
    const upd = await as(OP_A, () => rows(`update public.station_leads set status = 'converted' returning id`));
    expect(upd).toHaveLength(0);
  });
  it("are visible to admins, and can never be marked verified", async () => {
    expect(await as(ADMIN, () => count(`select count(*)::int n from public.station_leads`))).toBe(1);
    await expect(as(ADMIN, () => db.query(`update public.station_leads set verification_status = 'verified'`))).rejects.toThrow();
  });
  it("de-duplicate on dedupe_key so re-imports insert nothing", async () => {
    const r = await rows(`${leadInsert("seed-lead")} on conflict (dedupe_key) do nothing returning id`);
    expect(r).toHaveLength(0);
  });
  it("reject unsafe source links and fake coordinates outside India", async () => {
    await expect(db.query(leadInsert("bad-url").replace("'https://example.com/x'", "'javascript:alert(1)'"))).rejects.toThrow();
    await expect(db.query(leadInsert("bad-lat", ", latitude, longitude", ", 51.5, 0.1"))).rejects.toThrow();
  });
});

describe("data constraints", () => {
  it("rejects coordinates outside India", async () => {
    await expect(db.query(`update public.stations set latitude = 51.5 where id = '${PUBLISHED}'`)).rejects.toThrow();
  });
});
