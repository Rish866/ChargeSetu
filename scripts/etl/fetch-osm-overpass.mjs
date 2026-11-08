#!/usr/bin/env node
/**
 * Downloads OpenStreetMap charging stations for every Indian state / UT from the
 * public Overpass API, one state at a time (polite: sequential, delays, backoff).
 *
 *   node scripts/etl/fetch-osm-overpass.mjs [outDir]
 *
 * Licence: OpenStreetMap data is © OpenStreetMap contributors, ODbL 1.0
 * (https://opendatacommons.org/licenses/odbl/). Anything derived from it must keep
 * that attribution and the ODbL terms. Resumable: finished states are skipped.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "data/raw/osm";
mkdirSync(out, { recursive: true });
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const UA = "ChargeSetu-ETL/1.0 (+https://github.com/Rish866/ChargeSetu; polite sequential queries)";

// ISO 3166-2:IN codes (DH replaces the older DN/DD pair; both are tried).
const STATES = {
  AN: "Andaman and Nicobar Islands", AP: "Andhra Pradesh", AR: "Arunachal Pradesh", AS: "Assam", BR: "Bihar", CH: "Chandigarh",
  CT: "Chhattisgarh", DH: "Dadra and Nagar Haveli and Daman and Diu", DN: "Dadra and Nagar Haveli", DD: "Daman and Diu", DL: "Delhi",
  GA: "Goa", GJ: "Gujarat", HR: "Haryana", HP: "Himachal Pradesh", JK: "Jammu and Kashmir", JH: "Jharkhand", KA: "Karnataka",
  KL: "Kerala", LA: "Ladakh", LD: "Lakshadweep", MP: "Madhya Pradesh", MH: "Maharashtra", MN: "Manipur", ML: "Meghalaya",
  MZ: "Mizoram", NL: "Nagaland", OD: "Odisha", PY: "Puducherry", PB: "Punjab", RJ: "Rajasthan", SK: "Sikkim", TN: "Tamil Nadu",
  TG: "Telangana", TR: "Tripura", UP: "Uttar Pradesh", UT: "Uttarakhand", WB: "West Bengal",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function query(code) {
  const q = `[out:json][timeout:120];area["ISO3166-2"="IN-${code}"]->.a;(nwr["amenity"="charging_station"](area.a););out center tags;`;
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const ep = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(ep, { method: "POST", headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q), signal: AbortSignal.timeout(150000) });
      if (res.status === 429 || res.status >= 500) {
        lastErr = `HTTP ${res.status} from ${ep}`;
        await sleep(20000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json;
    } catch (e) {
      lastErr = String(e.message ?? e);
      await sleep(15000 * (attempt + 1));
    }
  }
  throw new Error(lastErr);
}

const summary = {};
for (const [code, name] of Object.entries(STATES)) {
  const file = join(out, `${code}.json`);
  if (existsSync(file)) {
    summary[code] = "cached";
    continue;
  }
  try {
    const json = await query(code);
    writeFileSync(file, JSON.stringify({ code, state: name, fetchedAt: new Date().toISOString(), osm3s: json.osm3s ?? null, elements: json.elements }));
    summary[code] = json.elements.length;
    console.log(`${code} ${name}: ${json.elements.length} elements`);
  } catch (e) {
    summary[code] = `FAILED: ${e.message}`;
    console.log(`${code} ${name}: FAILED ${e.message}`);
  }
  await sleep(6000);
}
writeFileSync(join(out, "_summary.json"), JSON.stringify(summary, null, 2));
console.log("done");
