import { z } from "zod";
import { CONNECTOR_TYPE_IDS, INDIA_BOUNDS } from "@/lib/constants";

type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const clean = (v: unknown) => {
  const x = first(v);
  return typeof x === "string" && x.trim() !== "" ? x.trim() : undefined;
};

/**
 * Parses directory search params. Invalid values are dropped (never thrown),
 * so a mangled URL simply shows unfiltered results.
 */
const filterSchema = z.object({
  q: z.preprocess(clean, z.string().max(100).optional()).catch(undefined),
  city: z.preprocess(clean, z.string().max(80).optional()).catch(undefined),
  connector: z
    .preprocess(clean, z.enum(CONNECTOR_TYPE_IDS).optional())
    .catch(undefined),
  minPower: z
    .preprocess(clean, z.coerce.number().min(0).max(1000).optional())
    .catch(undefined),
  network: z.preprocess(clean, z.string().max(80).optional()).catch(undefined),
  lat: z
    .preprocess(
      clean,
      z.coerce.number().min(INDIA_BOUNDS.minLat).max(INDIA_BOUNDS.maxLat).optional(),
    )
    .catch(undefined),
  lng: z
    .preprocess(
      clean,
      z.coerce.number().min(INDIA_BOUNDS.minLng).max(INDIA_BOUNDS.maxLng).optional(),
    )
    .catch(undefined),
  view: z.preprocess(clean, z.enum(["list", "map"]).optional()).catch(undefined),
});

export type StationFilters = z.output<typeof filterSchema>;

export function parseStationFilters(params: RawSearchParams): StationFilters {
  const parsed = filterSchema.parse(params);
  // A location is only useful as a pair.
  if (parsed.lat === undefined || parsed.lng === undefined) {
    parsed.lat = undefined;
    parsed.lng = undefined;
  }
  return parsed;
}

/** Builds a /stations URL from filters, omitting empty values. */
export function stationsHref(filters: Partial<StationFilters>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === "" || v === 0) continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `/stations?${qs}` : "/stations";
}
