# Datasets

Station-level files are **kept private** (not committed) because the BEE station list has no published reuse licence.

| File | Committed? | Contents |
|---|---|---|
| `india_ev_charging_raw.csv` | No — private | Every record as downloaded (BEE + OSM), 31,637 rows |
| `india_ev_charging_clean.csv` | No — private | Cleaned, de-duplicated records with publication eligibility (B / C), 27,436 rows |
| `india_ev_charging_rejected.csv` | No — private | Rows merged away as duplicates, with the reason, 2,361 rows |
| `india_ev_charging_sources.csv` | Yes | Source / licence manifest (no station records) |
| `../docs/data/coverage-by-state.csv` | Yes | Aggregate counts per state / UT |
| `../docs/data/etl-summary.json` | Yes | Aggregate ETL counts |

Regenerate the private files with the scripts in `scripts/etl` (see docs/NATIONWIDE.md). The admin imports
`india_ev_charging_clean.csv` by uploading it on `/admin/data`; only `source = bee` rows with coordinates inside India are imported.

## Licensing

* **BEE rows** — Bureau of Energy Efficiency, India, public EV charging station list dated 26 Oct 2025. No reuse licence is published; obtain written permission before publishing or redistributing. Attribution is shown in the app.
* **OSM rows** (`source = osm`) — © OpenStreetMap contributors, **ODbL 1.0** (attribution + share-alike). Private leads only; never imported.
