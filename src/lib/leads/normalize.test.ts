import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRecords } from "./csv";
import {
  extractPincode,
  leadDedupeKey,
  mapConnectors,
  normalizeLeadRecord,
  parsePowerList,
  planLeadImport,
} from "./normalize";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas and newlines inside fields", () => {
    const rows = parseCsv('a,b,c\r\n"x, y","say ""hi""","line1\nline2"\n\n1,,3');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "line1\nline2"],
      ["1", "", "3"],
    ]);
  });
  it("rejects unterminated quotes and rows with extra columns", () => {
    expect(() => parseCsv('a\n"open')).toThrow();
    expect(() => parseCsvRecords("a,b\n1,2,3")).toThrow();
  });
});

describe("field normalisation", () => {
  it("maps connector names to known ids and keeps unknown text", () => {
    expect(mapConnectors("CCS2; GB/T; Type 2")).toEqual({ ids: ["ccs2", "gbt", "type2"], unknown: [] });
    expect(mapConnectors("CCS2; CHAdeMO")).toEqual({ ids: ["ccs2", "chademo"], unknown: [] });
    expect(mapConnectors("Tesla NACS")).toEqual({ ids: [], unknown: ["Tesla NACS"] });
    expect(mapConnectors(null)).toEqual({ ids: [], unknown: [] });
  });
  it("parses multi-value power and uses the highest", () => {
    expect(parsePowerList("60; 22; 7")).toEqual({ max: 60, values: [60, 22, 7], invalid: [] });
    expect(parsePowerList("3.3")).toMatchObject({ max: 3.3 });
    expect(parsePowerList("fast")).toEqual({ max: null, values: [], invalid: ["fast"] });
    expect(parsePowerList(null).max).toBeNull();
  });
  it("extracts the PIN code, ignoring other numbers", () => {
    expect(extractPincode("Plot 39/1, Sector 30A, Vashi, Navi Mumbai 400701")).toBe("400701");
    expect(extractPincode("33/11 kV substation, Sector 15")).toBeNull();
  });
  it("builds the same dedupe key regardless of punctuation and case", () => {
    expect(leadDedupeKey("ChargeZone – Ibis", "D-266, TTC")).toBe(leadDedupeKey("chargezone - IBIS", "d 266 ttc"));
  });
});

const base = {
  station_name: "Example – Site",
  operator: "Example Net",
  address: "Plot 1, Sector 2, Vashi, Navi Mumbai 400703",
  city: "Navi Mumbai",
  state: "Maharashtra",
  connector_types: "",
  power_kw: "",
  tariff_inr_per_kwh: "",
  access_status: "",
  source_url: "https://example.com/list",
  verification_status: "pending_review",
  notes: "",
};

describe("normalizeLeadRecord", () => {
  it("never invents values: blanks stay null and are listed as missing", () => {
    const r = normalizeLeadRecord(base, 2, "b");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.powerKwMax).toBeNull();
    expect(r.row.tariffInrPerKwh).toBeNull();
    expect(r.row.connectorTypes).toEqual([]);
    expect(r.row.missingFields).toEqual(["coordinates", "connector_types", "power_kw", "tariff", "opening_hours", "area", "connector_count"]);
  });
  it("forces pending review even if the CSV claims verified, and flags it", () => {
    const r = normalizeLeadRecord({ ...base, verification_status: "verified" }, 2, "b");
    expect(r.ok && r.row.qualityFlags.some((f) => /imported as pending review/.test(f))).toBe(true);
  });
  it("rejects rows without required fields or with bad URLs/states", () => {
    const r = normalizeLeadRecord({ ...base, address: "", state: "Ontario", source_url: "javascript:alert(1)" }, 7, "b");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(3);
  });
  it("flags Ather Grid 'Type 2' listings for checking", () => {
    const r = normalizeLeadRecord({ ...base, operator: "Ather Grid", connector_types: "Type 2" }, 2, "b");
    expect(r.ok && r.row.qualityFlags.some((f) => /Ather/.test(f))).toBe(true);
  });
});

describe("planLeadImport", () => {
  it("skips duplicates within the file and of existing stations, and groups same-site listings", () => {
    const plan = planLeadImport(
      [
        base,
        { ...base, station_name: "EXAMPLE - site" }, // same name+address, different formatting
        { ...base, station_name: "Other Net – Site" }, // same site, other operator
        { ...base, station_name: "Known Station", address: "1 Known Road, Mumbai 400001" },
        { ...base, station_name: "" },
      ],
      "b",
      [{ id: "s1", name: "Known Station", address: "Somewhere else" }],
    );
    expect(plan.valid.map((v) => v.sourceRow)).toEqual([2, 4]);
    expect(plan.duplicatesInFile).toEqual([{ sourceRow: 3, stationName: "EXAMPLE - site", firstRow: 2 }]);
    expect(plan.duplicatesOfStations).toEqual([{ sourceRow: 5, stationName: "Known Station", stationId: "s1" }]);
    expect(plan.rejected.map((r) => r.sourceRow)).toEqual([6]);
    expect(plan.sameSiteGroups).toHaveLength(1);
  });

  it("parses the real Mumbai / Navi Mumbai lead file", () => {
    const text = readFileSync(join(__dirname, "../../../data/imports/chargesetu-mumbai-navi-mumbai-station-leads.csv"), "utf8");
    const { records } = parseCsvRecords(text);
    const plan = planLeadImport(records, "mumbai");
    expect(records).toHaveLength(44);
    expect(plan.rejected).toEqual([]);
    expect(plan.duplicatesInFile).toEqual([]);
    expect(plan.valid).toHaveLength(44);
    // No row has coordinates, so none can be published without manual work.
    expect(plan.valid.every((r) => r.missingFields.includes("coordinates"))).toBe(true);
    const nsci = plan.valid.find((r) => r.stationName.includes("NSCI"))!;
    expect(nsci.connectorTypes).toEqual(["ccs2", "gbt", "type2"]);
    expect(nsci.powerKwMax).toBe(80);
    expect(nsci.pincode).toBe("400010");
  });
});
