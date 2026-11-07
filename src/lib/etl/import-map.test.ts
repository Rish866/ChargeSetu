import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
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

describe("bundled dataset", () => {
  const rows = parseCsv(readFileSync("data/india_ev_charging_clean.csv", "utf8"));
  const mapped = rows.map(cleanRowToImport).filter((r) => r !== null);

  it("imports only BEE rows and never OSM leads", () => {
    expect(rows.some((r) => r.source === "osm")).toBe(true);
    expect(mapped.every((r) => r.source === "bee")).toBe(true);
  });
  it("has unique external ids and slugs", () => {
    expect(new Set(mapped.map((r) => r.external_id)).size).toBe(mapped.length);
    expect(new Set(mapped.map((r) => r.slug)).size).toBe(mapped.length);
  });
  it("skips rows whose coordinates fall outside India instead of guessing a fix", () => {
    const bee = rows.filter((r) => r.source === "bee");
    const outside = bee.filter((r) => !isWithinIndia(Number(r.latitude), Number(r.longitude)));
    expect(outside.length).toBeGreaterThan(0);
    expect(mapped.length).toBe(bee.length - outside.length);
    expect(mapped.every((r) => isWithinIndia(r.latitude, r.longitude))).toBe(true);
  });
  it("never marks suspect coordinates as publishable", () => {
    expect(mapped.filter((r) => r.location_quality === "suspect").every((r) => r.eligibility === "C")).toBe(true);
  });
  it("keeps points unique per (standard, power) so the DB unique index holds", () => {
    for (const r of mapped) {
      const keys = r.points.map((p) => `${p.standard}|${p.power_kw}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
  it("leaves unknown values null instead of inventing them", () => {
    expect(mapped.every((r) => r.power_kw === null || r.power_kw > 0)).toBe(true);
  });
});
