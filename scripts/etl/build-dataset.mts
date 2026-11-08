/**
 * Repeatable ETL: raw downloads → raw / clean / rejected / sources CSVs + coverage reports.
 *
 *   node --no-warnings scripts/etl/build-dataset.mts <beeDir> <osmDir> [retrievedAt=YYYY-MM-DD]
 *
 * beeDir: output of scripts/etl/fetch-bee-api.mjs (pages/*.json)
 * osmDir: output of scripts/etl/fetch-osm-overpass.mjs (*.json)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { INDIAN_STATES } from "../../src/lib/constants.ts";
import {
  CLEAN_COLUMNS, type BeeStation, type CleanRow, SOURCE_BEE, cleanBeeStation, mergeNearDuplicates, toCsv,
} from "../../src/lib/etl/bee.ts";
import { type OsmElement, SOURCE_OSM, nearestWithin, osmToClean } from "../../src/lib/etl/osm.ts";

const beeDir = process.argv[2] ?? "/projects/sandbox/research/bee-api";
const osmDir = process.argv[3] ?? "/projects/sandbox/research/osm";
const retrievedAt = process.argv[4] ?? new Date().toISOString().slice(0, 10);
mkdirSync("data", { recursive: true });
mkdirSync("docs/data", { recursive: true });

// ---------- 1. Load BEE ----------
const pageFiles = readdirSync(join(beeDir, "pages")).sort();
const beeRaw: BeeStation[] = pageFiles.flatMap((f) => JSON.parse(readFileSync(join(beeDir, "pages", f), "utf8")).data as BeeStation[]);
const meta = JSON.parse(readFileSync(join(beeDir, "meta.json"), "utf8")).data;
const expected = meta.counts.stations as number;

const rejected: Array<Record<string, string>> = [];
const seen = new Set<string>();
const unique: BeeStation[] = [];
for (const s of beeRaw) {
  if (seen.has(s.id)) {
    rejected.push({ source: "bee", source_id: s.id, decision: "duplicate", reason: "duplicate_source_id", state: s.state, city: s.city ?? "", operator: s.operator, latitude: String(s.latitude), longitude: String(s.longitude), detail: "" });
    continue;
  }
  seen.add(s.id);
  unique.push(s);
}

// ---------- 2. Merge same-operator near-duplicates, then clean ----------
const merged = mergeNearDuplicates(unique, 30);
const cleanRows: CleanRow[] = [];
const cleanBee: Array<{ id: string; latitude: number; longitude: number }> = [];
for (const s of merged) {
  const r = cleanBeeStation(s, { retrievedAt, today: new Date(retrievedAt) });
  if (!r.ok) {
    rejected.push({ source: "bee", source_id: s.id, decision: "rejected", reason: r.reason, state: s.state, city: s.city ?? "", operator: s.operator, latitude: String(s.latitude), longitude: String(s.longitude), detail: "" });
    continue;
  }
  cleanRows.push(r.row);
  cleanBee.push({ id: s.id, latitude: s.latitude, longitude: s.longitude });
  for (const m of s.mergedFrom) {
    rejected.push({ source: "bee", source_id: m, decision: "merged", reason: "same_operator_within_30m_merged_into_primary", state: s.state, city: s.city ?? "", operator: s.operator, latitude: "", longitude: "", detail: `primary=${s.id}` });
  }
}

// ---------- 3. OSM layer ----------
const rawRows: Array<Record<string, string>> = [];
for (const s of beeRaw) {
  for (const c of s.chargers) {
    rawRows.push({
      source: "bee", source_id: s.id, operator: s.operator, ownership: s.ownership ?? "", state: s.state, district: s.district ?? "", city: s.city ?? "",
      address: s.address ?? "", latitude: String(s.latitude), longitude: String(s.longitude), location_quality: s.location_quality,
      mixed_admin: String(s.mixed_admin), charger_type_raw: c.type_raw, standards: c.standards.join("; "), charger_kw: String(c.charger_kw ?? ""),
      connectors_per_charger: String(c.connectors_per_charger), gun_kw: c.guns.map((g) => `${g.standard}:${g.kw ?? ""}`).join("; "),
      charger_count: String(c.count), osm_tags: "", retrieved_at: retrievedAt,
    });
  }
}
let osmElements = 0;
const osmFiles = existsSync(osmDir) ? readdirSync(osmDir).filter((f) => /^[A-Z]{2}\.json$/.test(f)).sort() : [];
const osmSeen = new Set<string>();
for (const f of osmFiles) {
  const d = JSON.parse(readFileSync(join(osmDir, f), "utf8")) as { state: string; elements: OsmElement[] };
  for (const el of d.elements) {
    const id = `${el.type}/${el.id}`;
    osmElements++;
    rawRows.push({
      source: "osm", source_id: id, operator: el.tags?.operator ?? el.tags?.brand ?? "", ownership: "", state: d.state, district: "", city: el.tags?.["addr:city"] ?? "",
      address: "", latitude: String(el.lat ?? el.center?.lat ?? ""), longitude: String(el.lon ?? el.center?.lon ?? ""), location_quality: "", mixed_admin: "",
      charger_type_raw: "", standards: "", charger_kw: "", connectors_per_charger: "", gun_kw: "", charger_count: "", osm_tags: JSON.stringify(el.tags ?? {}), retrieved_at: retrievedAt,
    });
    if (osmSeen.has(id)) {
      rejected.push({ source: "osm", source_id: id, decision: "duplicate", reason: "duplicate_source_id", state: d.state, city: "", operator: "", latitude: "", longitude: "", detail: "" });
      continue;
    }
    osmSeen.add(id);
    const r = osmToClean(el, { state: d.state, retrievedAt });
    if (!r.row) {
      rejected.push({ source: "osm", source_id: id, decision: "rejected", reason: r.skip, state: d.state, city: "", operator: el.tags?.operator ?? "", latitude: "", longitude: "", detail: "" });
      continue;
    }
    const dup = nearestWithin({ latitude: Number(r.row.latitude), longitude: Number(r.row.longitude) }, cleanBee, 75);
    if (dup) {
      rejected.push({ source: "osm", source_id: id, decision: "duplicate", reason: "within_75m_of_bee_station", state: d.state, city: r.row.city, operator: r.row.operator, latitude: r.row.latitude, longitude: r.row.longitude, detail: `bee=${dup}` });
      continue;
    }
    cleanRows.push(r.row);
  }
}

// ---------- 4. Write CSVs ----------
const RAW_COLS = ["source", "source_id", "operator", "ownership", "state", "district", "city", "address", "latitude", "longitude", "location_quality", "mixed_admin", "charger_type_raw", "standards", "charger_kw", "connectors_per_charger", "gun_kw", "charger_count", "osm_tags", "retrieved_at"];
const REJ_COLS = ["source", "source_id", "decision", "reason", "state", "city", "operator", "latitude", "longitude", "detail"];
cleanRows.sort((a, b) => (a.state + a.city + a.source_id < b.state + b.city + b.source_id ? -1 : 1));
writeFileSync("data/india_ev_charging_raw.csv", toCsv(rawRows, RAW_COLS));
writeFileSync("data/india_ev_charging_clean.csv", toCsv(cleanRows, CLEAN_COLUMNS));
writeFileSync("data/india_ev_charging_rejected.csv", toCsv(rejected, REJ_COLS));

const sources = [
  { source: "bee", name: SOURCE_BEE.name, publisher: SOURCE_BEE.publisher, url: SOURCE_BEE.url, access_method: "Third-party REST API republishing the BEE PDF (https://ev-charging-stations-api.vercel.app); BEE's own site/PDF was unreachable from the build environment", licence: "No licence published by BEE for this file; the republisher gives it away with attribution. Written confirmation from BEE is recommended before commercial use.", attribution: SOURCE_BEE.attribution, rate_limit: "100 requests / 15 min, 100 stations per page (respected)", status: "used", records_downloaded: String(beeRaw.length), records_expected: String(expected), retrieved_at: retrievedAt, blocker: "" },
  { source: "osm", name: SOURCE_OSM.name, publisher: "OpenStreetMap contributors", url: SOURCE_OSM.url, access_method: "Public Overpass API, one state per request, sequential with delays", licence: SOURCE_OSM.license, attribution: SOURCE_OSM.attribution, rate_limit: "Overpass fair-use (sequential, ~6 s apart)", status: "used (private leads only; not merged into BEE records)", records_downloaded: String(osmElements), records_expected: "", retrieved_at: retrievedAt, blocker: "Derived OSM rows must stay under ODbL 1.0 with attribution. Coverage in India is thin; Telangana returned 0." },
  { source: "dataful", name: "Dataful — State, District, City and Location wise EV Public Charging Stations", publisher: "Factly Media & Research", url: "https://dataful.in/datasets/23369/", access_method: "Subscription portal", licence: "Subscribers only; datasets must not be redistributed or sold", attribution: "", rate_limit: "", status: "not used", records_downloaded: "0", records_expected: "", retrieved_at: "", blocker: "Subscription required and redistribution prohibited by its terms" },
  { source: "openchargemap", name: "Open Charge Map API", publisher: "Open Charge Map", url: "https://www.openchargemap.org/develop/api", access_method: "REST API", licence: "Mostly CC BY 4.0 (per-record); API key required", attribution: "Open Charge Map contributors", rate_limit: "per key", status: "blocked", records_downloaded: "0", records_expected: "", retrieved_at: "", blocker: "Requires a free API key registered by the project owner (HTTP 403 without one)" },
  { source: "bee_direct", name: "BEE original PDF/website", publisher: "Bureau of Energy Efficiency", url: "http://beeindia.gov.in/WriteReadData/RTF1984/EV_PCS_Data_29277.pdf", access_method: "Direct download", licence: "No licence published", attribution: SOURCE_BEE.attribution, rate_limit: "", status: "unreachable", records_downloaded: "0", records_expected: "", retrieved_at: "", blocker: "beeindia.gov.in timed out from the build environment; re-run the ETL against the PDF from a normal network if you want a primary-source rebuild" },
  { source: "niti_eamrit", name: "NITI Aayog E-Amrit charging station locator", publisher: "NITI Aayog", url: "https://e-amrit.niti.gov.in/charging-station-locators", access_method: "Website API", licence: "Website policy asks for prior written permission", attribution: "", rate_limit: "", status: "not used", records_downloaded: "0", records_expected: "", retrieved_at: "", blocker: "Permission required before use" },
  ...["Tata Power EZ Charge", "ChargeZone", "Statiq", "Jio-bp pulse", "Ather Grid", "BPCL", "HPCL", "IOCL"].map((op) => ({ source: op.toLowerCase().replace(/[^a-z]+/g, "_"), name: `${op} station locator`, publisher: op, url: "", access_method: "Operator app / website locator", licence: "No public data licence or open API found", attribution: "", rate_limit: "", status: "not used", records_downloaded: "0", records_expected: "", retrieved_at: "", blocker: "No permitted API/download. Operator stations already present in the BEE list (e.g. IOCL, BPCL, HPCL, Tata Power, Jio-bp) are included via BEE." })),
];
const SRC_COLS = ["source", "name", "publisher", "url", "access_method", "licence", "attribution", "rate_limit", "status", "records_downloaded", "records_expected", "retrieved_at", "blocker"];
writeFileSync("data/india_ev_charging_sources.csv", toCsv(sources, SRC_COLS as never));

// ---------- 5. Coverage by state ----------
const bee = cleanRows.filter((r) => r.source === "bee");
const cov = INDIAN_STATES.map((state) => {
  const rows = bee.filter((r) => r.state === state);
  const osm = cleanRows.filter((r) => r.source === "osm" && r.state === state).length;
  const car = rows.filter((r) => /Car/.test(r.vehicle_compatibility)).length;
  const fast = rows.filter((r) => /Car/.test(r.vehicle_compatibility) && /DC/.test(r.charger_type) && Number(r.rated_power_kw) >= 50).length;
  const avg = rows.length ? rows.reduce((a, r) => a + Number(r.data_quality_score), 0) / rows.length : 0;
  return {
    state, bee_stations: String(rows.length), eligible_B: String(rows.filter((r) => r.publication_eligibility === "B").length), private_C: String(rows.filter((r) => r.publication_eligibility === "C").length), private_C_unreadable_text: String(rows.filter((r) => r.flags.includes("unreadable_text_in_source")).length),
    car_capable: String(car), car_fast_dc_50kw_plus: String(fast), two_three_wheeler_only: String(rows.filter((r) => r.vehicle_compatibility === "2W/3W").length),
    cities: String(new Set(rows.map((r) => r.city)).size), avg_quality: avg.toFixed(1), osm_private_leads: String(osm), coverage_note: rows.length === 0 ? "NO RECORDS in any source" : rows.length < 25 ? "thin coverage" : "",
  };
});
const COV_COLS = ["state", "bee_stations", "eligible_B", "private_C", "private_C_unreadable_text", "car_capable", "car_fast_dc_50kw_plus", "two_three_wheeler_only", "cities", "avg_quality", "osm_private_leads", "coverage_note"];
writeFileSync("docs/data/coverage-by-state.csv", toCsv(cov, COV_COLS as never));

const count = (f: (r: CleanRow) => boolean) => cleanRows.filter(f).length;
const summary = {
  retrievedAt,
  bee: { pagesRead: pageFiles.length, stationsDownloaded: beeRaw.length, stationsExpected: expected, complete: beeRaw.length === expected, uniqueIds: unique.length, mergedAwayDuplicates: rejected.filter((r) => r.decision === "merged").length, rejected: rejected.filter((r) => r.source === "bee" && r.decision === "rejected").length, cleanStations: bee.length, eligibleB: bee.filter((r) => r.publication_eligibility === "B").length, privateC: bee.filter((r) => r.publication_eligibility === "C").length, privateCReasons: { suspectCoordinates: bee.filter((r) => r.flags.includes("suspect_coordinates_in_source") || r.flags.includes("coordinates_outside_india")).length, unreadableText: bee.filter((r) => r.flags.includes("unreadable_text_in_source")).length } },
  osm: { elementsDownloaded: osmElements, privateLeadsC: count((r) => r.source === "osm"), duplicatesOfBee: rejected.filter((r) => r.source === "osm" && r.reason === "within_75m_of_bee_station").length, rejected: rejected.filter((r) => r.source === "osm" && r.decision === "rejected").length },
  totals: { rawRows: rawRows.length, cleanRows: cleanRows.length, rejectedRows: rejected.length, eligibleB: count((r) => r.publication_eligibility === "B"), privateC: count((r) => r.publication_eligibility === "C") },
  statesWithNoRecords: cov.filter((c) => c.bee_stations === "0").map((c) => c.state),
};
writeFileSync("docs/data/etl-summary.json", JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
