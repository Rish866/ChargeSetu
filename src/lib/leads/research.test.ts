import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvRecords } from "./csv";
import { INDIA_BOUNDS } from "../constants";

const root = join(__dirname, "../../..");
const research = JSON.parse(readFileSync(join(root, "data/research/mumbai-navi-mumbai-lead-verification.json"), "utf8"));
const { records } = parseCsvRecords(readFileSync(join(root, "data/imports/chargesetu-mumbai-navi-mumbai-station-leads.csv"), "utf8"));

const DECISIONS = ["listed_by_operator", "corroborated_secondary", "needs_correction", "restricted_access", "no_evidence_found"];

describe("lead verification research file", () => {
  it("covers every CSV lead exactly once, in order, with matching names", () => {
    expect(research.entries).toHaveLength(records.length);
    research.entries.forEach((e: { sourceRow: number; stationName: string }, i: number) => {
      expect(e.sourceRow).toBe(i + 2);
      expect(e.stationName).toBe(records[i].station_name);
    });
  });

  it("never claims a station is verified or published", () => {
    for (const e of research.entries) {
      expect(e.verificationStatus).toBe("unverified");
      expect(e.publication).toBe("not_published_private_lead");
    }
    expect(research.summary.published).toBe(0);
    expect(research.summary.confirmedOperationalAndPublic).toBe(0);
  });

  it("uses only known decisions and its summary matches the entries", () => {
    for (const e of research.entries) expect(DECISIONS).toContain(e.decision);
    const count = (d: string) => research.entries.filter((e: { decision: string }) => e.decision === d).length;
    expect(research.summary.listedByOperator).toBe(count("listed_by_operator"));
    expect(research.summary.corroboratedBySecondarySource).toBe(count("corroborated_secondary"));
    expect(research.summary.needsCorrection).toBe(count("needs_correction"));
    expect(research.summary.restrictedAccess).toBe(count("restricted_access"));
    expect(research.summary.noEvidenceFound).toBe(count("no_evidence_found"));
  });

  it("backs every claim that a station exists with at least one positive evidence link", () => {
    const claimsExistence = ["listed_by_operator", "corroborated_secondary", "restricted_access"];
    for (const e of research.entries) {
      for (const ev of e.evidence) expect(ev.url).toMatch(/^https?:\/\/[^\s]+$/);
      if (claimsExistence.includes(e.decision)) {
        expect(e.evidence.some((x: { kind: string }) => x.kind !== "checked_not_found")).toBe(true);
      }
      // A contradicted lead must point at the source that contradicts it.
      if (e.decision === "needs_correction") expect(e.evidence.length).toBeGreaterThan(0);
    }
  });

  it("explains what is wrong for every contradicted lead", () => {
    for (const e of research.entries.filter((x: { decision: string }) => x.decision === "needs_correction")) {
      expect(e.corrections.length).toBeGreaterThan(0);
    }
  });

  it("only includes coordinates that are sourced, labelled and inside India", () => {
    const withCoords = research.entries.filter((e: { coordinates: unknown }) => e.coordinates);
    expect(withCoords.length).toBeGreaterThan(0);
    for (const e of withCoords) {
      const c = e.coordinates;
      expect(c.source).toBeTruthy();
      expect(["operator_published", "premises_only"]).toContain(c.precision);
      expect(c.latitude).toBeGreaterThan(INDIA_BOUNDS.minLat);
      expect(c.latitude).toBeLessThan(INDIA_BOUNDS.maxLat);
      expect(c.longitude).toBeGreaterThan(INDIA_BOUNDS.minLng);
      expect(c.longitude).toBeLessThan(INDIA_BOUNDS.maxLng);
    }
  });

  it("lists what is still missing for every lead (nothing is 'complete')", () => {
    for (const e of research.entries) expect(e.missingBeforePublication.length).toBeGreaterThan(0);
  });
});
