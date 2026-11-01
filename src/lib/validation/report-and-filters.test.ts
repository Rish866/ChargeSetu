import { describe, expect, it } from "vitest";
import { parseStationFilters, stationsHref } from "./filters";
import { parseReportForm } from "./report";

function fd(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.append(k, v);
  return f;
}

describe("parseReportForm", () => {
  const valid = {
    stationId: "abc",
    issueType: "wrong_price",
    description: "The price at the charger is ₹25, not ₹21.",
    reporterEmail: "",
  };

  it("accepts a valid anonymous report", () => {
    const r = parseReportForm(fd(valid));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reporterEmail).toBeNull();
  });

  it("validates optional email only when given", () => {
    expect(parseReportForm(fd({ ...valid, reporterEmail: "driver@example.com" })).success).toBe(true);
    const bad = parseReportForm(fd({ ...valid, reporterEmail: "not-an-email" }));
    expect(bad.success).toBe(false);
  });

  it("requires station, a known issue type and a meaningful description", () => {
    const r = parseReportForm(fd({ stationId: "", issueType: "spam", description: "bad" }));
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.fieldErrors.stationId).toBeDefined();
    expect(r.fieldErrors.issueType).toBeDefined();
    expect(r.fieldErrors.description?.[0]).toMatch(/at least 10/);
  });
});

describe("parseStationFilters", () => {
  it("parses valid params", () => {
    expect(
      parseStationFilters({ q: " bandra ", city: "Mumbai", connector: "ccs2", minPower: "50", view: "map" }),
    ).toMatchObject({ q: "bandra", city: "Mumbai", connector: "ccs2", minPower: 50, view: "map" });
  });

  it("drops invalid values instead of throwing", () => {
    const f = parseStationFilters({ connector: "warp-drive", minPower: "fast", view: "grid", lat: "999", lng: "72" });
    expect(f.connector).toBeUndefined();
    expect(f.minPower).toBeUndefined();
    expect(f.view).toBeUndefined();
    expect(f.lat).toBeUndefined();
    expect(f.lng).toBeUndefined(); // location only kept as a valid pair
  });

  it("uses the first value of repeated params", () => {
    expect(parseStationFilters({ city: ["Pune", "Mumbai"] }).city).toBe("Pune");
  });
});

describe("stationsHref", () => {
  it("omits empty values", () => {
    expect(stationsHref({ city: "Mumbai", connector: undefined, minPower: 0, q: "" })).toBe("/stations?city=Mumbai");
    expect(stationsHref({})).toBe("/stations");
  });
});
