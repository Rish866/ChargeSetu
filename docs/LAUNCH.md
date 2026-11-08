# ChargeSetu — pan-India launch status

## Public station data

| Source | Licence | Stations | Status |
|---|---|---:|---|
| OpenStreetMap (Overpass, OSM base 2026-11-08) + Nominatim addresses | ODbL 1.0 | **534** publishable (of 621 downloaded) | Imported to production **hidden**. The `publish-osm` workflow step publishes them and hides the demo stations in one transaction. |
| BEE list (26 Oct 2025) | No reuse licence | 26,621 eligible (private files) | **Blocked by the database** (`source_publication_permissions`) until written permission is recorded. 25 Goa test rows imported hidden. |
| Open Charge Map | CC BY-SA / per-provider | — | Needs an API key from the owner. |
| NITI Aayog e-Amrit | Prior permission required | — | Not used. |
| Operators | Direct submission | — | Operator portal and claims live; no operator feeds yet. |

Excluded OSM records (87): 49 duplicates of the same site, 25 battery-swap points (not chargers), 10 private, 3 `access=no`. Details: `data/osm/excluded.csv`.

Data quality of the 534 OSM stations (`docs/data/osm-summary.json`):
* 281 name the operator; the rest show "Unknown operator".
* 32 tag their connectors and 11 their power; everything else shows "not provided".
* 506 addresses are approximate, derived from the map position (shown as such).
* All are labelled **Source-listed · status unconfirmed**. None are marked verified.

### Coverage by state / UT (OpenStreetMap)
| State / UT | Stations | Named operator | Connector details | Cities |
|---|---:|---:|---:|---:|
| Delhi | 131 | 44 | 2 | 3 |
| Kerala | 95 | 53 | 3 | 55 |
| Tamil Nadu | 74 | 53 | 17 | 41 |
| Maharashtra | 69 | 57 | 6 | 35 |
| Karnataka | 47 | 19 | 0 | 18 |
| Andhra Pradesh | 29 | 23 | 0 | 14 |
| West Bengal | 25 | 4 | 0 | 12 |
| Uttar Pradesh | 24 | 9 | 1 | 15 |
| Haryana | 7 | 2 | 0 | 3 |
| Gujarat | 6 | 4 | 1 | 6 |
| Madhya Pradesh | 5 | 1 | 0 | 3 |
| Goa | 4 | 0 | 0 | 3 |
| Rajasthan | 4 | 3 | 0 | 3 |
| Jharkhand | 3 | 3 | 0 | 1 |
| Odisha | 2 | 2 | 2 | 2 |
| Telangana | 2 | 1 | 0 | 1 |
| Uttarakhand | 2 | 2 | 0 | 2 |
| Andaman and Nicobar Islands | 1 | 0 | 0 | 1 |
| Bihar | 1 | 0 | 0 | 1 |
| Jammu and Kashmir | 1 | 1 | 0 | 1 |
| Puducherry | 1 | 0 | 0 | 1 |
| Punjab | 1 | 0 | 0 | 1 |
| Arunachal Pradesh | 0 | 0 | 0 | 0 |
| Assam | 0 | 0 | 0 | 0 |
| Chandigarh | 0 | 0 | 0 | 0 |
| Chhattisgarh | 0 | 0 | 0 | 0 |
| Dadra and Nagar Haveli and Daman and Diu | 0 | 0 | 0 | 0 |
| Himachal Pradesh | 0 | 0 | 0 | 0 |
| Ladakh | 0 | 0 | 0 | 0 |
| Lakshadweep | 0 | 0 | 0 | 0 |
| Manipur | 0 | 0 | 0 | 0 |
| Meghalaya | 0 | 0 | 0 | 0 |
| Mizoram | 0 | 0 | 0 | 0 |
| Nagaland | 0 | 0 | 0 | 0 |
| Sikkim | 0 | 0 | 0 | 0 |
| Tripura | 0 | 0 | 0 | 0 |

**14 states/UTs have no OpenStreetMap stations at all.** Coverage there needs operator submissions, Open Charge Map (key needed) or BEE permission.

## Production database (verified via the Production database workflow)
* Migrations `20261108000000_nationwide_expansion` and `20261109000000_publication_permissions` are applied. 28/28 checks passed.
* Backups: `backup_20261109_005221` (before migration) and `backup_20261109_005258` (before the OSM import), each verified table by table.
* Stations: 534 OSM (hidden), 25 BEE (hidden), and 17 demo (14 published, 2 pending, 1 rejected). Leads 44, reports 2.

## Operations (GitHub → Actions → Production database)
* `check`: read-only status.
* `verify`: read-only checks.
* `backup`: in-database backup.
* `migrate` (`APPLY MIGRATIONS`): backup, then all migrations, then checks.
* `import-osm` (`IMPORT OSM`): backup, then import of `data/osm/*.json`, hidden and idempotent.
* `publish-osm` (`PUBLISH OSM`): backup, then publishes OSM and hides the demo stations (only when 300+ real stations are public), then checks.
* `rollback-osm` (`ROLLBACK OSM`): hides OSM again and restores the demo stations.
* `hide-demo` (`HIDE DEMO`): hides the demo stations on its own.

## Android
See `docs/ANDROID.md`. Signed 1.0.0 APK and AAB: https://github.com/Rish866/ChargeSetu/tree/android-builds/android/1.0.0
