import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INDIAN_STATES } from "@/lib/constants";
import { dedupeOsm, normaliseOperator, osmDecision, type Geo, type OsmEl, type OsmImportRow } from "./osm-publish";
import { unreadableReason } from "./text-quality";

const geo = (over: Record<string, string> = {}): Geo => ({
  address: { road: "MG Road", suburb: "Indiranagar", city: "Bengaluru", state: "Karnataka", postcode: "560038", country_code: "in", ...over },
});
const el = (tags: Record<string, string> = {}, over: Partial<OsmEl> = {}): OsmEl => ({ type: "node", id: 1, lat: 12.97, lon: 77.64, timestamp: "2025-05-01T00:00:00Z", tags: { amenity: "charging_station", ...tags }, ...over });
const ok = (d: ReturnType<typeof osmDecision>): OsmImportRow => {
  if (!d.publishable) throw new Error(d.reason);
  return d.row;
};

describe("osmDecision", () => {
  it("keeps only what OSM says and marks unknowns as null", () => {
    const r = ok(osmDecision(el(), geo(), "2026-11-08"));
    expect(r).toMatchObject({ source: "osm", external_id: "osm_node_1", state: "Karnataka", city: "Bengaluru", network: "Unknown operator", power_kw: null, connector_count: null, opening_hours: null, connector_types: [], vehicle_classes: [], name_is_derived: true, address_is_approximate: true, source_attribution: "© OpenStreetMap contributors, ODbL 1.0", source_data_as_of: "2025-05-01" });
    expect(r.name).toBe("EV charging station – Bengaluru");
    expect(r.address).toBe("Near MG Road, Indiranagar, Bengaluru, 560038");
    expect(r.source_notes).toContain("Access: not stated in source");
    expect(r.source_url).toBe("https://www.openstreetmap.org/node/1");
  });

  it("maps sockets, power, capacity, vehicles, hours and fee exactly as tagged", () => {
    const r = ok(osmDecision(el({ name: "Tata Power EZ Charge", operator: "tata power", "socket:type2_combo": "2", "socket:type2_combo:output": "60 kW", "socket:type2": "1", "socket:type2:output": "7.4 kW", capacity: "3", motorcar: "yes", opening_hours: "24/7", fee: "yes", "addr:street": "MG Road", "addr:city": "Bengaluru" }), geo(), "2026-11-08"));
    expect(r.network).toBe("Tata Power");
    expect(r.name).toBe("Tata Power EZ Charge");
    expect(r.connector_types.sort()).toEqual(["ccs2", "type2"]);
    expect(r.power_kw).toBe(60);
    expect(r.connector_count).toBe(3);
    expect(r.vehicle_classes).toEqual(["car"]);
    expect(r.opening_hours).toBe("24/7");
    expect(r.address_is_approximate).toBe(false);
    expect(r.source_notes).toContain("Fee: paid (amount not stated)");
    expect(r.points.find((p) => p.standard === "ccs2")).toMatchObject({ current: "DC", power_kw: 60, connector_count: 2 });
  });

  it("reports unknown socket types instead of guessing", () => {
    const r = ok(osmDecision(el({ "socket:type1": "1" }), geo(), "x"));
    expect(r.connector_types).toEqual([]);
    expect(r.source_notes).toContain("Other sockets tagged: type1");
  });

  it("keeps private, closed, swap-only and out-of-India records out", () => {
    const reason = (d: ReturnType<typeof osmDecision>) => (d.publishable ? "PUBLISHED" : d.reason);
    expect(reason(osmDecision(el({ access: "private" }), geo(), "x"))).toBe("access_private");
    expect(reason(osmDecision(el({ access: "no" }), geo(), "x"))).toBe("access_no");
    expect(reason(osmDecision(el({ disused: "yes" }), geo(), "x"))).toBe("not_operational_in_source");
    expect(reason(osmDecision(el({ brand: "Honda e:swap" }), geo(), "x"))).toBe("battery_swap_not_a_charger");
    expect(reason(osmDecision(el({ operator: "Battery Smart" }), geo(), "x"))).toBe("battery_swap_not_a_charger");
    expect(reason(osmDecision(el({}, { lat: 40, lon: 10 }), geo(), "x"))).toBe("outside_india");
    expect(reason(osmDecision(el(), geo({ state: "Province of Nowhere" }), "x"))).toMatch(/^state_unknown/);
    expect(reason(osmDecision(el({}, { lat: undefined, lon: undefined }), geo(), "x"))).toBe("missing_coordinates");
  });

  it("publishes customer-only access but says so", () => {
    const r = ok(osmDecision(el({ access: "customers" }), geo(), "x"));
    expect(r.source_notes).toContain("Access: customers (as tagged in OpenStreetMap)");
  });

  it("accepts transliterated place names with macrons", () => {
    expect(osmDecision(el(), geo({ city: undefined as unknown as string, town: "Devadānappatti" }), "x").publishable).toBe(true);
  });
});

describe("normaliseOperator / dedupeOsm", () => {
  it("normalises common spellings", () => {
    expect(["Tata power", "TATA POWER", "Tata"].map(normaliseOperator)).toEqual(["Tata Power", "Tata Power", "Tata Power"]);
    expect(["Ather", "Ather Energy", "ather grid"].map(normaliseOperator)).toEqual(["Ather Grid", "Ather Grid", "Ather Grid"]);
    expect(normaliseOperator("Kerala State Electricity Board")).toBe("KSEB");
    expect(normaliseOperator("Some New Network")).toBe("Some New Network");
  });
  it("merges the same site mapped twice and keeps the richer record", () => {
    const a = ok(osmDecision(el({ name: "Hub", operator: "Statiq", "socket:type2": "1" }, { id: 1 }), geo(), "x"));
    const b = ok(osmDecision(el({}, { id: 2, lat: 12.97005 }), geo(), "x")); // ~6 m away, no operator
    const c = ok(osmDecision(el({ operator: "Zeon" }, { id: 3, lat: 12.97008 }), geo(), "x")); // different operator → separate
    const { kept, merged } = dedupeOsm([b, a, c]);
    expect(kept.map((k) => k.external_id).sort()).toEqual(["osm_node_1", "osm_node_3"]);
    expect(merged).toEqual([{ id: "osm_node_2", into: "osm_node_1" }]);
    expect(kept.find((k) => k.external_id === "osm_node_1")!.merged_source_ids).toEqual(["osm_node_2"]);
  });
});

describe("committed OpenStreetMap dataset (data/osm)", () => {
  const file = JSON.parse(readFileSync("data/osm/india-osm-charging-stations.json", "utf8")) as { licence: string; count: number; rows: OsmImportRow[] };
  const rows = file.rows;
  it("is ODbL-licensed with attribution on every row", () => {
    expect(file.licence).toMatch(/ODbL/);
    expect(file.count).toBe(rows.length);
    expect(rows.every((r) => r.source === "osm" && r.source_attribution.includes("OpenStreetMap"))).toBe(true);
  });
  it("has unique ids and slugs, valid states and in-India coordinates", () => {
    expect(new Set(rows.map((r) => r.external_id)).size).toBe(rows.length);
    expect(new Set(rows.map((r) => r.slug)).size).toBe(rows.length);
    expect(rows.every((r) => (INDIAN_STATES as readonly string[]).includes(r.state))).toBe(true);
    expect(rows.every((r) => r.latitude >= 6 && r.latitude <= 37.6 && r.longitude >= 68 && r.longitude <= 97.5)).toBe(true);
  });
  it("contains no unreadable text and no swap-only or private stations", () => {
    expect(rows.filter((r) => [r.name, r.network, r.city, r.address].some((v) => unreadableReason(v)))).toEqual([]);
    expect(rows.filter((r) => /e:?swap|battery smart|sun mobility/i.test(`${r.name} ${r.network}`))).toEqual([]);
    expect(rows.filter((r) => /Access: (private|no) /.test(r.source_notes ?? ""))).toEqual([]);
  });
  it("never claims verification or invents values", () => {
    expect(rows.every((r) => r.location_quality === "ok" && r.eligibility === "B")).toBe(true);
    expect(rows.filter((r) => r.power_kw !== null).every((r) => r.power_kw! > 0)).toBe(true);
    expect(rows.every((r) => r.points.every((p) => r.connector_types.includes(p.standard)))).toBe(true);
  });
});
