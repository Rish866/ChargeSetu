/**
 * Builds the PUBLISHABLE OpenStreetMap station dataset (ODbL 1.0).
 *
 *   npx tsx scripts/etl/build-osm-publish.mts <osm-json> <nominatim-cache-json> [retrievedAt]
 *
 * Inputs: an Overpass export of amenity=charging_station for India and a cache of
 * Nominatim reverse-geocoding results (see scripts/etl/fetch-osm-india.mjs).
 * Outputs (committed, ODbL):
 *   data/osm/india-osm-charging-stations.json   import rows (used by scripts/db/deploy.mjs import-osm)
 *   data/osm/india-osm-charging-stations.csv    the same, human-readable
 *   data/osm/excluded.csv                        records kept out, with reasons
 *   docs/data/osm-coverage-by-state.csv, docs/data/osm-summary.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { INDIAN_STATES } from "../../src/lib/constants.ts";
import { toCsv } from "../../src/lib/etl/bee.ts";
import { dedupeOsm, OSM_LICENCE, osmDecision, type OsmEl, type Geo, type OsmImportRow } from "../../src/lib/etl/osm-publish.ts";

const [osmFile, geoFile, retrievedArg] = process.argv.slice(2);
if (!osmFile || !geoFile) throw new Error("usage: build-osm-publish.mts <osm-json> <nominatim-cache-json> [retrievedAt]");
const osm = JSON.parse(readFileSync(osmFile, "utf8")) as { fetchedAt: string; osm3s?: { timestamp_osm_base?: string }; elements: OsmEl[] };
const geo = JSON.parse(readFileSync(geoFile, "utf8")) as Record<string, Geo>;
const retrievedAt = retrievedArg ?? osm.fetchedAt.slice(0, 10);

const publishable: OsmImportRow[] = [];
const excluded: Array<Record<string, string>> = [];
const seen = new Set<string>();
for (const el of osm.elements) {
  const id = `${el.type}/${el.id}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const d = osmDecision(el, geo[id], retrievedAt);
  if (d.publishable) publishable.push(d.row);
  else excluded.push({ osm_id: id, reason: d.reason, name: el.tags?.name ?? "", operator: el.tags?.operator ?? el.tags?.brand ?? "" });
}
const { kept, merged } = dedupeOsm(publishable);
for (const m of merged) excluded.push({ osm_id: m.id.replace(/^osm_(node|way|relation)_/, "$1/"), reason: `duplicate_of:${m.into}`, name: "", operator: "" });

mkdirSync("data/osm", { recursive: true });
mkdirSync("docs/data", { recursive: true });
writeFileSync("data/osm/india-osm-charging-stations.json", JSON.stringify({ licence: OSM_LICENCE, attribution: "© OpenStreetMap contributors", osmBase: osm.osm3s?.timestamp_osm_base ?? null, retrievedAt, count: kept.length, rows: kept }) + "\n");
const CSV_COLS = ["external_id", "name", "name_is_derived", "network", "state", "district", "city", "address", "address_is_approximate", "latitude", "longitude", "connector_types", "connector_count", "power_kw", "vehicle_classes", "opening_hours", "source_notes", "source_url", "source_data_as_of", "last_evidence_check", "data_quality_score", "merged_source_ids"];
const flat = kept.map((r) => ({ ...r, connector_types: r.connector_types.join("; "), vehicle_classes: r.vehicle_classes.join("; "), merged_source_ids: r.merged_source_ids.join("; "), connector_count: r.connector_count ?? "", power_kw: r.power_kw ?? "", district: r.district ?? "", opening_hours: r.opening_hours ?? "", source_notes: r.source_notes ?? "", source_data_as_of: r.source_data_as_of ?? "" }));
writeFileSync("data/osm/india-osm-charging-stations.csv", toCsv(flat as never[], CSV_COLS as never));
writeFileSync("data/osm/excluded.csv", toCsv(excluded as never[], ["osm_id", "reason", "name", "operator"] as never));

const cov = INDIAN_STATES.map((s) => {
  const rs = kept.filter((r) => r.state === s);
  return {
    state: s,
    publishable_stations: String(rs.length),
    with_named_operator: String(rs.filter((r) => r.network !== "Unknown operator").length),
    with_connector_details: String(rs.filter((r) => r.points.length > 0).length),
    with_power: String(rs.filter((r) => r.power_kw !== null).length),
    with_opening_hours: String(rs.filter((r) => r.opening_hours).length),
    cities: String(new Set(rs.map((r) => r.city)).size),
    coverage_note: rs.length === 0 ? "no OSM stations" : rs.length < 10 ? "very thin" : "",
  };
});
writeFileSync("docs/data/osm-coverage-by-state.csv", toCsv(cov as never[], Object.keys(cov[0]) as never));
const reasons: Record<string, number> = {};
for (const e of excluded) {
  const k = e.reason.replace(/:.*$/, "");
  reasons[k] = (reasons[k] ?? 0) + 1;
}
const summary = {
  source: "OpenStreetMap amenity=charging_station (Overpass) + Nominatim reverse geocoding",
  licence: OSM_LICENCE,
  osmBase: osm.osm3s?.timestamp_osm_base ?? null,
  retrievedAt,
  elementsDownloaded: osm.elements.length,
  publishable: kept.length,
  excluded: excluded.length,
  excludedByReason: reasons,
  statesWithStations: cov.filter((c) => c.publishable_stations !== "0").length,
  statesWithout: cov.filter((c) => c.publishable_stations === "0").map((c) => c.state),
  withConnectorDetails: kept.filter((r) => r.points.length).length,
  withPower: kept.filter((r) => r.power_kw !== null).length,
  withNamedOperator: kept.filter((r) => r.network !== "Unknown operator").length,
  approximateAddresses: kept.filter((r) => r.address_is_approximate).length,
};
writeFileSync("docs/data/osm-summary.json", JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
