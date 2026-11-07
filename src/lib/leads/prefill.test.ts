import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONNECTOR_TYPES } from "../constants";
import type { StationLead } from "../types";
import { parseCsvRecords } from "./csv";
import { normalizeLeadRecord } from "./normalize";
import { buildStationPrefill, findResearch, type ResearchEntry } from "./research";
import data from "../../../data/research/mumbai-navi-mumbai-lead-verification.json";

const entries = data.entries as unknown as ResearchEntry[];
const { records } = parseCsvRecords(readFileSync(join(__dirname, "../../../data/imports/chargesetu-mumbai-navi-mumbai-station-leads.csv"), "utf8"));

/** Builds the lead exactly as the importer would have stored it. */
function leadForRow(sourceRow: number): StationLead {
  const r = normalizeLeadRecord(records[sourceRow - 2], sourceRow, "test");
  if (!r.ok) throw new Error("row should be valid");
  const x = r.row;
  return {
    id: `lead-${sourceRow}`, importBatch: "test", sourceRow, stationName: x.stationName, operatorName: x.operatorName, address: x.address,
    city: x.city, state: x.state, pincode: x.pincode, latitude: null, longitude: null, connectorTypes: x.connectorTypes as StationLead["connectorTypes"],
    connectorTypesRaw: x.connectorTypesRaw, powerKwMax: x.powerKwMax, powerKwRaw: x.powerKwRaw, tariffInrPerKwh: x.tariffInrPerKwh,
    accessNotes: x.accessNotes, sourceUrl: x.sourceUrl, notes: x.notes, missingFields: x.missingFields, qualityFlags: x.qualityFlags,
    status: "pending_review", stationId: null, reviewNote: null, createdAt: "", updatedAt: "",
  };
}

describe("findResearch", () => {
  it("matches a lead by CSV row and station name", () => {
    expect(findResearch(entries, leadForRow(5))?.decision).toBe("listed_by_operator");
  });
  it("returns nothing when the name differs or the row is unknown", () => {
    expect(findResearch(entries, { sourceRow: 5, stationName: "Something else" })).toBeNull();
    expect(findResearch(entries, { sourceRow: null, stationName: "ChargeZone – Shiravane / Fortune Cars" })).toBeNull();
    expect(findResearch(entries, { sourceRow: 99, stationName: "x" })).toBeNull();
  });
});

describe("buildStationPrefill", () => {
  it("corrects Ather Grid sites to the LECCS connector instead of Type 2", () => {
    for (const row of [12, 13, 43]) {
      const lead = leadForRow(row);
      const p = buildStationPrefill(lead, findResearch(entries, lead));
      expect(p.connectorTypes).toEqual(["type7_lecct"]);
    }
    expect(leadForRow(13).connectorTypes).toEqual(["type2"]); // what the CSV said
  });

  it("uses the operator's own published coordinates for ChargeZone Nerul", () => {
    const lead = leadForRow(5);
    const p = buildStationPrefill(lead, findResearch(entries, lead));
    expect(p.latitude).toBeCloseTo(19.0485332, 6);
    expect(p.longitude).toBeCloseTo(73.03206902, 6);
  });

  it("never pre-fills premises-only (guessed) coordinates", () => {
    const lead = leadForRow(2); // Four Points: only a hotel-level map pin exists
    const research = findResearch(entries, lead);
    expect(research?.coordinates?.precision).toBe("premises_only");
    const p = buildStationPrefill(lead, research);
    expect(p.latitude).toBeUndefined();
    expect(p.longitude).toBeUndefined();
  });

  it("fixes the city for Panvel addresses", () => {
    for (const row of [12, 21, 22, 26]) {
      const lead = leadForRow(row);
      expect(lead.city).toBe("Navi Mumbai");
      expect(buildStationPrefill(lead, findResearch(entries, lead)).city).toBe("Panvel");
    }
  });

  it("invents nothing: unknown fields stay empty", () => {
    const lead = leadForRow(13);
    const p = buildStationPrefill(lead, findResearch(entries, lead));
    expect(p.latitude).toBeUndefined();
    expect(p.price).toBeUndefined();
    expect(p.connectorCount).toBeUndefined();
    expect(p.openingHours).toBeUndefined();
  });

  it("leaves power blank when research says it is unconfirmed, but keeps it when corroborated", () => {
    const ather = leadForRow(13);
    expect(ather.powerKwMax).toBe(3.3); // directory figure on the lead
    expect(buildStationPrefill(ather, findResearch(entries, ather)).powerKw).toBeUndefined();
    const fourPoints = leadForRow(2);
    expect(buildStationPrefill(fourPoints, findResearch(entries, fourPoints)).powerKw).toBe(60);
  });

  it("leaves leads without research unchanged", () => {
    const lead = leadForRow(7);
    const p = buildStationPrefill(lead, null);
    expect(p.powerKw).toBe(lead.powerKwMax);
    expect(p.connectorTypes).toEqual(lead.connectorTypes);
    expect(p.city).toBe(lead.city);
  });

  it("only offers connector ids the app knows", () => {
    const known = new Set<string>(CONNECTOR_TYPES.map((c) => c.id));
    for (const e of entries) for (const c of e.prefill?.connectorTypes ?? []) expect(known.has(c)).toBe(true);
  });
});
