/**
 * OpenStreetMap charging stations → publishable import rows.
 *
 * OSM data © OpenStreetMap contributors, ODbL 1.0. Nominatim reverse geocoding
 * (also OSM / ODbL) fills in state, city and an approximate address when the
 * element itself has no address tags. Nothing is invented: unknown values stay
 * null, and approximate addresses are flagged as such.
 *
 * No path aliases: shared by the ETL script (plain Node) and tests.
 */
import { INDIAN_STATES } from "../constants.ts";
import { slugify } from "../format.ts";
import { distanceMetres, inIndia } from "./bee.ts";
import { unreadableReason } from "./text-quality.ts";

export interface OsmEl {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  timestamp?: string;
  tags?: Record<string, string>;
}
export interface Geo {
  address: Record<string, string>;
  display_name?: string;
}

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors, ODbL 1.0";
export const OSM_LICENCE = "ODbL 1.0 (Open Database License)";

const tidy = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();
const STATE_SET = new Set<string>(INDIAN_STATES);

/** OSM socket keys → app connector ids. Unknown keys are reported, never guessed. */
const SOCKETS: Record<string, { id: string; current: "AC" | "DC"; vehicle?: "two_three_wheeler" }> = {
  type2: { id: "type2", current: "AC" },
  type2_cable: { id: "type2", current: "AC" },
  type2_combo: { id: "ccs2", current: "DC" },
  ccs: { id: "ccs2", current: "DC" },
  chademo: { id: "chademo", current: "DC" },
  gb_dc: { id: "gbt", current: "DC" },
  gb_t: { id: "gbt", current: "DC" },
  type7: { id: "type7_lecct", current: "DC", vehicle: "two_three_wheeler" },
};

/** Battery-swap points are tagged amenity=charging_station by some mappers but are not chargers. */
const SWAP_RE = /\b(e:?swap|swap(ping)?|battery smart|sun mobility|yuma|bounce infinity|esmito|voltup|racenergy|battery swap)\b/i;

/** Normalises common spellings of the same operator. Unrecognised names are kept as written. */
const OPERATOR_ALIASES: Array<[RegExp, string]> = [
  [/^tata(\s*power)?(\s*ez\s*charge)?$/i, "Tata Power"],
  [/^ather(\s*(energy|grid))?$/i, "Ather Grid"],
  [/^(kseb|kerala state electricity board.*)$/i, "KSEB"],
  [/^(eesl|energy efficiency services limited.*)$/i, "EESL"],
  [/^zeon(\s*(network|charging))?$/i, "Zeon Charging"],
  [/^statiq$/i, "Statiq"],
  [/^bolt(\.|\s)?earth$/i, "Bolt.Earth"],
  [/^charge\s*zone$/i, "ChargeZone"],
  [/^jio[-\s]?bp(\s*pulse)?$/i, "Jio-bp pulse"],
  [/^electriva$/i, "ElectriVa"],
  [/^bescom$/i, "BESCOM"],
  [/^charge\s*karo$/i, "Charge Karo"],
];
export function normaliseOperator(raw: string): string {
  const s = tidy(raw);
  for (const [re, name] of OPERATOR_ALIASES) if (re.test(s)) return name;
  return s;
}

const yes = (v?: string) => v !== undefined && /^(yes|designated|\d+)$/i.test(v.trim());

function kw(v?: string): number | null {
  if (!v) return null;
  const m = /([\d.]+)\s*(k?w)/i.exec(v);
  if (!m) return null;
  const n = Number(m[1]) / (m[2].toLowerCase() === "w" ? 1000 : 1);
  return Number.isFinite(n) && n >= 0.5 && n <= 1000 ? Math.round(n * 10) / 10 : null;
}

export type OsmDecision =
  | { publishable: true; row: OsmImportRow }
  | { publishable: false; id: string; reason: string };

export interface OsmImportRow {
  source: "osm";
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
  opening_hours: string | null;
  source_notes: string | null;
  source_url: string;
  source_attribution: string;
  source_data_as_of: string | null;
  last_evidence_check: string;
  location_quality: "ok";
  name_is_derived: boolean;
  data_quality_score: number;
  merged_source_ids: string[];
  eligibility: "B";
  points: Array<{ standard: string; current: "AC" | "DC"; power_kw: number | null; connector_count: number; vehicle_classes: string[] }>;
  /** Not stored as columns; kept in the published CSV for transparency. */
  address_is_approximate: boolean;
}

export function osmDecision(el: OsmEl, geo: Geo | undefined, retrievedAt: string): OsmDecision {
  const id = `${el.type}/${el.id}`;
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return { publishable: false, id, reason: "missing_coordinates" };
  if (!inIndia(lat, lon) || (geo && geo.address.country_code && geo.address.country_code !== "in")) return { publishable: false, id, reason: "outside_india" };
  const state = tidy(geo?.address.state);
  if (!STATE_SET.has(state)) return { publishable: false, id, reason: `state_unknown:${state || "none"}` };
  if (["private", "no"].includes(tidy(t.access).toLowerCase())) return { publishable: false, id, reason: `access_${tidy(t.access).toLowerCase()}` };
  if (t.disused === "yes" || /closed|abandoned|disused/i.test(t.operational_status ?? "") || /^closed$/i.test(t.opening_hours ?? "")) return { publishable: false, id, reason: "not_operational_in_source" };
  const operatorRaw = tidy(t.operator || t.brand || t.network);
  if (SWAP_RE.test(`${t.name ?? ""} ${operatorRaw}`) || yes(t["battery_swapping"])) return { publishable: false, id, reason: "battery_swap_not_a_charger" };

  const a = geo?.address ?? {};
  const city = tidy(t["addr:city"]) || tidy(a.city || a.town || a.village || a.municipality || a.county || a.state_district) || state;
  const district = tidy(a.state_district || a.county) || null;
  const tagged = [t["addr:housenumber"], t["addr:street"], t["addr:suburb"] || t["addr:place"], t["addr:city"], t["addr:postcode"]].map(tidy).filter(Boolean);
  const approx = tagged.length < 2;
  const address = approx
    ? [a.road ? `Near ${a.road}` : "", a.neighbourhood || a.suburb || a.quarter || "", city, a.postcode || ""].map(tidy).filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(", ")
    : tagged.join(", ");
  if (address.length < 2) return { publishable: false, id, reason: "no_address_or_locality" };

  const operator = operatorRaw ? normaliseOperator(operatorRaw) : "";
  const name = tidy(t.name) || (operator ? `${operator} – ${city}` : `EV charging station – ${city}`);
  for (const [field, value] of Object.entries({ name, operator, city, address })) {
    if (unreadableReason(value)) return { publishable: false, id, reason: `unreadable_text:${field}` };
  }

  // Connectors and power, only as tagged.
  const vehicle = new Set<string>();
  if (yes(t.motorcar)) vehicle.add("car");
  if (yes(t.scooter) || yes(t.motorcycle) || yes(t.bicycle)) vehicle.add("two_three_wheeler");
  const points = new Map<string, OsmImportRow["points"][number]>();
  const unmapped: string[] = [];
  for (const [k, v] of Object.entries(t)) {
    const m = /^socket:([a-z0-9_]+)$/.exec(k);
    if (!m || v === "no") continue;
    const s = SOCKETS[m[1]];
    if (!s) {
      unmapped.push(m[1]);
      continue;
    }
    const count = /^\d+$/.test(v) ? Math.max(1, Math.min(5000, Number(v))) : 1;
    const power = kw(t[`${k}:output`]);
    const key = `${s.id}|${power ?? "x"}`;
    const prev = points.get(key);
    if (prev) prev.connector_count += count;
    else points.set(key, { standard: s.id, current: s.current, power_kw: power, connector_count: count, vehicle_classes: s.vehicle ? [s.vehicle] : [...vehicle] });
    if (s.vehicle) vehicle.add(s.vehicle);
  }
  const pts = [...points.values()];
  const powers = pts.map((p) => p.power_kw).filter((x): x is number => x !== null);
  const maxPower = powers.length ? Math.max(...powers) : kw(t.maxpower) ?? kw(t["charging:output"]);
  const cap = /^\d+$/.test(t.capacity ?? "") ? Number(t.capacity) : null;
  const connectorCount = cap && cap >= 1 && cap <= 1000 ? cap : pts.length ? Math.min(1000, pts.reduce((s, p) => s + p.connector_count, 0)) : null;

  const notes: string[] = [];
  const access = tidy(t.access).toLowerCase();
  if (access === "yes" || access === "permissive") notes.push("Access: public (as tagged in OpenStreetMap)");
  else if (access) notes.push(`Access: ${access} (as tagged in OpenStreetMap)`);
  else notes.push("Access: not stated in source");
  if (t.fee === "no") notes.push("Fee: free to use (as tagged)");
  else if (t.fee === "yes") notes.push("Fee: paid (amount not stated)");
  if (tidy(t.charge)) notes.push(`Charge as tagged: ${tidy(t.charge).slice(0, 80)}`);
  if (unmapped.length) notes.push(`Other sockets tagged: ${unmapped.join(", ")}`);
  if (approx) notes.push("Address approximate (derived from the map position)");

  let score = 30; // reliable mapped location
  if (tidy(t.name)) score += 10;
  if (operator) score += 10;
  if (pts.length) score += 10;
  if (maxPower) score += 5;
  if (!approx) score += 5;
  if (tidy(t.opening_hours)) score += 5;

  const externalId = `osm_${el.type}_${el.id}`;
  return {
    publishable: true,
    row: {
      source: "osm",
      external_id: externalId,
      name: name.slice(0, 120),
      slug: `${slugify(name) || "ev-charging-station"}-${externalId.replace(/_/g, "")}`.slice(0, 160),
      network: (operator || "Unknown operator").slice(0, 80),
      address: address.slice(0, 300),
      city: city.slice(0, 80),
      district: district ? district.slice(0, 80) : null,
      state,
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      connector_types: [...new Set(pts.map((p) => p.standard))],
      connector_count: connectorCount,
      power_kw: maxPower,
      vehicle_classes: [...vehicle].sort(),
      opening_hours: tidy(t.opening_hours) ? tidy(t.opening_hours).slice(0, 120) : null,
      source_notes: notes.join(". ").slice(0, 500) || null,
      source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      source_attribution: OSM_ATTRIBUTION,
      source_data_as_of: el.timestamp ? el.timestamp.slice(0, 10) : null,
      last_evidence_check: retrievedAt,
      location_quality: "ok",
      name_is_derived: !tidy(t.name),
      data_quality_score: Math.min(75, score),
      merged_source_ids: [],
      eligibility: "B",
      points: pts,
      address_is_approximate: approx,
    },
  };
}

const richness = (r: OsmImportRow) => (r.name_is_derived ? 0 : 4) + (r.network !== "Unknown operator" ? 2 : 0) + r.points.length + (r.address_is_approximate ? 0 : 1);

/**
 * Merges OSM duplicates: the same site mapped twice (e.g. a node and an area),
 * i.e. within 25 m with the same operator (or one of them has no operator).
 * The richer record is kept; the other id is listed in merged_source_ids.
 */
export function dedupeOsm(rows: OsmImportRow[], radiusM = 25): { kept: OsmImportRow[]; merged: Array<{ id: string; into: string }> } {
  const sorted = [...rows].sort((a, b) => richness(b) - richness(a) || (a.external_id < b.external_id ? -1 : 1));
  const kept: OsmImportRow[] = [];
  const merged: Array<{ id: string; into: string }> = [];
  for (const r of sorted) {
    const twin = kept.find(
      (k) =>
        Math.abs(k.latitude - r.latitude) < 0.0005 &&
        distanceMetres(k, r) <= radiusM &&
        (k.network === r.network || k.network === "Unknown operator" || r.network === "Unknown operator"),
    );
    if (twin) {
      twin.merged_source_ids.push(r.external_id);
      merged.push({ id: r.external_id, into: twin.external_id });
    } else kept.push({ ...r, merged_source_ids: [...r.merged_source_ids] });
  }
  kept.sort((a, b) => (a.state + a.city + a.external_id < b.state + b.city + b.external_id ? -1 : 1));
  return { kept, merged };
}
