/**
 * Checks the production operations scripts (supabase/ops) against a real
 * Postgres engine: backup copies every table exactly, the migration can be
 * applied twice, and the verification queries all pass.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../supabase");
const NATIONWIDE = "20261108000000_nationwide_expansion.sql";
const sql = (f: string) => readFileSync(join(ROOT, f), "utf8");
let db: PGlite;

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
  // Production today: every migration EXCEPT the nationwide one, plus demo data.
  for (const f of readdirSync(join(ROOT, "migrations")).sort()) if (f !== NATIONWIDE) await db.exec(sql(`migrations/${f}`));
  await db.exec(sql("seed.sql"));
}, 120_000);

describe("production operations", () => {
  it("backup copies every public table with identical row counts", async () => {
    await db.exec(sql("ops/01_backup.sql"));
    const schemas = (await db.query<{ nspname: string }>(`select nspname from pg_namespace where nspname like 'backup\\_%'`)).rows;
    expect(schemas).toHaveLength(1);
    const s = schemas[0].nspname;
    const m = (await db.query<{ table_name: string; source_rows: number; backup_rows: number }>(`select * from ${s}._manifest`)).rows;
    expect(m.map((r) => r.table_name)).toEqual(expect.arrayContaining(["stations", "station_leads", "reports", "profiles"]));
    expect(m.every((r) => Number(r.source_rows) === Number(r.backup_rows))).toBe(true);
    expect(Number(m.find((r) => r.table_name === "stations")!.backup_rows)).toBe(17);
    const priv = await db.query<{ ok: boolean }>(`select has_schema_privilege('anon', '${s}', 'usage') as ok`);
    expect(priv.rows[0].ok).toBe(false);
  });

  it("the nationwide migration applies on the pre-migration database and again (idempotent)", async () => {
    await db.exec(sql(`migrations/${NATIONWIDE}`));
    await db.exec(sql(`migrations/${NATIONWIDE}`));
    expect(Number((await db.query<{ n: number }>(`select count(*)::int n from public.stations`)).rows[0].n)).toBe(17);
  });

  it("every post-migration verification check passes", async () => {
    const rows = (await db.query<{ check: string; ok: boolean }>(sql("ops/02_verify.sql"))).rows;
    expect(rows.length).toBeGreaterThanOrEqual(20);
    const failed = rows.filter((r) => !r.ok).map((r) => r.check);
    expect(failed).toEqual([]);
  });
});
