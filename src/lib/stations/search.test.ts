import { describe, expect, it } from "vitest";
import { demoStations } from "@/lib/data/demo-seed";
import { filterOptions, filterStations, haversineKm, matchesQuery } from "./search";

const published = demoStations.filter((s) => s.status === "published");

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm({ lat: 19, lng: 72.8 }, { lat: 19, lng: 72.8 })).toBe(0);
  });

  it("approximates Mumbai → Pune (~120 km straight line)", () => {
    const d = haversineKm({ lat: 19.076, lng: 72.8777 }, { lat: 18.5204, lng: 73.8567 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(130);
  });
});

describe("filterStations", () => {
  it("never returns unpublished stations", () => {
    const all = filterStations(demoStations, {});
    expect(all.length).toBe(published.length);
    expect(all.every((s) => s.status === "published")).toBe(true);
  });

  it("filters by city case-insensitively", () => {
    const r = filterStations(demoStations, { city: "mumbai" });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((s) => s.city === "Mumbai")).toBe(true);
  });

  it("filters by connector, power and network together", () => {
    const r = filterStations(demoStations, { connector: "chademo", minPower: 100, network: "GreenPlug (Demo)" });
    expect(r.length).toBeGreaterThan(0);
    for (const s of r) {
      expect(s.connectorTypes).toContain("chademo");
      expect(s.powerKw).toBeGreaterThanOrEqual(100);
      expect(s.network).toBe("GreenPlug (Demo)");
    }
  });

  it("matches multi-word free-text queries across fields", () => {
    const r = filterStations(demoStations, { q: "whitefield bengaluru" });
    expect(r.map((s) => s.area)).toEqual(["Whitefield"]);
    expect(filterStations(demoStations, { q: "nowhere-at-all" })).toEqual([]);
  });

  it("sorts by distance and annotates distanceKm when a location is given", () => {
    const r = filterStations(demoStations, { lat: 12.97, lng: 77.75 }); // Whitefield
    expect(r[0].area).toBe("Whitefield");
    for (let i = 1; i < r.length; i++) {
      expect(r[i].distanceKm!).toBeGreaterThanOrEqual(r[i - 1].distanceKm!);
    }
  });

  it("does not mutate the input list", () => {
    const copy = structuredClone(demoStations);
    filterStations(demoStations, { lat: 19, lng: 72.8 });
    expect(demoStations).toEqual(copy);
  });
});

describe("matchesQuery", () => {
  it("ignores case and extra whitespace", () => {
    expect(matchesQuery(published[0], "  BANDRA   west ")).toBe(true);
  });
});

describe("filterOptions", () => {
  it("lists unique sorted cities from published stations only", () => {
    const { cities } = filterOptions(demoStations);
    expect(cities).toEqual([...new Set(cities)].sort());
    expect(cities).not.toContain("Thane"); // only the rejected listing is in Thane
  });
});
