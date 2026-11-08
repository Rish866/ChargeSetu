# Where the nationwide data is kept

Station-level datasets (the BEE list and anything derived from it) are **not** stored in this public repository,
because BEE has published no reuse licence. They are backed up in the **private** repository
`Rish866/ChargeSetu-Private-Data`:

* original BEE and OpenStreetMap downloads
* raw / clean / rejected CSVs (current version + archived versions)
* level-B (26,621), unreadable-text (299) and invalid-coordinate (115) subsets, the Goa test batch
* SHA-256 manifest, `scripts/verify.sh` and `scripts/backup.sh`

## Saving an update

After re-running the ETL (`scripts/etl/build-dataset.mts`), move the generated `data/india_ev_charging_*.csv`
files into a folder, then in a clone of the private repository run:

```bash
bash scripts/backup.sh /path/to/folder "What changed"
```

It refuses to run unless the repository is private, rejects anything that looks like a credential, archives the
files it replaces, refreshes the checksums and pushes.

## Guard

CI runs `scripts/check-no-restricted-data.sh` on every pull request. It fails if restricted file names, files
with many BEE record ids, or data files over 2 MB are committed here.
