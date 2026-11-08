import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { importChunkSchema } from "./import-schema";
import { unreadableFields } from "./text-quality";
import { cleanRowToImport, isWithinIndia, parseConnectorsDetail, parseVehicleClasses } from "./import-map";

describe("parseCsv", () => {
  it("handles quotes, commas, escaped quotes and CRLF", () => {
    const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n1,2\r\n');
    expect(rows).toEqual([
      { a: "x, y", b: 'he said "hi"' },
      { a: "1", b: "2" },
    ]);
  });
});

describe("connector parsing", () => {
  it("sums identical standard+power groups and skips unknown standards", () => {
    const pts = parseConnectorsDetail("CCS2:60kWx2 | CCS2:60kWx1 | TYPE2_AC:22kWx1 | WEIRD:5kWx1", ["car"]);
    expect(pts).toHaveLength(2);
    expect(pts[0]).toMatchObject({ standard: "ccs2", current: "DC", power_kw: 60, connector_count: 3 });
    expect(pts[1]).toMatchObject({ standard: "type2", current: "AC" });
  });
  it("maps light-EV standards to two/three wheelers only", () => {
    expect(parseConnectorsDetail("LEV_AC:3.3kWx2", ["car"])[0].vehicle_classes).toEqual(["two_three_wheeler"]);
  });
  it("parses vehicle compatibility", () => {
    expect(parseVehicleClasses("Car; 2W/3W")).toEqual(["car", "two_three_wheeler"]);
    expect(parseVehicleClasses("")).toEqual([]);
  });
});

const PRIVATE_FILE = process.env.CHARGESETU_PRIVATE_DATA ?? "../private-data/india_ev_charging_clean.csv";

describe("fixture file (fictional rows)", () => {
  const rows = parseCsv(readFileSync("tests/fixtures/sample-clean.csv", "utf8"));
  const mapped = rows.map(cleanRowToImport).filter((r) => r !== null);
  it("imports only level-B readable rows: skips OSM, level C, out-of-India and garbled text", () => {
    expect(rows).toHaveLength(35);
    expect(mapped).toHaveLength(30);
    expect(mapped.every((r) => r.eligibility === "B" && r.location_quality === "ok")).toBe(true);
    const ids = new Set(mapped.map((r) => r.external_id));
    for (const skipped of ["fixture_0099", "fixture_0098", "fixture_0097", "fixture_0096", "node/1"]) expect(ids.has(skipped)).toBe(false);
  });
  it("drops a garbled row even when an old file still marks it level B", () => {
    const old = rows.find((r) => r.source_id === "fixture_0097")!;
    expect(old.publication_eligibility).toBe("B");
    expect(cleanRowToImport(old)).toBeNull();
  });
  it("passes server-side validation", () => {
    expect(importChunkSchema.safeParse(mapped).success).toBe(true);
  });
  it("leaves an unknown power as null", () => {
    expect(mapped.some((r) => r.power_kw === null)).toBe(true);
  });
  it("rejects tampered rows", () => {
    const bad = [
      { ...mapped[0], source: "operator" },
      { ...mapped[0], latitude: 50 },
      { ...mapped[0], slug: "<script>" },
      { ...mapped[0], eligibility: "C" },
      { ...mapped[0], location_quality: "suspect" },
      { ...mapped[0], address: "ĞƚŝŵͲWŽŵďƵƌƉĂZĚ͕ůƚŽ" },
      { ...mapped[0], district: ":ĂůƉĂŝŐƵƌŝ\u0003" },
      { ...mapped[0], name: "\u0005@MF@KNQD\u0003" },
    ];
    for (const b of bad) expect(importChunkSchema.safeParse([b]).success).toBe(false);
    expect(importChunkSchema.safeParse(Array(251).fill(mapped[0])).success).toBe(false);
  });
});

// The real BEE file is kept out of the public repository (licence unconfirmed).
// These checks run only where the private copy exists.
describe.skipIf(!existsSync(PRIVATE_FILE))("private BEE dataset", () => {
  const rows = existsSync(PRIVATE_FILE) ? parseCsv(readFileSync(PRIVATE_FILE, "utf8")) : [];
  const mapped = rows.map(cleanRowToImport).filter((r) => r !== null);

  it("imports only level-B BEE rows inside India with readable text (26,621)", () => {
    expect(mapped.length).toBe(26621);
    expect(mapped.every((r) => r.source === "bee" && isWithinIndia(r.latitude, r.longitude))).toBe(true);
    expect(mapped.every((r) => unreadableFields(r as unknown as Record<string, unknown>, ["name", "network", "district", "city", "address"]).length === 0)).toBe(true);
  });
  it("marks every unreadable-text record level C (299 of them, including the 259 first found)", () => {
    const bee = rows.filter((r) => r.source === "bee");
    const unreadable = bee.filter((r) => r.flags.includes("unreadable_text_in_source"));
    expect(unreadable).toHaveLength(299);
    expect(unreadable.every((r) => r.publication_eligibility === "C")).toBe(true);
    // Independent re-check: no level-B row anywhere contains unreadable text.
    expect(bee.filter((r) => r.publication_eligibility === "B" && unreadableFields(r).length > 0)).toHaveLength(0);
    expect(bee.filter((r) => r.publication_eligibility === "B")).toHaveLength(26621);
  });
  it("every row passes server-side validation", () => {
    for (let i = 0; i < mapped.length; i += 250) {
      const res = importChunkSchema.safeParse(mapped.slice(i, i + 250));
      if (!res.success) throw new Error(JSON.stringify(res.error.issues.slice(0, 3)));
    }
  });
  it("has unique external ids and slugs", () => {
    expect(new Set(mapped.map((r) => r.external_id)).size).toBe(mapped.length);
    expect(new Set(mapped.map((r) => r.slug)).size).toBe(mapped.length);
  });
  it("keeps points unique per (standard, power) so the DB unique index holds", () => {
    for (const r of mapped) {
      const keys = r.points.map((p) => `${p.standard}|${p.power_kw}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
