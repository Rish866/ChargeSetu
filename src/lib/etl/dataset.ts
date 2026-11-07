import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCsv } from "./csv";
import { cleanRowToImport, type ImportRow } from "./import-map";

let cache: ImportRow[] | null = null;

/** Loads the bundled, cleaned BEE dataset (source rows only; OSM leads are never imported). */
export async function loadBeeDataset(): Promise<ImportRow[]> {
  if (cache) return cache;
  const file = path.join(process.cwd(), "data", "india_ev_charging_clean.csv");
  const text = await readFile(file, "utf8");
  cache = parseCsv(text)
    .map(cleanRowToImport)
    .filter((r): r is ImportRow => r !== null);
  return cache;
}

export function datasetByState(rows: ImportRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.state, (m.get(r.state) ?? 0) + 1);
  return m;
}
