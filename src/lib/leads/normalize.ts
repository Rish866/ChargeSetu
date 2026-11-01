/**
 * Turns raw station-lead CSV records into validated, normalised rows for the
 * `station_leads` table. Pure functions only — used by the import script and
 * covered by unit tests.
 *
 * Rules: never invent data. Missing values stay null, and anything uncertain
 * is recorded in `qualityFlags` for a human to check.
 */
import { CONNECTOR_TYPES, INDIAN_STATES } from "../constants.ts";

export const LEAD_CSV_COLUMNS = [
  "station_name",
  "operator",
  "address",
  "city",
  "state",
  "connector_types",
  "power_kw",
  "tariff_inr_per_kwh",
  "access_status",
  "source_url",
  "verification_status",
  "notes",
] as const;

export interface LeadRow {
  dedupeKey: string;
  importBatch: string;
  sourceRow: number;
  stationName: string;
  operatorName: string | null;
  address: string;
  city: string;
  state: string;
  pincode: string | null;
  connectorTypes: string[];
  connectorTypesRaw: string | null;
  powerKwMax: number | null;
  powerKwRaw: string | null;
  tariffInrPerKwh: number | null;
  accessNotes: string | null;
  sourceUrl: string;
  notes: string | null;
  missingFields: string[];
  qualityFlags: string[];
}

export type LeadParseResult =
  | { ok: true; row: LeadRow }
  | { ok: false; sourceRow: number; stationName: string; errors: string[] };

const blank = (v: string | undefined) => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
};

/** Lower-case, accent-free, punctuation-free text for comparisons. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function leadDedupeKey(name: string, address: string): string {
  return `${normalizeText(name)}|${normalizeText(address)}`;
}

/** The place part of "Operator – Place", used to spot two listings at one site. */
export function siteLabel(name: string): string {
  const parts = name.split(/\s[–—-]\s/);
  return normalizeText(parts.length > 1 ? parts.slice(1).join(" ") : name);
}

const CONNECTOR_ALIASES: Record<string, string> = {
  ccs: "ccs2",
  ccs2: "ccs2",
  "ccs 2": "ccs2",
  "ccs type 2": "ccs2",
  chademo: "chademo",
  "type 2": "type2",
  type2: "type2",
  "type 2 ac": "type2",
  "gb t": "gbt",
  gbt: "gbt",
  "bharat ac 001": "bharat_ac001",
  "bharat ac001": "bharat_ac001",
  "bharat dc 001": "bharat_dc001",
  "bharat dc001": "bharat_dc001",
  leccs: "type7_lecct",
  "type 7": "type7_lecct",
  "15a socket": "15a_socket",
  "15a": "15a_socket",
};
const KNOWN_CONNECTORS = new Set(CONNECTOR_TYPES.map((c) => c.id as string));

export function mapConnectors(raw: string | null): { ids: string[]; unknown: string[] } {
  if (!raw) return { ids: [], unknown: [] };
  const ids: string[] = [];
  const unknown: string[] = [];
  // Protect "GB/T" before splitting on separators (which include "/").
  const parts = raw.replace(/\bgb\s*\/\s*t\b/gi, "GBT").split(/[;,/|]+/);
  for (const part of parts) {
    const key = normalizeText(part);
    if (!key) continue;
    const id = CONNECTOR_ALIASES[key];
    if (id && KNOWN_CONNECTORS.has(id)) {
      if (!ids.includes(id)) ids.push(id);
    } else {
      unknown.push(part.trim());
    }
  }
  return { ids, unknown };
}

/** "60; 30" -> { max: 60, values: [60, 30] }. Non-numbers are ignored. */
export function parsePowerList(raw: string | null): { max: number | null; values: number[]; invalid: string[] } {
  if (!raw) return { max: null, values: [], invalid: [] };
  const values: number[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[;,/|]+/)) {
    const t = part.trim().replace(/\s*kw$/i, "");
    if (!t) continue;
    const n = Number(t);
    if (Number.isFinite(n) && n > 0 && n <= 1000) values.push(n);
    else invalid.push(part.trim());
  }
  return { max: values.length ? Math.max(...values) : null, values, invalid };
}

/** Last Indian PIN code (6 digits, not starting with 0) found in the address. */
export function extractPincode(address: string): string | null {
  const all = address.match(/(?<!\d)[1-9]\d{5}(?!\d)/g);
  return all ? all[all.length - 1] : null;
}

function validUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return (url.protocol === "https:" || url.protocol === "http:") && !!url.hostname && !/\s/.test(u);
  } catch {
    return false;
  }
}

export function normalizeLeadRecord(record: Record<string, string>, sourceRow: number, importBatch: string): LeadParseResult {
  const stationName = blank(record.station_name);
  const address = blank(record.address);
  const city = blank(record.city);
  const stateRaw = blank(record.state);
  const sourceUrl = blank(record.source_url);
  const errors: string[] = [];

  if (!stationName || stationName.length < 2) errors.push("station_name is missing");
  if (!address || address.length < 5) errors.push("address is missing");
  if (!city) errors.push("city is missing");
  const state = stateRaw ? INDIAN_STATES.find((s) => normalizeText(s) === normalizeText(stateRaw)) : undefined;
  if (!state) errors.push(stateRaw ? `state "${stateRaw}" is not an Indian state/UT` : "state is missing");
  if (!sourceUrl) errors.push("source_url is missing");
  else if (!validUrl(sourceUrl)) errors.push(`source_url "${sourceUrl}" is not a valid web address`);
  if (stationName && stationName.length > 200) errors.push("station_name is longer than 200 characters");
  if (address && address.length > 400) errors.push("address is longer than 400 characters");

  const connectorsRaw = blank(record.connector_types);
  const connectors = mapConnectors(connectorsRaw);
  const powerRaw = blank(record.power_kw);
  const power = parsePowerList(powerRaw);
  const tariffRaw = blank(record.tariff_inr_per_kwh);
  let tariff: number | null = null;
  if (tariffRaw) {
    const n = Number(tariffRaw.replace(/^₹\s*/, ""));
    if (Number.isFinite(n) && n >= 0 && n <= 10000) tariff = n;
    else errors.push(`tariff "${tariffRaw}" is not a number of rupees`);
  }

  if (errors.length || !stationName || !address || !city || !state || !sourceUrl) {
    return { ok: false, sourceRow, stationName: stationName ?? "(no name)", errors };
  }

  const qualityFlags: string[] = [];
  if (connectors.unknown.length) qualityFlags.push(`Unrecognised connector text: ${connectors.unknown.join(", ")}`);
  if (power.invalid.length) qualityFlags.push(`Unreadable power values: ${power.invalid.join(", ")}`);
  if (power.values.length > 1) qualityFlags.push(`Several power values listed (${power.values.join(", ")} kW); highest used as max`);
  const sourceStatus = blank(record.verification_status);
  if (sourceStatus && sourceStatus !== "pending_review") {
    qualityFlags.push(`CSV said "${sourceStatus}"; imported as pending review and unverified`);
  }
  const operatorName = blank(record.operator);
  if (operatorName && /ather/i.test(operatorName) && connectors.ids.includes("type2")) {
    qualityFlags.push("Ather Grid points usually use Ather's own two-wheeler connector — confirm the listed 'Type 2'");
  }
  const pincode = extractPincode(address);
  if (!pincode) qualityFlags.push("No PIN code in the address");

  // Everything a station needs before it can be published, but the lead lacks.
  const missingFields = ["coordinates"];
  if (!connectors.ids.length) missingFields.push("connector_types");
  if (power.max === null) missingFields.push("power_kw");
  if (tariff === null) missingFields.push("tariff");
  missingFields.push("opening_hours", "area", "connector_count");

  return {
    ok: true,
    row: {
      dedupeKey: leadDedupeKey(stationName, address),
      importBatch,
      sourceRow,
      stationName,
      operatorName,
      address,
      city,
      state,
      pincode,
      connectorTypes: connectors.ids,
      connectorTypesRaw: connectorsRaw,
      powerKwMax: power.max,
      powerKwRaw: powerRaw,
      tariffInrPerKwh: tariff,
      accessNotes: blank(record.access_status),
      sourceUrl,
      notes: blank(record.notes),
      missingFields,
      qualityFlags,
    },
  };
}

export interface ExistingStationRef {
  id: string;
  name: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface LeadImportPlan {
  valid: LeadRow[];
  rejected: { sourceRow: number; stationName: string; errors: string[] }[];
  duplicatesInFile: { sourceRow: number; stationName: string; firstRow: number }[];
  duplicatesOfStations: { sourceRow: number; stationName: string; stationId: string }[];
  /** Different listings that look like the same site (e.g. two operators at one mall). */
  sameSiteGroups: { site: string; pincode: string | null; rows: { sourceRow: number; stationName: string }[] }[];
}

/** Validates, normalises and de-duplicates a whole CSV file. */
export function planLeadImport(
  records: Record<string, string>[],
  importBatch: string,
  existingStations: ExistingStationRef[] = [],
  headerRowOffset = 1,
): LeadImportPlan {
  const plan: LeadImportPlan = { valid: [], rejected: [], duplicatesInFile: [], duplicatesOfStations: [], sameSiteGroups: [] };
  const seen = new Map<string, number>();
  const stationKeys = new Map(existingStations.map((s) => [leadDedupeKey(s.name, s.address), s.id]));
  const stationNames = new Map(existingStations.map((s) => [normalizeText(s.name), s.id]));

  records.forEach((rec, i) => {
    const sourceRow = i + 1 + headerRowOffset; // spreadsheet row number
    const r = normalizeLeadRecord(rec, sourceRow, importBatch);
    if (!r.ok) {
      plan.rejected.push({ sourceRow, stationName: r.stationName, errors: r.errors });
      return;
    }
    const first = seen.get(r.row.dedupeKey);
    if (first !== undefined) {
      plan.duplicatesInFile.push({ sourceRow, stationName: r.row.stationName, firstRow: first });
      return;
    }
    const stationId = stationKeys.get(r.row.dedupeKey) ?? stationNames.get(normalizeText(r.row.stationName));
    if (stationId) {
      plan.duplicatesOfStations.push({ sourceRow, stationName: r.row.stationName, stationId });
      return;
    }
    seen.set(r.row.dedupeKey, sourceRow);
    plan.valid.push(r.row);
  });

  const groups = new Map<string, LeadImportPlan["sameSiteGroups"][number]>();
  for (const row of plan.valid) {
    const key = `${siteLabel(row.stationName)}|${row.pincode ?? ""}`;
    const g = groups.get(key) ?? { site: siteLabel(row.stationName), pincode: row.pincode, rows: [] };
    g.rows.push({ sourceRow: row.sourceRow, stationName: row.stationName });
    groups.set(key, g);
  }
  plan.sameSiteGroups = [...groups.values()].filter((g) => g.rows.length > 1);
  for (const g of plan.sameSiteGroups) {
    for (const r of g.rows) {
      const row = plan.valid.find((v) => v.sourceRow === r.sourceRow)!;
      const others = g.rows.filter((o) => o.sourceRow !== r.sourceRow).map((o) => `row ${o.sourceRow}`);
      row.qualityFlags.push(`Same site as ${others.join(", ")} — check whether these are separate chargers`);
    }
  }
  return plan;
}
