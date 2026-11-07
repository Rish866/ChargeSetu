/**
 * OpenStreetMap charging stations → CleanRow. OSM data is © OpenStreetMap
 * contributors, licensed ODbL 1.0 — anything derived keeps that attribution.
 * OSM records are NEVER auto-published: they are private leads (C) unless they
 * duplicate a BEE station (D).
 */
import { INDIAN_STATES } from "../constants.ts";
import { type CleanRow, distanceMetres, inIndia } from "./bee.ts";

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export const SOURCE_OSM = {
  source: "osm",
  name: "OpenStreetMap — amenity=charging_station",
  url: "https://www.openstreetmap.org/",
  license: "ODbL 1.0 — © OpenStreetMap contributors",
  attribution: "© OpenStreetMap contributors (ODbL 1.0)",
} as const;

const SOCKET_MAP: Record<string, { app: string; label: string; dc: boolean }> = {
  type2: { app: "type2", label: "TYPE2_AC", dc: false },
  type2_combo: { app: "ccs2", label: "CCS2", dc: true },
  ccs: { app: "ccs2", label: "CCS2", dc: true },
  chademo: { app: "chademo", label: "CHADEMO", dc: true },
};

const tidy = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function kwFrom(v: string | undefined): number | null {
  if (!v) return null;
  const m = /([\d.]+)\s*kw/i.exec(v);
  return m ? Number(m[1]) : null;
}

export function osmToClean(el: OsmElement, ctx: { state: string; retrievedAt: string }): { row: CleanRow; skip?: string } | { skip: string; row?: undefined } {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return { skip: "missing_coordinates" };
  if (!inIndia(lat, lon)) return { skip: "coordinates_outside_india" };
  if (!INDIAN_STATES.includes(ctx.state as (typeof INDIAN_STATES)[number])) return { skip: `unknown_state:${ctx.state}` };
  const t = el.tags ?? {};
  const operator = tidy(t.operator || t.brand || t.network);
  const std = new Map<string, { label: string; dc: boolean; kw: number | null }>();
  const unknownSockets: string[] = [];
  for (const [k, v] of Object.entries(t)) {
    const m = /^socket:([a-z0-9_]+)$/.exec(k);
    if (!m || v === "no") continue;
    const mapped = SOCKET_MAP[m[1]];
    if (mapped) std.set(mapped.app, { label: mapped.label, dc: mapped.dc, kw: kwFrom(t[`${k}:output`]) });
    else unknownSockets.push(m[1]);
  }
  const flags = ["osm_unverified", "tariff_not_in_source"];
  if (!tidy(t.name)) flags.push("name_derived_from_operator");
  if (!tidy(t.opening_hours)) flags.push("hours_not_in_source");
  if (unknownSockets.length) flags.push(`unmapped_sockets:${unknownSockets.join(",")}`);
  if (!std.size) flags.push("no_connector_standard_in_source");
  if (t.access === "private" || t.access === "no" || t.access === "customers") flags.push(`osm_access_${t.access}`);
  const capacity = Number(t.capacity);
  const address = [t["addr:housenumber"], t["addr:street"], t["addr:suburb"], t["addr:city"], t["addr:postcode"]].map(tidy).filter(Boolean).join(", ");
  const kws = [...std.values()].map((x) => x.kw).filter((x): x is number => x !== null);
  const hasAc = [...std.values()].some((x) => !x.dc);
  const hasDc = [...std.values()].some((x) => x.dc);
  const name = tidy(t.name) || (operator ? `${operator} charging point` : "EV charging point");
  let score = 25;
  if (operator) score += 10;
  if (std.size) score += 10;
  if (address) score += 5;
  if (kws.length) score += 5;

  return {
    row: {
      source: SOURCE_OSM.source,
      source_id: `${el.type}/${el.id}`,
      station_name: name,
      name_is_derived: tidy(t.name) ? "no" : "yes",
      operator,
      state: ctx.state,
      district: tidy(t["addr:district"]),
      city: tidy(t["addr:city"]),
      address,
      latitude: lat.toFixed(6),
      longitude: lon.toFixed(6),
      charger_type: [hasAc ? "AC" : "", hasDc ? "DC" : ""].filter(Boolean).join("; "),
      connector_standard: [...std.values()].map((x) => x.label).join("; "),
      rated_power_kw: kws.length ? String(Math.max(...kws)) : "",
      connector_count: Number.isFinite(capacity) && capacity > 0 ? String(capacity) : "",
      connectors_detail: "",
      vehicle_compatibility: "",
      public_access_status: t.access ? `osm_access=${t.access}` : "not_stated_in_source",
      opening_hours: tidy(t.opening_hours),
      tariff: "",
      source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      source_publication_date: "",
      last_evidence_check: ctx.retrievedAt,
      verification_method: "source_list_only",
      verification_status: "unverified",
      publication_eligibility: "C",
      data_quality_score: String(Math.min(60, score)),
      merged_source_ids: "",
      flags: flags.join("; "),
      license: SOURCE_OSM.license,
      notes: "",
    },
  };
}

/** Finds the nearest BEE station within `radiusM` metres, or null. */
export function nearestWithin(
  point: { latitude: number; longitude: number },
  stations: Array<{ id: string; latitude: number; longitude: number }>,
  radiusM = 75,
): string | null {
  const dLat = radiusM / 111000 + 0.0005;
  let best: { id: string; d: number } | null = null;
  for (const s of stations) {
    if (Math.abs(s.latitude - point.latitude) > dLat) continue;
    const d = distanceMetres(point, s);
    if (d <= radiusM && (!best || d < best.d)) best = { id: s.id, d };
  }
  return best?.id ?? null;
}
