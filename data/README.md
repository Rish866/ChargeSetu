# Datasets

| File | Contents |
|---|---|
| `india_ev_charging_raw.csv` | Every record as downloaded (BEE + OSM) |
| `india_ev_charging_clean.csv` | Cleaned, de-duplicated records with publication eligibility (B / C) |
| `india_ev_charging_rejected.csv` | Rows merged away as duplicates or rejected, with the reason |
| `india_ev_charging_sources.csv` | Source / licence manifest |

## Licensing

* **BEE rows** — Bureau of Energy Efficiency, India, public EV charging station list dated 26 Oct 2025. BEE publishes no licence for this file; obtain written confirmation before commercial reuse. Attribution is required in the app.
* **OSM rows** (`source = osm`) — © OpenStreetMap contributors, **ODbL 1.0**. Attribution and share-alike apply to these rows. They are private leads and are never imported into the public directory.

`india_ev_charging_clean.csv` is bundled with the app and read by the admin import (`/admin/data`). Only `source = bee` rows are imported.
