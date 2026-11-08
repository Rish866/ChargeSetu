#!/usr/bin/env bash
# Fails if restricted station-level source data is committed to this PUBLIC repository.
# BEE records have no published reuse licence: they live only in the private repository
# Rish866/ChargeSetu-Private-Data (see docs/DATA_BACKUP.md).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
fail=0
files=$(git ls-files)

# 1. Known restricted file names, anywhere in the tree.
bad_names=$(echo "$files" | grep -E '(^|/)(india_ev_charging_(raw|clean|rejected)\.csv|bee_level_[BC]_.*\.csv|osm_private_leads\.csv|chargesetu-test-batch-.*\.csv)$|(^|/)(bee-api|source-downloads|private-data)/' || true)
if [ -n "$bad_names" ]; then echo "Restricted dataset files are tracked:"; echo "$bad_names"; fail=1; fi

# 2. Any tracked file containing many BEE record ids (evs_ + 10 hex digits).
while IFS= read -r f; do
  [ -f "$f" ] || continue
  n=$(grep -aoE 'evs_[0-9a-f]{10}' "$f" 2>/dev/null | sort -u | wc -l || true)
  if [ "${n:-0}" -ge 5 ]; then echo "$f contains $n BEE station ids"; fail=1; fi
done <<< "$files"

# 3. Unexpectedly large data files.
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in *.csv|*.json|*.tsv|*.xlsx|*.zip|*.gz)
    s=$(wc -c < "$f"); if [ "$s" -gt 2000000 ]; then echo "$f is $s bytes (data files over 2 MB are not allowed here)"; fail=1; fi;;
  esac
done <<< "$files"

if [ "$fail" = 0 ]; then echo "OK: no restricted datasets in the public repository."; else
  echo "FAILED: move these files to the private data repository instead."; exit 1; fi
