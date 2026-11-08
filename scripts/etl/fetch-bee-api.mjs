#!/usr/bin/env node
/**
 * Resumable, rate-limit-friendly download of the BEE public charging station list
 * from the third-party "India EV Charging Station Directory API"
 * (https://ev-charging-stations-api.vercel.app), which republishes BEE's
 * "EV Public Charging Stations Data till 26th October 2025" with attribution.
 *
 *   node scripts/etl/fetch-bee-api.mjs [outDir] [maxRequestsThisRun]
 *
 * - The API allows 100 requests / 15 minutes and 100 stations per page.
 * - Each page is saved to <outDir>/pages/NNNN.json, so re-running resumes.
 * - On HTTP 429 it stops cleanly; run it again after the window resets.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://ev-charging-stations-api.vercel.app";
const out = process.argv[2] ?? "data/raw/bee-api";
const budget = Number(process.argv[3] ?? 95); // stay under the 100-request window
const UA = "ChargeSetu-ETL/1.0 (+https://github.com/Rish866/ChargeSetu; respectful, rate-limited)";
const pagesDir = join(out, "pages");
mkdirSync(pagesDir, { recursive: true });

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { "user-agent": UA, accept: "application/json" } });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, retryAfter: res.headers.get("retry-after") };
}

let used = 0;
const have = new Set(readdirSync(pagesDir).map((f) => Number(f.replace(".json", ""))));

// Reference lists (small): states, operators, connectors, meta.
for (const [name, path] of [["meta", "/v1/meta"], ["states", "/v1/states"], ["operators", "/v1/operators"], ["connectors", "/v1/connectors"]]) {
  if (existsSync(join(out, `${name}.json`))) continue;
  const r = await get(path);
  used++;
  if (r.status !== 200) {
    console.log(`${name}: HTTP ${r.status}`);
    process.exit(r.status === 429 ? 3 : 1);
  }
  writeFileSync(join(out, `${name}.json`), JSON.stringify(r.json, null, 2));
}

let page = 1;
let totalPages = Infinity;
while (page <= totalPages && used < budget) {
  if (have.has(page)) {
    page++;
    continue;
  }
  const r = await get(`/v1/stations?limit=100&page=${page}`);
  used++;
  if (r.status === 429) {
    console.log(`Rate limited at page ${page} (retry-after: ${r.retryAfter ?? "unknown"}). Re-run after the 15-minute window resets.`);
    break;
  }
  if (r.status !== 200 || !r.json?.success) {
    console.log(`Page ${page}: HTTP ${r.status} ${r.text.slice(0, 200)}`);
    process.exit(1);
  }
  writeFileSync(join(pagesDir, `${String(page).padStart(4, "0")}.json`), JSON.stringify(r.json));
  const pg = r.json.meta?.pagination ?? r.json.pagination ?? {};
  totalPages = pg.total_pages ?? pg.totalPages ?? totalPages;
  if (r.json.data.length < 100) totalPages = page;
  have.add(page);
  page++;
  await new Promise((res) => setTimeout(res, 700));
}
const done = readdirSync(pagesDir).length;
console.log(`pages saved: ${done}${Number.isFinite(totalPages) ? ` of ${totalPages}` : ""}; requests used this run: ${used}`);
