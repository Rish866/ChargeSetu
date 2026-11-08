import { slugify } from "@/lib/format";
import { BEE_STANDARD_TO_APP } from "./bee";
import { connectorCurrent } from "@/lib/constants";
import { unreadableFields } from "./text-quality";

export interface ImportPoint {
  standard: string;
  current: "AC" | "DC";
  power_kw: number | null;
  connector_count: number;
  vehicle_classes: string[];
}

/** Shape accepted by the database function `import_stations_batch`. */
export interface ImportRow {
  source: string;
  external_id: string;
  name: string;
  slug: string;
  network: string;
  address: string;
  city: string;
  district: string | null;
  state: string;
  latitude: number;
  longitude: number;
  connector_types: string[];
  connector_count: number | null;
  power_kw: number | null;
  vehicle_classes: string[];
  source_url: string | null;
  source_attribution: string;
  source_data_as_of: string | null;
  last_evidence_check: string | null;
  location_quality: "ok" | "suspect";
  name_is_derived: boolean;
  data_quality_score: number | null;
  merged_source_ids: string[];
  eligibility: "B" | "C";
  points: ImportPoint[];
}

export function isWithinIndia(lat: number, lng: number): boolean {
  return lat >= 6 && lat <= 37.6 && lng >= 68 && lng <= 97.5;
}

export function parseVehicleClasses(text: string): string[] {
  const out: string[] = [];
  if (/\bcar\b/i.test(text)) out.push("car");
  if (/2W|3W/i.test(text)) out.push("two_three_wheeler");
  return out;
}

const numOrNull = (v: string) => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Parses "CCS2:60kWx2 | TYPE2_AC:22kWx1" into charging points. Identical
 * (standard, power) groups are summed because the database keeps one row each.
 * Unknown standards are skipped rather than guessed.
 */
export function parseConnectorsDetail(detail: string, vehicleClasses: string[]): ImportPoint[] {
  const merged = new Map<string, ImportPoint>();
  for (const part of detail.split("|")) {
    const m = part.trim().match(/^([A-Z0-9_]+):([\d.]*)kWx(\d+)$/);
    if (!m) continue;
    const standard = BEE_STANDARD_TO_APP[m[1]];
    const current = standard ? connectorCurrent(standard) : undefined;
    if (!standard || !current) continue;
    const power = m[2] === "" ? null : Number(m[2]);
    const count = Math.max(1, Number(m[3]));
    const key = `${standard}|${power ?? "x"}`;
    const prev = merged.get(key);
    if (prev) prev.connector_count += count;
    else
      merged.set(key, {
        standard,
        current,
        power_kw: power,
        connector_count: count,
        vehicle_classes: standard.startsWith("lev_") ? ["two_three_wheeler"] : vehicleClasses,
      });
  }
  return [...merged.values()];
}

/** Converts one row of the clean CSV into a database import row. Returns null for rows that must not be imported. */
export function cleanRowToImport(r: Record<string, string>): ImportRow | null {
  if (r.source !== "bee" || !r.source_id) return null;
  // Only level-B rows are importable. Level C (suspect location, unreadable text, …) stays private in the file.
  if (r.publication_eligibility !== "B") return null;
  // Belt and braces for files produced before the unreadable-text check existed.
  if (unreadableFields(r).length > 0) return null;
  const lat = numOrNull(r.latitude);
  const lng = numOrNull(r.longitude);
  if (lat === null || lng === null) return null;
  // The stations table only accepts coordinates inside India's bounding box. Rows whose
  // source coordinates fall outside it (e.g. latitude typed into the longitude field) are
  // NOT imported and NOT "corrected" by guessing: they stay in the CSV for manual follow-up.
  if (!isWithinIndia(lat, lng)) return null;
  const vehicle = parseVehicleClasses(r.vehicle_compatibility);
  const points = parseConnectorsDetail(r.connectors_detail, vehicle);
  const types = [...new Set(points.map((p) => p.standard))];
  const suspect = r.flags.includes("suspect_coordinates_in_source");
  const name = r.station_name.trim() || `${r.operator} – ${r.city}`;
  return {
    source: "bee",
    external_id: r.source_id,
    name,
    slug: `${slugify(name) || "station"}-${r.source_id.replace(/[^a-z0-9]/gi, "").toLowerCase()}`.slice(0, 160),
    network: r.operator || "Unknown operator",
    address: r.address,
    city: r.city,
    district: r.district || null,
    state: r.state,
    latitude: lat,
    longitude: lng,
    connector_types: types,
    connector_count: numOrNull(r.connector_count),
    power_kw: numOrNull(r.rated_power_kw),
    vehicle_classes: vehicle,
    source_url: r.source_url || null,
    source_attribution:
      "Bureau of Energy Efficiency (BEE), India — public EV charging station list dated 26 Oct 2025",
    source_data_as_of: r.source_publication_date || null,
    last_evidence_check: r.last_evidence_check || null,
    location_quality: suspect ? "suspect" : "ok",
    name_is_derived: r.name_is_derived === "yes",
    data_quality_score: numOrNull(r.data_quality_score),
    merged_source_ids: r.merged_source_ids ? r.merged_source_ids.split(";").map((s) => s.trim()).filter(Boolean) : [],
    eligibility: suspect ? "C" : "B",
    points,
  };
}
