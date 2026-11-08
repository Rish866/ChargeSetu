/**
 * Pure ETL helpers for the BEE (Bureau of Energy Efficiency) public charging
 * station list, as republished by the "India EV Charging Station Directory API".
 *
 * Rules: never invent data. Unknown stays empty. Everything uncertain is flagged.
 */
import { INDIA_BOUNDS, INDIAN_STATES } from "../constants.ts";
import { UNREADABLE_FLAG, unreadableFields } from "./text-quality.ts";

export interface BeeGun {
  standard: string;
  kw: number | null;
}
export interface BeeCharger {
  type_raw: string;
  standards: string[];
  lev_variant: string | null;
  charger_kw: number | null;
  connectors_per_charger: number;
  guns: BeeGun[];
  count: number;
}
export interface BeeStation {
  id: string;
  operator: string;
  ownership: string | null;
  state: string;
  state_code: string | null;
  district: string | null;
  city: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  location_quality: "ok" | "suspect";
  mixed_admin: boolean;
  chargers: BeeCharger[];
  total_chargers: number;
  total_connectors: number;
  max_power_kw: number | null;
  standards: string[];
  currents: string[];
  vehicle_classes: string[];
}

export const SOURCE_BEE = {
  source: "bee",
  name: "EV Public Charging Stations Data till 26th October 2025",
  publisher: "Bureau of Energy Efficiency (BEE), Ministry of Power, Government of India",
  url: "http://beeindia.gov.in/show_content.php?lang=1&level=2&ls_id=345&lid=67",
  publicationDate: "2025-10-26",
  attribution:
    'Data: Bureau of Energy Efficiency (BEE), Ministry of Power, Government of India — "EV Public Charging Stations Data till 26th October 2025".',
} as const;

/** BEE standard names → ChargeSetu connector ids (see src/lib/constants.ts). */
export const BEE_STANDARD_TO_APP: Record<string, string> = {
  CCS2: "ccs2",
  CHADEMO: "chademo",
  TYPE2_AC: "type2",
  BHARAT_AC001: "bharat_ac001",
  BHARAT_DC001: "bharat_dc001",
  LEV_AC: "lev_ac",
  LEV_DC: "lev_dc",
};

const DC_STANDARDS = new Set(["CCS2", "CHADEMO", "BHARAT_DC001", "LEV_DC"]);
const STATE_SET = new Set<string>(INDIAN_STATES);

export interface MergedStation extends BeeStation {
  mergedFrom: string[];
}

const toRad = (d: number) => (d * Math.PI) / 180;
export function distanceMetres(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function inIndia(lat: number, lng: number): boolean {
  return lat >= INDIA_BOUNDS.minLat && lat <= INDIA_BOUNDS.maxLat && lng >= INDIA_BOUNDS.minLng && lng <= INDIA_BOUNDS.maxLng;
}

const union = <T>(a: T[], b: T[]) => Array.from(new Set([...a, ...b]));

/**
 * Merges records of the SAME operator within `radiusM` metres into one physical
 * station (BEE lists one row per charger, so one site can appear several times
 * with coordinates that differ in the 5th decimal). Different operators at one
 * location stay separate. Deterministic: the smallest id becomes the primary.
 * Suspect locations are never merged.
 */
export function mergeNearDuplicates(stations: BeeStation[], radiusM = 30): MergedStation[] {
  const sorted = [...stations].sort((a, b) => (a.id < b.id ? -1 : 1));
  const CELL = 0.0004; // ≈ 44 m; neighbours checked, so radius ≤ 30 m is safe
  const cells = new Map<string, MergedStation[]>();
  const out: MergedStation[] = [];
  const key = (op: string, i: number, j: number) => `${op}|${i}|${j}`;

  for (const s of sorted) {
    const merged: MergedStation = { ...s, mergedFrom: [] };
    if (s.location_quality !== "ok") {
      out.push(merged);
      continue;
    }
    const ci = Math.floor(s.latitude / CELL);
    const cj = Math.floor(s.longitude / CELL);
    let target: MergedStation | undefined;
    outer: for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const cand of cells.get(key(s.operator, ci + di, cj + dj)) ?? []) {
          if (distanceMetres(cand, s) <= radiusM) {
            target = cand;
            break outer;
          }
        }
      }
    }
    if (target) {
      target.mergedFrom.push(s.id);
      target.chargers = [...target.chargers, ...s.chargers];
      target.total_chargers += s.total_chargers;
      target.total_connectors += s.total_connectors;
      target.max_power_kw = Math.max(target.max_power_kw ?? 0, s.max_power_kw ?? 0) || null;
      target.standards = union(target.standards, s.standards);
      target.currents = union(target.currents, s.currents);
      target.vehicle_classes = union(target.vehicle_classes, s.vehicle_classes);
      target.mixed_admin ||= s.mixed_admin;
    } else {
      const k = key(s.operator, ci, cj);
      cells.set(k, [...(cells.get(k) ?? []), merged]);
      out.push(merged);
    }
  }
  return out;
}

export interface CleanRow {
  source: string;
  source_id: string;
  station_name: string;
  name_is_derived: string;
  operator: string;
  state: string;
  district: string;
  city: string;
  address: string;
  latitude: string;
  longitude: string;
  charger_type: string;
  connector_standard: string;
  rated_power_kw: string;
  connector_count: string;
  connectors_detail: string;
  vehicle_compatibility: string;
  public_access_status: string;
  opening_hours: string;
  tariff: string;
  source_url: string;
  source_publication_date: string;
  last_evidence_check: string;
  verification_method: string;
  verification_status: string;
  publication_eligibility: "B" | "C";
  data_quality_score: string;
  merged_source_ids: string;
  flags: string;
  license: string;
  notes: string;
}

export const CLEAN_COLUMNS: Array<keyof CleanRow> = [
  "source", "source_id", "station_name", "name_is_derived", "operator", "state", "district", "city", "address", "latitude", "longitude",
  "charger_type", "connector_standard", "rated_power_kw", "connector_count", "connectors_detail", "vehicle_compatibility",
  "public_access_status", "opening_hours", "tariff", "source_url", "source_publication_date", "last_evidence_check",
  "verification_method", "verification_status", "publication_eligibility", "data_quality_score", "merged_source_ids", "flags", "license", "notes",
];

const tidy = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const title = (s: string) => tidy(s).replace(/\b([A-Za-z])([A-Za-z]*)\b/g, (m, a, b) => (m === m.toUpperCase() && m.length > 3 ? a + b.toLowerCase() : m));

/** BEE has no station names. This builds a plain, honest label from real fields. */
export function derivedName(operator: string, city: string, district: string): string {
  const place = tidy(city) || tidy(district);
  return place ? `${title(operator)} – ${title(place)}` : title(operator);
}

export function describeConnectors(chargers: BeeCharger[]): string {
  const m = new Map<string, number>();
  for (const c of chargers) {
    for (const g of c.guns) {
      const k = `${g.standard}:${g.kw ?? "?"}kW`;
      m.set(k, (m.get(k) ?? 0) + c.count);
    }
  }
  return [...m.entries()].map(([k, n]) => `${k}x${n}`).join(" | ");
}

export function qualityScore(s: MergedStation, flags: string[]): number {
  let score = 0;
  if (s.location_quality === "ok" && inIndia(s.latitude, s.longitude)) score += 30;
  if (tidy(s.operator)) score += 10;
  if (tidy(s.state) && tidy(s.district) && tidy(s.city)) score += 10;
  if (tidy(s.address).length >= 15) score += 10;
  if (s.max_power_kw && s.standards.length) score += 15;
  if (s.vehicle_classes.length) score += 5;
  if (flags.includes("district_city_mismatch_in_source")) score -= 15;
  return Math.max(0, Math.min(80, score)); // source-list-only records cap at 80; field verification adds the rest
}

export type CleanResult =
  | { ok: true; row: CleanRow }
  | { ok: false; sourceId: string; reason: string };

export function cleanBeeStation(s: MergedStation, opts: { retrievedAt: string; today?: Date }): CleanResult {
  if (!Number.isFinite(s.latitude) || !Number.isFinite(s.longitude)) return { ok: false, sourceId: s.id, reason: "missing_coordinates" };
  if (!STATE_SET.has(s.state)) return { ok: false, sourceId: s.id, reason: `unknown_state:${s.state}` };
  if (!tidy(s.operator)) return { ok: false, sourceId: s.id, reason: "missing_operator" };
  if (!s.standards.length) return { ok: false, sourceId: s.id, reason: "no_connector_standard" };

  const flags: string[] = ["name_derived_from_operator_and_place", "hours_not_in_source", "tariff_not_in_source"];
  if (s.location_quality !== "ok") flags.push("suspect_coordinates_in_source");
  else if (!inIndia(s.latitude, s.longitude)) flags.push("coordinates_outside_india");
  if (s.mixed_admin) flags.push("district_city_mismatch_in_source");
  if (tidy(s.address).length < 8) flags.push("address_very_short");
  if (s.mergedFrom.length) flags.push(`merged_${s.mergedFrom.length + 1}_records_same_operator_within_30m`);
  const today = opts.today ?? new Date();
  const ageDays = (today.getTime() - new Date(SOURCE_BEE.publicationDate).getTime()) / 86400000;
  if (ageDays > 365) flags.push("source_older_than_12_months");
  // Garbled PDF text: keep the original, but never make it publishable.
  const unreadable = unreadableFields({
    station_name: derivedName(s.operator, s.city ?? "", s.district ?? ""),
    operator: tidy(s.operator),
    district: tidy(s.district),
    city: tidy(s.city),
    address: tidy(s.address),
  });
  if (unreadable.length) flags.push(`${UNREADABLE_FLAG}:${unreadable.join("+")}`);

  const eligible =
    s.location_quality === "ok" && inIndia(s.latitude, s.longitude) && tidy(s.address).length >= 3 && unreadable.length === 0;
  const hasAc = s.standards.some((x) => !DC_STANDARDS.has(x));
  const hasDc = s.standards.some((x) => DC_STANDARDS.has(x));
  // Stable order (Car first) so the same set always prints the same way.
  const classes = [...s.vehicle_classes]
    .sort((a, b) => (a === "car" ? -1 : b === "car" ? 1 : a < b ? -1 : 1))
    .map((c) => (c === "two_three_wheeler" ? "2W/3W" : c === "car" ? "Car" : c));

  return {
    ok: true,
    row: {
      source: SOURCE_BEE.source,
      source_id: s.id,
      station_name: derivedName(s.operator, s.city ?? "", s.district ?? ""),
      name_is_derived: "yes",
      operator: tidy(s.operator),
      state: s.state,
      district: tidy(s.district),
      city: tidy(s.city),
      address: tidy(s.address),
      latitude: s.latitude.toFixed(6),
      longitude: s.longitude.toFixed(6),
      charger_type: [hasAc ? "AC" : "", hasDc ? "DC" : ""].filter(Boolean).join("; "),
      connector_standard: s.standards.join("; "),
      rated_power_kw: s.max_power_kw === null ? "" : String(s.max_power_kw),
      connector_count: String(s.total_connectors),
      connectors_detail: describeConnectors(s.chargers),
      vehicle_compatibility: classes.join("; "),
      public_access_status: "listed_as_public_by_source_not_confirmed",
      opening_hours: "",
      tariff: "",
      source_url: SOURCE_BEE.url,
      source_publication_date: SOURCE_BEE.publicationDate,
      last_evidence_check: opts.retrievedAt,
      verification_method: "source_list_only",
      verification_status: "unverified",
      publication_eligibility: eligible ? "B" : "C",
      data_quality_score: String(unreadable.length ? Math.min(qualityScore(s, flags), 20) : qualityScore(s, flags)),
      merged_source_ids: s.mergedFrom.join("; "),
      flags: flags.join("; "),
      license: "No licence published by BEE; republished with attribution",
      notes: unreadable.length
        ? `Private: ${unreadable.join(", ")} unreadable in the source (PDF text-encoding error). Original text kept unchanged; correct manually before any use.`
        : "",
    },
  };
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export function toCsv<T extends object>(rows: T[], columns: Array<keyof T & string>): string {
  const lines = [columns.join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(String((r as Record<string, unknown>)[c] ?? ""))).join(","));
  return lines.join("\n") + "\n";
}
