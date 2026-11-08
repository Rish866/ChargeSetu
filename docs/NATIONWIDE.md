# ChargeSetu — nationwide (pan-India) expansion

This document is the runbook and honest status report for the nationwide data layer.

## What was built

| Area | Result |
|---|---|
| Data acquisition | BEE public list (29,184 stations, 292 pages) and OpenStreetMap Overpass (613 elements), downloaded 2026-11-07 |
| ETL | Dedupe (same operator within 30 m merged), cleaning, honest unknowns, quality score, 4 CSVs + coverage report (`scripts/etl`, `src/lib/etl`) |
| Database | Migration `20261108000000_nationwide_expansion.sql`: nullable unknowns, provenance, `charging_points`, `station_sources`, `import_batches`, `station_claims`, indexes, RPCs (`stations_nearby`, `station_map_points`, `state_stats`, `operator_counts`, `import_stations_batch`, `admin_bulk_set_status`) |
| Product | Paginated directory (24/page), state / vehicle / AC-DC / connector / power / operator filters, nearby search, clustered nationwide map (`/api/map`), source-listed badges and banners, charging-points table, claim workflow, admin import + state dashboard + claims |
| Security | RLS on every new table, admin-only import RPC, suspect locations can never be published (DB constraint), API rate limit + cache headers, request error logging |

## Publication levels

| Level | Meaning | Where |
|---|---|---|
| A | Operator-confirmed / admin-verified (`verification_status = verified`) | Public, "Verified" badge |
| B | Source-listed: from the BEE list, location and address present. Shown as **"Source-listed · status unconfirmed"** | Public after an admin publishes it |
| C | Private (suspect coordinates, **unreadable text from the source PDF**, OSM-only leads) | Never imported, never public |
| D | Rejected / duplicate | Not imported |

Nothing is published automatically. The import creates stations **hidden**; an admin publishes per state or for all.

## Counts (from `docs/data/etl-summary.json`)

* BEE downloaded: **29,184** of 29,184 expected, 29,184 unique ids
* Merged as same-operator duplicates (<30 m): **2,149** → **27,035** clean stations
* Level B (importable; publishable only once reuse is permitted): **26,621**
* Level C (private, not importable): **414**
  * **115** — source coordinates outside India (e.g. latitude typed into the longitude field). Not "corrected" by guessing.
  * **299** — unreadable text in the source (PDF text-encoding errors in the address, district, city or derived name; flag `unreadable_text_in_source:<fields>`). The original text is kept unchanged in the private files so it can be corrected by hand later. Detection: `src/lib/etl/text-quality.ts` (control characters, replacement/private-use glyphs, Latin-Extended/IPA/Greek/Cyrillic mojibake, letters shifted by one such as `B@MF@KNQD`). Native Indian scripts on their own are not flagged.
  * Version history: the first build (v1) marked all 26,920 located rows level B; the 299 unreadable rows were reclassified in v2. v1 files are archived privately and unchanged.
* OSM: 613 elements → 212 within 75 m of a BEE station (duplicates), **401 private leads**; OSM data is never published or imported (ODbL share-alike, thin data)
* Operator-verified: **0** new (no station has been physically or operator-verified by this work)
* Pre-existing: 44 private Mumbai/Navi Mumbai leads, 17 fictional demo stations

The database import was tested end-to-end against a real Postgres engine (PGlite, all migrations): all 26,621 level-B rows import in chunks, a second run inserts 0, and bulk publish never publishes a suspect location (`tests/db/real-dataset.test.ts`). Level-C rows are rejected three times over: the admin screen drops them, the server rejects any row that is not level B / has unreadable text, and the database refuses to publish suspect locations.

## Running it in production (admin steps)

1. **Merge the pull request** (safe before the migration: the app falls back to the old behaviour until the new database functions exist).
2. **Back up and apply the migration** — see [DEPLOY_DATABASE.md](DEPLOY_DATABASE.md) (GitHub Actions secret, or Supabase SQL Editor). Additive; nothing is deleted.
3. Sign in as admin → **Admin → Nationwide data & import**.
4. Choose the private file `india_ev_charging_clean.csv`, pick one state, leave "make visible" **unticked**, press **Import**. The stations are stored **hidden**. Re-running is safe.
5. **Only once BEE reuse is permitted in writing**: press **Publish imported** for a state. Published stations are labelled "Source-listed · status unconfirmed" and are never shown as verified.
6. Only after real stations are live: download the demo backup, type `HIDE DEMO`, press **Hide demo stations** (hides, never deletes; refused while fewer than 500 stations are published).

## Where the data is

Station-level BEE records are **not** in the public GitHub repository and are **not** bundled into the website, because BEE has not published a reuse licence. The admin uploads the private file; it is parsed in the admin's browser and sent to the server in validated 250-row chunks. Only aggregate reports (`docs/data/coverage-by-state.csv`, `docs/data/etl-summary.json`) and the source manifest (`data/india_ev_charging_sources.csv`) are committed.

> Earlier commits on the `nationwide-expansion` branch (pushed before this change) contained the record files. They are still reachable in the public Git history of PR #6. Removing them completely requires rewriting that history (force-push) and asking GitHub Support to purge cached pull-request refs — this has **not** been done and needs the owner's decision.

## Legal and licensing blockers

* **BEE list has no published licence.** Written confirmation from BEE is recommended before commercial use. The list is republished with attribution: *Bureau of Energy Efficiency (BEE), India — public EV charging station list dated 26 Oct 2025*.
* The list was read from a third-party API wrapper (`ev-charging-stations-api.vercel.app`) because BEE's own site timed out from the build environment. That wrapper has no licence file, so only its public API output (BEE's own data) was used, never its repository files.
* **OpenStreetMap** data is ODbL 1.0 (attribution + share-alike). It is kept separate and unpublished.
* **Not used:** Dataful (paid, redistribution prohibited), NITI Aayog E-Amrit (needs permission), operator locators (no public API / terms), Open Charge Map (needs an API key that only the project owner can request — add it and re-run `scripts/etl` to extend coverage).
* Full per-source manifest: `data/india_ev_charging_sources.csv`.

## Known limits

* BEE data is dated **26 Oct 2025** and has **no station names**; names are derived as "{Operator} – {City}" (`name_is_derived`) and flagged.
* No tariffs, hours or live availability — shown as "not provided".
* Search uses the database's btree indexes + haversine (no PostGIS). Fine for tens of thousands of rows.
* The map caps at 800 markers per view (clusters beyond that).
* English only. Hindi was **not** done.
* Telangana returned 0 OSM elements (area code not retried); BEE covers Telangana.
* The in-memory rate limiter is per server instance; use an edge/WAF limit for real protection.
* Claim approval records the decision only; linking the operator account to the station is a manual admin step.

## Re-running the ETL

```bash
node scripts/etl/fetch-bee-api.mjs      # resumable, respects the 100 req / 15 min limit
node scripts/etl/fetch-osm-overpass.mjs
npx tsx scripts/etl/build-dataset.mts   # rewrites data/*.csv and docs/data/*
```
