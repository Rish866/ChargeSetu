import { describe, expect, it } from "vitest";
import { cleanBeeStation, type MergedStation } from "./bee";

const station = (over: Partial<MergedStation> = {}): MergedStation => ({
  id: "evs_test000001",
  operator: "Tata Power",
  ownership: null,
  state: "Goa",
  state_code: "GA",
  district: "North Goa",
  city: "Panaji",
  address: "Example Road, Panaji, Goa 403001",
  latitude: 15.49,
  longitude: 73.83,
  location_quality: "ok",
  mixed_admin: false,
  chargers: [{ type_raw: "DC", standards: ["CCS2"], lev_variant: null, charger_kw: 60, connectors_per_charger: 2, guns: [{ standard: "CCS2", kw: 60 }], count: 1 }],
  total_chargers: 1,
  total_connectors: 2,
  max_power_kw: 60,
  standards: ["CCS2"],
  currents: ["DC"],
  vehicle_classes: ["car"],
  mergedFrom: [],
  ...over,
});
const clean = (s: MergedStation) => {
  const r = cleanBeeStation(s, { retrievedAt: "2026-11-07", today: new Date("2026-11-07") });
  if (!r.ok) throw new Error(r.reason);
  return r.row;
};

describe("cleanBeeStation — unreadable text", () => {
  it("keeps a readable record publishable (level B)", () => {
    const row = clean(station());
    expect(row.publication_eligibility).toBe("B");
    expect(row.flags).not.toContain("unreadable_text_in_source");
    expect(row.notes).toBe("");
  });

  it("marks a garbled address private (level C) and keeps the original text unchanged", () => {
    const garbled = "ĞƚŝŵͲWŽŵďƵƌƉĂZĚ͕ůƚŽ";
    const row = clean(station({ address: garbled }));
    expect(row.publication_eligibility).toBe("C");
    expect(row.flags).toContain("unreadable_text_in_source:address");
    expect(row.address).toBe(garbled);
    expect(Number(row.data_quality_score)).toBeLessThanOrEqual(20);
    expect(row.notes).toMatch(/^Private: address unreadable/);
    expect(row.verification_status).toBe("unverified");
  });

  it("catches a district in the wrong encoding and garbled city (which also garbles the derived name)", () => {
    expect(clean(station({ district: ":ĂůƉĂŝŐƵƌŝ\u0003" })).flags).toContain("unreadable_text_in_source:district");
    const row = clean(station({ city: "dǇĂƐƐĂƌ" }));
    expect(row.publication_eligibility).toBe("C");
    expect(row.flags).toContain("unreadable_text_in_source:station_name+city");
  });

  it("catches control characters and shifted letters", () => {
    const row = clean(station({ address: "\u0005@MF@KNQD\u0003\u0011NQSG" }));
    expect(row.publication_eligibility).toBe("C");
  });

  it("does not flag Devanagari or readable punctuation", () => {
    expect(clean(station({ address: "शिवाजी नगर, पुणे 411005" })).publication_eligibility).toBe("B");
    expect(clean(station({ address: "Opp. Bus Stand, NH-66 (Old NH-17), Margao – 403601" })).publication_eligibility).toBe("B");
  });
});
